'use strict';

const REST_NOTIF = 1;
const fmtW = w => (w === '' || w == null) ? '' : String(+(+w).toFixed(2));
const U = () => Store.data.settings.unit;

const UI = {
  tab: 'home', stack: [], restEnd: 0, restTotal: 0, draft: null, pick: null, timer: null, importResult: null,

  async init() {
    await Store.load();
    await Sync.load();
    applyLook();
    this.bind();
    if (HC.on) HC.pull().then(() => { if (!this.stack.length) this.render(); });
    Companion.init();
    this.render();
    setInterval(() => this.tick(), 1000);
    Updater.init();
    const app = Plugin('App');
    if (app) {
      app.addListener('backButton', () => this.back());
      app.addListener('resume', () => {
        this.tick(); Sync.schedule(800);
        // Fresh sleep and heart data each time you come back (for example after Sleep as Android's alarm)
        if (HC.on && Date.now() - ((Store.data.health || {}).at || 0) > 20 * 60e3) HC.pull().then(() => { if (!this.stack.length) this.render(); else if (this.top().key === 'checkin' && !this._ciTouched) this.openCheckin(this._ciBefore); });
      });
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
  onDeviceState() {
    if (this.stack.length && this.top().key === 'devices') this.refreshSheet();
    if (this.stack.length && this.top().key === 'workout') this.refreshSheet();
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
    root.innerHTML = `<div class="sheet" data-key="${s.key}" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
      <header class="sheet-head"><button class="icon-btn" data-a="closeSheet" aria-label="Back">${icon(s.key === 'workout' ? 'chevron-down' : 'arrow-left')}</button>
      <h2 id="sheetTitle" tabindex="-1">${s.title}</h2>${s.action || '<span style="width:40px"></span>'}</header>
      <div class="sheet-body">${s.render()}</div>${s.footer ? s.footer() : ''}</div>`;
    $('.sheet-body', root).scrollTop = prevScroll;
    if (!prevScroll && this._lastSheet !== s.key) { const h = $('#sheetTitle'); if (h && h.focus) h.focus({ preventScroll: true }); }
    this._lastSheet = s.key;
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
      ${d.health && (d.health.steps || d.health.sleepH) ? `<div class="sm muted">${d.health.steps ? `${icon('shoe')} ${fmtNum(d.health.steps)} steps today` : ''}${d.health.sleepH ? `${d.health.steps ? ' · ' : ''}${icon('moon')} ${d.health.sleepH} h sleep${d.health.sleep ? ' (' + esc(d.health.sleep.source) + ')' : ''}` : ''}</div>` : ''}
      <button class="btn ${ci ? '' : 'primary'}" data-a="checkin">${icon('heart-rate-monitor')} ${ci ? 'Redo' : 'Check in'}</button></div>
    </div>
    ${(() => { const b = Plan.block(); if (!b) return ''; return b.done
      ? `<div class="card accent-card col"><b>${icon('trophy')} ${esc(b.name)} block complete</b><div class="sm">Start the next block to keep progressing.</div><div class="grid2"><button class="btn sm primary" data-a="startBlock" data-id="${b.type}">Start another</button><button class="btn sm" data-a="endBlock">Not now</button></div></div>`
      : `<div class="card block-card"><div class="row-between"><b>${icon('calendar-stats')} ${esc(b.name)}: week ${b.week} of ${b.total}</b><span class="tag-next">${esc(b.label)}</span></div><div class="progress"><div style="width:${b.week / b.total * 100}%"></div></div><div class="sm muted">${esc(b.note)} Target RPE ${b.rpe}.</div></div>`; })()}
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
    <div class="card">${BodyMap.svg(rec, 'recovery')}${BodyMap.legend('recovery')}${recoveryList()}</div>
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
      <button class="card tile" data-a="tool" data-id="cali">${icon('stretching')}<b>Calisthenics 1RM</b></button>
      <button class="card tile" data-a="tool" data-id="convert">${icon('arrows-exchange')}<b>Bodyweight ↔ barbell</b></button>
      <button class="card tile" data-a="tool" data-id="standards">${icon('trophy')}<b>Strength level</b></button>
      <button class="card tile" data-a="tool" data-id="rpe">${icon('gauge')}<b>RPE chart</b></button>
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
    <div class="card">${(this._allIns ? ins : ins.slice(0, 4)).map(i => `<div class="insight ${i.tone}" ${i.exId ? `data-a="exDetail" data-id="${i.exId}"` : ''}>${icon(i.icon)}<span>${esc(i.text)}</span></div>`).join('')}${ins.length > 4 ? `<button class="link sm" data-a="toggleIns">${this._allIns ? 'Show less' : `Show all ${ins.length}`}</button>` : ''}<div class="sm muted" style="padding-top:8px">General guidance, not medical advice. <button class="link sm" data-a="disclaimer">Health and safety</button></div></div>
    <div class="stats3">
      <div class="stat"><div class="muted sm">Workouts</div><b>${ws.length}</b></div>
      <div class="stat"><div class="muted sm">Week streak</div><b>${weekStreak()}</b></div>
      <div class="stat"><div class="muted sm">Total volume</div><b>${fmtNum(ws.reduce((a, w) => a + workoutVolume(w), 0) / 1000)}<span class="muted sm">k ${U()}</span></b></div>
    </div>
    <div class="card"><div class="row-between"><b>Weekly volume</b><span class="muted sm">${U()}</span></div>${barChart(weeks, { label: 'weekly volume', fmt: fmtNum })}</div>
    <div class="card"><div class="row-between"><b>${this._mapMode === 'recovery' ? 'Recovery right now' : 'Muscles trained this week'}</b><button class="link sm" data-a="mapMode">${this._mapMode === 'recovery' ? 'Show sets' : 'Show recovery'}</button></div>
      ${this._mapMode === 'recovery' ? BodyMap.svg(Coach.recovery(), 'recovery') : BodyMap.svg(Coach.weeklySets(), 'sets')}
      ${BodyMap.legend(this._mapMode === 'recovery' ? 'recovery' : 'sets')}${this._mapMode === 'recovery' ? recoveryList() : ''}</div>
    <div class="card"><b>Consistency</b>${heatmap(ws)}</div>
    <div class="card"><b>Sets per muscle, last 30 days</b>
      ${mList.length ? mList.map(([m, v]) => `<div class="hbar"><span>${MUSCLES[m] || m}</span><div><div style="width:${v / mMax * 100}%"></div></div><span>${v}</span></div>`).join('') : '<div class="empty-chart">No data yet</div>'}</div>
    ${Climb.climbs(365).length ? (() => { const b = Climb.stats('boulder', 90), r = Climb.stats('route', 90); return `<button class="card accent-card" data-a="climbStats">${icon('mountain')}<div><b>Climbing coach</b><div class="sm">${[b && b.max != null ? 'Boulder ' + Climb.label(b.max, 'boulder') : '', r && r.max != null ? 'Route ' + Climb.label(r.max, 'route') : ''].filter(Boolean).join(' · ') || 'Grade pyramid, flash grade, send rate'}</div></div></button>`; })() : ''}
    <div class="section-head"><h3>Best lifts</h3><button class="link" data-a="allExercises">All exercises</button></div>
    ${prs.length ? `<div class="card list">${prs.map(p => `<button class="li" data-a="exDetail" data-id="${p.exId}"><span>${esc(Store.ex(p.exId).name)}</span><span class="muted sm">${fmtW(p.w)} ${U()} × ${p.r} · e1RM ${Math.round(p.e1)}</span></button>`).join('')}</div>` : '<div class="empty">Personal records show up here.</div>'}
    <div class="section-head"><h3>${icon('award')} Achievements</h3><span class="muted sm">${Achievements.unlocked().size} of ${Achievements.LIST.length}</span></div>
    <div class="badges">${(() => { const u = Achievements.unlocked(); return Achievements.LIST.map(([id, name, desc]) => `<div class="badge ${u.has(id) ? 'on' : ''}" title="${esc(desc)}">${icon(u.has(id) ? 'award' : 'lock')}<b>${esc(name)}</b><span>${esc(desc)}</span></div>`).join(''); })()}</div>
    <div class="grid2" style="margin-top:12px"><button class="btn" data-a="report" data-id="30">${icon('file-type-pdf')} 30-day report</button><button class="btn" data-a="report" data-id="90">${icon('file-type-pdf')} 90-day report</button></div>
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
      <button class="li" data-a="devices">${icon('device-watch')}<span>Watches, scales and sensors</span><span class="muted sm">${[HC.on ? 'Health Connect' : '', BLE.hrDevice ? 'HR' : ''].filter(Boolean).join(', ') || 'Connect'}</span></button>
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
    const ex = routine ? routine.exercises.map(re => this.makeWorkoutEx(re.exId, { sets: re.sets, repMin: re.repMin, repMax: re.repMax, pct: re.pct || undefined, rpe: re.rpe || undefined }, re.rest)) : [];
    Store.data.active = { id: uid(), name: name || 'Workout', routineId: routine ? routine.id : null, start: Date.now(), exercises: ex, readiness: Coach.readiness() };
    BLE.autoHR();
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
    const P = ex.type === 'hang' ? Climb.protocol(ex).timer : null;
    return { exId, target: t, rest: rest || (ex.type === 'dist' ? 0 : P ? (P.setRest || P.rest) : ex.type === 'climb' ? 180 : Store.data.settings.rest), notes: '', ss: false, sets };
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
      ${Store.data.workouts.length < 3 && !Store.data.settings.hideLogTips ? `<div class="card tip-card sm"><b>${icon('info-circle')} How to log a workout</b>
        <ol><li>The grey numbers are what you did last time. Type what you actually do in each box.</li><li>Tap ${icon('check')} when you finish a set. The rest timer starts by itself.</li><li>The blue coach box says what to aim for today. Tap <b>Apply</b> to fill it in.</li><li>Tap an exercise name for how to do it.</li><li>Tap <b>Finish</b> at the top when you're done.</li></ol>
        <button class="link sm" data-a="hideLogTips">Got it, hide this</button></div>` : ''}
      <div class="row muted sm wstats"><span>${icon('weight')} ${fmtNum(vol)} ${U()}</span><span>${icon('check')} ${done} sets</span>${a.readiness != null ? `<span>${icon('heart-rate-monitor')} readiness ${a.readiness}</span>` : ''}${BLE.hrDevice ? `<span class="hr">${icon('heart')} <span class="hrLive">${BLE.hr || '–'}</span> bpm</span>` : ''}</div>
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
      return `<div class="set-row ${s.done ? 'done' : ''} cols-${cols.length} ty-${ex.type}">
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
      <div class="ex-target sm"><span>${icon('target')} ${esc(targetText(ex, e.target || Coach.defaultTarget(ex)))}${ex.type !== 'dist' && +e.rest ? ` · rest ${fmtDur(e.rest)}` : ''}</span>${ex.type === 'hang' ? `<button class="link sm" data-a="hangTimer" data-i="${i}">${icon('clock-play')} Timer</button>` : ''}<button class="link sm" data-a="toggleHow" data-i="${i}" aria-expanded="${!!e.showHow}">${icon('info-circle')} ${e.showHow ? 'Hide' : 'How to'}</button></div>
      ${e.showHow ? (() => { const h = howTo(ex); return `<div class="howto sm"><p>${esc(h.steps)}</p><p class="muted">${icon('bulb')} ${esc(h.tip)}</p><p class="muted">${esc(trackingText(ex))}</p></div>`; })() : ''}
      ${e.showNotes || e.notes ? `<textarea class="notes" data-f="enotes" data-i="${i}" placeholder="Notes: seat height, grip, cues">${esc(e.notes)}</textarea>` : ''}
      <div class="coach ${sug.kind}">
        <div class="coach-head">${icon('sparkles')}<b>${esc(sug.title)}</b>${sug.tag ? `<span class="tag">${esc(sug.tag)}</span>` : ''}${sug.rpeTarget ? `<span class="tag">RPE ${sug.rpeTarget}</span>` : ''}</div>
        <div class="sm">${esc(sug.text)}</div>
        <div class="coach-btns">${sug.sets && sug.sets.length && sug.kind !== 'new' ? `<button class="btn sm" data-a="applySug" data-i="${i}">${icon('wand')} Apply</button>` : ''}
        ${sug.nextEx ? `<button class="btn sm" data-a="swapEx" data-i="${i}" data-id="${sug.nextEx}">${icon('arrow-up-right')} Switch to ${esc(Store.ex(sug.nextEx).name)}</button>` : ''}</div>
      </div>
      <div class="set-row head cols-${cols.length} ty-${ex.type}"><span>Set</span><span>Previous</span>${cols.map(c => `<span>${colLabel(c, ex)}</span>`).join('')}<span>${icon('check')}</span></div>
      ${rows}
      <div class="row-between ex-foot">
        <button class="btn sm" data-a="addSet" data-i="${i}">${icon('plus')} Set</button>
        <button class="btn sm ghost" data-a="removeSet" data-i="${i}">${icon('minus')} Set</button>
        ${['wr', 'wbw', 'bw'].includes(ex.type) ? `<button class="btn sm ghost" data-a="countReps" data-i="${i}" aria-label="Count reps with camera">${icon('camera')}</button>` : ''}
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
    Notify.ensure().then(ok => { if (ok) { Notify.at(REST_NOTIF, this.restEnd, 'Rest over', 'Time for your next set'); RestNotif.show(); } });
    Companion.schedule();
    this.refreshSheet();
  },
  stopRest() { this.restEnd = 0; Notify.cancel(REST_NOTIF); RestNotif.hide(); Companion.schedule(); this.refreshSheet(); },

  tick() {
    const a = Store.data.active;
    Wake.set(!!a || (!!Timer.iv && !Timer.finished && !Timer.paused));
    if (a) $$('.wtime').forEach(el => el.textContent = fmtDur((Date.now() - a.start) / 1000));
    if (this.restEnd) {
      const left = Math.round((this.restEnd - Date.now()) / 1000);
      const el = $('#restLeft'); if (el) el.textContent = fmtDur(Math.max(0, left));
      const fill = $('.rest-fill'); if (fill) fill.style.width = (1 - Math.max(0, left) / this.restTotal) * 100 + '%';
      if (left <= 3 && left > 0) beep(660, 90, 0.15);
      if (left <= 0 && !this._restBeeped) { this._restBeeped = true; beep(988, 400); buzz([400]); this.restEnd = 0; Notify.cancel(REST_NOTIF); RestNotif.hide(); if (this.top() && this.top().key === 'workout') this.refreshSheet(); toast('Rest over'); }
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
    if (a.hr && a.hr.length > 3) { const v = a.hr.map(x => x[1]); w.hr = { avg: Math.round(v.reduce((p, q) => p + q, 0) / v.length), max: Math.max(...v), src: 'strap' }; }
    else if (HC.on) HC.workoutHR(w.start, w.end).then(hr => { if (hr) { w.hr = hr; Store.save(); } });
    Store.data.workouts.push(w); Store.data.active = null; Store.save(true);
    this.restEnd = 0; Notify.cancel(REST_NOTIF);
    this.stack = []; this.render();
    beep(1046, 150); setTimeout(() => beep(1318, 250), 160); buzz([80]);
    const unlocked = Achievements.check(); w.badges = unlocked.map(a => a[1]);
    this.openSheet('summary', 'Workout complete', () => summaryBody(w, prs));
    if (unlocked.length) setTimeout(() => toast(`${icon('award')} Achievement unlocked: ${unlocked[0][1]}`.replace(/<[^>]+>/g, ''), 3500), 900);
    Sync.run('finish');
  },

  discard() { Store.data.active = null; Store.save(true); this.restEnd = 0; Notify.cancel(REST_NOTIF); this.stack = this.stack.filter(s => s.key !== 'workout'); this.renderSheets(); this.render(); },

  // ---------- Exercise picker
  openPicker(mode, onPick) {
    this.pick = { mode, onPick, sel: [], q: '', disc: 'all', muscle: 'all', gymOnly: !!(Store.data.settings.gym && Store.data.settings.gym.length) };
    this.openSheet('picker', 'Add exercises', () => `
      <input class="search" type="search" placeholder="Search 180+ exercises" data-f="pickq" value="${esc(this.pick.q)}" aria-label="Search exercises">
      ${Store.data.settings.gym && Store.data.settings.gym.length ? `<label class="field row sm"><input type="checkbox" data-a-change="pickGym" ${this.pick.gymOnly ? 'checked' : ''}> Only equipment at my gym</label>` : ''}
      <div class="grid2 filters"><label class="field">Category<select data-f="pickdisc">${['all', ...Object.keys(DISCIPLINES)].map(k => `<option value="${k}" ${this.pick.disc === k ? 'selected' : ''}>${k === 'all' ? 'All categories' : DISCIPLINES[k].name}</option>`).join('')}</select></label>
        <label class="field">Muscle<select data-f="pickmus">${['all', ...Object.keys(MUSCLES)].map(k => `<option value="${k}" ${this.pick.muscle === k ? 'selected' : ''}>${k === 'all' ? 'Any muscle' : MUSCLES[k]}</option>`).join('')}</select></label></div>
      <div id="pickList">${this.pickList()}</div>
      <button class="btn wide" data-a="customEx">${icon('plus')} Create custom exercise</button><div style="height:80px"></div>`,
      { footer: () => this.pick.mode === 'replace' ? '' : `<div class="sheet-foot"><button class="btn primary wide" data-a="pickDone">Add ${this.pick.sel.length || ''} exercise${this.pick.sel.length === 1 ? '' : 's'}</button></div>` });
  },
  pickList() {
    const p = this.pick, q = p.q.toLowerCase().trim();
    const recent = new Set(Store.workoutsSorted().slice(0, 10).flatMap(w => w.exercises.map(e => e.exId)));
    let list = Store.allExercises().filter(e => (!p.gymOnly || Plan.available(e)) && (p.disc === 'all' || e.discipline === p.disc) && (p.muscle === 'all' || e.muscle === p.muscle || (e.secondary || []).includes(p.muscle)) && (!q || e.name.toLowerCase().includes(q) || (MUSCLES[e.muscle] || '').toLowerCase().includes(q)));
    const grp = p.grp || 'all';
    if (!q && p.muscle === 'all' && p.disc === 'all') {
      const rec = list.filter(e => recent.has(e.id)).slice(0, 6);
      return `${rec.length ? `<div class="pick-head">Recent</div>${rec.map(e => this.pickRow(e, p)).join('')}` : ''}
        <div class="pick-head">Categories</div><div class="tile-grid">${Object.entries(DISCIPLINES).map(([k, d]) => { const n = list.filter(e => e.discipline === k).length; return n ? `<button class="card tile-btn" data-a="pickDisc" data-id="${k}">${icon(d.icon)}<b>${esc(d.name)}</b><span class="sm muted">${n} exercises</span></button>` : ''; }).join('')}</div>`;
    }
    if (!q && p.muscle === 'all' && grp === 'all') {
      const groups = {}; list.forEach(e => (groups[exGroup(e)] = groups[exGroup(e)] || []).push(e));
      if (Object.keys(groups).length > 1 && list.length > 14) return `<button class="btn sm ghost" data-a="pickDisc" data-id="all">${icon('arrow-left')} All categories</button>
        <div class="pick-head">${esc(DISCIPLINES[p.disc].name)}</div><div class="tile-grid">${Object.entries(groups).map(([g, items]) => `<button class="card tile-btn" data-a="pickGroup" data-id="${esc(g)}"><b>${esc(g)}</b><span class="sm muted">${items.length} · ${esc(items.slice(0, 2).map(e => e.name).join(', '))}</span></button>`).join('')}</div>`;
    }
    if (!q && grp !== 'all') list = list.filter(e => exGroup(e) === grp);
    const back = !q && p.disc !== 'all' && grp !== 'all' ? `<button class="btn sm ghost" data-a="pickGroup" data-id="all">${icon('arrow-left')} ${esc(DISCIPLINES[p.disc].name)}</button>` : '';
    const head = e => q ? '' : recent.has(e.id) ? 'Recent' : (DISCIPLINES[e.discipline] ? DISCIPLINES[e.discipline].name + ' · ' : '') + exGroup(e);
    list.sort((a, b) => (recent.has(b.id) - recent.has(a.id)) || (q ? 0 : head(a).localeCompare(head(b))) || a.name.localeCompare(b.name));
    let last = null;
    return back + (list.slice(0, 200).map(e => { const h = head(e), hd = h && h !== last ? `<div class="pick-head">${esc(h)}</div>` : ''; last = h; return hd + this.pickRow(e, p); }).join('') || '<div class="empty">No matches. Create a custom exercise below.</div>');
  },
  pickRow(e, p) {
    return `<button class="li pick ${p.sel.includes(e.id) ? 'sel' : ''}" data-a="pickToggle" data-id="${e.id}">
      <span class="ex-ic">${icon(DISCIPLINES[e.discipline] ? DISCIPLINES[e.discipline].icon : 'barbell')}</span>
      <span><b>${esc(e.name)}</b><span class="sm muted">${MUSCLES[e.muscle] || ''}${e.equipment !== 'none' ? ' · ' + e.equipment : ''} · ${esc(trackingText(e).replace(/^Log /, '').replace(/\.$/, ''))}</span></span>
      ${p.mode === 'browse' ? icon('chevron-right', 'muted') : p.sel.includes(e.id) ? icon('circle-check', 'acc') : icon('circle', 'muted')}</button>`;
  },

  // ---------- Routine editor
  editRoutine(r) {
    this.draft = r ? JSON.parse(JSON.stringify(r)) : { id: uid(), name: 'New routine', exercises: [] };
    const isNew = !r;
    this.openSheet('routine', isNew ? 'New routine' : 'Edit routine', () => {
      const d = this.draft;
      const folders = [...new Set(Store.data.routines.map(r => r.folder || r.program).filter(Boolean))];
      return `<input class="title-input" data-rf="name" value="${esc(d.name)}" aria-label="Routine name">
      <label class="field">Folder <span class="muted sm">(optional, groups routines on Home)</span><input data-rf="folder" list="folderList" value="${esc(d.folder || d.program || '')}" placeholder="e.g. Summer cut"><datalist id="folderList">${folders.map(f => `<option value="${esc(f)}">`).join('')}</datalist></label>
      ${d.exercises.map((e, i) => { const ex = Store.ex(e.exId); const isT = ex.type === 'dur' || ex.type === 'wdur' || ex.type === 'hang'; const none = ex.type === 'dist' || ex.type === 'climb'; return `
        <div class="card"><div class="row-between"><b>${esc(ex.name)}</b><span>
          <button class="icon-btn" data-a="rMove" data-i="${i}" data-v="-1" aria-label="Move up">${icon('arrow-up')}</button>
          <button class="icon-btn" data-a="rRemove" data-i="${i}" aria-label="Remove">${icon('x')}</button></span></div>
          ${none ? '<div class="sm muted">The coach sets distance and grade targets from your history.</div>' : `<div class="grid3 small-inputs">
            <label>Sets<input inputmode="numeric" data-rf="sets" data-i="${i}" value="${e.sets}"></label>
            <label>${isT ? 'Min sec' : 'Min reps'}<input inputmode="numeric" data-rf="repMin" data-i="${i}" value="${e.repMin}"></label>
            <label>${isT ? 'Max sec' : 'Max reps'}<input inputmode="numeric" data-rf="repMax" data-i="${i}" value="${e.repMax}"></label></div>
            ${['wr', 'wbw'].includes(ex.type) ? `<div class="grid2 small-inputs"><label>% of max (optional)<input inputmode="numeric" data-rf="pct" data-i="${i}" value="${e.pct || ''}" placeholder="Coach decides"></label><label>Target RPE (optional)<input inputmode="decimal" data-rf="rpe" data-i="${i}" value="${e.rpe || ''}" placeholder="8"></label></div>` : ''}`}
          <label class="sm muted">Rest <select data-rf="rest" data-i="${i}">${[0, 30, 45, 60, 90, 120, 150, 180, 240, 300].map(v => `<option value="${v}" ${+e.rest === v ? 'selected' : ''}>${v ? fmtDur(v) : 'Off'}</option>`).join('')}</select></label>
        </div>`; }).join('') || '<div class="empty">Add exercises to this routine.</div>'}
      <button class="btn wide" data-a="rAddEx">${icon('plus')} Add exercise</button>
      ${isNew ? '' : `<button class="btn wide" data-a="rDuplicate">${icon('copy')} Duplicate routine</button><button class="btn wide danger-ghost" data-a="rDelete">${icon('trash')} Delete routine</button>`}<div style="height:80px"></div>`;
    }, { action: `<button class="btn primary sm" data-a="rSave">Save</button>` });
  },

  // ---------- Events
  bind() {
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-a]'); if (!t) return;
      const fn = Actions[t.dataset.a]; if (!fn) return;
      e.preventDefault();
      const fail = err => { ErrorLog.add('action:' + t.dataset.a, err && err.message, err && err.stack); toast('Something went wrong. It was saved to the error log.'); };
      try { const r = fn.call(this, t, t.dataset); if (r && r.catch) r.catch(fail); } catch (err) { fail(err); }
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
      else if (ds.f === 'st') { const st = a.exercises[i].sets[j]; st.st = v; st.sent = v !== '' && !/^p\d/.test(v); }
      else if (ds.f === 'edge') a.exercises[i].sets[j].edge = v === 'jug' || v === '' ? v : +v;
      else if (['w', 'r', 'rpe', 't', 'd', 'g', 'a', 'ang', 'grip'].includes(ds.f)) a.exercises[i].sets[j][ds.f] = ds.f === 'g' ? v : (ds.f === 't' && ds.fmt === 'mmss' ? (v.includes(':') ? parseDur(v) : v) : v);
      Store.save();
      if (isChange && ds.f === 'g') this.refreshSheet();
    }
    if (ds.f === 'discq' && this.top()) { this.disc = { ...(this.disc || { grp: 'all' }), q: v }; const el = $('#discList'); if (el) el.innerHTML = this.discList(this.top().discKey); }
    if ((ds.f === 'pickdisc' || ds.f === 'pickmus') && this.pick) { if (ds.f === 'pickdisc') { this.pick.disc = v; this.pick.grp = 'all'; } else this.pick.muscle = v; const el = $('#pickList'); if (el) el.innerHTML = this.pickList(); }
    if (ds.f === 'pickq') { this.pick.q = v; $('#pickList').innerHTML = this.pickList(); }
    if (ds.rf && this.draft) {
      const d = this.draft;
      if (ds.rf === 'name') d.name = v; else if (ds.rf === 'folder') { d.folder = v.trim(); if (d.program && d.folder !== d.program) delete d.program; } else d.exercises[+ds.i][ds.rf] = +v || 0;
    }
    if (ds.setting) {
      const s = Store.data.settings;
      if (ds.setting === 'plates') s.plates = v.split(/[ ,;]+/).map(num).filter(Boolean).sort((x, y) => y - x);
      else if (['rest', 'bar', 'bodyweight', 'weekGoal'].includes(ds.setting)) s[ds.setting] = num(v);
      else if (ds.setting === 'unit' && v !== s.unit) {
        const from = s.unit;
        if (Store.data.workouts.length && confirm(`Convert your logged weights from ${from} to ${v}? Choose Cancel to keep the numbers as they are.`)) convertUnits(from, v);
        else { s.unit = v; if (v === 'lb') { s.bar = 45; s.plates = [45, 35, 25, 10, 5, 2.5]; } else { s.bar = 20; s.plates = [25, 20, 15, 10, 5, 2.5, 1.25]; } }
      }
      else s[ds.setting] = v;
      Store.save();
      if (['theme', 'textSize'].includes(ds.setting)) applyLook();
      if (isChange && ['unit', 'autoUpdate', 'autoSync'].includes(ds.setting)) this.refreshSheet();
    }
    if (ds.ci) { this._ciTouched = true; this.ci[ds.ci] = +v; const out = $('#ci-' + ds.ci); if (out) out.textContent = v; const sc = $('#ciScore'); if (sc) sc.textContent = readinessScore(this.ci); }
    if (ds.tc) { this.tconf[ds.tc] = ds.tc === 'name' ? v : ds.tc === 'moves' ? v.split('\n').map(x => x.trim()).filter(Boolean) : num(v); const s = $('#tcSum'); if (s) s.textContent = timerSummary(this.tconf); }
    if (ds.tool) { this.toolState[ds.tool] = v; const r = $('#toolOut'); if (r) r.innerHTML = this.toolOut(); }
    if (ds.m) this.mdraft[ds.m] = v;
    if (ds.imp) this.impUnit = v;
  }
};

// Theme and text size (accessibility)
function applyLook() {
  const s = Store.data.settings, root = document.documentElement;
  if (!root || !root.setAttribute) return;
  if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme); else root.removeAttribute('data-theme');
  if (document.body && document.body.style) document.body.style.zoom = s.textSize && s.textSize != '1' ? s.textSize : '';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.body).backgroundColor || '#0f1115');
}
// ---------- Helpers used by views
// Routines grouped by the program they came from, with the next one to do in each program
function routineGroups(d) {
  const groups = [], byName = {};
  d.routines.forEach(r => { const k = r.folder || r.program || ''; if (!byName[k]) { byName[k] = { name: k, routines: [] }; groups.push(byName[k]); } byName[k].routines.push(r); });
  const sorted = Store.workoutsSorted();
  groups.forEach(g => {
    if (!g.name) return;
    const ids = g.routines.map(r => r.id), last = sorted.find(w => ids.includes(w.routineId));
    g.next = last ? ids[(ids.indexOf(last.routineId) + 1) % ids.length] : ids[0];
  });
  return groups.sort((a, b) => (a.name === '') - (b.name === ''));
}

function setColumns(ex) {
  return { wr: ['w', 'r', 'rpe'], wbw: ['w', 'r', 'rpe'], bw: ['r', 'rpe'], dur: ['t'], wdur: ['w', 't'], hang: ['edge', 'grip', 'w', 't'], dist: ['d', 'tt'], climb: ['g', 'a', 'st', 'ang'] }[ex.type] || ['w', 'r'];
}
function colLabel(c, ex) {
  const added = ex.type === 'wbw' || ex.type === 'hang' || (ex.type === 'wdur' && !Climb.LIFT.includes(ex.id));
  return { w: added ? '+' + U() : U(), r: 'Reps', rpe: 'RPE', t: 'Sec', d: 'km', tt: 'Time', g: 'Grade', a: 'Tries', sent: 'Sent', st: 'Result', ang: 'Wall', edge: 'mm', grip: 'Grip' }[c];
}
function setInput(ex, c, s, i, j) {
  const p = s.p || {};
  if (c === 'sent') return `<label class="sent"><input type="checkbox" data-f="sent" data-i="${i}" data-j="${j}" ${s.sent ? 'checked' : ''} aria-label="Sent"></label>`;
  if (c === 'g') {
    const scale = Climb.grades(Climb.cat(ex)), opts = s.g && !scale.includes(s.g) ? [s.g, ...scale] : scale;
    return `<select data-f="g" data-i="${i}" data-j="${j}" aria-label="Grade"><option value="">${esc(p.g || '–')}</option>${opts.map(g => `<option ${s.g === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>`;
  }
  if (c === 'st') { const cur = s.st != null ? s.st : (s.sent ? 'sent' : ''); return `<select data-f="st" data-i="${i}" data-j="${j}" aria-label="Result">${CLIMB_RESULTS.filter(r => r[0] !== 'onsight' || Climb.cat(ex) === 'route').map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`; }
  if (c === 'edge') { const cur = s.edge != null && s.edge !== '' ? String(s.edge) : ''; return `<select data-f="edge" data-i="${i}" data-j="${j}" aria-label="Edge depth"><option value="">${p.edge ? esc(String(p.edge === 'jug' ? 'Jug' : p.edge)) : '–'}</option>${[...Climb.EDGES.map(String), 'jug'].map(v => `<option value="${v}" ${cur === v ? 'selected' : ''}>${v === 'jug' ? 'Jug' : v}</option>`).join('')}</select>`; }
  if (c === 'grip') return `<select data-f="grip" data-i="${i}" data-j="${j}" aria-label="Grip"><option value="">${esc(p.grip ? (Climb.GRIPS.find(g => g[0] === p.grip) || [0, 0, p.grip])[2] : 'Grip')}</option>${Climb.GRIPS.map(([v, , sh]) => `<option value="${v}" ${s.grip === v ? 'selected' : ''}>${sh}</option>`).join('')}</select>`;
  if (c === 'ang') return `<select data-f="ang" data-i="${i}" data-j="${j}" aria-label="Wall angle">${CLIMB_ANGLES.map(([v, l]) => `<option value="${v}" ${(s.ang || '') === v ? 'selected' : ''}>${v ? l : '–'}</option>`).join('')}</select>`;
  if (c === 'tt') return `<input inputmode="numeric" data-f="t" data-fmt="mmss" data-i="${i}" data-j="${j}" value="${s.t !== '' ? fmtDur(s.t) : ''}" placeholder="${p.t ? fmtDur(p.t) : 'mm:ss'}" aria-label="Time">`;
  const ph = c === 'w' ? fmtW(p.w) : (p[c] != null ? p[c] : '');
  const mode = c === 'r' || c === 't' || c === 'a' ? 'numeric' : 'decimal';
  return `<input inputmode="${mode}" data-f="${c}" data-i="${i}" data-j="${j}" value="${esc(s[c] == null ? '' : s[c])}" placeholder="${esc(ph === '' ? (c === 'rpe' ? '' : '–') : ph)}" aria-label="${colLabel(c, ex)}">`;
}
function prevText(ex, s) {
  if (ex.type === 'dist') return `${s.d || 0}km ${fmtDur(s.t)}`;
  if (ex.type === 'dur') return `${s.t}s`;
  if (ex.type === 'climb') return `${s.g || '?'}${s.sent ? (s.st === 'flash' || s.st === 'onsight' ? ' ⚡' : ' ✓') : ''}`;
  if (ex.type === 'hang') return `${s.edge ? (s.edge === 'jug' ? 'jug' : s.edge + 'mm') : ''}${s.grip ? ' ' + (Climb.GRIPS.find(g => g[0] === s.grip) || [0, 0, s.grip])[2] : ''} ${+s.w ? (+s.w > 0 ? '+' : '') + fmtW(s.w) : 'BW'} ${s.t || 0}s`.trim();
  if (ex.type === 'wdur') return `${Climb.LIFT.includes(ex.id) ? fmtW(s.w) : (+s.w ? '+' + fmtW(s.w) : 'BW')} ${s.t || 0}s`;
  if (ex.type === 'bw') return `${s.r}`;
  return `${fmtW(s.w)}×${s.r}`;
}
// Muscles still recovering, with roughly how long until they're ready
function recoveryList() {
  const r = Coach.recovery(Date.now(), true), list = Object.entries(r.pct).filter(([m, p]) => p < 95 && MUSCLES[m] && !['full_body', 'cardio', 'mobility'].includes(m)).sort((a, b) => a[1] - b[1]);
  if (!list.length) return '<div class="sm muted center" style="margin-top:8px">Everything is recovered. A good day for a big session.</div>';
  return `<div class="rec-list">${list.map(([m, p]) => `<div class="rec-row"><span>${MUSCLES[m]}</span><div class="rec-bar"><div class="rc-bg-${p >= 75 ? 1 : p >= 50 ? 2 : 3}" style="width:${p}%"></div></div><span class="sm muted">${r.left[m] ? 'ready in ~' + (r.left[m] >= 24 ? Math.round(r.left[m] / 24 * 10) / 10 + ' d' : r.left[m] + ' h') : p + '%'}</span></div>`).join('')}</div>`;
}
function workoutVolume(w, includeOpen) {
  let v = 0;
  for (const e of w.exercises) { const ex = Store.ex(e.exId); if (ex.type !== 'wr' && ex.type !== 'wbw') continue;
    for (const s of e.sets) if ((s.done || includeOpen === undefined) && s.done !== false && s.type !== 'W') v += (+s.w || 0) * (+s.r || 0); }
  return v;
}
function readinessScore(c) {
  let s = Math.min(c.sleep, 9) / 8 * 25 + c.quality / 5 * 15 + (6 - c.soreness) / 5 * 20 + c.energy / 5 * 25 + (6 - c.stress) / 5 * 15;
  // Watch signals: resting HR well above your baseline, or HRV well below, both mean incomplete recovery
  if (c.rhrDelta != null) s -= c.rhrDelta >= 7 ? 12 : c.rhrDelta >= 4 ? 6 : c.rhrDelta <= -3 ? -3 : 0;
  if (c.hrvRatio != null) s -= c.hrvRatio < 0.8 ? 10 : c.hrvRatio < 0.9 ? 5 : c.hrvRatio > 1.1 ? -3 : 0;
  // Several short nights in a row add up even if last night was fine
  if (c.sleepAvg != null) s -= c.sleepAvg < 5.5 ? 6 : c.sleepAvg < 6.5 ? 3 : 0;
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
    else if (ex.type === 'wdur') { if (mw > b.w && sets.some(s => (+s.w || 0) === mw && (+s.t || 0) >= 5)) out.push({ ex: ex.name, what: 'Heaviest hold', val: fmtW(mw) + ' ' + U() }); }
    else if (ex.type === 'climb') {
      const cat = Climb.cat(ex), val = s => (s.sent ? Climb.value(s.g, cat) : null);
      const before = Math.max(-9, ...Store.sessions(e.exId, 200).filter(h => h.workoutId !== w.id).flatMap(h => h.sets.map(val)).filter(v => v != null));
      const now = Math.max(-9, ...sets.map(val).filter(v => v != null));
      if (now > before && before > -9) out.push({ ex: ex.name, what: 'Hardest send', val: Climb.label(now, cat) });
    }
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
// Convert every stored weight between kg and lb (workouts, active workout, measurements, settings)
function convertUnits(from, to) {
  const k = to === 'lb' ? 1 / 0.45359237 : 0.45359237, d = Store.data, s = d.settings;
  const cw = v => (v === '' || v == null || isNaN(+v)) ? v : Math.round(+v * k * 10) / 10;
  const fixSets = list => list.forEach(e => { const ex = Store.ex(e.exId); if (ex.type !== 'wr' && ex.type !== 'wbw') return; e.sets.forEach(st => { st.w = cw(st.w); if (st.p) st.p.w = cw(st.p.w); }); });
  d.workouts.forEach(w => { fixSets(w.exercises); w.u = Date.now(); });
  if (d.active) fixSets(d.active.exercises);
  d.measurements.forEach(m => { if (m.weight) m.weight = cw(m.weight); m.u = Date.now(); });
  s.unit = to; s.bodyweight = cw(s.bodyweight);
  if (to === 'lb') { s.bar = 45; s.plates = [45, 35, 25, 10, 5, 2.5]; } else { s.bar = 20; s.plates = [25, 20, 15, 10, 5, 2.5, 1.25]; }
  toast(`Converted to ${to}`);
}
function heatmap(ws) {
  const days = {}; ws.forEach(w => { const k = new Date(w.start).toDateString(); days[k] = (days[k] || 0) + 1; });
  const weeks = 16, start = startOfWeek() - (weeks - 1) * 7 * 864e5, L = 18, T = 14;
  let cells = '', lastMonth = -1;
  ['M', '', 'W', '', 'F', '', 'S'].forEach((d, r) => { if (d) cells += `<text x="0" y="${T + r * 19 + 11}" class="axis">${d}</text>`; });
  for (let c = 0; c < weeks; c++) {
    const m = new Date(start + c * 7 * 864e5).getMonth();
    if (m !== lastMonth) { cells += `<text x="${L + c * 19}" y="10" class="axis">${new Date(start + c * 7 * 864e5).toLocaleDateString(undefined, { month: 'short' })}</text>`; lastMonth = m; }
    for (let r = 0; r < 7; r++) {
      const t = start + (c * 7 + r) * 864e5; if (t > Date.now()) continue;
      const n = days[new Date(t).toDateString()] || 0;
      cells += `<rect x="${L + c * 19}" y="${T + r * 19}" width="15" height="15" rx="3" class="hm${Math.min(n, 2)}"><title>${fmtDate(t)}: ${n} workout(s)</title></rect>`;
    }
  }
  return `<svg viewBox="0 0 ${L + weeks * 19} ${T + 7 * 19}" class="chart heat" role="img" aria-label="Workout calendar, last ${weeks} weeks">${cells}</svg>`;
}
function historyCard(w) {
  const mins = Math.round(((w.end || w.start) - w.start) / 60000);
  return `<button class="card hist" data-a="workoutDetail" data-id="${w.id}">
    <div class="row-between"><b>${esc(w.name)}</b><span class="sm muted">${fmtDate(w.start)}</span></div>
    <div class="sm muted row wstats"><span>${icon('clock')} ${mins} min</span><span>${icon('weight')} ${fmtNum(workoutVolume(w))} ${U()}</span>${w.prs ? `<span class="acc">${icon('trophy')} ${w.prs} PR</span>` : ''}${w.hr ? `<span>${icon('heart')} ${w.hr.avg} avg</span>` : ''}${w.imported ? `<span>${icon('file-import')} ${esc(w.imported)}</span>` : ''}</div>
    <div class="sm clamp">${w.exercises.map(e => `${e.sets.length}× ${esc(Store.ex(e.exId).name)}`).join(' · ')}</div></button>`;
}
function summaryBody(w, prs) {
  const mins = Math.round((w.end - w.start) / 60000);
  const sets = w.exercises.reduce((s, e) => s + e.sets.length, 0);
  return `<div class="celebrate">${icon('trophy')}<h2>Nice work</h2><div class="muted">${esc(w.name)} · ${fmtDate(w.start)}</div></div>
    <div class="stats3"><div class="stat"><div class="muted sm">Duration</div><b>${mins} min</b></div><div class="stat"><div class="muted sm">Volume</div><b>${fmtNum(workoutVolume(w))}</b></div><div class="stat"><div class="muted sm">Sets</div><b>${sets}</b></div></div>
    ${w.badges && w.badges.length ? `<div class="card accent-card col"><b>${icon('award')} Achievement${w.badges.length > 1 ? 's' : ''} unlocked</b><div class="sm">${w.badges.map(esc).join(' · ')}</div></div>` : ''}
    ${prs.length ? `<div class="card"><b>${icon('trophy')} New records</b>${prs.map(p => `<div class="li static"><span>${esc(p.ex)}<span class="sm muted"> · ${p.what}</span></span><b>${esc(p.val)}</b></div>`).join('')}</div>` : ''}
    <div class="card"><b>${icon('sparkles')} Next session plan</b>${w.exercises.map(e => { const s = Coach.suggest(e.exId, e.target); return `<div class="li static col"><span><b>${esc(Store.ex(e.exId).name)}</b>: ${esc(s.title)}</span><span class="sm muted">${esc(s.text)}</span></div>`; }).join('')}</div>
    ${w.routineId && Store.data.routines.find(r => r.id === w.routineId) ? `<button class="btn wide" data-a="updateRoutineFrom" data-id="${w.id}">${icon('device-floppy')} Update routine with this workout's exercises</button>` : `<button class="btn wide" data-a="saveAsRoutine" data-id="${w.id}">${icon('device-floppy')} Save as routine</button>`}
    <button class="btn wide" data-a="shareWorkout" data-id="${w.id}">${icon('share')} Share as image</button>
    <button class="btn primary wide" data-a="closeSheet">Done</button>`;
}

const TIMER_PRESETS = {
  hiit: { name: 'HIIT', icon: 'flame', work: 40, rest: 20, rounds: 10, about: 'High-intensity intervals. Work hard for the work time, recover during the rest, repeat.',
    how: ['Pick 4–5 moves below (or keep the suggestions).', 'Each work interval, do the move shown on screen at a hard but steady pace.', 'Rest when the screen turns to Rest. The next move is shown so you can get ready.', 'The list repeats until all rounds are done.'],
    moves: ['Burpees', 'Mountain climbers', 'Squat jumps', 'Push-ups', 'High knees'] },
  tabata: { name: 'Tabata', icon: 'bolt', work: 20, rest: 10, rounds: 8, about: '4 minutes: 20 seconds all-out, 10 seconds rest, 8 times. Short and very hard.',
    how: ['Choose one or two moves you can do fast and safely.', 'Go flat out for every 20 seconds.', 'Count your reps each round; try to keep the count the same in the last round.'],
    moves: ['Squat jumps', 'Push-ups'] },
  emom: { name: 'EMOM', icon: 'repeat', work: 60, rest: 0, rounds: 12, about: 'Every minute on the minute. At the start of each minute, do the set reps. Whatever is left of the minute is your rest.',
    how: ['Write each minute\'s task below with its reps, e.g. "10 kettlebell swings".', 'When the minute starts, do the reps shown.', 'Rest until the next minute beeps.', 'If you can\'t finish the reps with at least 10 seconds to spare, lower them.'],
    moves: ['10 Kettlebell swings', '8 Push-ups', '12 Air squats'] },
  amrap: { name: 'AMRAP', icon: 'infinity', work: 900, rest: 0, rounds: 1, about: 'As many rounds as possible within the time cap.',
    how: ['Set up a circuit below, e.g. 5 pull-ups, 10 push-ups, 15 squats.', 'Go through the circuit in order, again and again, at a pace you can keep.', 'Tap Round done each time you finish the circuit.', 'Your score is the number of rounds. Beat it next time.'],
    moves: ['5 Pull-ups', '10 Push-ups', '15 Air squats'] },
  boxing: { name: 'Boxing', icon: 'karate', work: 180, rest: 60, rounds: 6, about: 'Boxing rounds: 3 minutes on, 1 minute off. For bag work, shadow boxing or pads.',
    how: ['Wrap your hands and warm up.', 'Each round has a focus shown on screen. Keep your guard up and keep moving.', 'Use the minute off to breathe and shake out your arms.'],
    moves: ['Jab and cross', 'Hooks and uppercuts', 'Body shots', 'Defence and footwork', 'Free combinations', 'All-out last round'] },
  maxhang: { name: 'Max hangs', icon: 'hand-grab', work: 10, rest: 180, rounds: 5, about: 'Hangboard max hangs: short, heavy hangs with long rests to build finger strength.',
    how: ['Pick a 20 mm edge and a half-crimp grip.', 'Add weight so you could hold about 3 seconds longer than the hang time.', 'Hang when the screen says Go, step off at the beep.', 'Rest fully. Stop if anything hurts.'], moves: ['20 mm half crimp'] },
  repeaters: { name: 'Repeaters', icon: 'repeat', work: 7, rest: 3, reps: 6, setRest: 180, rounds: 5, about: 'Hangboard repeaters: 7 s on, 3 s off, six hangs per set, for finger endurance.',
    how: ['Use a slightly bigger edge than for max hangs.', 'Hang for 7 s, let go for 3 s, six times. That is one set.', 'Rest 3 minutes between sets.', 'If you can\'t finish the last hangs, use a bigger edge or take weight off.'], moves: ['20 mm open hand'] },
  abrahang: { name: 'Abrahangs', icon: 'heart-handshake', work: 10, rest: 20, rounds: 30, about: 'Very easy hangs for finger health: 10 s on, 20 s off for about 15 minutes.',
    how: ['Keep your feet on the ground or use a light load so it feels like 40–60% effort.', 'Hang 10 s, rest 20 s, and repeat.', 'Good on rest days or before climbing.'], moves: [] },
  bjj: { name: 'BJJ rolls', icon: 'users', work: 300, rest: 60, rounds: 5, about: 'Timed sparring rounds for grappling. Switch partners each round.',
    how: ['Agree on intensity with your partner.', 'Roll for the round time. Tap early, tap often.', 'Rest and switch partners during the break.'],
    moves: [] }
};
function timerSummary(c) {
  const reps = c.reps || 1;
  if (reps > 1) { const set = reps * c.work + (reps - 1) * c.rest, total = c.rounds * set + Math.max(0, c.rounds - 1) * (c.setRest || 0) + (c.prep || 0); return `${c.rounds} sets × ${reps} hangs (${c.work}s on / ${c.rest}s off) · ${fmtDur(c.setRest || 0)} between sets · total ${fmtDur(total)}`; }
  const total = c.rounds * c.work + Math.max(0, c.rounds - 1) * c.rest + (c.prep || 0); return `${c.rounds} × ${fmtDur(c.work)} work${c.rest ? ' / ' + fmtDur(c.rest) + ' rest' : ''} · total ${fmtDur(total)}`;
}
