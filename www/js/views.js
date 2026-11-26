'use strict';

const MEASURES = [['weight', 'Body weight', () => U()], ['bodyfat', 'Body fat', () => '%'], ['waist', 'Waist', () => 'cm'], ['chest', 'Chest', () => 'cm'], ['hips', 'Hips', () => 'cm'],
  ['arm', 'Arm', () => 'cm'], ['thigh', 'Thigh', () => 'cm'], ['calf', 'Calf', () => 'cm'], ['neck', 'Neck', () => 'cm'], ['rhr', 'Resting heart rate', () => 'bpm']];

const Timer = {
  phases: [], i: 0, end: 0, left: 0, paused: false, iv: null, conf: null, startedAt: 0, amrapRounds: 0, finished: false,
  build(c) {
    const ph = [];
    if (c.prep) ph.push({ label: 'Get ready', secs: c.prep, kind: 'prep' });
    for (let r = 1; r <= c.rounds; r++) {
      ph.push({ label: c.type === 'emom' ? `Minute ${r}` : c.type === 'amrap' ? 'AMRAP' : `Round ${r} of ${c.rounds}`, secs: c.work, kind: 'work', r });
      if (c.rest && r < c.rounds) ph.push({ label: 'Rest', secs: c.rest, kind: 'rest' });
    }
    return ph;
  },
  start(c) {
    this.conf = c; this.phases = this.build(c); this.i = 0; this.paused = false; this.finished = false; this.amrapRounds = 0;
    this.startedAt = Date.now(); this.end = Date.now() + this.phases[0].secs * 1000; this.lastBeep = -1;
    this.scheduleNotifs(); clearInterval(this.iv); this.iv = setInterval(() => this.tick(), 200);
    beep(880, 200);
  },
  scheduleNotifs() {
    Notify.ensure().then(ok => { if (!ok) return; let t = this.end; for (let k = this.i + 1; k < Math.min(this.phases.length, this.i + 40); k++) { Notify.at(100 + k, t, this.phases[k].label, this.phases[k].kind === 'rest' ? 'Rest' : 'Go'); t += this.phases[k].secs * 1000; } Notify.at(99, t, 'Timer finished', 'Great work'); });
  },
  cancelNotifs() { for (let k = 0; k < Math.min(this.phases.length, 200); k++) Notify.cancel(100 + k); Notify.cancel(99); },
  tick() {
    if (this.paused || this.finished) return;
    let left = (this.end - Date.now()) / 1000;
    while (left <= 0) {
      this.i++;
      if (this.i >= this.phases.length) { this.finish(); return; }
      this.end += this.phases[this.i].secs * 1000; left = (this.end - Date.now()) / 1000;
      const k = this.phases[this.i].kind; beep(k === 'rest' ? 520 : 988, 350); buzz([300]);
      if (UI.top() && UI.top().key === 'timer') UI.refreshSheet();
    }
    this.left = left;
    const s = Math.ceil(left);
    if (s <= 3 && s >= 1 && s !== this.lastBeep) { this.lastBeep = s; beep(660, 100, 0.2); }
    const el = $('#tLeft'); if (el) el.textContent = fmtDur(s);
    const ring = $('#tRing'); if (ring) { const p = this.phases[this.i]; ring.style.strokeDashoffset = 565 * (1 - left / p.secs); }
  },
  pause() {
    if (this.paused) { this.paused = false; this.end = Date.now() + this.left * 1000; this.scheduleNotifs(); }
    else { this.paused = true; this.left = (this.end - Date.now()) / 1000; this.cancelNotifs(); }
    UI.refreshSheet();
  },
  stop() { clearInterval(this.iv); this.cancelNotifs(); this.finished = true; },
  finish() { clearInterval(this.iv); this.finished = true; beep(1046, 200); setTimeout(() => beep(1318, 400), 220); buzz([500]); UI.refreshSheet(); },
  save() {
    const c = this.conf, exId = { boxing: 'heavy_bag_rounds', bjj: 'bjj_rolling' }[c.type] || 'interval_session';
    const done = this.finished && this.i >= this.phases.length ? c.rounds : this.phases.slice(0, this.i).filter(p => p.kind === 'work').length;
    const sets = Array.from({ length: Math.max(1, done) }, () => ({ type: 'N', t: c.work, done: true }));
    Store.data.workouts.push({ id: uid(), name: c.name || TIMER_PRESETS[c.type].name, start: this.startedAt, end: Date.now(), notes: c.type === 'amrap' ? `${this.amrapRounds} rounds` : timerSummary(c), exercises: [{ exId, sets, notes: '' }] });
    Store.save(true);
  }
};

Object.assign(UI, {
  beginWorkout(fn) {
    if (Store.data.active) { if (!confirm('You have a workout in progress. Discard it and start a new one?')) return this.openWorkout(); this.discard(); }
    if (!Store.latestCheckin()) { this._afterCheckin = fn; this.openCheckin(true); } else fn();
  },

  openCheckin(beforeWorkout) {
    this.ci = { sleep: 7, quality: 3, soreness: 2, energy: 3, stress: 2 };
    const slider = (k, label, min, max, lo, hi, step = 1) => `<div class="ci"><div class="row-between"><span>${label}</span><b id="ci-${k}">${this.ci[k]}</b></div>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${this.ci[k]}" data-ci="${k}" aria-label="${label}"><div class="row-between sm muted"><span>${lo}</span><span>${hi}</span></div></div>`;
    this.openSheet('checkin', 'Readiness check-in', () => `
      <p class="sm muted">30 seconds. The coach uses this to scale today's sets and weights.</p>
      ${slider('sleep', 'Sleep (hours)', 3, 10, '3h', '10h', 0.5)}${slider('quality', 'Sleep quality', 1, 5, 'Poor', 'Great')}
      ${slider('soreness', 'Muscle soreness', 1, 5, 'None', 'Very sore')}${slider('energy', 'Energy', 1, 5, 'Drained', 'Wired')}
      ${slider('stress', 'Stress', 1, 5, 'Calm', 'High')}
      <div class="card center"><div class="muted sm">Readiness</div><div class="big" id="ciScore">${readinessScore(this.ci)}</div></div>
      <button class="btn primary wide" data-a="ciSave">Save${beforeWorkout ? ' and start' : ''}</button>
      ${beforeWorkout ? '<button class="btn wide ghost" data-a="ciSkip">Skip for today</button>' : ''}`,
      { onClose: () => { } });
  },

  openPrograms() {
    this.openSheet('programs', 'Programs', () => `<p class="sm muted">Ready-made plans, free. Adding one creates its routines, and the coach handles progression.</p>
      ${PROGRAMS.map(p => `<div class="card"><div class="row-between"><div><b>${esc(p.name)}</b><div class="sm muted">${esc(p.desc)}</div></div><button class="btn sm primary" data-a="addProgram" data-id="${p.id}">Add</button></div>
      <div class="sm muted" style="margin-top:6px">${p.routines.map(r => `<div><b>${esc(r[0])}</b>: ${r[1].map(e => esc(Store.ex(e[0]).name)).join(', ')}</div>`).join('')}</div></div>`).join('')}`);
  },

  openCustomEx() {
    this.cx = { name: '', muscle: 'chest', equipment: 'barbell', type: 'wr', discipline: 'strength', compound: false };
    const sel = (k, opts) => `<select data-cx="${k}">${opts.map(([v, l]) => `<option value="${v}" ${this.cx[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    this.openSheet('customex', 'Custom exercise', () => `
      <label class="field">Name<input data-cx="name" placeholder="Landmine press"></label>
      <label class="field">Tracking ${sel('type', [['wr', 'Weight and reps'], ['bw', 'Bodyweight reps'], ['wbw', 'Weighted bodyweight'], ['dur', 'Time (holds, rounds)'], ['dist', 'Distance and time'], ['climb', 'Climbing grade']])}</label>
      <label class="field">Main muscle ${sel('muscle', Object.entries(MUSCLES))}</label>
      <label class="field">Discipline ${sel('discipline', Object.entries(DISCIPLINES).map(([k, v]) => [k, v.name]))}</label>
      <label class="field">Equipment ${sel('equipment', ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight', 'band', 'other', 'none'].map(x => [x, x]))}</label>
      <label class="field row"><input type="checkbox" data-cx="compound"> Compound (multi-joint) movement</label>
      <button class="btn primary wide" data-a="saveCustomEx">Create exercise</button>`,
      { mount: () => $$('[data-cx]').forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => this.cx[el.dataset.cx] = el.type === 'checkbox' ? el.checked : el.value)) });
  },

  openLibrary() {
    this.pick = { mode: 'browse', sel: [], q: '', disc: 'all', muscle: 'all' };
    this.openPicker('browse', () => { });
    this.top().title = 'Exercise library'; this.top().footer = null; this.refreshSheet();
  },

  openExDetail(id) {
    const ex = Store.ex(id);
    const hist = Store.sessions(id, 60).slice().reverse();
    const sug = Coach.suggest(id, null);
    let charts = '';
    if (ex.type === 'wr' || ex.type === 'wbw') {
      charts = `<div class="card"><b>Estimated 1RM</b>${lineChart(hist.map(h => ({ x: h.date, y: Coach.bestE1(h.sets) })), { label: 'estimated 1RM', fmt: Math.round })}</div>
        <div class="card"><b>Best set weight</b>${lineChart(hist.map(h => ({ x: h.date, y: Math.max(...h.sets.map(s => +s.w || 0)) })), { label: 'heaviest weight' })}</div>
        <div class="card"><b>Session volume</b>${lineChart(hist.map(h => ({ x: h.date, y: h.sets.reduce((a, s) => a + (+s.w || 0) * (+s.r || 0), 0) })), { label: 'volume', fmt: Math.round })}</div>`;
    } else if (ex.type === 'bw') charts = `<div class="card"><b>Most reps in a set</b>${lineChart(hist.map(h => ({ x: h.date, y: Math.max(...h.sets.map(s => +s.r || 0)) })), { label: 'max reps' })}</div><div class="card"><b>Total reps</b>${lineChart(hist.map(h => ({ x: h.date, y: h.sets.reduce((a, s) => a + (+s.r || 0), 0) })), { label: 'total reps' })}</div>`;
    else if (ex.type === 'dur') charts = `<div class="card"><b>Longest hold or round (sec)</b>${lineChart(hist.map(h => ({ x: h.date, y: Math.max(...h.sets.map(s => +s.t || 0)) })), { label: 'longest' })}</div>`;
    else if (ex.type === 'dist') charts = `<div class="card"><b>Distance (km)</b>${lineChart(hist.map(h => ({ x: h.date, y: h.sets.reduce((a, s) => a + (+s.d || 0), 0) })), { label: 'distance' })}</div>
      <div class="card"><b>Pace (min/km)</b>${lineChart(hist.filter(h => h.sets[0].d).map(h => ({ x: h.date, y: h.sets[0].t / h.sets[0].d / 60 })), { label: 'pace', fmt: v => fmtDur(v * 60) })}</div>`;
    const b = bestOf(id);
    const best = Math.max(0, ...hist.flatMap(h => h.sets.map(s => Coach.e1rm(s.w, s.r))));
    const ladder = Coach.ladderFor(id);
    this.openSheet('exdetail', esc(ex.name), () => `
      <div class="chips"><span class="chip">${MUSCLES[ex.muscle] || ex.muscle}</span>${(ex.secondary || []).map(m => `<span class="chip ghost">${MUSCLES[m] || m}</span>`).join('')}<span class="chip ghost">${ex.equipment}</span>${ladder ? `<span class="chip ghost">${icon('stairs-up')} ${esc(ladder.name)}</span>` : ''}</div>
      <div class="coach ${sug.kind}"><div class="coach-head">${icon('sparkles')}<b>${esc(sug.title)}</b></div><div class="sm">${esc(sug.text)}</div></div>
      ${(ex.type === 'wr' || ex.type === 'wbw') && hist.length ? `<div class="stats3"><div class="stat"><div class="muted sm">Heaviest</div><b>${fmtW(b.w)}</b></div><div class="stat"><div class="muted sm">Best e1RM</div><b>${Math.round(b.e1)}</b></div><div class="stat"><div class="muted sm">Best set vol.</div><b>${fmtNum(b.vol)}</b></div></div>` : ''}
      ${charts}
      ${best ? `<div class="card"><b>Rep max estimates</b><div class="rm-grid">${[1, 2, 3, 5, 8, 10, 12, 15].map(r => `<div><span class="muted sm">${r}RM</span><b>${fmtW(Coach.roundW(best / (1 + (r === 1 ? 0 : r / 30))))}</b></div>`).join('')}</div></div>` : ''}
      <div class="section-head"><h3>History</h3></div>
      ${hist.slice().reverse().slice(0, 30).map(h => `<div class="card"><div class="sm muted">${fmtDate(h.date)}</div>${h.sets.map((s, k) => `<div class="sm">${k + 1}. ${prevText(ex, s)}${s.rpe ? ' @' + s.rpe : ''}${ex.type === 'wr' ? `<span class="muted"> · e1RM ${Math.round(Coach.e1rm(s.w, s.r))}</span>` : ''}</div>`).join('')}</div>`).join('') || '<div class="empty">No sessions yet.</div>'}`);
  },

  openWorkoutDetail(id) {
    const w = Store.data.workouts.find(x => x.id === id); if (!w) return;
    this.openSheet('wdetail', esc(w.name), () => `
      <div class="muted sm">${fmtDate(w.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${fmtTime(w.start)}</div>
      <div class="stats3"><div class="stat"><div class="muted sm">Duration</div><b>${Math.round(((w.end || w.start) - w.start) / 60000)} min</b></div><div class="stat"><div class="muted sm">Volume</div><b>${fmtNum(workoutVolume(w))}</b></div><div class="stat"><div class="muted sm">Sets</div><b>${w.exercises.reduce((a, e) => a + e.sets.length, 0)}</b></div></div>
      ${w.notes ? `<div class="card sm">${esc(w.notes)}</div>` : ''}
      ${w.exercises.map(e => { const ex = Store.ex(e.exId); let n = 0; return `<div class="card"><button class="ex-title" data-a="exDetail" data-id="${e.exId}">${esc(ex.name)}</button>${e.notes ? `<div class="sm muted">${esc(e.notes)}</div>` : ''}
        ${e.sets.map(s => `<div class="sm set-line"><span class="set-type t-${s.type || 'N'} mini">${(s.type || 'N') === 'N' ? ++n : s.type}</span>${prevText(ex, s)}${s.rpe ? ' @ RPE ' + s.rpe : ''}</div>`).join('')}</div>`; }).join('')}
      <button class="btn primary wide" data-a="repeatWorkout" data-id="${w.id}">${icon('repeat')} Repeat this workout</button>
      <button class="btn wide" data-a="saveAsRoutine" data-id="${w.id}">${icon('device-floppy')} Save as routine</button>
      <button class="btn wide danger-ghost" data-a="deleteWorkout" data-id="${w.id}">${icon('trash')} Delete</button>`);
  },

  openDiscipline(key) {
    const d = DISCIPLINES[key], list = Store.allExercises().filter(e => e.discipline === key);
    const timers = { combat: ['boxing', 'bjj'], conditioning: ['hiit', 'tabata', 'emom', 'amrap'] }[key] || [];
    const extra = {
      cardio: 'Log distance and time. The coach applies the 10% rule for distance and nudges your pace. You can import GPX and TCX files from Strava, Garmin and other trackers.',
      combat: 'Use the round timers, then log rounds. The coach adds rounds over time.',
      mobility: 'Timed holds. The coach adds about 10% hold time each session.',
      climbing: 'Log each climb\'s grade and whether you sent it. After 3 sends at your top grade, the coach suggests projecting the next grade.',
      calisthenics: 'Follow the skill ladders. Once you hit a step\'s goal, the coach tells you to move up.',
      conditioning: 'Interval timers keep running with the screen off, using notifications.',
      strength: 'Double progression: add reps until you top the range, then add weight.'
    }[key];
    this.openSheet('disc', d.name, () => `<p class="sm muted">${extra}</p>
      ${timers.length ? `<div class="grid3">${timers.map(t => `<button class="card tile" data-a="timerSetup" data-id="${t}">${icon(TIMER_PRESETS[t].icon)}<b>${TIMER_PRESETS[t].name}</b></button>`).join('')}</div>` : ''}
      <div class="card list">${list.map(e => `<div class="li"><button class="grow left" data-a="exDetail" data-id="${e.id}"><b>${esc(e.name)}</b><span class="sm muted">${MUSCLES[e.muscle] || ''}</span></button><button class="btn sm" data-a="quickStart" data-id="${e.id}">Start</button></div>`).join('')}</div>`);
  },

  openLadder(id) {
    const l = LADDERS.find(x => x.id === id);
    this.openSheet('ladder', esc(l.name), () => { const p = Coach.ladderProgress(l); return `<p class="sm muted">Reach each step's goal (sets × reps or seconds) to unlock the next one. Progress updates from your logged workouts.</p>
      ${l.steps.map((st, i) => { const ex = Store.ex(st.exId); const state = i < p ? 'done' : i === p ? 'current' : 'locked'; return `<div class="card step ${state}">
        <div class="row-between"><span>${icon(state === 'done' ? 'circle-check' : state === 'current' ? 'player-play' : 'lock')} <b>${esc(ex.name)}</b></span><span class="sm muted">${st.sets} × ${st.goal}${ex.type === 'dur' ? 's' : ''}</span></div>
        ${state === 'current' ? `<button class="btn sm primary" data-a="quickStart" data-id="${st.exId}">Train this step</button>` : ''}</div>`; }).join('')}`; });
  },

  openTimerSetup(type) {
    const p = TIMER_PRESETS[type];
    this.tconf = { type, name: p.name, work: p.work, rest: p.rest, rounds: p.rounds, prep: 10 };
    const f = (k, label, unit) => `<label class="field">${label}<div class="row"><input inputmode="numeric" data-tc="${k}" value="${this.tconf[k]}"><span class="muted sm">${unit}</span></div></label>`;
    this.openSheet('tsetup', p.name + ' timer', () => `
      ${type === 'amrap' ? f('work', 'Time cap', 'seconds') : f('work', type === 'emom' ? 'Interval' : 'Work', 'seconds')}
      ${type === 'amrap' || type === 'emom' ? '' : f('rest', 'Rest', 'seconds')}
      ${type === 'amrap' ? '' : f('rounds', type === 'emom' ? 'Minutes' : 'Rounds', '')}
      ${f('prep', 'Get-ready countdown', 'seconds')}
      <div class="card sm" id="tcSum">${timerSummary(this.tconf)}</div>
      <button class="btn primary wide" data-a="timerStart">${icon('player-play')} Start</button>`);
  },

  startTimer() {
    const c = this.tconf; if (c.work <= 0 || c.rounds <= 0) return toast('Work time and rounds must be above 0');
    Timer.start({ ...c });
    this.stack = this.stack.filter(s => s.key !== 'tsetup');
    this.openSheet('timer', esc(c.name), () => {
      const T = Timer, ph = T.phases[Math.min(T.i, T.phases.length - 1)];
      if (T.finished) return `<div class="celebrate">${icon('trophy')}<h2>Done</h2><div class="muted">${timerSummary(T.conf)}</div></div>
        ${T.conf.type === 'amrap' ? `<div class="center big">${T.amrapRounds} rounds</div>` : ''}
        <button class="btn primary wide" data-a="timerSave">${icon('device-floppy')} Save to history</button><button class="btn wide" data-a="closeSheet">Close without saving</button>`;
      return `<div class="timer ${ph.kind}"><svg viewBox="0 0 200 200" class="ring"><circle cx="100" cy="100" r="90" class="ring-bg"/><circle id="tRing" cx="100" cy="100" r="90" class="ring-fg" style="stroke-dasharray:565;stroke-dashoffset:0"/></svg>
        <div class="timer-in"><div class="phase">${esc(ph.label)}</div><div class="tbig" id="tLeft">${fmtDur(ph.secs)}</div><div class="sm muted">${T.phases[T.i + 1] ? 'Next: ' + esc(T.phases[T.i + 1].label) : 'Final interval'}</div></div></div>
        ${T.conf.type === 'amrap' ? `<button class="btn wide big-btn" data-a="timerRound">${icon('plus')} Round done (${T.amrapRounds})</button>` : ''}
        <div class="grid2"><button class="btn big-btn" data-a="timerPause">${icon(T.paused ? 'player-play' : 'player-pause')} ${T.paused ? 'Resume' : 'Pause'}</button><button class="btn big-btn danger-ghost" data-a="timerStop">${icon('player-stop')} Stop</button></div>`;
    }, { onClose: () => { if (!Timer.finished) Timer.stop(); } });
    Timer.tick();
  },

  openTool(id) {
    const s = Store.data.settings;
    this.toolState = { target: '100', bar: String(s.bar), w: '100', r: '5' };
    const titles = { plates: 'Plate calculator', warmup: 'Warm-up calculator', onerm: '1RM calculator' };
    this.toolId = id;
    this.openSheet('tool', titles[id], () => `
      ${id === 'plates' ? `<label class="field">Target weight (${U()})<input inputmode="decimal" data-tool="target" value="${this.toolState.target}"></label><label class="field">Bar (${U()})<input inputmode="decimal" data-tool="bar" value="${this.toolState.bar}"></label>` : ''}
      ${id === 'warmup' ? `<label class="field">Working weight (${U()})<input inputmode="decimal" data-tool="target" value="${this.toolState.target}"></label>` : ''}
      ${id === 'onerm' ? `<div class="grid2"><label class="field">Weight<input inputmode="decimal" data-tool="w" value="${this.toolState.w}"></label><label class="field">Reps<input inputmode="numeric" data-tool="r" value="${this.toolState.r}"></label></div>` : ''}
      <div id="toolOut">${this.toolOut()}</div>
      ${id === 'plates' ? `<p class="sm muted">Available plates: ${s.plates.join(', ')} ${U()}. Change them in Settings.</p>` : ''}`);
  },

  toolOut() {
    const t = this.toolState, s = Store.data.settings;
    if (this.toolId === 'plates') {
      const target = num(t.target), bar = num(t.bar); let side = (target - bar) / 2;
      if (side < 0) return '<div class="card">The target is lighter than the bar.</div>';
      const used = []; for (const p of s.plates) { while (side >= p - 1e-6) { used.push(p); side -= p; } }
      const max = Math.max(...s.plates);
      return `<div class="card center"><div class="barbell">${used.slice().reverse().map(p => `<span class="plate" style="height:${30 + p / max * 70}px">${p}</span>`).join('')}<span class="bar-mid"></span>${used.map(p => `<span class="plate" style="height:${30 + p / max * 70}px">${p}</span>`).join('')}</div>
        <div><b>Each side:</b> ${used.length ? used.join(' + ') : 'nothing, bar only'}</div>${side > 0.01 ? `<div class="sm warn">${round1(side * 2)} ${U()} can't be loaded with your plates</div>` : ''}</div>`;
    }
    if (this.toolId === 'warmup') {
      const w = num(t.target); if (!w) return '';
      return `<div class="card list">${warmupSets(w).map((x, i) => `<div class="li static"><span>Warm-up ${i + 1}</span><b>${fmtW(x.w)} ${U()} × ${x.r}</b></div>`).join('')}<div class="li static"><span>Working sets</span><b>${fmtW(w)} ${U()}</b></div></div>`;
    }
    const w = num(t.w), r = num(t.r); if (!w || !r) return '';
    const epley = Coach.e1rm(w, r), brz = r < 37 ? w * 36 / (37 - r) : epley, e = (epley + brz) / 2;
    return `<div class="card center"><div class="muted sm">Estimated 1RM</div><div class="big">${fmtW(Coach.roundW(e))} ${U()}</div></div>
      <div class="card list">${[100, 95, 90, 85, 80, 75, 70, 65, 60].map(p => `<div class="li static"><span>${p}%</span><b>${fmtW(Coach.roundW(e * p / 100))} ${U()}</b></div>`).join('')}</div>`;
  },

  openMeasure() {
    this.mdraft = {};
    this.openSheet('measure', 'Log measurements', () => `<p class="sm muted">Fill in any you track. Leave the rest blank.</p>
      <div class="grid2">${MEASURES.map(([k, l, u]) => `<label class="field">${l} <span class="muted sm">${u()}</span><input inputmode="decimal" data-m="${k}"></label>`).join('')}</div>
      <button class="btn primary wide" data-a="mSave">Save</button>`);
  },

  openMeasureList() {
    this.openSheet('mlist', 'Measurements', () => {
      const m = Store.data.measurements.slice().sort((a, b) => a.date - b.date);
      return MEASURES.filter(([k]) => m.some(x => x[k] != null)).map(([k, l, u]) => `<div class="card"><b>${l}</b> <span class="muted sm">${u()}</span>${lineChart(m.filter(x => x[k] != null).map(x => ({ x: x.date, y: x[k] })), { label: l })}</div>`).join('')
        + `<div class="card list">${m.slice().reverse().map(x => `<div class="li static"><span class="sm">${fmtDate(x.date)}</span><span class="sm muted grow right">${MEASURES.filter(([k]) => x[k] != null).map(([k, l]) => l + ' ' + x[k]).join(' · ')}</span><button class="icon-btn" data-a="deleteMeasure" data-id="${x.id}" aria-label="Delete">${icon('trash')}</button></div>`).join('') || '<div class="empty">No measurements yet.</div>'}</div>`;
    });
  },

  openSettings() {
    const s = Store.data.settings;
    this.openSheet('settings', 'Settings', () => `
      <label class="field">Your name<input data-setting="name" value="${esc(s.name)}" placeholder="Optional"></label>
      <label class="field">Units<select data-setting="unit"><option value="kg" ${s.unit === 'kg' ? 'selected' : ''}>Kilograms (kg)</option><option value="lb" ${s.unit === 'lb' ? 'selected' : ''}>Pounds (lb)</option></select></label>
      <p class="sm muted">Changing units doesn't convert weights you've already logged.</p>
      <div class="grid2">
        <label class="field">Default rest (sec)<input inputmode="numeric" data-setting="rest" value="${s.rest}"></label>
        <label class="field">Weekly workout goal<input inputmode="numeric" data-setting="weekGoal" value="${s.weekGoal}"></label>
        <label class="field">Bar weight (${s.unit})<input inputmode="decimal" data-setting="bar" value="${s.bar}"></label>
        <label class="field">Body weight (${s.unit})<input inputmode="decimal" data-setting="bodyweight" value="${s.bodyweight}"></label>
      </div>
      <label class="field">Available plates (${s.unit}, comma separated)<input data-setting="plates" value="${s.plates.join(', ')}"></label>
      <button class="btn wide" data-a="updates">${icon('refresh')} App updates</button>`);
  },

  openUpdates() {
    const s = Store.data.settings;
    this.openSheet('settings', 'App updates', () => {
      const st = { idle: 'Not checked yet', checking: 'Checking…', current: 'You\'re up to date', downloading: 'Downloading update…', ready: `Update ${Updater.info && Updater.info.version} downloaded. It applies on next launch.`, apk: 'A new APK is available', web: 'A new version is available', error: 'Check failed: ' + (Updater.err || '') }[Updater.state];
      return `<div class="card"><div class="li static"><span>App content version</span><b>${esc(Updater.bundleVersion)}</b></div><div class="li static"><span>Android app version</span><b>${esc(Updater.nativeVersion || 'browser')}${Updater.nativeBuild ? ' (build ' + Updater.nativeBuild + ')' : ''}</b></div>
        <div class="li static"><span>Status</span><span class="sm">${esc(st)}</span></div></div>
      <label class="field">Update feed URL (update.json)<input data-setting="updateUrl" value="${esc(s.updateUrl)}" placeholder="https://raw.githubusercontent.com/you/overload/main/dist/update.json"></label>
      <label class="field row"><input type="checkbox" data-setting="autoUpdate" ${s.autoUpdate ? 'checked' : ''}> Check for updates automatically at startup</label>
      <button class="btn primary wide" data-a="checkUpdate">${icon('refresh')} Check now</button>
      ${Updater.state === 'ready' ? `<button class="btn wide" data-a="applyUpdate">${icon('player-play')} Restart and apply now</button>` : ''}
      ${Updater.state === 'apk' ? `<button class="btn wide" data-a="openApk">${icon('download')} Download new APK</button>` : ''}
      <p class="sm muted">Content updates (features, coach logic, fixes) download quietly and install on the next launch, with no reinstall. Changes to the Android side itself need a new APK, and the app will offer to download it.</p>`;
    });
  },

  openData() {
    this.impUnit = this.impUnit || U();
    this.openSheet('data', 'Import, export and sync', () => {
      const r = this.importResult;
      let res = '';
      if (r && r.error) res = `<div class="card warn-card"><b>Couldn't import ${esc(r.file)}</b><div class="sm">${esc(r.error)}</div><button class="btn sm" data-a="importCancel">OK</button></div>`;
      else if (r) {
        const sets = r.workouts.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
        const range = r.workouts.length ? `${fmtDate(Math.min(...r.workouts.map(w => w.start)), { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(Math.max(...r.workouts.map(w => w.start)), { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
        res = `<div class="card accent-card col"><b>${esc(r.source)} file: ${esc(r.file)}</b><div class="sm">${r.workouts.length} workouts · ${sets} sets · ${range}</div>${r.exercisesCreated ? `<div class="sm">${r.exercisesCreated} exercises weren't in the library and were added as custom exercises.</div>` : ''}<div class="sm">Duplicates are skipped automatically.</div>
          <div class="grid2"><button class="btn primary" data-a="importCommit">Import</button><button class="btn" data-a="importCancel">Cancel</button></div></div>`;
      }
      return `<div class="section-head"><h3>Import from other apps</h3></div>
      <div class="card sm">
        <div class="fmt"><b>Hevy</b>: Settings, Export data, Export workouts (CSV)</div>
        <div class="fmt"><b>Strong</b>: Settings, Export data (CSV)</div>
        <div class="fmt"><b>FitNotes</b>: Settings, Spreadsheet export (CSV)</div>
        <div class="fmt"><b>Strava, Garmin, Nike Run, Coros, Polar</b>: GPX or TCX activity files</div>
        <div class="fmt"><b>Any spreadsheet</b>: CSV with Date, Exercise, Weight and Reps columns</div>
        <div class="fmt"><b>Overload backup</b>: .json from this app</div>
      </div>
      <label class="field">Weight unit in the file (when the file doesn't say)<select data-imp="1"><option value="kg" ${this.impUnit === 'kg' ? 'selected' : ''}>kg</option><option value="lb" ${this.impUnit === 'lb' ? 'selected' : ''}>lb</option></select></label>
      <label class="btn primary wide">${icon('file-import')} Choose file<input type="file" accept=".csv,.json,.gpx,.tcx,text/csv,application/json,application/gpx+xml,application/xml,text/xml" data-a-change="importFile" hidden></label>
      ${res}
      <div class="section-head"><h3>Export</h3></div>
      <button class="btn wide" data-a="exportJSON">${icon('database-export')} Full backup (.json)</button>
      <button class="btn wide" data-a="exportStrong">${icon('table-export')} Strong-format CSV (Hevy can import this)</button>
      <button class="btn wide" data-a="exportHevy">${icon('table-export')} Hevy-format CSV</button>
      <p class="sm muted">To sync two phones, export a backup on one and import it on the other. Workouts are merged and duplicates skipped.</p>
      <div class="section-head"><h3>Danger zone</h3></div>
      <button class="btn wide danger-ghost" data-a="wipeData">${icon('trash')} Delete all data</button>`;
    });
  }
});

document.addEventListener('DOMContentLoaded', () => UI.init());
