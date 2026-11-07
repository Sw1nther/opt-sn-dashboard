import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {kyivDate, ageDays, validNumber, sparkPath} from '../site/data-utils.js';
test('date is Kyiv calendar date, including midnight and DST', () => {
  assert.equal(kyivDate(new Date('2026-11-07T23:30:00Z')), '2026-11-08');
  assert.equal(kyivDate(new Date('2026-07-07T21:30:00Z')), '2026-07-08');
  assert.equal(ageDays('2026-11-07', new Date('2026-11-07T23:30:00Z')), 1);
  assert.equal(ageDays('2026-11-09', new Date('2026-11-07T23:30:00Z')), -1);
  assert.equal(ageDays(null), Infinity);
});
test('only real positive numeric observations accepted', () => {
  for (const value of [null, undefined, '45', NaN, Infinity, 0, -3]) assert.equal(validNumber(value), false);
  assert.equal(validNumber(45.4432), true);
});
test('sparkline uses observations, no decorative fake trend', () => {
  assert.equal(sparkPath([]), '');
  assert.equal(sparkPath([{value: 2}]), '');
  assert.equal(sparkPath([{value: 2},{value: null}]), '');
  assert.equal(sparkPath([{value: 2},{value: 3}]), 'M3.0,40.0 L297.0,6.0');
  assert.ok(!sparkPath([{value: 2},{value: 2}]).includes('NaN'));
});
test('static assets and safe base scope', () => {
  const html = readFileSync('site/index.html','utf8');
  assert.ok(html.includes('<html lang="uk">'));
  assert.ok(html.includes('<title>Відділ Опт СН</title>'));
  assert.ok(html.includes('Пальне · роздрібний орієнтир мережі'));
  assert.ok(html.includes('Ілюстрація · не фактичні маршрути'));
  assert.ok(html.includes('Історія цін накопичуватиметься'));
  assert.ok(!/АЗС Барс|ArbiQuest/i.test(html));
  assert.ok(html.includes('Демонстраційний вхід — не захист даних'));
  assert.ok(html.includes('Приклад даних · не фактичні показники'));
  const app=readFileSync('site/app.js','utf8');
  assert.ok(!/localStorage|sessionStorage/.test(app));
  assert.ok(app.includes("crypto.subtle.digest('SHA-256'"));
  assert.ok(html.includes('Захищений вхід ще не підключено'));
  for (const m of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)) assert.ok(existsSync('site/'+m[1]), m[1]);
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  for (const id of ['settings','settings-dialog','close-dialog','understood','refresh','fullscreen','usd','eur','brent','wti']) assert.ok(ids.includes(id));
});
test('committed public cache schema has no private statistics', () => {
  const data=JSON.parse(readFileSync('site/data/market.json','utf8'));
  assert.equal(data.schemaVersion,1);
  assert.deepEqual(data.fx.rates.map(r=>r.code).sort(), ['EUR','USD']);
  assert.equal(data.fuel.status,'snapshot');
  assert.equal(data.fuel.observedDate,'2026-11-07');
  assert.ok(!('feed' in data.fuel));
  assert.ok(!('fetchedAt' in data.fuel));
  assert.equal(data.fuel.scope,'retail_network');
  assert.equal(data.fuel.sourceDate,null);
  assert.ok(data.fuel.items.a98.min > 0);
  assert.ok(data.fuel.history.length >= 1);
  assert.ok(!('statistics' in data));
  assert.ok(data.fx.rates.every(r=>validNumber(r.value)));
});

test('no undocumented company API, no real private stats, demo gate is explicit', () => {
  const script=readFileSync('scripts/refresh.py','utf8');
  assert.ok(!script.includes('/api/stations'));
  assert.ok(!script.includes('parse_station_prices'));
  assert.ok(script.includes('retail-snapshot.json'));
  const snapshot=JSON.parse(readFileSync('site/data/retail-snapshot.json','utf8'));
  assert.equal(snapshot.source,'https://barsgroup.com.ua/map');
  assert.equal(snapshot.status,'snapshot');
  assert.ok(!('fetchedAt' in snapshot));
  const app=readFileSync('site/app.js','utf8');
  assert.ok(app.includes("dialog.addEventListener('close'"));
  assert.ok(app.includes("$('demo-login').reset()"));
  assert.ok(/DEMO_DIGEST = '[0-9a-f]{64}'/.test(app));
  assert.ok(!/localStorage|sessionStorage/.test(app));
});
