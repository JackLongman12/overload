const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, session, DAY } = require('./harness');

// A climbing session logged as time (seconds)
function climbDay(app, daysAgo, secs = 5400) {
  const t = Date.now() - daysAgo * DAY;
  const w = { id: app.uid(), name: 'Climb', start: t, end: t + 5400e3, exercises: [{ exId: 'bouldering', sets: [{ type: 'N', t: secs, done: true }] }] };
  app.Store.data.workouts.push(w);
  return w;
}
function hang(app, daysAgo, w, secs = 10) {
  const t = Date.now() - daysAgo * DAY;
  app.Store.data.workouts.push({ id: app.uid(), name: 'Fingers', start: t, end: t + 1, exercises: [{ exId: 'max_hang_added_weight', sets: [{ type: 'N', edge: 20, grip: 'half', w, t: secs, done: true }] }] });
}
function routine(app, name, exIds) {
  const r = { id: app.uid(), name, program: 'Plan', exercises: exIds.map(exId => ({ exId, sets: 3, repMin: 5, repMax: 8 })) };
  app.Store.data.routines.push(r);
  return r;
}

test('climbing workouts show climbing time, not 0 kg', async () => {
  const app = await fresh();
  assert.equal(app.workoutStat(climbDay(app, 1)).text, '90 min climbing');
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
  [1, 2, 3].forEach(d => climbDay(app, d));
  const t = app.Today.get();
  assert.equal(t.kind, 'rest');
  assert.match(t.text, /fingers|Legs/);
});

test('Today card carries readiness and the training block; starting a workout checks in by itself', async () => {
  const app = await fresh();
  routine(app, 'Upper', ['bench_press_barbell']);
  let html = app.UI.todayCard();
  assert.match(html, /No check-in yet/);
  app.Plan.startBlock('strength');
  let started = false;
  app.UI.beginWorkout(() => { started = true; });
  assert.ok(started, 'workout starts straight away, no check-in screen');
  assert.equal(app.Store.data.checkins.length, 1);
  html = app.UI.todayCard();
  assert.match(html, /Readiness \d+/);
  assert.match(html, /Strength 1\/5/);
});

test('Ask: matches questions to topics and answers offline from the log', async () => {
  const app = await fresh();
  const A = app.Ask;
  assert.equal(A.match('are my fingers getting stronger?'), 'fingers');
  assert.equal(A.match('my legs are sore'), 'recovery');
  assert.equal(A.match('why have I plateaued'), 'stuck');
  assert.equal(A.match('what should I train today'), 'today');
  app.Store.data.settings.bodyweight = 70;
  hang(app, 2, 14);
  A.nano = 'unavailable';
  const r = await A.ask('how strong are my fingers?');
  assert.equal(r.src, 'coach');
  assert.match(r.text, /120% of body weight/);
  const sore = await A.ask('my forearms are sore');
  assert.match(sore.text, /forearms feel sore/);
  const pain = await A.ask('I felt a pop in my finger, does it need rest?');
  assert.match(pain.text, /physio/);
});

test('Ask: uses Gemini Nano with the facts in the prompt, and falls back when busy', async () => {
  const app = await fresh();
  app.Store.data.settings.bodyweight = 70;
  climbDay(app, 2);
  hang(app, 3, 7);
  let sent = '';
  app.ctx.Capacitor = { isNativePlatform: () => true, Plugins: { Nano: { generate: async o => { sent = o.prompt; return { text: 'Rest today, climb tomorrow.' }; } } } };
  app.Ask.nano = 'available';
  const r = await app.Ask.ask('should I climb today?');
  assert.equal(r.src, 'nano');
  assert.equal(r.text, 'Rest today, climb tomorrow.');
  assert.match(sent, /FACTS:/);
  assert.match(sent, /Strongest hang: 110% of body weight/);
  assert.match(sent, /Climbing sessions logged: 1/);
  assert.match(sent, /QUESTION: should I climb today\?/);
  assert.doesNotMatch(sent, /\bV\d\b|grade/i);
  app.ctx.Capacitor.Plugins.Nano.generate = async () => { throw new Error('busy'); };
  const f = await app.Ask.ask('what needs rest?');
  assert.equal(f.src, 'coach');
  assert.match(f.note, /busy/);
});

test('coach notes skip muscle-volume advice for people who only climb', async () => {
  const app = await fresh();
  climbDay(app, 1);
  climbDay(app, 3);
  assert.ok(!app.Coach.insights().some(i => /Chest/.test(i.text)));
  session(app, 'squat_barbell', 2, [[100, 5]]);
  assert.ok(app.Coach.insights().some(i => /Chest/.test(i.text)));
});

test('climbing achievements: sessions and finger strength, no grades', async () => {
  const app = await fresh();
  app.Store.data.settings.bodyweight = 70;
  for (let d = 1; d <= 10; d++) climbDay(app, d * 2);
  hang(app, 1, 14);
  const u = app.Achievements.unlocked();
  assert.ok(u.has('c10') && u.has('f120'));
  assert.ok(!u.has('f150'));
  assert.ok(!app.Achievements.LIST.some(a => /V\d|send|flash/i.test(a[1] + a[2])));
});

test('timers come in three groups that cover every preset', async () => {
  const app = await fresh();
  const all = Object.values(app.TIMER_GROUPS).flatMap(g => g.list);
  assert.equal(Object.keys(app.TIMER_GROUPS).length, 3);
  assert.equal(all.sort().join(), Object.keys(app.TIMER_PRESETS).sort().join());
});
