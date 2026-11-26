const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, session, DAY } = require('./harness');
const T = { sets: 3, repMin: 6, repMax: 10 };

test('deload week halves sets and drops the load about 10%', async () => {
  const app = await fresh();
  session(app, 'bench_press_barbell', 3, [[100, 8], [100, 8], [100, 8], [100, 8]], { ...T, sets: 4 });
  app.Store.data.settings.block = { type: 'hypertrophy', start: Date.now() - 4 * 7 * DAY - DAY };
  const s = app.Coach.suggest('bench_press_barbell', { ...T, sets: 4 });
  assert.equal(s.kind, 'deload');
  assert.equal(s.sets.length, 2);
  assert.equal(s.sets[0].w, 90);
});

test('overload week adds a set and sets an RPE target', async () => {
  const app = await fresh();
  session(app, 'bench_press_barbell', 3, [[80, 8], [80, 8], [80, 8]], T);
  app.Store.data.settings.block = { type: 'hypertrophy', start: Date.now() - 2 * 7 * DAY - DAY };
  const s = app.Coach.suggest('bench_press_barbell', T);
  assert.equal(s.sets.length, 4);
  assert.equal(s.rpeTarget, 8.5);
});

test('percent-of-max loading uses 90% of best e1RM as training max', async () => {
  const app = await fresh();
  session(app, 'squat_barbell', 3, [[150, 5]], T); // e1RM 175 -> TM 157.5
  const s = app.Coach.suggest('squat_barbell', { sets: 3, repMin: 5, repMax: 5, pct: 80 });
  assert.equal(s.kind, 'pct');
  assert.equal(s.sets[0].w, 125); // 157.5 * 0.8 = 126 -> loadable 125
});

test('easy RPE raises the next sets, a grinder lowers them', async () => {
  const app = await fresh();
  const mk = () => ({ exId: 'bench_press_barbell', target: {}, sets: [{ type: 'N', w: 100, r: 8, rpe: 6, done: true }, { type: 'N', w: '', r: '', done: false, p: { w: 100 } }] });
  const e1 = mk(); assert.match(app.Plan.autoregulate(e1, 0), /easy/); assert.equal(e1.sets[1].p.w, 102.5);
  const e2 = mk(); e2.sets[0].rpe = 10; assert.match(app.Plan.autoregulate(e2, 0), /hard/); assert.equal(e2.sets[1].p.w, 95);
  const e3 = mk(); e3.sets[0].rpe = 8; assert.equal(app.Plan.autoregulate(e3, 0), null);
});

test('program builder respects days and equipment', async () => {
  const app = await fresh();
  app.Store.data.settings.gym = ['dumbbell', 'bodyweight'];
  for (const days of [2, 3, 4, 5, 6]) {
    const p = app.Plan.build({ goal: 'muscle', days, minutes: 60, level: 'Intermediate' });
    assert.equal(p.routines.length, days);
    for (const r of p.routines) {
      assert.ok(r.exercises.length >= 3, `${r.name} too short`);
      for (const e of r.exercises) assert.ok(['dumbbell', 'bodyweight', 'none'].includes(app.Store.ex(e.exId).equipment), `${e.exId} needs ${app.Store.ex(e.exId).equipment}`);
    }
  }
});

test('session length controls exercises per day; strength uses low reps first', async () => {
  const app = await fresh();
  const short = app.Plan.build({ goal: 'strength', days: 3, minutes: 30, level: 'Beginner' });
  assert.ok(short.routines.every(r => r.exercises.length <= 3));
  assert.equal(short.routines[0].exercises[0].repMax, 5);
});

test('coach variations only suggest available equipment', async () => {
  const app = await fresh();
  app.Store.data.settings.gym = ['dumbbell'];
  const v = app.Coach.variations(app.Store.ex('bench_press_barbell'));
  assert.ok(v.every(e => e.equipment === 'dumbbell'));
});
