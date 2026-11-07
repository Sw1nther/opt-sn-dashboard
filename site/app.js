import { kyivDate, ageDays, validNumber, sparkPath } from './data-utils.js?v=20261107-r4';
const $ = id => document.getElementById(id);
const decimal = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function dateLabel(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'дата невідома';
  return new Intl.DateTimeFormat('uk-UA', {timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric'}).format(new Date(iso + 'T12:00:00Z'));
}
function timestamp(iso) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return 'невідомо';
  return new Intl.DateTimeFormat('uk-UA', {timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}).format(new Date(iso)) + ' · Київ';
}
function clock() {
  const now = new Date();
  $('clock').textContent = new Intl.DateTimeFormat('uk-UA', {timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit'}).format(now);
  $('clock').dateTime = now.toISOString();
  $('today').textContent = new Intl.DateTimeFormat('uk-UA', {timeZone: 'Europe/Kyiv', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}).format(now);
}
let fuelData = null;
function renderHistory() {
  const key = $('history-fuel').value;
  const history = (fuelData?.history || []).filter(row => validNumber(row.items?.[key]?.min) && ageDays(row.date) >= 0).sort((a,b) => a.date.localeCompare(b.date));
  const first = history[0], last = history.at(-1), enough = history.length >= 2;
  $('fuel-history-chart').hidden = !enough;
  $('history-pending').hidden = enough;
  if (enough) {
    $('fuel-history-chart').querySelector('path').setAttribute('d', sparkPath(history.map(row => ({value: row.items[key].min}))));
    $('fuel-history-chart').setAttribute('aria-label', 'Реальні спостереження мінімальної роздрібної ціни у мережі, грн за літр, ' + dateLabel(first.date) + ' — ' + dateLabel(last.date));
    const delta = last.items[key].min - history.at(-2).items[key].min;
    $('history-change').textContent = `${delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ '}${decimal.format(delta)} грн/л`;
    $('history-change').classList.toggle('history-up', delta > 0);
    $('history-change').classList.toggle('history-down', delta < 0);
    $('history-change').title = 'Зміна від попереднього щоденного спостереження';
  } else $('history-change').textContent = history.length ? 'Перше спостереження' : 'Ще немає історії';
  $('history-state').textContent = last ? `${decimal.format(last.items[key].min)} грн/л · спостереження ${dateLabel(last.date)}` : 'Даних для графіка ще немає';
  $('history-dates').textContent = first ? `Період: ${dateLabel(first.date)}${enough ? ' — ' + dateLabel(last.date) : ' · 1 день'}` : 'Спостереження накопичуватимуться після підключення';
}
function renderFuel(data) {
  fuelData = data;
  const isSnapshot = data?.status === 'snapshot';
  const stale = !isSnapshot || ageDays(data?.observedDate) > 1;
  for (const key of ['a98','a95','diesel','lpg']) {
    const item = data?.items?.[key];
    const valid = validNumber(item?.min) && validNumber(item?.max) && item.max >= item.min;
    $('fuel-' + key).textContent = valid ? decimal.format(item.min) + (item.max > item.min ? '–' + decimal.format(item.max) : '') : '—';
    $('fuel-' + key + '-caption').textContent = valid ? `${item.stations} АЗК з ціною · ${isSnapshot ? 'знімок сторінки' : 'збережені дані'}` : 'Немає підтвердженої ціни';
  }
  $('fuel-status').textContent = isSnapshot ? `Знімок ${dateLabel(data.observedDate)} · не live` : 'Ціни недоступні';
  $('fuel-status').classList.add('amber');
  $('fuel-source-status').textContent = `Знімок: ${dateLabel(data?.observedDate)} · роздріб, грн/л`;
  $('fuel-source-status').title = 'Діапазон цін АЗК компанії, не середнє по Україні. Точну ціну перевіряйте на АЗК.';
  renderHistory();
}
$('history-fuel').addEventListener('change', renderHistory);
let loading = false;
async function load() {
  if (loading) return;
  loading = true;
  $('refresh').disabled = true;
  $('cache-status').textContent = 'Перевірка збережених даних…';
  try {
    const response = await fetch('./data/market.json?t=' + Date.now(), {cache: 'no-store', signal: AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (data.schemaVersion !== 1) throw new Error('Unsupported data');
    renderFuel(data.fuel);
    let fxCurrent = true;
    for (const code of ['USD', 'EUR']) {
      const key = code.toLowerCase();
      const row = data.fx?.rates?.find(r => r.code === code);
      const age = ageDays(row?.date);
      const valid = row && validNumber(row.value) && age >= 0 && Number.isFinite(age);
      $(key).textContent = valid ? decimal.format(row.value) : '—';
      $(key + '-date').textContent = valid ? dateLabel(row.date) : 'Немає підтверджених даних';
      if (!valid || row.date !== kyivDate()) fxCurrent = false;
    }
    const fxOld = !fxCurrent || data.fx?.status !== 'ok' || !data.fx?.fetchedAt || Date.now() - Date.parse(data.fx.fetchedAt) > 36 * 3600000;
    $('fx-status').textContent = (fxOld ? 'Увага: збережені / неактуальні дані · ' : 'Отримано ') + timestamp(data.fx?.fetchedAt);
    $('fx-status').classList.toggle('warning', fxOld);
    $('fx-brief').textContent = fxOld ? 'НБУ · увага: збережені дані' : 'НБУ · офіційний, не готівковий';
    $('fx-brief').classList.toggle('warning', fxOld);
    for (const key of ['brent', 'wti']) {
      const series = data.energy?.[key];
      const points = Array.isArray(series?.points) ? series.points.filter(p => validNumber(p.value) && Number.isFinite(ageDays(p.date)) && ageDays(p.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)) : [];
      const latest = points.at(-1);
      $(key).textContent = latest ? decimal.format(latest.value) : '—';
      $(key + '-chart').querySelector('path').setAttribute('d', sparkPath(points));
      $(key + '-chart').setAttribute('aria-label', latest ? `${key.toUpperCase()}: ${points.length} останніх опублікованих спостережень, до ${dateLabel(latest.date)}` : 'Немає даних графіка');
      const stale = latest && (ageDays(latest.date) > 7 || series.status !== 'ok' || Date.now() - Date.parse(series.fetchedAt || 0) > 36 * 3600000);
      $(key + '-details').textContent = latest ? `${key.toUpperCase()}: спостереження ${dateLabel(latest.date)} · отримано ${timestamp(series.fetchedAt)}${series.releaseDate ? ' · випуск ' + dateLabel(series.releaseDate) : ''}` : 'Джерело тимчасово недоступне';
      $(key + '-status').textContent = latest ? `${stale ? 'Застаріле · ' : ''}${dateLabel(latest.date)}` : 'Дані недоступні';
      $(key + '-status').classList.toggle('warning', !!stale);
    }
    const cacheStale = !data.attemptedAt || Date.now() - Date.parse(data.attemptedAt) > 36 * 3600000;
    $('cache-status').textContent = `${cacheStale ? 'Дані потребують перевірки' : 'Перевірено'}: ${timestamp(data.attemptedAt)}`;
    $('cache-status').classList.toggle('warning', cacheStale);
    $('cache-status').title = '* GitHub Actions може запускатися із затримкою. Дати спостережень показано окремо. Сторінка перевіряє кеш кожні 5 хв.';
  } catch {
    $('cache-status').textContent = 'Не вдалося оновити дані. Попередні значення, якщо є, можуть бути застарілими.';
    $('cache-status').classList.add('warning');
    $('fuel-status').textContent = 'Немає зв’язку · ціни не підтверджено';
    $('fuel-status').classList.add('amber');
    $('fx-status').textContent = 'Немає зв’язку з кешем · актуальність не підтверджена';
    $('fx-status').classList.add('warning');
    $('fx-brief').textContent = 'НБУ · зв’язок не підтверджено';
    $('fx-brief').classList.add('warning');
    for (const key of ['brent','wti']) {
      $(key + '-status').textContent = 'Немає зв’язку · актуальність не підтверджена';
      $(key + '-status').classList.add('warning');
    }
  } finally { loading = false; $('refresh').disabled = false; }
}
// A deliberately bypassable client-side DEMO gate, never real authentication.
const DEMO_DIGEST = 'a8d0b6f0939cfd883251f62b265f971ef8a5ab97eee32b91460f08b965601d93';
function showDemo(open) {
  $('demo-stats').hidden = !open;
  document.querySelector('.history-section > .history-card:not(.demo-stats)').hidden = open;
  $('history-title').querySelector('span').textContent = open ? 'Статистика відділу · демо' : 'Динаміка цін на пальне';
  document.querySelector('.history-select').hidden = open;
}
$('demo-lock').addEventListener('click', () => showDemo(false));
$('demo-login').addEventListener('submit', async event => {
  event.preventDefault();
  const userOkay = $('demo-user').value.trim() === 'admin';
  const bytes = new TextEncoder().encode($('demo-password').value);
  $('demo-password').value = '';
  $('demo-user').value = '';
  $('demo-submit').disabled = true;
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2,'0')).join('');
    if (!userOkay || hex !== DEMO_DIGEST) {
      $('login-status').textContent = 'Невірний демо-логін або демо-пароль.';
      return;
    }
    $('login-status').textContent = '';
    showDemo(true);
    dialog.close();
  } catch { $('login-status').textContent = 'Демо-вхід недоступний у цьому браузері. Реальні дані не використовуються.'; }
  finally { bytes.fill(0); $('demo-submit').disabled = false; }
});
const dialog = $('settings-dialog');
dialog.addEventListener('close', () => { $('demo-login').reset(); $('login-status').textContent = ''; });
for (const id of ['settings', 'team-info']) $(id).addEventListener('click', () => dialog.showModal());
for (const id of ['close-dialog', 'understood']) $(id).addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
$('refresh').addEventListener('click', load);
$('sources').addEventListener('click', () => $('sources-dialog').showModal());
$('close-sources').addEventListener('click', () => $('sources-dialog').close());
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { $('fullscreen').title = 'Повноекранний режим недоступний у цьому браузері'; }
});
clock(); setInterval(clock, 1000); load(); setInterval(load, 300000);
