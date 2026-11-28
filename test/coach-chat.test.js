const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, session, DAY } = require('./harness');

function climbDay(app, daysAgo, list) {
  const t = Date.now() - daysAgo * DAY;
  const w = { id: app.uid(), name: 'Climb', start: t, end: t + 5400e3, exercises: [{ exId: 'bouldering', sets: list.map(([g, sent, st]) => ({ type: 'N', g, sent, st: st || (sent ? 'sent' : ''), a: 1, done: true })) }] };
  app.Store.data.workouts.push(w);
  return w;
}
function routine(app, name, exIds) {
  const r = { id: app.uid(), name, program: 'Plan', exercises: exIds.map(exId => ({ exId, sets: 3, repMin: 5, repMax: 8 })) };
  app.Store.data.routines.push(r);
  return r;
}

test('climbing workouts show climbs and top grade, not 0 kg', async () => {
  const app = await fresh();
  const w = climbDay(app, 1, [['V3', true], ['V5', true, 'flash'], ['V6', false]]);
  assert.equal(app.workoutStat(w).text, '3 climbs · top V5');
  const lift = session(app, 'bench_press_barbell', 1, [[60, 5]]);
  assert.match(app.workoutStat(lift).text, /300/);
});

test('Today: no routine, then go, then rest after a low check-in', async () => {
  const app = await fresh();
  assert.equal(app.Today.get().kind, 'none');
  routine(app, 'Upper', ['bench_press_barbell', 'barbell_row']);
  const t = app.Today.get();
  assert.equal(t.kind, 'go');
  assert.match(t.title, /Upper/);
  app.Store.data.checkins.push({ date: Date.now(), score: 30 });
  assert.equal(app.Today.get().kind, 'rest');
});

test('Today: suggests a recovered routine when the next one hits sore muscles', async () => {
  const app = await fresh();
  routine(app, 'Push', ['bench_press_barbell']);
  routine(app, 'Legs', ['squat_barbell']);
  // Heavy chest session 6 hours ago (but not today, so it isn't "done")
  const w = session(app, 'bench_press_barbell', 0, Array(10).fill([80, 8, 9]));
  w.start = w.end = new Date().setHours(0, 0, 0, 0) - 6 * 3600e3;
  const t = app.Today.get();
  assert.equal(t.kind, 'easy');
  assert.equal(t.alt && t.alt.name, 'Legs');
});

test('Today: says rest after three days in a row on the fingers', async () => {
  const app = await fresh();
  routine(app, 'Limit', ['bouldering']);
  routine(app, 'Legs', ['squat_barbell']);
  [1, 2, 3].forEach(d => climbDay(app, d, [['V3', true]]));
  const t = app.Today.get();
  assert.equal(t.kind, 'rest');
  assert.match(t.text, /fingers|Legs/);
});

test('Ask: matches questions to topics and answers offline from the log', async () => {
  const app = await fresh();
  const A = app.Ask;
  assert.equal(A.match('How do I send V7?'), 'climb');
  assert.equal(A.match('my legs are sore'), 'recovery');
  assert.equal(A.match('why have I plateaued'), 'stuck');
  assert.equal(A.match('what should I train today'), 'today');
  climbDay(app, 2, [['V4', true], ['V4', true], ['V5', true, 'flash']]);
  A.nano = 'unavailable';
  const r = await A.ask('how do I climb harder?');
  assert.equal(r.src, 'coach');
  assert.match(r.text, /V4|V5/);
  const sore = await A.ask('my forearms are sore');
  assert.match(sore.text, /forearms feel sore/);
  const pain = await A.ask('I felt a pop in my finger, does it need rest?');
  assert.match(pain.text, /physio/);
});

test('Ask: uses Gemini Nano with the facts in the prompt, and falls back when busy', async () => {
  const app = await fresh();
  climbDay(app, 2, [['V4', true]]);
  let sent = '';
  app.ctx.Capacitor = { isNativePlatform: () => true, Plugins: { Nano: { generate: async o => { sent = o.prompt; return { text: 'Rest today, climb tomorrow.' }; } } } };
  app.Ask.nano = 'available';
  const r = await app.Ask.ask('should I climb today?');
  assert.equal(r.src, 'nano');
  assert.equal(r.text, 'Rest today, climb tomorrow.');
  assert.match(sent, /FACTS:/);
  assert.match(sent, /Bouldering \(90 days\): hardest send V4/);
  assert.match(sent, /QUESTION: should I climb today\?/);
  app.ctx.Capacitor.Plugins.Nano.generate = async () => { throw new Error('busy'); };
  const f = await app.Ask.ask('what needs rest?');
  assert.equal(f.src, 'coach');
  assert.match(f.note, /busy/);
});

test('coach notes skip muscle-volume advice for people who only climb', async () => {
  const app = await fresh();
  climbDay(app, 1, [['V3', true]]);
  climbDay(app, 3, [['V3', true]]);
  assert.ok(!app.Coach.insights().some(i => /Chest/.test(i.text)));
  session(app, 'squat_barbell', 2, [[100, 5]]);
  assert.ok(app.Coach.insights().some(i => /Chest/.test(i.text)));
});

test('climbing achievements unlock', async () => {
  const app = await fresh();
  climbDay(app, 1, [['V5', true, 'flash']]);
  const u = app.Achievements.unlocked();
  assert.ok(u.has('c1') && u.has('cflash') && u.has('cv5'));
  assert.ok(!u.has('cv8'));
});

test('quick climb pad: one tap per climb, fills empty rows first, undo removes the last', async () => {
  const app = await fresh();
  app.UI.refreshSheet = () => { };
  app.Store.data.active = { id: 'w', name: 'Climb', start: Date.now(), exercises: [{ exId: 'bouldering', rest: 180, sets: [{ type: 'N', g: '', done: false }] }] };
  const A = app.Actions;
  A.quickClimb.call(app.UI, null, { i: '0', id: 'V4' });
  A.quickRes.call(app.UI, null, { i: '0', id: 'flash' });
  A.quickClimb.call(app.UI, null, { i: '0', id: 'V2' });
  A.quickRes.call(app.UI, null, { i: '0', id: 'p50' });
  A.quickClimb.call(app.UI, null, { i: '0', id: 'V6' });
  const sets = app.Store.data.active.exercises[0].sets;
  assert.equal(JSON.stringify(sets.map(s => [s.g, s.st, s.sent, s.done])), JSON.stringify([['V4', 'sent', true, true], ['V2', 'flash', true, true], ['V6', 'p50', false, true]]));
  A.quickUndo.call(app.UI, null, { i: '0' });
  assert.equal(sets.length, 2);
  assert.equal(app.workoutStat(app.Store.data.active).text, '2 climbs · top V4');
});
