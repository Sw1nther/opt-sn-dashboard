import importlib.util
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('refresh', 'scripts/refresh.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class RefreshTests(unittest.TestCase):
    def test_eia_blank_days_and_dates(self):
        html = '<table><tr><td>2026 Nov- 2 to Nov- 6</td><td>107.39</td><td>107.03</td><td></td><td>NA</td><td>-</td></tr></table>Release Date: 11/4/2026'
        points, released = mod.parse_eia(html, date(2026,11,7))
        self.assertEqual(points,[{'date':'2026-11-02','value':107.39},{'date':'2026-11-03','value':107.03}])
        self.assertEqual(released,'2026-11-04')
        points,_=mod.parse_eia(html,date(2026,11,2))
        self.assertEqual(len(points),1)

    def test_eia_year_crossing(self):
        html='<tr><td>2025 Dec-29 to Jan- 2</td><td>1.00</td><td>2.00</td><td>3.00</td><td>4.00</td><td>5.00</td></tr>'
        points,_=mod.parse_eia(html,date(2026,1,5))
        self.assertEqual(points[-1]['date'],'2026-01-02')

    def test_reject_empty_and_invalid(self):
        for html in ['', '<tr><td>not an EIA row</td></tr>', '<tr><td>2026 Nov- 2 to Nov- 6</td><td>NA</td><td>0.00</td><td>-</td><td>-</td><td>-</td></tr>']:
            with self.assertRaises(ValueError): mod.parse_eia(html,date(2026,11,7))

    def test_failure_retains_old_cache_and_flags_error(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'market.json'
            previous={'fx':{'status':'ok','fetchedAt':'2026-11-01T12:00:00+02:00','rates':[{'code':'USD','value':40,'date':'2026-11-01'}]},'energy':{}}
            target.write_text(json.dumps(previous))
            with patch.object(mod,'TARGET',target),patch.object(mod,'fetch',side_effect=TimeoutError): mod.refresh()
            actual=json.loads(target.read_text())
            self.assertEqual(actual['fx']['rates'],previous['fx']['rates'])
            self.assertEqual(actual['fx']['fetchedAt'],previous['fx']['fetchedAt'])
            self.assertEqual(actual['fx']['status'],'error')
            self.assertEqual(len(actual['errors']),3)
            self.assertEqual(actual['fuel']['status'],'snapshot')
            self.assertNotIn('feed',actual['fuel'])
            self.assertNotIn('fetchedAt',actual['fuel'])

if __name__=='__main__': unittest.main()
