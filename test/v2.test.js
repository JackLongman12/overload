const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, session, DAY } = require('./harness');
const J = x => JSON.stringify(x);

function hangs(app, exId, daysAgo, sets, target) {
  const t = Date.now() - daysAgo * DAY;
  app.Store.data.workouts.push({ id: app.uid(), name: 'Fingers', start: t, end: t + 1, exercises: [{ exId, target, sets: sets.map(([edge, grip, w, s]) => ({ type: 'N', edge, grip, w, t: s, done: true })) }] });
}
function climbs(app, exId, daysAgo, secs) {
  const t = Date.now() - daysAgo * DAY;
  app.Store.data.workouts.push({ id: app.uid(), name: 'Climb', start: t, end: t + secs * 1000, exercises: [{ exId, sets: [{ type: 'N', t: secs, done: true }] }] });
}

test('hangboard: keeps edge and grip, adds weight when every hang holds, smaller edge for minimum-edge', async () => {
  const app = await fresh();
  app.Store.data.settings.bodyweight = 70;
  hangs(app, 'max_hang_added_weight', 4, [[18, 'half', 10, 10], [18, 'half', 10, 10], [18, 'half', 10, 10], [18, 'half', 10, 10], [18, 'half', 10, 10]]);
  let s = app.Coach.suggest('max_hang_added_weight');
  assert.equal(s.kind, 'weight');
  assert.equal(J(s.sets[0]), J({ w: 12.5, t: 7, edge: 18, grip: 'half' }));
  assert.match(s.text, /16 mm edge/);
  hangs(app, 'minimum_edge_hang', 2, [[12, 'half', 0, 10], [12, 'half', 0, 10], [12, 'half', 0, 10], [12, 'half', 0, 10]]);
  s = app.Coach.suggest('minimum_edge_hang');
  assert.equal(s.sets[0].edge, 10);
  // Finger strength normalised to 20 mm: 80 kg on 18 mm = 114% x 1.05
  assert.equal(app.Climb.fingers().hang.pct, 120);
});

test('hangboard: lighter when most hangs fall short; rest after 3 finger days', async () => {
  const app = await fresh();
  hangs(app, 'max_hang_added_weight', 5, [[20, 'half', 10, 5], [20, 'half', 10, 4], [20, 'half', 10, 8]]);
  let s = app.Coach.suggest('max_hang_added_weight');
  assert.equal(s.kind, 'deload');
  assert.equal(s.sets[0].w, 7.5);
  for (const d of [2, 1, 0]) hangs(app, 'repeaters_7_3', d, [[20, 'open', 0, 42]]);
  s = app.Coach.suggest('max_hang_added_weight');
  assert.match(s.title, /Rest your fingers/);
});

test('finger strength: % of body weight per session, block lifts apart, pull-up 1RM', async () => {
  const app = await fresh();
  app.Store.data.settings.bodyweight = 70;
  hangs(app, 'max_hang_added_weight', 10, [[20, 'half', 0, 10]]);
  hangs(app, 'max_hang_added_weight', 3, [[20, 'half', 14, 10], [20, 'half', 14, 3]]);
  hangs(app, 'abrahang', 2, [[20, 'half', 30, 10]]); // easy hangs don't count as max strength
  const t = Date.now() - DAY;
  app.Store.data.workouts.push({ id: app.uid(), name: 'Block', start: t, end: t + 1, exercises: [{ exId: 'no_hang_block_lift', sets: [{ type: 'N', w: 35, t: 10, done: true }] }] });
  assert.equal(J(app.Climb.hangTrend().map(p => p.y)), J([100, 120]));
  const f = app.Climb.fingers();
  assert.equal(f.hang.pct, 120);
  assert.equal(f.lift.pct, 50);
  session(app, 'pull_up_weighted', 1, [[35, 1]]);
  assert.equal(app.Climb.pullPct(), 150);
});

test('climbing plan: days, beginner safety, and the coach follows the phase', async () => {
  const app = await fresh();
  const C = app.Climb;
  const beginner = C.buildPlan({ focus: 'boulder', days: 3, level: 'new', hangboard: true });
  assert.equal(beginner.routines.length, 3);
  const ids = beginner.routines.flatMap(r => r[1].map(e => e[0]));
  assert.ok(!ids.includes('max_hang_added_weight') && !ids.includes('campus_ladder'), 'no max hangs or campus for beginners');
  const adv = C.buildPlan({ focus: 'route', days: 5, level: 'adv', hangboard: true });
  assert.equal(adv.routines.length, 5);
  assert.ok(adv.routines.flatMap(r => r[1].map(e => e[0])).includes('repeaters_7_3'));
  const valid = new Set(app.BUILTIN_EXERCISES.map(e => e.id));
  [beginner, adv].forEach(p => p.routines.forEach(r => r[1].forEach(e => assert.ok(valid.has(e[0]), e[0]))));
  climbs(app, 'bouldering', 6, 5400);
  app.Store.data.settings.climbPlan = { focus: 'boulder', days: 3, level: 'mid', hangboard: true, start: Date.now() - 5 * 7 * DAY };
  assert.equal(C.phase().name, 'Strength');
  const s = app.Coach.suggest('bouldering');
  assert.match(s.title, /Strength/);
  assert.match(s.text, /Limit bouldering/);
  assert.equal(s.sets[0].t, 5400);
});

test('recovery totals sets per muscle per workout and skips mobility', async () => {
  const app = await fresh();
  const t = Date.now() - 20 * 3600e3;
  app.Store.data.workouts.push({ id: 'r1', name: 'Push', start: t, end: t, exercises: [
    { exId: 'bench_press_barbell', sets: Array(4).fill(0).map(() => ({ type: 'N', w: 80, r: 8, done: true })) },
    { exId: 'incline_bench_press_dumbbell', sets: Array(4).fill(0).map(() => ({ type: 'N', w: 30, r: 10, done: true })) },
    { exId: 'pigeon_pose', sets: [{ type: 'N', t: 60, done: true }] }] });
  const r = app.Coach.recovery(Date.now(), true);
  assert.ok(r.pct.chest < 45, 'chest fatigued after 8 sets');
  assert.ok(r.left.chest > 20);
  assert.equal(r.pct.glutes, 100);
});

test('account key: format, id is stable and not the key', async () => {
  const app = await fresh();
  const S = app.Sync, key = S.newRecoveryCode();
  assert.match(key, /^[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$/);
  const id1 = await S.keyId(key), id2 = await S.keyId(key.toLowerCase().replace(/-/g, ' '));
  assert.equal(id1, id2);
  assert.match(id1, /^k[0-9a-f]{24}@key\.gymapp\.app$/);
  assert.ok(!id1.includes(S.normKey(key).slice(0, 8).toLowerCase()));
  await assert.rejects(S.keyLogin('ABC'), /25 letters/);
});

test('strength tools: calisthenics 1RM, barbell estimates both ways, standards, DOTS, RPE', async () => {
  const app = await fresh();
  const S = app.Strength;
  const c = S.cali('pull_up', 80, 0, 10);
  assert.ok(Math.abs(c.maxAdded - 26.7) < 0.2);
  const bench = S.predictLifts('push_up', 80, 0, 30)[0][1];
  assert.ok(Math.abs(bench - 100) < 2);
  assert.equal(S.repsFrom('bench', 100, 80)[0][1], 30);
  assert.equal(S.level('m', 'bench', 1.2).name, 'Intermediate');
  assert.ok(Math.abs(S.dots(600, 83, 'm') - 405) < 2);
  assert.equal(S.rpePct(1, 10), 1);
  assert.ok(S.rpePct(5, 8) > 0.8 && S.rpePct(5, 8) < 0.84);
});

test('body map draws artwork regions and colours trained muscles', async () => {
  const app = await fresh();
  const svg = app.BodyMap.svg({ chest: 14, lats: 3 }, 'sets');
  assert.match(svg, /class="bm-3"><title>Chest/);
  assert.match(svg, /class="bm-1"><title>Lats and upper back/);
  assert.ok((svg.match(/<path/g) || []).length > 80);
});
