'use strict';

const Actions = {
  closeSheet() { this.closeSheet(); },
  openWorkout() { this.openWorkout(); },
  applyUpdate() { Updater.applyNow(); },
  openApk() { Updater.openApk(); },
  moreHistory() { this._histN = (this._histN || 15) + 30; this.render(); },

  // ----- Starting workouts
  startEmpty() { this.beginWorkout(() => this.newWorkout('Workout')); },
  startRoutine(el, d) { const r = Store.data.routines.find(x => x.id === d.id); if (r) this.beginWorkout(() => this.newWorkout(r.name, r)); },

  // ----- Check-in
  checkin() { this.openCheckin(); },
  ciSave() {
    const c = { ...this.ci, date: Date.now(), score: readinessScore(this.ci) };
    Store.data.checkins.push(c); if (Store.data.active) Store.data.active.readiness = c.score; Store.save(true);
    const next = this._afterCheckin; this._afterCheckin = null;
    this.closeSheet(); toast(`Readiness ${c.score}. ${readinessLabel(c.score)}`);
    if (next) next();
  },
  ciSkip() { const next = this._afterCheckin; this._afterCheckin = null; this.closeSheet(); if (next) next(); },

  // ----- Routines
  newRoutine() { this.editRoutine(null); },
  editRoutine(el, d) { this.editRoutine(Store.data.routines.find(r => r.id === d.id)); },
  rAddEx() { this.openPicker('routine', ids => { ids.forEach(id => { const ex = Store.ex(id), t = Coach.defaultTarget(ex); this.draft.exercises.push({ exId: id, sets: t.sets, repMin: t.repMin, repMax: t.repMax, rest: ex.type === 'dist' ? 0 : Store.data.settings.rest }); }); }); },
  rMove(el, d) { const a = this.draft.exercises, i = +d.i, j = i + +d.v; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; this.refreshSheet(); },
  rRemove(el, d) { this.draft.exercises.splice(+d.i, 1); this.refreshSheet(); },
  rSave() {
    const d = this.draft; if (!d.name.trim()) return toast('Give the routine a name');
    const rs = Store.data.routines, i = rs.findIndex(r => r.id === d.id);
    if (i >= 0) rs[i] = d; else rs.push(d);
    Store.save(true); this.closeSheet(); toast('Routine saved');
  },
  rDelete() { if (!confirm('Delete this routine? Your workout history is kept.')) return; Store.data.routines = Store.data.routines.filter(r => r.id !== this.draft.id); Store.save(true); this.closeSheet(); },
  programs() { this.openPrograms(); },
  addProgram(el, d) {
    const p = PROGRAMS.find(x => x.id === d.id);
    p.routines.forEach(([name, exs]) => Store.data.routines.push({ id: uid(), name, program: p.name, exercises: exs.map(([exId, sets, repMin, repMax]) => ({ exId, sets, repMin, repMax, rest: Store.ex(exId).type === 'dist' ? 0 : (repMax <= 8 ? 180 : Store.data.settings.rest) })) }));
    Store.save(true); this.closeSheet(); this.nav('home'); toast(`Added ${p.routines.length} routines from ${p.name}`);
  },
  saveAsRoutine(el, d) {
    const w = Store.data.workouts.find(x => x.id === d.id); if (!w) return;
    Store.data.routines.push({ id: uid(), name: w.name, exercises: w.exercises.map(e => ({ exId: e.exId, sets: e.sets.filter(s => s.type !== 'W').length || 1, repMin: (e.target || {}).repMin || 8, repMax: (e.target || {}).repMax || 12, rest: e.rest || Store.data.settings.rest })) });
    Store.save(true); toast('Saved as routine'); el.remove();
  },
  updateRoutineFrom(el, d) {
    const w = Store.data.workouts.find(x => x.id === d.id), r = Store.data.routines.find(x => x.id === w.routineId); if (!r) return;
    r.exercises = w.exercises.map(e => { const old = r.exercises.find(x => x.exId === e.exId) || {}; return { exId: e.exId, sets: e.sets.filter(s => s.type !== 'W').length || 1, repMin: old.repMin || (e.target || {}).repMin || 8, repMax: old.repMax || (e.target || {}).repMax || 12, rest: e.rest || old.rest || Store.data.settings.rest }; });
    Store.save(true); toast('Routine updated'); el.remove();
  },

  // ----- Active workout
  addExercise() { this.openPicker('workout', ids => { ids.forEach(id => Store.data.active.exercises.push(this.makeWorkoutEx(id))); Store.save(); }); },
  discardWorkout() { if (confirm('Discard this workout? Logged sets will be lost.')) this.discard(); },
  finishWorkout() { this.finishWorkout(); },
  cycleType(el, d) { const s = Store.data.active.exercises[+d.i].sets[+d.j]; const order = ['N', 'W', 'D', 'F']; s.type = order[(order.indexOf(s.type) + 1) % 4]; Store.save(); this.refreshSheet(); },
  toggleSet(el, d) {
    const e = Store.data.active.exercises[+d.i], s = e.sets[+d.j], ex = Store.ex(e.exId);
    if (!s.done) {
      const p = s.p || {};
      setColumns(ex).forEach(c => { const k = c === 'tt' ? 't' : c; if ((s[k] === '' || s[k] == null) && p[k] != null && p[k] !== '' && k !== 'rpe') s[k] = p[k]; });
      if ((ex.type === 'wr') && s.w === '') return toast('Enter a weight first');
      if (['wr', 'wbw', 'bw'].includes(ex.type) && (s.r === '' || s.r == null)) return toast('Enter reps first');
      s.done = true; buzz([30]);
      const nextUndone = e.sets.slice(+d.j + 1).some(x => !x.done);
      if (!e.ss && e.rest && (nextUndone || Store.data.active.exercises.indexOf(e) < Store.data.active.exercises.length - 1)) this.startRest(e.rest);
    } else s.done = false;
    Store.save(); this.refreshSheet();
  },
  addSet(el, d) {
    const e = Store.data.active.exercises[+d.i], last = e.sets[e.sets.length - 1] || {};
    e.sets.push({ type: 'N', w: last.w || '', r: '', t: '', d: '', g: '', a: '', rpe: '', done: false, p: { ...(last.p || {}), w: last.w || (last.p || {}).w, r: last.r || (last.p || {}).r, t: last.t || (last.p || {}).t } });
    Store.save(); this.refreshSheet();
  },
  removeSet(el, d) { const e = Store.data.active.exercises[+d.i]; if (e.sets.length) e.sets.pop(); Store.save(); this.refreshSheet(); },
  applySug(el, d) {
    const e = Store.data.active.exercises[+d.i], sug = Coach.suggest(e.exId, e.target);
    const warm = e.sets.filter(s => s.type === 'W');
    e.sets = warm.map(s => s.done ? s : { ...s, w: s.p.w, r: s.p.r }).concat(sug.sets.map(p => ({ type: 'N', w: p.w != null ? p.w : '', r: p.r != null ? p.r : '', t: p.t != null ? p.t : '', d: p.d != null ? p.d : '', g: p.g || '', a: p.a || '', rpe: '', done: false, p: { ...p } })));
    Store.save(); this.refreshSheet(); toast('Coach plan applied');
  },
  swapEx(el, d) { const a = Store.data.active, old = a.exercises[+d.i]; a.exercises[+d.i] = this.makeWorkoutEx(d.id, null, old.rest); Store.save(); this.refreshSheet(); toast('Switched to ' + Store.ex(d.id).name); },
  restAdj(el, d) { if (!this.restEnd) return; this.restEnd += +d.v * 1000; this.restTotal = Math.max(1, this.restTotal + +d.v); Notify.at(REST_NOTIF, this.restEnd, 'Rest over', 'Time for your next set'); this.tick(); },
  restSkip() { this.stopRest(); },
  exMenu(el, d) {
    const i = +d.i, a = Store.data.active, e = a.exercises[i];
    this.openSheet('exmenu', esc(Store.ex(e.exId).name), () => `<div class="card list">
      <button class="li" data-a="exOp" data-op="notes" data-i="${i}">${icon('notes')}<span>${e.showNotes ? 'Hide' : 'Add'} notes</span></button>
      <button class="li" data-a="exOp" data-op="ss" data-i="${i}">${icon('link')}<span>${e.ss ? 'Unlink superset' : 'Superset with next exercise'}</span></button>
      <button class="li" data-a="exOp" data-op="up" data-i="${i}">${icon('arrow-up')}<span>Move up</span></button>
      <button class="li" data-a="exOp" data-op="down" data-i="${i}">${icon('arrow-down')}<span>Move down</span></button>
      <button class="li" data-a="exOp" data-op="replace" data-i="${i}">${icon('replace')}<span>Replace exercise</span></button>
      <button class="li" data-a="exOp" data-op="warm" data-i="${i}">${icon('temperature')}<span>Add warm-up sets</span></button>
      <button class="li danger" data-a="exOp" data-op="remove" data-i="${i}">${icon('trash')}<span>Remove exercise</span></button></div>`);
  },
  exOp(el, d) {
    const a = Store.data.active, i = +d.i, list = a.exercises, e = list[i];
    this.closeSheet();
    if (d.op === 'notes') e.showNotes = !e.showNotes;
    if (d.op === 'ss') e.ss = !e.ss;
    if (d.op === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    if (d.op === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    if (d.op === 'remove') list.splice(i, 1);
    if (d.op === 'warm') {
      const top = Math.max(...e.sets.map(s => +s.w || +(s.p || {}).w || 0));
      if (!top) toast('Enter a working weight first');
      else warmupSets(top).slice(0, 4).reverse().forEach(ws => e.sets.unshift({ type: 'W', w: '', r: '', rpe: '', done: false, p: ws }));
    }
    if (d.op === 'replace') { this.openPicker('replace', ids => { if (ids[0]) list[i] = this.makeWorkoutEx(ids[0], null, e.rest); Store.save(); }); return; }
    Store.save(); this.refreshSheet();
  },

  // ----- Picker
  pickDisc(el, d) { this.pick.disc = d.id; this.refreshSheet(); },
  pickMuscle(el, d) { this.pick.muscle = d.id; this.refreshSheet(); },
  pickToggle(el, d) {
    const p = this.pick;
    if (p.mode === 'browse') { this.openExDetail(d.id); return; }
    if (p.mode === 'replace') { this.closeSheet(); p.onPick([d.id]); this.refreshSheet(); return; }
    const k = p.sel.indexOf(d.id); if (k >= 0) p.sel.splice(k, 1); else p.sel.push(d.id);
    const scroll = $('.sheet-body').scrollTop; this.refreshSheet(); $('.sheet-body').scrollTop = scroll;
  },
  pickDone() { const p = this.pick; if (!p.sel.length) return toast('Select at least one exercise'); this.closeSheet(); p.onPick(p.sel); this.refreshSheet(); },
  customEx() { this.openCustomEx(); },
  saveCustomEx() {
    const f = this.cx; if (!f.name || !f.name.trim()) return toast('Enter a name');
    const ex = Store.addCustomExercise({ name: f.name.trim(), muscle: f.muscle, equipment: f.equipment, type: f.type, discipline: f.discipline, compound: f.compound });
    this.closeSheet(); if (this.pick) { this.pick.sel.push(ex.id); this.refreshSheet(); } toast('Exercise created');
  },

  // ----- Details
  exDetail(el, d) { this.openExDetail(d.id); },
  allExercises() { this.openLibrary(); },
  workoutDetail(el, d) { this.openWorkoutDetail(d.id); },
  repeatWorkout(el, d) {
    const w = Store.data.workouts.find(x => x.id === d.id);
    this.stack = []; this.beginWorkout(() => this.newWorkout(w.name, { id: w.routineId, exercises: w.exercises.map(e => ({ exId: e.exId, sets: e.sets.filter(s => s.type !== 'W').length, repMin: (e.target || {}).repMin, repMax: (e.target || {}).repMax, rest: e.rest })) }));
  },
  deleteWorkout(el, d) { if (!confirm('Delete this workout from history? This can\'t be undone.')) return; Store.data.workouts = Store.data.workouts.filter(w => w.id !== d.id); Store.save(true); this.closeSheet(); toast('Workout deleted'); },

  // ----- Disciplines, ladders, timers, tools
  discipline(el, d) { this.openDiscipline(d.id); },
  quickStart(el, d) { this.stack = []; this.beginWorkout(() => { this.newWorkout(Store.ex(d.id).name); Store.data.active.exercises.push(this.makeWorkoutEx(d.id)); Store.save(); this.refreshSheet(); }); },
  ladder(el, d) { this.openLadder(d.id); },
  timerSetup(el, d) { this.openTimerSetup(d.id); },
  timerStart() { this.startTimer(); },
  timerPause() { Timer.pause(); },
  timerStop() { if (confirm('Stop the timer?')) { Timer.stop(); this.closeSheet(); } },
  timerRound() { Timer.amrapRounds++; this.refreshSheet(); },
  timerSave() { Timer.save(); this.stack = []; this.render(); this.renderSheets(); toast('Session saved to history'); },
  tool(el, d) { this.openTool(d.id); },

  // ----- Body
  addMeasure() { this.openMeasure(); },
  mSave() {
    const m = { id: uid(), date: Date.now() };
    Object.entries(this.mdraft).forEach(([k, v]) => { if (v !== '' && v != null) m[k] = num(v); });
    if (Object.keys(m).length <= 2) return toast('Enter at least one value');
    Store.data.measurements.push(m); if (m.weight) Store.data.settings.bodyweight = m.weight; Store.save(true); this.closeSheet(); toast('Measurements saved');
  },
  measureList() { this.openMeasureList(); },
  deleteMeasure(el, d) { Store.data.measurements = Store.data.measurements.filter(m => m.id !== d.id); Store.save(true); this.refreshSheet(); },
  async addPhoto(el) {
    const f = el.files && el.files[0]; if (!f) return;
    try { const src = await resizeImage(f); Store.photos.push({ id: uid(), date: Date.now(), src }); if (Store.savePhotos()) { toast('Photo added'); this.render(); } else Store.photos.pop(); }
    catch (e) { toast('Couldn\'t read that image'); }
  },
  viewPhoto(el, d) {
    const p = Store.photos.find(x => x.id === d.id);
    this.openSheet('photo', fmtDate(p.date), () => `<img class="photo-full" src="${p.src}" alt="Progress photo"><button class="btn wide danger-ghost" data-a="deletePhoto" data-id="${p.id}">${icon('trash')} Delete photo</button>`);
  },
  deletePhoto(el, d) { if (!confirm('Delete this photo?')) return; Store.photos = Store.photos.filter(p => p.id !== d.id); Store.savePhotos(); this.closeSheet(); },

  // ----- Settings, data, updates
  settings() { this.openSettings(); },
  dataSheet() { this.openData(); },
  updates() { this.openUpdates(); },
  checkUpdate() { Updater.check(true); },
  async importFile(el) {
    const f = el.files && el.files[0]; if (!f) return;
    try { this.importResult = await IO.parseFile(f, this.impUnit || U()); this.importResult.file = f.name; }
    catch (e) { this.importResult = { error: e.message || String(e), file: f.name }; }
    el.value = ''; this.refreshSheet();
  },
  importCommit() { const r = this.importResult; const n = IO.commit(r); this.importResult = null; this.refreshSheet(); toast(`Imported ${n} workout(s)`); },
  importCancel() { this.importResult = null; this.refreshSheet(); },
  exportJSON() { download(`overload-backup-${new Date().toISOString().slice(0, 10)}.json`, Store.exportJSON(), 'application/json'); },
  exportStrong() { download(`overload-strong-format-${new Date().toISOString().slice(0, 10)}.csv`, IO.toStrongCSV(), 'text/csv'); },
  exportHevy() { download(`overload-hevy-format-${new Date().toISOString().slice(0, 10)}.csv`, IO.toHevyCSV(), 'text/csv'); },
  wipeData() {
    if (!confirm('Delete ALL workouts, routines, measurements and photos from this phone? This can\'t be undone. Export a backup first.')) return;
    if (!confirm('Are you sure? Everything will be erased.')) return;
    Store.data = Store.defaults(); Store.photos = []; Store.save(true); Store.savePhotos(); this.stack = []; this.renderSheets(); this.nav('home');
  }
};
