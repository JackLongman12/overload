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
    d.u = Date.now();
    const rs = Store.data.routines, i = rs.findIndex(r => r.id === d.id);
    if (i >= 0) rs[i] = d; else rs.push(d);
    Store.save(true); this.closeSheet(); toast('Routine saved');
  },
  rDelete() { if (!confirm('Delete this routine? Your workout history is kept.')) return; Store.tombstone(this.draft.id); Store.data.routines = Store.data.routines.filter(r => r.id !== this.draft.id); Store.save(true); this.closeSheet(); },
  programs() { this.openPrograms(); },
  toggleIns() { this._allIns = !this._allIns; this.render(); },
  watchDemo(el, d) { openExternal('https://www.youtube.com/results?search_query=' + encodeURIComponent(Store.ex(d.id).name + ' exercise proper form')); },
  progGoal(el, d) { this.progGoal = d.id; this.refreshSheet(); },
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
      const auto = Plan.autoregulate(e, +d.j); if (auto) toast(auto, 3500);
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
      <button class="li" data-a="watchDemo" data-id="${e.exId}">${icon('brand-youtube')}<span>Watch how to do it</span></button>
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
  deleteWorkout(el, d) { if (!confirm('Delete this workout from history? This can\'t be undone.')) return; Store.tombstone(d.id); Store.data.workouts = Store.data.workouts.filter(w => w.id !== d.id); Store.save(true); this.closeSheet(); toast('Workout deleted'); },

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
    Store.data.measurements.push(m); if (m.weight) { Store.data.settings.bodyweight = m.weight; HC.saveWeight(m.weight, m.bodyfat); } Store.save(true); this.closeSheet(); toast('Measurements saved');
  },
  measureList() { this.openMeasureList(); },
  deleteMeasure(el, d) { Store.tombstone(d.id); Store.data.measurements = Store.data.measurements.filter(m => m.id !== d.id); Store.save(true); this.refreshSheet(); },
  async addPhoto(el) {
    const f = el.files && el.files[0]; if (!f) return;
    try { const src = await resizeImage(f, 1080); if (await Photos.add(src)) { toast('Photo added'); this.render(); } }
    catch (e) { toast('Couldn\'t read that image'); }
  },
  viewPhoto(el, d) {
    const p = Store.photos.find(x => x.id === d.id);
    this.openSheet('photo', fmtDate(p.date), () => `<img class="photo-full" src="${Photos.src(p)}" alt="Progress photo"><button class="btn wide danger-ghost" data-a="deletePhoto" data-id="${p.id}">${icon('trash')} Delete photo</button>`);
  },
  async deletePhoto(el, d) { if (!confirm('Delete this photo?')) return; await Photos.remove(d.id); this.closeSheet(); },

  // ----- Welcome, disclaimer, privacy
  onboardDone() { Store.data.onboarded = true; Store.save(true); this.closeSheet(); },
  disclaimer() { this.openSheet('disclaimer', 'Health and safety', () => DISCLAIMER_HTML); },
  privacy() { const url = 'https://github.com/JackLongman12/overload/blob/main/PRIVACY.md'; const br = Plugin('Browser'); if (br) br.open({ url }); else window.open(url, '_blank'); },

  // ----- AI rep counter
  countReps(el, d) { this.openPose(+d.i); },
  async aiInstall() {
    this.aiBusy = 'Starting…'; this.refreshSheet();
    try { await Pose.installPack(msg => { this.aiBusy = msg; const e = $('#aiBusy'); if (e) e.textContent = msg; }); this.aiBusy = null; this.refreshSheet(); }
    catch (e) { this.aiBusy = null; this.aiErr = e.message; this.refreshSheet(); }
  },
  poseUse() {
    const i = this.poseEx, a = Store.data.active, st = Pose.state;
    if (!a || !st || !st.reps) return toast('No reps counted yet');
    const e = a.exercises[i]; let s = e.sets.find(x => !x.done && x.type !== 'W') || e.sets.find(x => !x.done);
    if (!s) { Actions.addSet.call(this, null, { i }); s = e.sets[e.sets.length - 1]; }
    s.r = st.reps; Store.save();
    Pose.stop(); this.closeSheet(); toast(st.reps + ' reps entered. Tap the check to complete the set.');
  },
  poseReset() { if (Pose.state) { Pose.state.reps = 0; Pose.state.phase = 'up'; Pose.state.cue = 'Start your set'; Pose.state.onUpdate(Pose.state); } },
  async poseFlip() { Pose.facing = Pose.facing === 'user' ? 'environment' : 'user'; this.refreshSheet(); },
  aiDelete() { const fs = Plugin('Filesystem'); if (fs) fs.rmdir({ path: 'ai', directory: 'DATA', recursive: true }).catch(() => { }); delete Store.data.settings.aiPack; Store.save(true); Pose.landmarker = null; toast('AI pack removed'); this.refreshSheet(); },

  // ----- Planning
  toggleGym(el, d) {
    const g = Plan.gym().slice(), i = g.indexOf(d.id);
    if (i >= 0) g.splice(i, 1); else g.push(d.id);
    Store.data.settings.gym = g.length === Object.keys(EQUIPMENT).length ? [] : g; Store.save(); this.refreshSheet();
  },
  pickGym(el) { this.pick.gymOnly = el.checked; $('#pickList').innerHTML = this.pickList(); },
  startBlock(el, d) { Plan.startBlock(d.id); toast(`${Plan.BLOCKS[d.id].name} block started. Week 1 of 5.`); this.stack.length ? this.refreshSheet() : this.render(); this.render(); },
  endBlock() { Plan.endBlock(); this.stack.length ? this.refreshSheet() : this.render(); this.render(); },
  builder() {
    this.bopt = this.bopt || { goal: 'muscle', days: 4, minutes: 60, level: 'Intermediate' };
    const sel = (k, opts) => `<select data-b="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(this.bopt[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    this.openSheet('builder', 'Build my program', () => {
      const plan = Plan.build(this.bopt); this.bplan = plan;
      return `<div class="grid2">
          <label class="field">Goal ${sel('goal', [['muscle', 'Build muscle'], ['strength', 'Get stronger'], ['general', 'General fitness']])}</label>
          <label class="field">Days per week ${sel('days', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']])}</label>
          <label class="field">Session length ${sel('minutes', [[30, '30 min'], [45, '45 min'], [60, '60 min'], [75, '75+ min']])}</label>
          <label class="field">Experience ${sel('level', [['Beginner', 'Beginner'], ['Intermediate', 'Intermediate'], ['Advanced', 'Advanced']])}</label></div>
        <p class="sm muted">Equipment: ${Plan.gym().map(k => EQUIPMENT[k]).join(', ')}. <button class="link sm" data-a="settings">Change</button></p>
        <div class="card"><b>${esc(plan.name)}</b><div class="sm muted">${esc(plan.split)} split</div>
          ${plan.routines.map(r => `<div style="margin-top:10px"><b class="sm">${esc(r.name)}</b>${r.exercises.map(e => `<div class="sm muted">${esc(Store.ex(e.exId).name)}: ${e.sets} × ${e.repMin}–${e.repMax}</div>`).join('')}</div>`).join('')}</div>
        <button class="btn primary wide" data-a="builderAdd">${icon('plus')} Add this program</button>
        <p class="sm muted">You can edit any routine afterwards. Tip: start a training block from Programs to add planned progression and a deload week.</p>`;
    }, { mount: () => $$('[data-b]').forEach(el => el.addEventListener('change', () => { this.bopt[el.dataset.b] = /^\d+$/.test(el.value) ? +el.value : el.value; this.refreshSheet(); })) });
  },
  builderAdd() {
    const p = this.bplan; if (!p) return;
    p.routines.forEach(r => Store.data.routines.push({ id: uid(), name: r.name, program: p.name, u: Date.now(), exercises: r.exercises }));
    Store.save(true); this.stack = []; this.renderSheets(); this.nav('home'); toast(`Added ${p.routines.length} routines`);
  },

  // ----- Error log
  errorLog() {
    this.openSheet('errors', 'Error log', () => {
      const l = ErrorLog.list().slice().reverse();
      return `<p class="sm muted">Errors are recorded on this phone only. If something breaks, share this log so it can be fixed.</p>
        <div class="grid2"><button class="btn primary" data-a="errorShare">${icon('share')} Share log</button><button class="btn" data-a="errorClear">${icon('trash')} Clear</button></div>
        ${l.length ? l.map(e => `<div class="card sm"><div class="row-between"><b>${esc(e.kind)}</b><span class="muted">${fmtDate(e.t, { day: 'numeric', month: 'short' })} ${fmtTime(e.t)}</span></div><div>${esc(e.msg)}</div>${e.stack ? `<details><summary>Details</summary><pre class="stack">${esc(e.stack)}</pre></details>` : ''}</div>`).join('') : '<div class="empty">No errors recorded.</div>'}`;
    });
  },
  errorShare() { download(`gym-app-errors-${new Date().toISOString().slice(0, 10)}.txt`, ErrorLog.text()); },
  errorClear() { ErrorLog.clear(); this.refreshSheet(); },

  // ----- Devices
  devices() { this.openDevices(); },
  async hcConnect() { try { await HC.connect(); toast(HC.on ? 'Health Connect linked' : 'No permissions granted'); } catch (e) { toast(e.message); } this.refreshSheet(); },
  async hcPull() { toast('Reading from Health Connect…'); const h = await HC.pull(); toast(h ? `Updated${h.imported ? ', ' + h.imported + ' watch workout(s) added' : ''}` : 'Not linked'); this.refreshSheet(); },
  hcSettings() { if (HC.api) HC.api.openHealthConnectSettings().catch(() => { }); },
  hcDisconnect() { HC.disconnect(); this.refreshSheet(); toast('Unlinked. To fully revoke access, use Health Connect settings.'); },
  async scaleScan() {
    this.scale = { status: 'scanning', reading: null };
    this.refreshSheet();
    try {
      await BLE.scanScale(r => {
        if (!r) { if (this.scale.status === 'scanning') this.scale.status = 'timeout'; this.refreshSheet(); return; }
        this.scale.reading = r;
        if (r.stable) { this.scale.status = 'done'; BLE.stopScan(); buzz([80]); }
        const el = $('#scaleLive'); if (el) el.textContent = fmtW(Store.data.settings.unit === 'lb' ? Math.round(r.kg / 0.45359237 * 10) / 10 : r.kg);
        if (r.stable) this.refreshSheet();
      });
    } catch (e) { this.scale = { status: 'error', err: e.message }; this.refreshSheet(); }
  },
  scaleStop() { BLE.stopScan(); this.scale = null; this.refreshSheet(); },
  scaleSave() {
    const r = this.scale && this.scale.reading; if (!r) return;
    const w = Store.data.settings.unit === 'lb' ? Math.round(r.kg / 0.45359237 * 10) / 10 : Math.round(r.kg * 10) / 10;
    const m = { id: uid(), date: Date.now(), weight: w, source: r.model };
    if (r.impedance) m.impedance = r.impedance;
    Store.data.measurements.push(m); Store.data.settings.bodyweight = w; Store.save(true);
    HC.saveWeight(w);
    this.scale = null; this.refreshSheet(); toast('Weight saved: ' + w + ' ' + U());
  },
  async hrConnect() { try { toast('Looking for heart-rate monitors…'); await BLE.connectHR(); toast('Heart-rate monitor connected'); } catch (e) { toast(e.message || 'No device selected'); } },
  hrDisconnect() { BLE.disconnectHR(true); },

  // ----- Account and sync
  account() { this.authMode = this.authMode || 'signup'; this.openAccount(); },
  authMode(el, d) { this.authMode = d.id; this.authErr = ''; this.refreshSheet(); },
  async authSubmit() {
    const email = ($('#authEmail') || {}).value || '', pw = ($('#authPw') || {}).value || '', pw2 = ($('#authPw2') || {}).value, code = ($('#authCode') || {}).value || '';
    const mode = this.authMode;
    const fail = m => { this.authErr = m; this.refreshSheet(); };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail('Enter a valid email address.');
    if (mode === 'recover' && code.replace(/[^A-Za-z0-9]/g, '').length !== 25) return fail('Enter the 25-character recovery key.');
    if (pw.length < 10) return fail('Use a password of at least 10 characters.');
    if (mode !== 'login' && pw !== pw2) return fail("The passwords don't match.");
    this.authBusy = true; this.authErr = ''; this.refreshSheet();
    try {
      if (mode === 'signup') { const rc = await Sync.signup(email, pw); this.showRecoveryCode(rc); }
      else if (mode === 'recover') { await Sync.recover(email, code, pw); toast('Password reset. You were signed out on your other devices.'); }
      else { await Sync.login(email, pw); toast('Logged in. Your data is syncing.'); }
    } catch (e) { this.authErr = e.message; }
    this.authBusy = false; this.refreshSheet();
  },
  async makeRecovery() {
    if (Sync.acct.hasRecovery && !confirm('Make a new recovery key? The old one will stop working.')) return;
    try { this.showRecoveryCode(await Sync.createRecovery()); } catch (e) { toast(e.message); }
  },
  copyRecovery() { const c = this.recCode; if (navigator.clipboard) navigator.clipboard.writeText(c).then(() => toast('Copied. Store it somewhere safe.')).catch(() => toast('Copy failed. Write it down.')); },
  savedRecovery() { this.recCode = null; this.closeSheet(); toast('Recovery key set'); },
  async changePw() {
    const cur = ($('#pwCur') || {}).value || '', n1 = ($('#pwNew') || {}).value || '', n2 = ($('#pwNew2') || {}).value || '';
    const fail = m => { this.pwErr = m; this.refreshSheet(); };
    if (n1.length < 10) return fail('Use a new password of at least 10 characters.');
    if (n1 !== n2) return fail("The new passwords don't match.");
    this.pwBusy = true; this.pwErr = ''; this.refreshSheet();
    try { await Sync.changePassword(cur, n1); this.pwBusy = false; this.closeSheet(); toast('Password changed. Other devices were signed out.'); }
    catch (e) { this.pwBusy = false; fail(e.message); }
  },
  changePwSheet() {
    this.pwErr = '';
    this.openSheet('pw', 'Change password', () => `
      <label class="field">Current password<input id="pwCur" type="password" autocomplete="current-password"></label>
      <label class="field">New password<input id="pwNew" type="password" autocomplete="new-password" placeholder="At least 10 characters"></label>
      <label class="field">Confirm new password<input id="pwNew2" type="password" autocomplete="new-password"></label>
      ${this.pwErr ? `<div class="sm" style="color:var(--bad);margin-bottom:10px">${esc(this.pwErr)}</div>` : ''}
      <button class="btn primary wide" data-a="changePw">${this.pwBusy ? 'Working…' : 'Change password'}</button>
      <p class="sm muted">Your data stays encrypted with the same key, so nothing needs to re-upload. Other phones will need to log in again.</p>`);
  },
  syncNow() { Sync.run('manual'); },
  async loadSnapshots() { try { this.snaps = await Sync.snapshots(); } catch (e) { toast(e.message); this.snaps = []; } this.refreshSheet(); },
  async restoreSnap(el, d) {
    if (!confirm('Replace the workouts, routines and measurements on all your devices with this backup? Changes made since then will be lost.')) return;
    try { await Sync.restore(+d.id); toast('Backup restored'); this.render(); } catch (e) { toast('Restore failed: ' + e.message); }
    this.refreshSheet();
  },
  async signOut() { if (!confirm('Sign out? Your data stays on this phone, and sync stops.')) return; await Sync.logout(); this.refreshSheet(); },
  async deleteAccount() {
    if (!confirm("Delete your account and all cloud data and backups? Data on this phone is kept. This can't be undone.")) return;
    try { await Sync.deleteAccount(); toast('Account deleted'); } catch (e) { toast("Couldn't delete: " + e.message); }
    this.refreshSheet();
  },

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
  async exportJSON() { toast('Preparing backup…'); download(`gym-app-backup-${new Date().toISOString().slice(0, 10)}.json`, await Store.exportJSON(), 'application/json'); this.render(); },
  exportStrong() { download(`gym-app-strong-format-${new Date().toISOString().slice(0, 10)}.csv`, IO.toStrongCSV(), 'text/csv'); },
  exportHevy() { download(`gym-app-hevy-format-${new Date().toISOString().slice(0, 10)}.csv`, IO.toHevyCSV(), 'text/csv'); },
  wipeData() {
    if (!confirm('Delete ALL workouts, routines, measurements and photos from this phone? This can\'t be undone. Export a backup first.')) return;
    if (!confirm('Are you sure? Everything will be erased.')) return;
    if (Sync.acct) Sync.logout();
    Store.data = Store.defaults(); [...Store.photos].forEach(p => Photos.remove(p.id)); Store.photos = []; Store.save(true); Store.savePhotos(); this.stack = []; this.renderSheets(); this.nav('home');
  }
};
