"""Refresh public market observations only. No credentials or private inputs."""
import json
import re
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'site/data/market.json'
KYIV = ZoneInfo('Europe/Kyiv')


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'OptSN-PublicDashboard/1.0'}), timeout=35) as response:
        return response.read().decode('utf-8-sig')


class TableRows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
        elif tag in ('td', 'th') and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            if self.row is not None:
                self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def parse_eia(html, today):
    parser = TableRows()
    parser.feed(html)
    observations = {}
    for row in parser.rows:
        if len(row) != 6:
            continue
        match = re.match(r'^(\d{4})\s+([A-Z][a-z]{2})-\s*(\d{1,2})\s+to\s+', row[0])
        if not match:
            continue
        monday = datetime.strptime(f'{match[1]} {match[2]} {match[3]}', '%Y %b %d').date()
        for i, value in enumerate(row[1:]):
            observed = monday + timedelta(days=i)
            if re.fullmatch(r'\d+\.\d+', value) and observed <= today:
                number = float(value)
                if 0 < number < 2000:
                    observations[observed.isoformat()] = number
    points = [{'date': d, 'value': observations[d]} for d in sorted(observations)][-22:]
    if not points:
        raise ValueError('No valid EIA observations')
    release = re.search(r'Release Date:\s*(\d{1,2}/\d{1,2}/\d{4})', re.sub('<[^>]+>', ' ', html))
    return points, datetime.strptime(release[1], '%m/%d/%Y').date().isoformat() if release else None


def refresh():
    now = datetime.now(KYIV)
    today = now.date()
    old = json.loads(TARGET.read_text()) if TARGET.exists() else {}
    output = {'schemaVersion': 1, 'attemptedAt': now.isoformat(), 'fx': old.get('fx', {}), 'energy': old.get('energy', {}),
              'fuel': old.get('fuel', {})}
    errors = []
    # Retail snapshots are manually verified from the ordinary public map page.
    # Never restore earlier API-derived fuel values/history from the Actions cache.
    snapshot = json.loads((ROOT / 'site/data/retail-snapshot.json').read_text())
    output['fuel'] = snapshot
    try:
        # Explicit Kyiv date avoids the NBU default endpoint switching to tomorrow after 15:30.
        url = f'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date={today:%Y%m%d}&json'
        rows = json.loads(fetch(url))
        selected = [r for r in rows if r.get('cc') in ('USD', 'EUR')]
        if len(selected) != 2 or {r['cc'] for r in selected} != {'USD', 'EUR'}:
            raise ValueError('NBU missing USD/EUR')
        rates = []
        for row in selected:
            value = row['rate']
            effective = datetime.strptime(row['exchangedate'], '%d.%m.%Y').date()
            if not isinstance(value, (float, int)) or isinstance(value, bool) or not 0 < value < 1000 or effective > today:
                raise ValueError('Invalid NBU rate or future date')
            rates.append({'code': row['cc'], 'value': value, 'date': effective.isoformat()})
        output['fx'] = {'status': 'ok', 'fetchedAt': now.isoformat(), 'source': url, 'rates': rates}
    except Exception as exc:
        output['fx']['status'] = 'error'
        errors.append(f'NBU: {type(exc).__name__}')
    for key, series in [('brent', 'RBRTEd'), ('wti', 'RWTCd')]:
        url = f'https://www.eia.gov/dnav/pet/hist/{series}.htm'
        try:
            points, released = parse_eia(fetch(url), today)
            output['energy'][key] = {'status': 'ok', 'source': url, 'fetchedAt': now.isoformat(), 'releaseDate': released, 'points': points, 'unit': 'USD/bbl'}
        except Exception as exc:
            output['energy'].setdefault(key, {})['status'] = 'error'
            errors.append(f'{key}: {type(exc).__name__}')
    output['errors'] = errors
    TARGET.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'fx': output['fx'].get('status'), 'energy': {k: v['status'] for k, v in output['energy'].items()}, 'errors': errors}))
    # Partial failures preserve the last valid observation, never invent replacement values.
    if not output['fx'].get('rates'):
        raise SystemExit('No NBU observations available')


if __name__ == '__main__':
    refresh()
