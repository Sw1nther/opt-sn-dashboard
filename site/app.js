import { kyivDate, ageDays, validNumber, sparkPath } from './data-utils.js';
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
    let fxCurrent = true;
    for (const code of ['USD', 'EUR']) {
      const key = code.toLowerCase();
      const row = data.fx?.rates?.find(r => r.code === code);
      const age = ageDays(row?.date);
      const valid = row && validNumber(row.value) && age >= 0 && Number.isFinite(age);
      $(key).textContent = valid ? decimal.format(row.value) : '—';
      $(key + '-date').textContent = valid ? 'Діє на ' + dateLabel(row.date) : 'Немає підтверджених даних';
      if (!valid || row.date !== kyivDate()) fxCurrent = false;
    }
    const fxOld = !fxCurrent || data.fx?.status !== 'ok' || !data.fx?.fetchedAt || Date.now() - Date.parse(data.fx.fetchedAt) > 36 * 3600000;
    $('fx-status').textContent = (fxOld ? 'Увага: збережені / неактуальні дані · ' : 'Отримано ') + timestamp(data.fx?.fetchedAt);
    $('fx-status').classList.toggle('warning', fxOld);
    for (const key of ['brent', 'wti']) {
      const series = data.energy?.[key];
      const points = Array.isArray(series?.points) ? series.points.filter(p => validNumber(p.value) && Number.isFinite(ageDays(p.date)) && ageDays(p.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)) : [];
      const latest = points.at(-1);
      $(key).textContent = latest ? decimal.format(latest.value) : '—';
      $(key + '-chart').querySelector('path').setAttribute('d', sparkPath(points));
      $(key + '-chart').setAttribute('aria-label', latest ? `${key.toUpperCase()}: ${points.length} останніх опублікованих спостережень, до ${dateLabel(latest.date)}` : 'Немає даних графіка');
      const stale = latest && (ageDays(latest.date) > 7 || series.status !== 'ok' || Date.now() - Date.parse(series.fetchedAt || 0) > 36 * 3600000);
      $(key + '-status').textContent = latest ? `${stale ? 'Застаріле · ' : 'Спостереження '}${dateLabel(latest.date)} · отримано ${timestamp(series.fetchedAt)}${series.releaseDate ? ' · випуск ' + dateLabel(series.releaseDate) : ''}` : 'Джерело тимчасово недоступне';
      $(key + '-status').classList.toggle('warning', !!stale);
    }
    const cacheStale = !data.attemptedAt || Date.now() - Date.parse(data.attemptedAt) > 36 * 3600000;
    $('cache-status').textContent = `${cacheStale ? 'Кеш потребує оновлення' : 'Перевірка джерел'}: ${timestamp(data.attemptedAt)} · автооновлення щогодини*`;
    $('cache-status').classList.toggle('warning', cacheStale);
    $('cache-status').title = '* GitHub Actions може запускатися із затримкою. Дати спостережень показано окремо. Сторінка перевіряє кеш кожні 5 хв.';
  } catch {
    $('cache-status').textContent = 'Не вдалося оновити дані. Попередні значення, якщо є, можуть бути застарілими.';
    $('cache-status').classList.add('warning');
    $('fx-status').textContent = 'Немає зв’язку з кешем · актуальність не підтверджена';
    $('fx-status').classList.add('warning');
    for (const key of ['brent','wti']) {
      $(key + '-status').textContent = 'Немає зв’язку · актуальність не підтверджена';
      $(key + '-status').classList.add('warning');
    }
  } finally { loading = false; $('refresh').disabled = false; }
}
const dialog = $('settings-dialog');
for (const id of ['settings', 'team-info']) $(id).addEventListener('click', () => dialog.showModal());
for (const id of ['close-dialog', 'understood']) $(id).addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
$('refresh').addEventListener('click', load);
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { $('fullscreen').title = 'Повноекранний режим недоступний у цьому браузері'; }
});
clock(); setInterval(clock, 1000); load(); setInterval(load, 300000);
