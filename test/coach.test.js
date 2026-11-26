const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, session } = require('./harness');

const T = { sets: 3, repMin: 6, repMax: 10 };

test('first session asks for a starting weight', async () => {
  const app = await fresh();
  const s = app.Coach.suggest('bench_press_barbell', T);
  assert.equal(s.kind, 'new');
  assert.equal(s.sets.length, 3);
});

test('adds reps when inside the rep range', async () => {
  const app = await fresh();
  session(app, 'bench_press_barbell', 3, [[80, 8], [80, 7], [80, 7]], T);
  const s = app.Coach.suggest('bench_press_barbell', T);
  assert.equal(s.kind, 'reps');
  assert.deepEqual(s.sets.map(x => x.r), [9, 8, 8]);
  assert.ok(s.sets.every(x => x.w === 80));
});

test('adds weight once every set hits the top of the range', async () => {
  const app = await fresh();
  session(app, 'bench_press_barbell', 3, [[80, 10], [80, 10], [80, 10]], T);
  const s = app.Coach.suggest('bench_press_barbell', T);
  assert.equal(s.kind, 'weight');
  assert.equal(s.sets[0].w, 82.5);
  assert.equal(s.sets[0].r, 6);
});

test('does not add weight when RPE says the sets were maximal', async () => {
  const app = await fresh();
  session(app, 'bench_press_barbell', 3, [[80, 10, 10], [80, 10, 10], [80, 10, 10]], T);
  assert.notEqual(app.Coach.suggest('bench_press_barbell', T).kind, 'weight');
});

test('lower-body barbell lifts jump 5 kg', async () => {
  const app = await fresh();
  session(app, 'squat_barbell', 3, [[100, 10], [100, 10], [100, 10]], T);
  assert.equal(app.Coach.suggest('squat_barbell', T).sets[0].w, 105);
});

test('resets weight after two sessions of missed reps', async () => {
  const app = await fresh();
  session(app, 'bench_press_barbell', 5, [[90, 5], [90, 4]], T);
  session(app, 'bench_press_barbell', 2, [[90, 5], [90, 4]], T);
  const s = app.Coach.suggest('bench_press_barbell', T);
  assert.equal(s.kind, 'reduce');
  assert.equal(s.sets[0].w, 85); // 95% of 90 = 85.5, rounded to a loadable 85
});

test('deloads when stalled AND missing reps', async () => {
  const app = await fresh();
  [12, 9, 6, 3].forEach(d => session(app, 'overhead_press_barbell', d, [[50, 6], [50, 5], [50, 5]], T));
  const s = app.Coach.suggest('overhead_press_barbell', T);
  assert.equal(s.kind, 'deload');
  assert.equal(s.sets[0].w, 45);
});

test('flat but hitting reps means push harder, not deload', async () => {
  const app = await fresh();
  const t = { sets: 3, repMin: 12, repMax: 20 };
  [12, 9, 6, 3].forEach(d => session(app, 'face_pull', d, [[20, 15], [20, 15], [20, 14]], t));
  assert.equal(app.Coach.suggest('face_pull', t).kind, 'push');
});

test('high-rep progress is not mistaken for a plateau', async () => {
  const app = await fresh();
  const t = { sets: 3, repMin: 12, repMax: 25 };
  [12, 9, 6, 3].forEach((d, i) => session(app, 'lateral_raise_dumbbell', d, [[10, 16 + i], [10, 16 + i], [10, 15 + i]], t));
  assert.equal(app.Coach.suggest('lateral_raise_dumbbell', t).kind, 'reps');
});

test('uses the rep range saved with the last session when none is passed', async () => {
  const app = await fresh();
  session(app, 'squat_barbell', 3, [[120, 8], [120, 8], [120, 8]], { sets: 3, repMin: 5, repMax: 8 });
  assert.equal(app.Coach.suggest('squat_barbell', null).kind, 'weight');
});

test('low readiness removes a set and lightens the load', async () => {
  const app = await fresh();
  session(app, 'bench_press_barbell', 3, [[80, 8], [80, 8], [80, 8]], T);
  app.Store.data.checkins.push({ date: Date.now(), score: 30 });
  const s = app.Coach.suggest('bench_press_barbell', T);
  assert.equal(s.sets.length, 2);
  assert.ok(s.sets[0].w < 80);
});

test('warm-up weights are loadable with the default plates', async () => {
  const app = await fresh();
  for (const work of [47.5, 82.5, 122.5, 140]) {
    for (const ws of app.warmupSets(work)) assert.equal(((ws.w - 20) / 2) % 1.25, 0, `${ws.w} kg not loadable`);
  }
});

test('weighted pull-ups count toward the pull-up ladder', async () => {
  const app = await fresh();
  session(app, 'pull_up_weighted', 2, [[5, 8], [5, 8], [5, 8]], T);
  assert.ok(app.Coach.ladderProgress(app.LADDERS[0]) >= 5);
});

test('readiness score drops with poor sleep and high resting heart rate', async () => {
  const app = await fresh();
  const base = { sleep: 8, quality: 4, soreness: 2, energy: 4, stress: 2 };
  const good = app.readinessScore(base);
  assert.ok(app.readinessScore({ ...base, sleep: 4 }) < good);
  assert.ok(app.readinessScore({ ...base, rhrDelta: 8 }) < good);
  assert.ok(app.readinessScore({ ...base, hrvRatio: 0.7 }) < good);
});

test('kg to lb conversion round-trips', async () => {
  const app = await fresh();
  session(app, 'bench_press_barbell', 1, [[100, 5]], T);
  app.convertUnits('kg', 'lb');
  assert.equal(app.Store.data.workouts[0].exercises[0].sets[0].w, 220.5);
  app.convertUnits('lb', 'kg');
  assert.equal(app.Store.data.workouts[0].exercises[0].sets[0].w, 100);
});

test('every program uses only exercises that exist', async () => {
  const app = await fresh();
  const ids = new Set(app.BUILTIN_EXERCISES.map(e => e.id));
  for (const p of app.PROGRAMS) for (const [, exs] of p.routines) for (const [id] of exs) assert.ok(ids.has(id), `${p.id}: ${id}`);
});
