const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, DAY } = require('./harness');

// A climbing session logged as time (seconds)
function session(app, exId, daysAgo, secs) {
  const t = Date.now() - daysAgo * DAY;
  app.Store.data.workouts.push({ id: app.uid(), name: 'Climb', start: t, end: t + 7200e3, exercises: [{ exId, sets: [{ type: 'N', t: secs, done: true }] }] });
}

test('climbing sessions are logged as time only; old graded climbs still load', async () => {
  const app = await fresh();
  const ex = app.Store.ex('bouldering');
  assert.equal(JSON.stringify(app.setColumns(ex)), JSON.stringify(['tt']));
  assert.equal(app.prevText(ex, { t: 5400 }), '1:30:00');
  // A climb logged with a grade before 2.3.0 still shows up (as done) instead of breaking
  assert.equal(app.prevText(ex, { g: 'V4', sent: true }), '✓');
  assert.equal(app.Coach.defaultTarget(ex).sets, 1);
});

test('climbing coach asks for the session time, keeps it, and eases off after 3 finger days', async () => {
  const app = await fresh();
  let s = app.Coach.suggest('bouldering');
  assert.equal(s.kind, 'new');
  assert.equal(s.sets.length, 1);
  session(app, 'bouldering', 9, 5400);
  s = app.Coach.suggest('bouldering');
  assert.equal(s.kind, 'climb');
  assert.equal(s.sets[0].t, 5400);
  [2, 1, 0].forEach(d => session(app, 'bouldering', d, 5400));
  s = app.Coach.suggest('bouldering');
  assert.equal(s.kind, 'deload');
  assert.ok(s.sets[0].t < 5400);
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
