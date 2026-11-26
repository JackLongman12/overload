const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, session } = require('./harness');

test('achievements unlock from training history', async () => {
  const app = await fresh();
  app.Store.data.settings.bodyweight = 80;
  session(app, 'bench_press_barbell', 2, [[80, 5]]);
  session(app, 'squat_barbell', 1, [[120, 5]]);
  const u = app.Achievements.unlocked();
  assert.ok(u.has('first'));
  assert.ok(u.has('bw1'));   // e1RM 93 >= 80 kg body weight
  assert.ok(u.has('sq15'));  // e1RM 140 >= 120
  assert.ok(!u.has('w10'));
  const fresh1 = app.Achievements.check();
  assert.ok(fresh1.length >= 3);
  assert.equal(app.Achievements.check().length, 0); // not announced twice
});

test('routines group by folder, then program', async () => {
  const app = await fresh();
  app.Store.data.routines = [{ id: 'a', name: 'A', folder: 'Cut', exercises: [] }, { id: 'b', name: 'B', program: 'PPL', exercises: [] }, { id: 'c', name: 'C', exercises: [] }];
  const g = app.routineGroups(app.Store.data);
  assert.equal(JSON.stringify(g.map(x => x.name)), JSON.stringify(['Cut', 'PPL', '']));
});

test('body map renders and highlights an exercise\'s muscles', async () => {
  const app = await fresh();
  const svg = app.BodyMap.svg({}, 'sets', { primary: 'chest', secondary: ['triceps'] });
  assert.match(svg, /^<svg/);
  assert.ok((svg.match(/bm-3/g) || []).length >= 1);
  assert.ok((svg.match(/bm-1/g) || []).length >= 1);
});
