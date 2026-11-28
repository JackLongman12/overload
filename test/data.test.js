const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, session } = require('./harness');

test('imports a Strong CSV (semicolons, warm-ups, rest rows)', async () => {
  const app = await fresh();
  const csv = `Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE
"2026-10-01 18:00:00";"Leg day";"1h 5m";"Squat (Barbell)";"W";"60";"5";"0";"0";"";"";""
"2026-10-01 18:00:00";"Leg day";"1h 5m";"Squat (Barbell)";"1";"100";"5";"0";"0";"";"";"8"
"2026-10-01 18:00:00";"Leg day";"1h 5m";"Rest Timer";"";"";"";"";"90";"";"";""`;
  const r = app.IO.fromCSV(csv, 'kg');
  assert.equal(r.source, 'Strong');
  assert.equal(r.workouts.length, 1);
  const sets = r.workouts[0].exercises[0].sets;
  assert.equal(sets[0].type, 'W');
  assert.equal(sets[1].w, 100);
  assert.equal(r.workouts[0].end - r.workouts[0].start, 65 * 60000);
});

test('imports a Hevy CSV and converts lb to kg', async () => {
  const app = await fresh();
  const csv = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_lbs","reps","distance_km","duration_seconds","rpe"
"Upper","3 Oct 2026, 09:15","3 Oct 2026, 10:20","","Bench Press (Barbell)","","",1,"normal",185,6,,,8`;
  const r = app.IO.fromCSV(csv, 'kg');
  assert.equal(r.source, 'Hevy');
  assert.equal(r.workouts[0].exercises[0].sets[0].w, 83.9);
});

test('matches short exercise names to the library', async () => {
  const app = await fresh();
  assert.equal(app.IO.matchExercise('Deadlift', { w: 1 }).id, 'deadlift_barbell');
  assert.equal(app.IO.matchExercise('Lat Pulldown', { w: 1 }).id, 'lat_pulldown_cable');
  assert.ok(app.IO.matchExercise('Zercher Squat', { w: 1 }).id.startsWith('c_'));
});

test('re-importing the same file skips duplicates', async () => {
  const app = await fresh();
  const csv = `Date,Exercise,Category,Weight (kgs),Reps\n2026-10-05,Deadlift,Back,140.0,3`;
  assert.equal(app.IO.commit(app.IO.fromCSV(csv, 'kg')), 1);
  assert.equal(app.IO.commit(app.IO.fromCSV(csv, 'kg')), 0);
});

test('Strong-format export can be imported back', async () => {
  const app = await fresh();
  session(app, 'bench_press_barbell', 2, [[80, 8], [80, 7]]);
  session(app, 'squat_barbell', 1, [[100, 5]]);
  const out = app.IO.toStrongCSV();
  const back = await fresh();
  const r = back.IO.fromCSV(out, 'kg');
  assert.equal(r.workouts.length, 2);
  assert.equal(r.workouts.reduce((a, w) => a + w.exercises[0].sets.length, 0), 3);
});

test('sync encryption round-trips and hides plaintext', async () => {
  const app = await fresh();
  const k = await app.Sync.derive('a@example.com', 'correct horse battery');
  assert.match(k.authKey, /^[0-9a-f]{64}$/);
  app.Sync.acct = { email: 'a@example.com', encKey: k.encKey };
  const blob = await app.Sync.encrypt({ secret: 'bench 100kg' });
  assert.ok(!blob.includes('bench'));
  assert.deepEqual(await app.Sync.decrypt(blob), { secret: 'bench 100kg' });
});

test('sync merge: union, newer wins, deletions propagate', async () => {
  const app = await fresh();
  const d = app.Store.data;
  d.routines = [{ id: 'r1', name: 'Old', u: 1 }, { id: 'r2', name: 'Local only', u: 5 }];
  d.workouts = [{ id: 'w1', start: 10, exercises: [] }];
  const remote = { routines: [{ id: 'r1', name: 'New', u: 2 }, { id: 'r3', name: 'Remote only', u: 1 }], workouts: [{ id: 'w1', start: 10, exercises: [] }], deleted: { w1: Date.now() } };
  app.Sync.merge(remote);
  assert.equal(JSON.stringify(d.routines.map(r => r.name).sort()), JSON.stringify(['Local only', 'New', 'Remote only']));
  assert.equal(d.workouts.length, 0);
});
