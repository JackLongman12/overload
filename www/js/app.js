'use strict';

const REST_NOTIF = 1;
const fmtW = w => (w === '' || w == null) ? '' : String(+(+w).toFixed(2));
const U = () => Store.data.settings.unit;

const UI = {
  tab: 'home', stack: [], restEnd: 0, restTotal: 0, draft: null, pick: null, timer: null, importResult: null,

  async init() {
    await Store.load();
    await Sync.load();
    this.bind();
    this.render();
    setInterval(() => this.tick(), 1000);
    Updater.init();
    const app = Plugin('App');
    if (app) {
      app.addListener('backButton', () => this.back());
      app.addListener('resume', () => { this.tick(); Sync.schedule(800); });
    }
    if (!Store.data.onboarded) this.openWelcome();
    else if (Store.data.active) toast('Workout in progress. Tap the banner to resume.');
  },

  back() {
    if (this.stack.length) this.closeSheet();
    else if (this.tab !== 'home') this.nav('home');
    else { const app = Plugin('App'); if (app) app.minimizeApp(); }
  },

  // ---------- Rendering shell
  render() {
    const t = this.tab;
    $('#view').innerHTML = this['tab_' + t]();
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    this.renderBanner();
  },
  nav(tab) { this.tab = tab; this.render(); $('#view').scrollTop = 0; window.scrollTo(0, 0); },

  renderBanner() {
    const a = Store.data.active, el = $('#banner');
    const showing = this.stack.some(s => s.key === 'workout');
    if (a && !showing) {
      el.innerHTML = `<button class="banner" data-a="openWorkout">${icon('barbell')}<span><b>${esc(a.name)}</b> in progress · <span class="wtime">${fmtDur((Date.now() - a.start) / 1000)}</span></span>${icon('chevron-up')}</button>`;
    } else el.innerHTML = '';
    const u = Updater.state;
    const ub = $('#updbar');
    if (u === 'ready') ub.innerHTML = `<div class="updbar">${icon('download')} Update ${esc(Updater.info.version)} is ready <button class="btn sm primary" data-a="applyUpdate">Restart</button></div>`;
    else if (u === 'apk') ub.innerHTML = `<div class="updbar">${icon('brand-android')} A new app version is available <button class="btn sm primary" data-a="openApk">Download</button></div>`;
    else if (u === 'web') ub.innerHTML = `<div class="updbar">${icon('refresh')} New version ${esc(Updater.info.version)} <button class="btn sm primary" data-a="applyUpdate">Reload</button></div>`;
    else ub.innerHTML = '';
  },
  onSyncState() {
    const el = $('#syncLabel'); if (el) el.textContent = Sync.label();
    if (this.stack.length && this.top().key === 'account') this.refreshSheet();
  },
  onUpdateState() { this.renderBanner(); if (this.stack.length && this.top().key === 'settings') this.refreshSheet(); },

  openSheet(key, title, renderFn, opts = {}) {
    this.stack = this.stack.filter(s => s.key !== key);
    this.stack.push({ key, title, render: renderFn, ...opts });
    this.renderSheets();
  },
  top() { return this.stack[this.stack.length - 1]; },
  closeSheet() { const s = this.stack.pop(); if (s && s.onClose) s.onClose(); this.renderSheets(); this.render(); },
  refreshSheet() { this.renderSheets(); },
  renderSheets() {
    const root = $('#sheets');
    if (!this.stack.length) { root.innerHTML = ''; document.body.classList.remove('sheet-open'); this.renderBanner(); return; }
    document.body.classList.add('sheet-open');
    const s = this.top();
    const prevScroll = root.firstElementChild && root.firstElementChild.dataset.key === s.key ? $('.sheet-body', root).scrollTop : 0;
    root.innerHTML = `<div class="sheet" data-key="${s.key}">
      <header class="sheet-head"><button class="icon-btn" data-a="closeSheet" aria-label="Back">${icon(s.key === 'workout' ? 'chevron-down' : 'arrow-left')}</button>
      <h2>${s.title}</h2>${s.action || '<span style="width:40px"></span>'}</header>
      <div class="sheet-body">${s.render()}</div>${s.footer ? s.footer() : ''}</div>`;
    $('.sheet-body', root).scrollTop = prevScroll;
    if (s.mount) s.mount();
    this.renderBanner();
  },

  // ---------- Tabs
  tab_home() {
    const d = Store.data, a = d.active;
    const ci = Store.latestCheckin();
    const wk = d.workouts.filter(w => w.start > startOfWeek());
    const vol = wk.reduce((s, w) => s + workoutVolume(w), 0);
    const rec = Coach.recovery();
    const recList = Object.entries(rec).filter(([m]) => !['cardio', 'mobility', 'full_body'].includes(m));
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const lastB = d.settings.lastBackup || 0, firstW = d.workouts.length ? Math.min(...d.workouts.map(w => w.start)) : Date.now();
    const needBackup = d.workouts.length >= 3 && Date.now() - Math.max(lastB, firstW) > 30 * 864e5;
    return `
    <div class="page-head"><div><div class="muted sm">${fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}</div><h1>${greet}${d.settings.name ? ', ' + esc(d.settings.name) : ''}</h1></div></div>
    ${a ? `<button class="card accent-card" data-a="openWorkout">${icon('player-play')} <div><b>Resume ${esc(a.name)}</b><div class="sm">${a.exercises.length} exercises · started ${fmtTime(a.start)}</div></div></button>` : ''}
    ${needBackup ? `<div class="card warn-card"><div class="row-between"><div><b>${icon('database-export')} Back up your training</b><div class="sm">${lastB ? 'Last backup ' + fmtDate(lastB, { day: 'numeric', month: 'short' }) : 'You haven\'t made a backup yet'}. Save a copy to Drive or email so a lost phone doesn't mean lost progress.</div></div><button class="btn sm primary" data-a="exportJSON">Back up</button></div></div>` : ''}
    <div class="card">
      <div class="row-between"><div><div class="muted sm">Readiness today</div>
      ${ci ? `<div class="big">${ci.score}<span class="muted sm"> / 100</span></div><div class="sm muted">${readinessLabel(ci.score)}</div>` : `<div class="sm">Check in so the coach can adjust today's targets.</div>`}</div>
      <button class="btn ${ci ? '' : 'primary'}" data-a="checkin">${icon('heart-rate-monitor')} ${ci ? 'Redo' : 'Check in'}</button></div>
    </div>
    <div class="grid2">
      <button class="btn big-btn primary" data-a="startEmpty">${icon('plus')} Empty workout</button>
      <button class="btn big-btn" data-a="programs">${icon('books')} Programs</button>
    </div>
    <div class="section-head"><h3>Routines</h3><button class="link" data-a="newRoutine">${icon('plus')} New</button></div>
    ${d.routines.length ? routineGroups(d).map(g => `
      ${g.name ? `<div class="group-head sm muted">${icon('books')} ${esc(g.name)}</div>` : '<div class="group-head sm muted">My routines</div>'}
      ${g.routines.map(r => `
      <div class="card routine ${r.id === g.next ? 'next' : ''}">
        <div class="routine-main" data-a="editRoutine" data-id="${r.id}"><b>${esc(r.name)}</b>${r.id === g.next ? ' <span class="tag-next">Next</span>' : ''}
        <div class="sm muted clamp">${r.exercises.map(e => esc(Store.ex(e.exId).name)).join(', ') || 'No exercises'}</div></div>
        <button class="btn primary sm" data-a="startRoutine" data-id="${r.id}">Start</button>
      </div>`).join('')}`).join('') : `<div class="empty">Create a routine or add a ready-made program. Routines are unlimited and free.</div>`}
    <div class="section-head"><h3>This week</h3></div>
    <div class="stats3">
      <div class="stat"><div class="muted sm">Workouts</div><b>${wk.length}<span class="muted sm"> / ${d.settings.weekGoal}</span></b></div>
      <div class="stat"><div class="muted sm">Volume</div><b>${fmtNum(vol)}<span class="muted sm"> ${U()}</span></b></div>
      <div class="stat"><div class="muted sm">Time</div><b>${fmtDur(wk.reduce((s, w) => s + ((w.end || w.start) - w.start) / 1000, 0)).replace(/:\d\d$/, '')}<span class="muted sm"> h</span></b></div>
    </div>
    <div class="section-head"><h3>Muscle recovery</h3><span class="muted sm">estimated</span></div>
    <div class="chips">${recList.map(([m, p]) => `<span class="chip rec ${p >= 90 ? 'ok' : p >= 50 ? 'mid' : 'low'}">${MUSCLES[m]} ${p}%</span>`).join('')}</div>
    <div style="height:20px"></div>`;
  },

  tab_train() {
    return `
    <div class="page-head"><h1>Train</h1></div>
    <div class="section-head"><h3>Disciplines</h3></div>
    <div class="grid2">${Object.entries(DISCIPLINES).map(([k, v]) => `
      <button class="card disc" data-a="discipline" data-id="${k}">${icon(v.icon, 'disc-ic')}<b>${v.name}</b><span class="sm muted">${v.desc}</span></button>`).join('')}</div>
    <div class="section-head"><h3>Timers</h3></div>
    <div class="grid3">${Object.entries(TIMER_PRESETS).map(([k, v]) => `
      <button class="card tile" data-a="timerSetup" data-id="${k}">${icon(v.icon)}<b>${v.name}</b></button>`).join('')}</div>
    <div class="section-head"><h3>Skill ladders</h3></div>
    ${LADDERS.map(l => { const p = Coach.ladderProgress(l); return `
      <button class="card ladder" data-a="ladder" data-id="${l.id}"><div class="row-between"><b>${l.name}</b><span class="sm muted">${p}/${l.steps.length}</span></div>
      <div class="progress"><div style="width:${p / l.steps.length * 100}%"></div></div>
      <div class="sm muted">${p >= l.steps.length ? 'Ladder complete' : 'Current step: ' + esc(Store.ex(l.steps[Math.min(p, l.steps.length - 1)].exId).name)}</div></button>`; }).join('')}
    <div class="section-head"><h3>Tools</h3></div>
    <div class="grid3">
      <button class="card tile" data-a="tool" data-id="plates">${icon('circle-dot')}<b>Plates</b></button>
      <button class="card tile" data-a="tool" data-id="warmup">${icon('temperature')}<b>Warm-up</b></button>
      <button class="card tile" data-a="tool" data-id="onerm">${icon('calculator')}<b>1RM</b></button>
    </div><div style="height:20px"></div>`;
  },

  tab_progress() {
    const ws = Store.workoutsSorted();
    const ins = Coach.insights();
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const s = startOfWeek() - i * 7 * 864e5, e = s + 7 * 864e5;
      const inW = ws.filter(w => w.start >= s && w.start < e);
      weeks.push({ l: fmtDate(s, { day: 'numeric', month: 'numeric' }), v: inW.reduce((a, w) => a + workoutVolume(w), 0), n: inW.length });
    }
    const since = Date.now() - 30 * 864e5, musc = {};
    ws.filter(w => w.start > since).forEach(w => w.exercises.forEach(e => { const ex = Store.ex(e.exId); musc[ex.muscle] = (musc[ex.muscle] || 0) + e.sets.filter(s => s.type !== 'W').length; }));
    const mList = Object.entries(musc).sort((a, b) => b[1] - a[1]);
    const mMax = Math.max(1, ...mList.map(x => x[1]));
    const prs = topLifts().slice(0, 8);
    return `
    <div class="page-head"><h1>Progress</h1></div>
    <div class="section-head"><h3>${icon('sparkles')} Coach</h3></div>
    <div class="card">${ins.map(i => `<div class="insight ${i.tone}" ${i.exId ? `data-a="exDetail" data-id="${i.exId}"` : ''}>${icon(i.icon)}<span>${esc(i.text)}</span></div>`).join('')}<div class="sm muted" style="padding-top:8px">General guidance, not medical advice. <button class="link sm" data-a="disclaimer">Health and safety</button></div></div>
    <div class="stats3">
      <div class="stat"><div class="muted sm">Workouts</div><b>${ws.length}</b></div>
      <div class="stat"><div class="muted sm">Week streak</div><b>${weekStreak()}</b></div>
      <div class="stat"><div class="muted sm">Total volume</div><b>${fmtNum(ws.reduce((a, w) => a + workoutVolume(w), 0) / 1000)}<span class="muted sm">k ${U()}</span></b></div>
    </div>
    <div class="card"><div class="row-between"><b>Weekly volume</b><span class="muted sm">${U()}</span></div>${barChart(weeks, { label: 'weekly volume', fmt: fmtNum })}</div>
    <div class="card"><b>Consistency</b>${heatmap(ws)}</div>
    <div class="card"><b>Sets per muscle, last 30 days</b>
      ${mList.length ? mList.map(([m, v]) => `<div class="hbar"><span>${MUSCLES[m] || m}</span><div><div style="width:${v / mMax * 100}%"></div></div><span>${v}</span></div>`).join('') : '<div class="empty-chart">No data yet</div>'}</div>
    <div class="section-head"><h3>Best lifts</h3><button class="link" data-a="allExercises">All exercises</button></div>
    ${prs.length ? `<div class="card list">${prs.map(p => `<button class="li" data-a="exDetail" data-id="${p.exId}"><span>${esc(Store.ex(p.exId).name)}</span><span class="muted sm">${fmtW(p.w)} ${U()} × ${p.r} · e1RM ${Math.round(p.e1)}</span></button>`).join('')}</div>` : '<div class="empty">Personal records show up here.</div>'}
    <div class="section-head"><h3>History</h3><span class="muted sm">${ws.length} workouts</span></div>
    ${ws.slice(0, this._histN || 15).map(w => historyCard(w)).join('') || '<div class="empty">Finished workouts show up here.</div>'}
    ${ws.length > (this._histN || 15) ? `<button class="btn wide" data-a="moreHistory">Show more</button>` : ''}
    <div style="height:20px"></div>`;
  },

  tab_you() {
    const d = Store.data, m = d.measurements.slice().sort((a, b) => a.date - b.date);
    const lastM = m[m.length - 1];
    const bw = m.filter(x => x.weight).map(x => ({ x: x.date, y: +x.weight }));
    return `
    <div class="page-head"><h1>You</h1></div>
    <div class="card"><div class="row-between"><b>Body weight</b><button class="btn sm" data-a="addMeasure">${icon('plus')} Log</button></div>
      ${lastM ? `<div class="big">${fmtW(lastM.weight || '–')} <span class="muted sm">${U()}${lastM.bodyfat ? ' · ' + lastM.bodyfat + '% body fat' : ''}</span></div>` : ''}
      ${lineChart(bw, { label: 'body weight' })}
      <button class="link" data-a="measureList">All measurements</button></div>
    <div class="card"><div class="row-between"><b>Progress photos</b><label class="btn sm">${icon('camera')} Add<input type="file" accept="image/*" data-a-change="addPhoto" hidden></label></div>
      <div class="photos">${Store.photos.slice().reverse().slice(0, 9).map(p => `<button data-a="viewPhoto" data-id="${p.id}"><img src="${Photos.src(p)}" alt="Progress photo, ${fmtDate(p.date)}"><span>${fmtDate(p.date, { day: 'numeric', month: 'short' })}</span></button>`).join('') || '<div class="sm muted">Photos stay on this phone.</div>'}</div></div>
    <div class="card list">
      <button class="li" data-a="account">${icon('cloud')}<span>Account and sync</span><span class="muted sm" id="syncLabel">${Sync.label()}</span></button>
      <button class="li" data-a="settings">${icon('settings')}<span>Settings</span>${icon('chevron-right', 'muted')}</button>
      <button class="li" data-a="dataSheet">${icon('file-import')}<span>Import, export and sync</span>${icon('chevron-right', 'muted')}</button>
      <button class="li" data-a="updates">${icon('refresh')}<span>App updates</span><span class="muted sm">v${esc(Updater.bundleVersion)}</span></button>
      <button class="li" data-a="allExercises">${icon('list')}<span>Exercise library</span><span class="muted sm">${Store.allExercises().length}</span></button>
    </div>
    <div class="card list">
      <button class="li" data-a="disclaimer">${icon('stethoscope')}<span>Health and safety</span>${icon('chevron-right', 'muted')}</button>
      <button class="li" data-a="privacy">${icon('shield-lock')}<span>Privacy policy</span>${icon('external-link', 'muted')}</button>
    </div>
    <div class="card about sm muted">${icon('lock-open')} Every feature is free. No account, no ads, no paywall. Your data stays on your device.</div>
    <div style="height:20px"></div>`;
  },

  // ---------- Workout
  newWorkout(name, routine) {
    const ex = routine ? routine.exercises.map(re => this.makeWorkoutEx(re.exId, { sets: re.sets, repMin: re.repMin, repMax: re.repMax }, re.rest)) : [];
    Store.data.active = { id: uid(), name: name || 'Workout', routineId: routine ? routine.id : null, start: Date.now(), exercises: ex, readiness: Coach.readiness() };
    Store.save(true);
    this.openWorkout();
  },

  makeWorkoutEx(exId, target, rest) {
    const ex = Store.ex(exId);
    const t = { ...Coach.defaultTarget(ex), ...(target || {}) };
    const sug = Coach.suggest(exId, t);
    const sets = (sug.sets && sug.sets.length ? sug.sets : [{}]).map(p => ({ type: 'N', w: '', r: '', t: '', d: '', g: '', a: '', rpe: '', done: false, p: { ...p } }));
    if ((ex.type === 'wr') && ex.compound && Store.data.settings.warmups !== false && sug.sets && sug.sets[0] && +sug.sets[0].w >= Store.data.settings.bar * 1.8) {
      warmupSets(+sug.sets[0].w).slice(0, 3).reverse().forEach(ws => sets.unshift({ type: 'W', w: '', r: '', rpe: '', done: false, p: ws }));
    }
    return { exId, target: t, rest: rest || (ex.type === 'dist' ? 0 : Store.data.settings.rest), notes: '', ss: false, sets };
  },

  openWorkout() {
    const a = Store.data.active; if (!a) return;
    this.openSheet('workout', `<span class="wtime-head"><span class="wtime">${fmtDur((Date.now() - a.start) / 1000)}</span></span>`, () => this.workoutBody(),
      { action: `<button class="btn primary sm" data-a="finishWorkout">Finish</button>`, footer: () => this.restBar() });
  },

  workoutBody() {
    const a = Store.data.active; if (!a) return '';
    const vol = workoutVolume(a, true), done = a.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);
    return `
      <input class="title-input" data-f="wname" value="${esc(a.name)}" aria-label="Workout name">
      <div class="row muted sm wstats"><span>${icon('weight')} ${fmtNum(vol)} ${U()}</span><span>${icon('check')} ${done} sets</span>${a.readiness != null ? `<span>${icon('heart-rate-monitor')} readiness ${a.readiness}</span>` : ''}</div>
      ${a.exercises.map((e, i) => this.exCard(e, i, a)).join('')}
      <button class="btn wide primary-ghost" data-a="addExercise">${icon('plus')} Add exercise</button>
      <button class="btn wide danger-ghost" data-a="discardWorkout">${icon('trash')} Discard workout</button>
      <div style="height:120px"></div>`;
  },

  exCard(e, i, a) {
    const ex = Store.ex(e.exId);
    const prev = Store.lastSets(e.exId);
    const sug = Coach.suggest(e.exId, e.target);
    const inSS = e.ss || (i > 0 && a.exercises[i - 1].ss);
    const cols = setColumns(ex);
    let n = 0;
    const rows = e.sets.map((s, j) => {
      const label = s.type === 'N' ? ++n : s.type;
      const pv = prev.filter(x => x.type === s.type)[s.type === 'N' ? n - 1 : 0];
      return `<div class="set-row ${s.done ? 'done' : ''} cols-${cols.length}">
        <button class="set-type t-${s.type}" data-a="cycleType" data-i="${i}" data-j="${j}" aria-label="Set type">${label}</button>
        <span class="prev">${pv ? prevText(ex, pv) : '–'}</span>
        ${cols.map(c => setInput(ex, c, s, i, j)).join('')}
        <button class="check ${s.done ? 'on' : ''}" data-a="toggleSet" data-i="${i}" data-j="${j}" aria-label="Complete set">${icon('check')}</button>
      </div>`;
    }).join('');
    return `<div class="card excard ${inSS ? 'ss' : ''}">
      <div class="row-between"><button class="ex-title" data-a="exDetail" data-id="${e.exId}">${esc(ex.name)}</button>
        <button class="icon-btn" data-a="exMenu" data-i="${i}" aria-label="Exercise options">${icon('dots-vertical')}</button></div>
      ${inSS ? `<div class="ss-tag sm">${icon('link')} Superset</div>` : ''}
      ${e.showNotes || e.notes ? `<textarea class="notes" data-f="enotes" data-i="${i}" placeholder="Notes: seat height, grip, cues">${esc(e.notes)}</textarea>` : ''}
      <div class="coach ${sug.kind}">
        <div class="coach-head">${icon('sparkles')}<b>${esc(sug.title)}</b>${sug.tag ? `<span class="tag">${esc(sug.tag)}</span>` : ''}</div>
        <div class="sm">${esc(sug.text)}</div>
        <div class="coach-btns">${sug.sets && sug.sets.length && sug.kind !== 'new' ? `<button class="btn sm" data-a="applySug" data-i="${i}">${icon('wand')} Apply</button>` : ''}
        ${sug.nextEx ? `<button class="btn sm" data-a="swapEx" data-i="${i}" data-id="${sug.nextEx}">${icon('arrow-up-right')} Switch to ${esc(Store.ex(sug.nextEx).name)}</button>` : ''}</div>
      </div>
      <div class="set-row head cols-${cols.length}"><span>Set</span><span>Previous</span>${cols.map(c => `<span>${colLabel(c, ex)}</span>`).join('')}<span>${icon('check')}</span></div>
      ${rows}
      <div class="row-between ex-foot">
        <button class="btn sm" data-a="addSet" data-i="${i}">${icon('plus')} Set</button>
        <button class="btn sm ghost" data-a="removeSet" data-i="${i}">${icon('minus')} Set</button>
        ${ex.type !== 'dist' ? `<label class="rest-sel sm">${icon('clock')}<select data-f="rest" data-i="${i}">${[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map(v => `<option value="${v}" ${+e.rest === v ? 'selected' : ''}>${v ? fmtDur(v) : 'Off'}</option>`).join('')}</select></label>` : ''}
      </div></div>`;
  },

  restBar() {
    if (!this.restEnd) return '';
    const left = Math.max(0, Math.round((this.restEnd - Date.now()) / 1000));
    return `<div class="restbar"><div class="rest-fill" style="width:${this.restTotal ? (1 - left / this.restTotal) * 100 : 0}%"></div>
      <button class="btn sm" data-a="restAdj" data-v="-15">−15</button><div class="rest-time">${icon('clock')} <span id="restLeft">${fmtDur(left)}</span></div>
      <button class="btn sm" data-a="restAdj" data-v="15">+15</button><button class="btn sm primary" data-a="restSkip">Skip</button></div>`;
  },

  startRest(sec) {
    if (!sec) return;
    this.restTotal = sec; this.restEnd = Date.now() + sec * 1000; this._restBeeped = false;
    Notify.ensure().then(ok => ok && Notify.at(REST_NOTIF, this.restEnd, 'Rest over', 'Time for your next set'));
    this.refreshSheet();
  },
  stopRest() { this.restEnd = 0; Notify.cancel(REST_NOTIF); this.refreshSheet(); },

  tick() {
    const a = Store.data.active;
    if (a) $$('.wtime').forEach(el => el.textContent = fmtDur((Date.now() - a.start) / 1000));
    if (this.restEnd) {
      const left = Math.round((this.restEnd - Date.now()) / 1000);
      const el = $('#restLeft'); if (el) el.textContent = fmtDur(Math.max(0, left));
      const fill = $('.rest-fill'); if (fill) fill.style.width = (1 - Math.max(0, left) / this.restTotal) * 100 + '%';
      if (left <= 3 && left > 0) beep(660, 90, 0.15);
      if (left <= 0 && !this._restBeeped) { this._restBeeped = true; beep(988, 400); buzz([400]); this.restEnd = 0; Notify.cancel(REST_NOTIF); if (this.top() && this.top().key === 'workout') this.refreshSheet(); toast('Rest over'); }
    }
  },

  finishWorkout() {
    const a = Store.data.active;
    const doneSets = a.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);
    if (!doneSets) {
      // Allow finishing by auto-completing filled sets
      const filled = a.exercises.reduce((s, e) => s + e.sets.filter(x => x.w !== '' || x.r !== '' || x.t !== '' || x.d !== '').length, 0);
      if (!filled) { if (confirm('No sets completed. Discard this workout?')) this.discard(); return; }
      if (!confirm('No sets are marked complete. Mark all filled-in sets complete and finish?')) return;
      a.exercises.forEach(e => e.sets.forEach(x => { if (x.w !== '' || x.r !== '' || x.t !== '' || x.d !== '') x.done = true; }));
    } else {
      const open = a.exercises.reduce((s, e) => s + e.sets.filter(x => !x.done).length, 0);
      if (open && !confirm(`${open} unfinished set(s) will be dropped. Finish workout?`)) return;
    }
    const w = { id: a.id, name: a.name, routineId: a.routineId, start: a.start, end: Date.now(), notes: a.notes || '', readiness: a.readiness,
      exercises: a.exercises.map(e => ({ exId: e.exId, target: e.target, notes: e.notes, ss: e.ss, rest: e.rest, sets: e.sets.filter(s => s.done).map(({ p, ...s }) => s) })).filter(e => e.sets.length) };
    const prs = findPRs(w);
    w.prs = prs.length; w.u = Date.now();
    Store.data.workouts.push(w); Store.data.active = null; Store.save(true);
    this.restEnd = 0; Notify.cancel(REST_NOTIF);
    this.stack = []; this.render();
    beep(1046, 150); setTimeout(() => beep(1318, 250), 160); buzz([80]);
    this.openSheet('summary', 'Workout complete', () => summaryBody(w, prs));
    Sync.run('finish');
  },

  discard() { Store.data.active = null; Store.save(true); this.restEnd = 0; Notify.cancel(REST_NOTIF); this.stack = this.stack.filter(s => s.key !== 'workout'); this.renderSheets(); this.render(); },

  // ---------- Exercise picker
  openPicker(mode, onPick) {
    this.pick = { mode, onPick, sel: [], q: '', disc: 'all', muscle: 'all' };
    this.openSheet('picker', 'Add exercises', () => `
      <input class="search" type="search" placeholder="Search 180+ exercises" data-f="pickq" value="${esc(this.pick.q)}" aria-label="Search exercises">
      <div class="chips scroll-x">${['all', ...Object.keys(DISCIPLINES)].map(k => `<button class="chip ${this.pick.disc === k ? 'on' : ''}" data-a="pickDisc" data-id="${k}">${k === 'all' ? 'All' : DISCIPLINES[k].name}</button>`).join('')}</div>
      <div class="chips scroll-x">${['all', ...Object.keys(MUSCLES)].map(k => `<button class="chip ${this.pick.muscle === k ? 'on' : ''}" data-a="pickMuscle" data-id="${k}">${k === 'all' ? 'Any muscle' : MUSCLES[k]}</button>`).join('')}</div>
      <div id="pickList">${this.pickList()}</div>
      <button class="btn wide" data-a="customEx">${icon('plus')} Create custom exercise</button><div style="height:80px"></div>`,
      { footer: () => this.pick.mode === 'replace' ? '' : `<div class="sheet-foot"><button class="btn primary wide" data-a="pickDone">Add ${this.pick.sel.length || ''} exercise${this.pick.sel.length === 1 ? '' : 's'}</button></div>` });
  },
  pickList() {
    const p = this.pick, q = p.q.toLowerCase().trim();
    const recent = new Set(Store.workoutsSorted().slice(0, 10).flatMap(w => w.exercises.map(e => e.exId)));
    let list = Store.allExercises().filter(e => (p.disc === 'all' || e.discipline === p.disc) && (p.muscle === 'all' || e.muscle === p.muscle || (e.secondary || []).includes(p.muscle)) && (!q || e.name.toLowerCase().includes(q) || (MUSCLES[e.muscle] || '').toLowerCase().includes(q)));
    list.sort((a, b) => (recent.has(b.id) - recent.has(a.id)) || a.name.localeCompare(b.name));
    return list.slice(0, 120).map(e => `<button class="li pick ${p.sel.includes(e.id) ? 'sel' : ''}" data-a="pickToggle" data-id="${e.id}">
      <span class="ex-ic">${icon(DISCIPLINES[e.discipline] ? DISCIPLINES[e.discipline].icon : 'barbell')}</span>
      <span><b>${esc(e.name)}</b><span class="sm muted">${MUSCLES[e.muscle] || ''} · ${e.equipment}${recent.has(e.id) ? ' · recent' : ''}</span></span>
      ${p.sel.includes(e.id) ? icon('circle-check', 'acc') : icon('circle', 'muted')}</button>`).join('') || '<div class="empty">No matches. Create a custom exercise below.</div>';
  },

  // ---------- Routine editor
  editRoutine(r) {
    this.draft = r ? JSON.parse(JSON.stringify(r)) : { id: uid(), name: 'New routine', exercises: [] };
    const isNew = !r;
    this.openSheet('routine', isNew ? 'New routine' : 'Edit routine', () => {
      const d = this.draft;
      return `<input class="title-input" data-rf="name" value="${esc(d.name)}" aria-label="Routine name">
      ${d.exercises.map((e, i) => { const ex = Store.ex(e.exId); const isT = ex.type === 'dur'; const none = ex.type === 'dist' || ex.type === 'climb'; return `
        <div class="card"><div class="row-between"><b>${esc(ex.name)}</b><span>
          <button class="icon-btn" data-a="rMove" data-i="${i}" data-v="-1" aria-label="Move up">${icon('arrow-up')}</button>
          <button class="icon-btn" data-a="rRemove" data-i="${i}" aria-label="Remove">${icon('x')}</button></span></div>
          ${none ? '<div class="sm muted">The coach sets distance and grade targets from your history.</div>' : `<div class="grid3 small-inputs">
            <label>Sets<input inputmode="numeric" data-rf="sets" data-i="${i}" value="${e.sets}"></label>
            <label>${isT ? 'Min sec' : 'Min reps'}<input inputmode="numeric" data-rf="repMin" data-i="${i}" value="${e.repMin}"></label>
            <label>${isT ? 'Max sec' : 'Max reps'}<input inputmode="numeric" data-rf="repMax" data-i="${i}" value="${e.repMax}"></label></div>`}
          <label class="sm muted">Rest <select data-rf="rest" data-i="${i}">${[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map(v => `<option value="${v}" ${+e.rest === v ? 'selected' : ''}>${v ? fmtDur(v) : 'Off'}</option>`).join('')}</select></label>
        </div>`; }).join('') || '<div class="empty">Add exercises to this routine.</div>'}
      <button class="btn wide" data-a="rAddEx">${icon('plus')} Add exercise</button>
      ${isNew ? '' : `<button class="btn wide danger-ghost" data-a="rDelete">${icon('trash')} Delete routine</button>`}<div style="height:80px"></div>`;
    }, { action: `<button class="btn primary sm" data-a="rSave">Save</button>` });
  },

  // ---------- Events
  bind() {
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-a]'); if (!t) return;
      const fn = Actions[t.dataset.a]; if (fn) { e.preventDefault(); fn.call(this, t, t.dataset); }
    });
    document.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.aChange && Actions[t.dataset.aChange]) Actions[t.dataset.aChange].call(this, t, t.dataset);
      if (t.tagName === 'SELECT' || t.type === 'checkbox') this.onInput(t, true);
    });
    document.addEventListener('input', e => this.onInput(e.target, false));
    $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.nav(b.dataset.tab); });
  },

  onInput(t, isChange) {
    const ds = t.dataset, v = t.type === 'checkbox' ? t.checked : t.value;
    const a = Store.data.active;
    if (ds.f && a) {
      const i = +ds.i, j = +ds.j;
      if (ds.f === 'wname') a.name = v;
      else if (ds.f === 'enotes') a.exercises[i].notes = v;
      else if (ds.f === 'rest') a.exercises[i].rest = +v;
      else if (ds.f === 'sent') a.exercises[i].sets[j].sent = v;
      else if (['w', 'r', 'rpe', 't', 'd', 'g', 'a'].includes(ds.f)) a.exercises[i].sets[j][ds.f] = ds.f === 'g' ? v : (ds.f === 't' && ds.fmt === 'mmss' ? (v.includes(':') ? parseDur(v) : v) : v);
      Store.save();
      if (isChange && ds.f === 'g') this.refreshSheet();
    }
    if (ds.f === 'pickq') { this.pick.q = v; $('#pickList').innerHTML = this.pickList(); }
    if (ds.rf && this.draft) {
      const d = this.draft;
      if (ds.rf === 'name') d.name = v; else d.exercises[+ds.i][ds.rf] = +v || 0;
    }
    if (ds.setting) {
      const s = Store.data.settings;
      if (ds.setting === 'plates') s.plates = v.split(/[ ,;]+/).map(num).filter(Boolean).sort((x, y) => y - x);
      else if (['rest', 'bar', 'bodyweight', 'weekGoal'].includes(ds.setting)) s[ds.setting] = num(v);
      else s[ds.setting] = v;
      Store.save();
      if (isChange && ['unit', 'autoUpdate', 'autoSync'].includes(ds.setting)) this.refreshSheet();
    }
    if (ds.ci) { this.ci[ds.ci] = +v; const out = $('#ci-' + ds.ci); if (out) out.textContent = v; const sc = $('#ciScore'); if (sc) sc.textContent = readinessScore(this.ci); }
    if (ds.tc) { this.tconf[ds.tc] = ds.tc === 'name' ? v : num(v); const s = $('#tcSum'); if (s) s.textContent = timerSummary(this.tconf); }
    if (ds.tool) { this.toolState[ds.tool] = v; const r = $('#toolOut'); if (r) r.innerHTML = this.toolOut(); }
    if (ds.m) this.mdraft[ds.m] = v;
    if (ds.imp) this.impUnit = v;
  }
};

// ---------- Helpers used by views
// Routines grouped by the program they came from, with the next one to do in each program
function routineGroups(d) {
  const groups = [], byName = {};
  d.routines.forEach(r => { const k = r.program || ''; if (!byName[k]) { byName[k] = { name: k, routines: [] }; groups.push(byName[k]); } byName[k].routines.push(r); });
  const sorted = Store.workoutsSorted();
  groups.forEach(g => {
    if (!g.name) return;
    const ids = g.routines.map(r => r.id), last = sorted.find(w => ids.includes(w.routineId));
    g.next = last ? ids[(ids.indexOf(last.routineId) + 1) % ids.length] : ids[0];
  });
  return groups.sort((a, b) => (a.name === '') - (b.name === ''));
}

function setColumns(ex) {
  return { wr: ['w', 'r', 'rpe'], wbw: ['w', 'r', 'rpe'], bw: ['r', 'rpe'], dur: ['t'], dist: ['d', 'tt'], climb: ['g', 'a', 'sent'] }[ex.type] || ['w', 'r'];
}
function colLabel(c, ex) {
  return { w: ex.type === 'wbw' ? '+' + U() : U(), r: 'Reps', rpe: 'RPE', t: 'Sec', d: 'km', tt: 'Time', g: 'Grade', a: 'Tries', sent: 'Sent' }[c];
}
function setInput(ex, c, s, i, j) {
  const p = s.p || {};
  if (c === 'sent') return `<label class="sent"><input type="checkbox" data-f="sent" data-i="${i}" data-j="${j}" ${s.sent ? 'checked' : ''} aria-label="Sent"></label>`;
  if (c === 'g') { const scale = ex.id === 'bouldering' ? CLIMB_GRADES.boulder : CLIMB_GRADES.route; return `<select data-f="g" data-i="${i}" data-j="${j}" aria-label="Grade"><option value="">${esc(p.g || '–')}</option>${scale.map(g => `<option ${s.g === g ? 'selected' : ''}>${g}</option>`).join('')}</select>`; }
  if (c === 'tt') return `<input inputmode="numeric" data-f="t" data-fmt="mmss" data-i="${i}" data-j="${j}" value="${s.t !== '' ? fmtDur(s.t) : ''}" placeholder="${p.t ? fmtDur(p.t) : 'mm:ss'}" aria-label="Time">`;
  const ph = c === 'w' ? fmtW(p.w) : (p[c] != null ? p[c] : '');
  const mode = c === 'r' || c === 't' || c === 'a' ? 'numeric' : 'decimal';
  return `<input inputmode="${mode}" data-f="${c}" data-i="${i}" data-j="${j}" value="${esc(s[c] == null ? '' : s[c])}" placeholder="${esc(ph === '' ? (c === 'rpe' ? '' : '–') : ph)}" aria-label="${colLabel(c, ex)}">`;
}
function prevText(ex, s) {
  if (ex.type === 'dist') return `${s.d || 0}km ${fmtDur(s.t)}`;
  if (ex.type === 'dur') return `${s.t}s`;
  if (ex.type === 'climb') return `${s.g || '?'}${s.sent ? ' ✓' : ''}`;
  if (ex.type === 'bw') return `${s.r}`;
  return `${fmtW(s.w)}×${s.r}`;
}
function workoutVolume(w, includeOpen) {
  let v = 0;
  for (const e of w.exercises) { const ex = Store.ex(e.exId); if (ex.type !== 'wr' && ex.type !== 'wbw') continue;
    for (const s of e.sets) if ((s.done || includeOpen === undefined) && s.done !== false && s.type !== 'W') v += (+s.w || 0) * (+s.r || 0); }
  return v;
}
function readinessScore(c) {
  const s = Math.min(c.sleep, 9) / 8 * 25 + c.quality / 5 * 15 + (6 - c.soreness) / 5 * 20 + c.energy / 5 * 25 + (6 - c.stress) / 5 * 15;
  return Math.max(0, Math.min(100, Math.round(s)));
}
function readinessLabel(s) { return s >= 85 ? 'Primed. A good day to push for PRs.' : s >= 65 ? 'Good to train as planned.' : s >= 45 ? 'A bit flat. Stick to the plan, no heroics.' : 'Low. The coach will lighten today\'s targets.'; }

function warmupSets(work) {
  const bar = Store.data.settings.bar;
  const pick = (pct, r) => ({ w: Math.max(bar, Coach.roundW(work * pct, { equipment: 'barbell' })), r });
  return [{ w: bar, r: 10 }, pick(0.45, 8), pick(0.65, 5), pick(0.8, 3), pick(0.9, 1)].filter((x, i, arr) => i === 0 || x.w > arr[i - 1].w);
}

function bestOf(exId, excludeId) {
  const b = { e1: 0, w: 0, r: 0, t: 0, d: 0, pace: Infinity, vol: 0 };
  for (const w of Store.data.workouts) { if (w.id === excludeId) continue;
    for (const e of w.exercises) { if (e.exId !== exId) continue;
      for (const s of e.sets) { if (s.type === 'W') continue;
        b.e1 = Math.max(b.e1, Coach.e1rm(s.w, s.r)); b.w = Math.max(b.w, +s.w || 0); b.r = Math.max(b.r, +s.r || 0);
        b.t = Math.max(b.t, +s.t || 0); b.d = Math.max(b.d, +s.d || 0); b.vol = Math.max(b.vol, (+s.w || 0) * (+s.r || 0));
        if (+s.d >= 1 && +s.t) b.pace = Math.min(b.pace, s.t / s.d); } } }
  return b;
}
function findPRs(w) {
  const out = [];
  for (const e of w.exercises) {
    const ex = Store.ex(e.exId), b = bestOf(e.exId, w.id), had = Store.sessions(e.exId, 1).length > 0;
    if (!had) continue;
    const sets = e.sets.filter(s => s.type !== 'W');
    const me1 = Math.max(0, ...sets.map(s => Coach.e1rm(s.w, s.r))), mw = Math.max(0, ...sets.map(s => +s.w || 0)), mr = Math.max(0, ...sets.map(s => +s.r || 0));
    if (ex.type === 'wr' || ex.type === 'wbw') {
      if (mw > b.w) out.push({ ex: ex.name, what: 'Heaviest weight', val: fmtW(mw) + ' ' + U() });
      if (me1 > b.e1 + 0.01) out.push({ ex: ex.name, what: 'Best est. 1RM', val: Math.round(me1) + ' ' + U() });
    } else if (ex.type === 'bw' && mr > b.r) out.push({ ex: ex.name, what: 'Most reps', val: mr });
    else if (ex.type === 'dur') { const mt = Math.max(0, ...sets.map(s => +s.t || 0)); if (mt > b.t) out.push({ ex: ex.name, what: 'Longest', val: fmtDur(mt) }); }
    else if (ex.type === 'dist') { const s = sets[0]; if (s && +s.d > b.d) out.push({ ex: ex.name, what: 'Longest distance', val: s.d + ' km' }); if (s && +s.d >= 1 && s.t / s.d < b.pace) out.push({ ex: ex.name, what: 'Best pace', val: fmtPace(s.t / s.d) }); }
  }
  return out;
}
function topLifts() {
  const m = {};
  for (const w of Store.data.workouts) for (const e of w.exercises) { const ex = Store.ex(e.exId); if (ex.type !== 'wr') continue;
    for (const s of e.sets) { if (s.type === 'W') continue; const e1 = Coach.e1rm(s.w, s.r); if (!m[e.exId] || e1 > m[e.exId].e1) m[e.exId] = { exId: e.exId, e1, w: s.w, r: s.r }; } }
  return Object.values(m).sort((a, b) => b.e1 - a.e1);
}
function weekStreak() {
  let n = 0, s = startOfWeek();
  const has = (a, b) => Store.data.workouts.some(w => w.start >= a && w.start < b);
  if (!has(s, s + 7 * 864e5)) s -= 7 * 864e5;
  while (has(s, s + 7 * 864e5)) { n++; s -= 7 * 864e5; }
  return n;
}
function heatmap(ws) {
  const days = {}; ws.forEach(w => { const k = new Date(w.start).toDateString(); days[k] = (days[k] || 0) + 1; });
  const weeks = 17, start = startOfWeek() - (weeks - 1) * 7 * 864e5;
  let cells = '';
  for (let c = 0; c < weeks; c++) for (let r = 0; r < 7; r++) {
    const t = start + (c * 7 + r) * 864e5; if (t > Date.now()) continue;
    const n = days[new Date(t).toDateString()] || 0;
    cells += `<rect x="${c * 19}" y="${r * 19}" width="15" height="15" rx="3" class="hm${Math.min(n, 2)}"><title>${fmtDate(t)}: ${n} workout(s)</title></rect>`;
  }
  return `<svg viewBox="0 0 ${weeks * 19} ${7 * 19}" class="chart heat" role="img" aria-label="Workout calendar, last ${weeks} weeks">${cells}</svg>`;
}
function historyCard(w) {
  const mins = Math.round(((w.end || w.start) - w.start) / 60000);
  return `<button class="card hist" data-a="workoutDetail" data-id="${w.id}">
    <div class="row-between"><b>${esc(w.name)}</b><span class="sm muted">${fmtDate(w.start)}</span></div>
    <div class="sm muted row wstats"><span>${icon('clock')} ${mins} min</span><span>${icon('weight')} ${fmtNum(workoutVolume(w))} ${U()}</span>${w.prs ? `<span class="acc">${icon('trophy')} ${w.prs} PR</span>` : ''}${w.imported ? `<span>${icon('file-import')} ${esc(w.imported)}</span>` : ''}</div>
    <div class="sm clamp">${w.exercises.map(e => `${e.sets.length}× ${esc(Store.ex(e.exId).name)}`).join(' · ')}</div></button>`;
}
function summaryBody(w, prs) {
  const mins = Math.round((w.end - w.start) / 60000);
  const sets = w.exercises.reduce((s, e) => s + e.sets.length, 0);
  return `<div class="celebrate">${icon('trophy')}<h2>Nice work</h2><div class="muted">${esc(w.name)} · ${fmtDate(w.start)}</div></div>
    <div class="stats3"><div class="stat"><div class="muted sm">Duration</div><b>${mins} min</b></div><div class="stat"><div class="muted sm">Volume</div><b>${fmtNum(workoutVolume(w))}</b></div><div class="stat"><div class="muted sm">Sets</div><b>${sets}</b></div></div>
    ${prs.length ? `<div class="card"><b>${icon('trophy')} New records</b>${prs.map(p => `<div class="li static"><span>${esc(p.ex)}<span class="sm muted"> · ${p.what}</span></span><b>${esc(p.val)}</b></div>`).join('')}</div>` : ''}
    <div class="card"><b>${icon('sparkles')} Next session plan</b>${w.exercises.map(e => { const s = Coach.suggest(e.exId, e.target); return `<div class="li static col"><span><b>${esc(Store.ex(e.exId).name)}</b>: ${esc(s.title)}</span><span class="sm muted">${esc(s.text)}</span></div>`; }).join('')}</div>
    ${w.routineId && Store.data.routines.find(r => r.id === w.routineId) ? `<button class="btn wide" data-a="updateRoutineFrom" data-id="${w.id}">${icon('device-floppy')} Update routine with this workout's exercises</button>` : `<button class="btn wide" data-a="saveAsRoutine" data-id="${w.id}">${icon('device-floppy')} Save as routine</button>`}
    <button class="btn primary wide" data-a="closeSheet">Done</button>`;
}

const TIMER_PRESETS = {
  hiit: { name: 'HIIT', icon: 'flame', work: 40, rest: 20, rounds: 10 },
  tabata: { name: 'Tabata', icon: 'bolt', work: 20, rest: 10, rounds: 8 },
  emom: { name: 'EMOM', icon: 'repeat', work: 60, rest: 0, rounds: 12 },
  amrap: { name: 'AMRAP', icon: 'infinity', work: 900, rest: 0, rounds: 1 },
  boxing: { name: 'Boxing', icon: 'karate', work: 180, rest: 60, rounds: 6 },
  bjj: { name: 'BJJ rolls', icon: 'users', work: 300, rest: 60, rounds: 5 }
};
function timerSummary(c) { const total = c.rounds * c.work + Math.max(0, c.rounds - 1) * c.rest + (c.prep || 0); return `${c.rounds} × ${fmtDur(c.work)} work${c.rest ? ' / ' + fmtDur(c.rest) + ' rest' : ''} · total ${fmtDur(total)}`; }
