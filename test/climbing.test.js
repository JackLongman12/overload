const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, DAY } = require('./harness');

// A climbing session: climbs = [[grade, sent, result, tries, angle]]
function climbs(app, exId, daysAgo, list) {
  const t = Date.now() - daysAgo * DAY;
  app.Store.data.workouts.push({ id: app.uid(), name: 'Climb', start: t, end: t + 7200e3, exercises: [{ exId, sets: list.map(([g, sent, st, a, ang]) => ({ type: 'N', g, sent, st: st || (sent ? 'sent' : ''), a: a || 1, ang: ang || '', done: true })) }] });
}

test('grades convert between V and Font, and YDS and French', async () => {
  const app = await fresh();
  const C = app.Climb;
  assert.equal(C.value('V5', 'boulder'), 5);
  assert.equal(C.value('6C', 'boulder'), 5);
  assert.equal(C.value('7a', 'route'), C.value('5.11d', 'route'));
  app.Store.data.settings.boulderScale = 'Font';
  assert.equal(C.show('V7', 'boulder'), '7A+');
  assert.equal(C.show('V4', 'boulder'), '6B');
  app.Store.data.settings.routeScale = 'French';
  assert.equal(C.show('5.10a', 'route'), '6a');
  // Rounds down, never overstates
  assert.equal(C.label(5.5, 'boulder'), '6C+');
  assert.equal(C.label(11, 'route'), '6c+');
});

test('climbing stats: hardest send, flash, top-5, pyramid, send rate, angles', async () => {
  const app = await fresh();
  climbs(app, 'bouldering', 2, [['V3', true, 'flash', 1, 'vert'], ['V4', true, 'sent', 3, 'over'], ['V5', false, '', 4, 'over'], ['V4', true, 'redpoint', 2, 'slab'], ['V2', true, '', 1, 'vert']]);
  climbs(app, 'lead_climbing', 1, [['5.10a', true, 'onsight', 1]]);
  const st = app.Climb.stats('boulder', 90);
  assert.equal(st.n, 5);
  assert.equal(st.sends, 4);
  assert.equal(st.max, 4);
  assert.equal(st.flash, 3);
  assert.equal(st.top5, (4 + 4 + 3 + 2) / 4);
  assert.equal(st.sendRate, 0.8);
  assert.equal(JSON.stringify(st.pyramid.map(p => [p.g, p.sent, p.tried])), JSON.stringify([['V5', 0, 1], ['V4', 2, 2], ['V3', 1, 1], ['V2', 1, 1]]));
  assert.equal(st.angles.over.n, 1);
  assert.equal(app.Climb.stats('route', 90).max, app.Climb.value('5.10a', 'route'));
});

test('climbing coach plans a pyramid and moves the project up after 3 sends', async () => {
  const app = await fresh();
  climbs(app, 'bouldering', 9, [['V3', true], ['V4', true], ['V4', true]]);
  let s = app.Coach.suggest('bouldering');
  assert.match(s.title, /Consolidate V4/);
  assert.equal(JSON.stringify(s.sets.map(x => x.g)), JSON.stringify(['V2', 'V2', 'V3', 'V3', 'V4', 'V4']));
  climbs(app, 'bouldering', 6, [['V4', true]]);
  s = app.Coach.suggest('bouldering');
  assert.match(s.title, /Project V5/);
  assert.equal(s.sets[s.sets.length - 1].g, 'V5');
  assert.equal(s.sets[s.sets.length - 1].a, 3);
});

test('climbing coach suggests easy volume after 3 finger days in a row', async () => {
  const app = await fresh();
  climbs(app, 'bouldering', 3, [['V4', true], ['V4', true], ['V4', true]]);
  climbs(app, 'bouldering', 2, [['V4', true]]);
  climbs(app, 'bouldering', 1, [['V4', true]]);
  climbs(app, 'bouldering', 0, [['V3', true]]);
  const s = app.Coach.suggest('bouldering');
  assert.equal(s.kind, 'deload');
  assert.ok(s.sets.every(x => app.Climb.value(x.g, 'boulder') <= 2));
});

test('max hangs add weight when every set holds the full time; strength as % body weight', async () => {
  const app = await fresh();
  app.Store.data.settings.bodyweight = 70;
  const t = Date.now() - 3 * DAY;
  app.Store.data.workouts.push({ id: 'h1', name: 'Fingers', start: t, end: t + 1, exercises: [{ exId: 'max_hang_added_weight', target: { sets: 3, repMin: 7, repMax: 10 }, sets: [10, 10, 10].map(s => ({ type: 'N', w: 14, t: s, done: true })) }] });
  const s = app.Coach.suggest('max_hang_added_weight');
  assert.equal(s.kind, 'weight');
  assert.equal(s.sets[0].w, 16.5);
  assert.equal(s.sets[0].t, 7);
  assert.equal(app.Climb.fingers().hang.pct, 120);
});

test('sleep: one source per night, Sleep as Android preferred, quality from stages', async () => {
  const app = await fresh();
  const now = Date.parse('2026-11-26T08:00:00Z');
  const st = (stage, a, b) => ({ stage, startDate: a, endDate: b, durationMinutes: (Date.parse(b) - Date.parse(a)) / 60000 });
  const saa = { sourceId: 'com.urbandroid.sleep', startDate: '2026-11-25T23:00:00Z', endDate: '2026-11-26T07:00:00Z', stages: [
    st('light', '2026-11-25T23:00:00Z', '2026-11-26T01:00:00Z'), st('deep', '2026-11-26T01:00:00Z', '2026-11-26T03:00:00Z'),
    st('rem', '2026-11-26T03:00:00Z', '2026-11-26T05:00:00Z'), st('light', '2026-11-26T05:00:00Z', '2026-11-26T06:30:00Z'), st('awake', '2026-11-26T06:30:00Z', '2026-11-26T07:00:00Z')] };
  const samsung = { sourceId: 'com.sec.android.app.shealth', startDate: '2026-11-25T23:10:00Z', endDate: '2026-11-26T06:50:00Z', stages: [st('light', '2026-11-25T23:10:00Z', '2026-11-26T06:50:00Z')] };
  const nap = { sourceId: 'com.urbandroid.sleep', startDate: '2026-11-25T14:00:00Z', endDate: '2026-11-25T14:40:00Z' };
  const h = app.HC.summarizeSleep([samsung, saa, nap], now);
  assert.equal(h.source, 'Sleep as Android');
  assert.equal(h.sleepH, 7.5); // not doubled, nap excluded
  assert.equal(h.restorative, 53);
  assert.equal(h.quality, 5);
  assert.equal(h.sources.length, 2);
  // Picking Samsung explicitly
  const s2 = app.HC.summarizeSleep([samsung, saa], now, 'com.sec.android.app.shealth');
  assert.equal(s2.source, 'Samsung Health');
  assert.equal(s2.sleepH, 7.7);
  // Only light sleep and a short night: lower quality
  assert.equal(s2.quality, 4); // no deep/REM detail: judged on efficiency only
});

test('sleeping heart rate fallback and 3-night sleep debt lower readiness', async () => {
  const app = await fresh();
  assert.equal(app.HC.sleepingHR([62, 55, 54, 53, 60, 70, 58].map(value => ({ value }))), 54);
  assert.equal(app.HC.sleepingHR([{ value: 50 }]), null);
  const base = { sleep: 8, quality: 4, soreness: 2, energy: 4, stress: 2 };
  assert.ok(app.readinessScore({ ...base, sleepAvg: 5.2 }) < app.readinessScore(base));
});

test('every built-in exercise has directions', async () => {
  const app = await fresh();
  const missing = app.BUILTIN_EXERCISES.filter(e => !app.HOWTO[e.id]).map(e => e.id);
  assert.equal(JSON.stringify(missing), JSON.stringify([]));
});
