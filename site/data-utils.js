export function kyivDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function ageDays(iso, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return Infinity;
  return Math.floor((Date.parse(kyivDate(now) + 'T12:00:00Z') - Date.parse(iso + 'T12:00:00Z')) / 86400000);
}
export function validNumber(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
export function sparkPath(points) {
  const values = points.map(p => p.value);
  if (values.length < 2 || values.some(v => !validNumber(v))) return '';
  const min = Math.min(...values), range = Math.max(...values) - min || 1;
  return values.map((v, i) => `${i ? 'L' : 'M'}${(i * 294 / (values.length - 1) + 3).toFixed(1)},${(40 - (v - min) * 34 / range).toFixed(1)}`).join(' ');
}
