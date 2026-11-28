'use strict';

const MEASURES = [['weight', 'Body weight', () => U()], ['bodyfat', 'Body fat', () => '%'], ['waist', 'Waist', () => 'cm'], ['chest', 'Chest', () => 'cm'], ['hips', 'Hips', () => 'cm'],
  ['arm', 'Arm', () => 'cm'], ['thigh', 'Thigh', () => 'cm'], ['calf', 'Calf', () => 'cm'], ['neck', 'Neck', () => 'cm'], ['rhr', 'Resting heart rate', () => 'bpm']];

const DISCLAIMER_HTML = `<div class="card warn-card sm"><b>Health and safety</b>
  <p>Gym App gives general training suggestions based on the numbers you log. It is not medical advice and doesn't know about your injuries, health conditions or form.</p>
  <p>Check with a doctor before starting a new training program, especially if you have a medical condition, are pregnant, or haven't exercised in a while. Stop and get help if you feel pain, dizziness or chest discomfort. Ignore any suggestion that doesn't feel right for your body.</p></div>`;

const Timer = {
  phases: [], i: 0, end: 0, left: 0, paused: false, iv: null, conf: null, startedAt: 0, amrapRounds: 0, finished: false,
  build(c) {
    const ph = [];
    if (c.prep) ph.push({ label: 'Get ready', secs: c.prep, kind: 'prep' });
    const reps = c.reps || 1;
    for (let r = 1; r <= c.rounds; r++) {
      const mv = c.moves && c.moves.length && c.type !== 'amrap' ? c.moves[(r - 1) % c.moves.length] : '';
      for (let k = 1; k <= reps; k++) {
        ph.push({ label: c.type === 'emom' ? `Minute ${r}` : c.type === 'amrap' ? 'AMRAP' : reps > 1 ? `Set ${r} of ${c.rounds} · hang ${k} of ${reps}` : `${c.type === 'hang' || c.type === 'maxhang' || c.type === 'abrahang' ? 'Hang' : 'Round'} ${r} of ${c.rounds}`, secs: c.work, kind: 'work', r, move: mv });
        if (k < reps && c.rest) ph.push({ label: 'Off', secs: c.rest, kind: 'rest' });
      }
      const between = reps > 1 ? c.setRest : c.rest;
      if (between && r < c.rounds) ph.push({ label: 'Rest', secs: between, kind: 'rest' });
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
    Notify.ensure().then(ok => { if (!ok) return; let t = this.end; for (let k = this.i + 1; k < Math.min(this.phases.length, this.i + 40); k++) { Notify.at(100 + k, t, this.phases[k].label, this.phases[k].kind === 'rest' ? 'Rest' + (this.phases[k + 1] && this.phases[k + 1].move ? '. Next: ' + this.phases[k + 1].move : '') : (this.phases[k].move || 'Go')); t += this.phases[k].secs * 1000; } Notify.at(99, t, 'Timer finished', 'Great work'); });
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
    // Readiness fills in by itself (sleep, heart data, recent training). Redo it from the Today card.
    if (!Store.latestCheckin()) Actions.autoCheckin.call(this, true);
    fn();
  },

  openCheckin(beforeWorkout) {
    this.prepCheckin(beforeWorkout);
    this.openSheet('checkin', 'How do you feel?', () => this.checkinBody(beforeWorkout), { onClose: () => { } });
  },
  // Fills in everything that can be automatic: sleep, heart data, soreness from training
  prepCheckin(beforeWorkout) {
    this.ci = { sleep: 7, quality: 3, soreness: 2, energy: 3, stress: 2 };
    this._ciTouched = false; this._ciBefore = beforeWorkout;
    const h = Store.data.health && Date.now() - Store.data.health.at < 6 * 3600e3 ? Store.data.health : null;
    let watchNote = '', filled = [];
    if (h) {
      if (h.sleepH) { this.ci.sleep = Math.min(10, Math.max(3, Math.round(h.sleepH * 2) / 2)); filled.push('sleep'); }
      if (h.sleepQ) { this.ci.quality = h.sleepQ; filled.push('quality'); }
      if (h.rhr && h.rhr.base && h.rhr.fresh) this.ci.rhrDelta = h.rhr.latest - h.rhr.base;
      if (h.hrv && h.hrv.base && h.hrv.fresh) this.ci.hrvRatio = h.hrv.latest / h.hrv.base;
      if (h.sleepAvg3 != null) this.ci.sleepAvg = Math.round(h.sleepAvg3 * 10) / 10;
      const sl = h.sleep;
      watchNote = [h.sleepH ? `${h.sleepH} h sleep${sl ? ' from ' + sl.source : ''}` : '',
        sl && sl.restorative != null ? `${sl.restorative}% deep and REM` : '', sl && sl.eff != null ? `${Math.round(sl.eff * 100)}% efficiency` : '',
        h.rhr ? `${h.rhr.sleeping ? 'sleeping HR' : 'resting HR'} ${h.rhr.latest}${h.rhr.base ? ' (usual ' + h.rhr.base + ')' : ''}` : '',
        h.hrv ? `HRV ${h.hrv.latest} ms${h.hrv.base ? ' (usual ' + h.hrv.base + ')' : ''}` : '',
        h.sleepAvg3 != null ? `3-night average ${h.sleepAvg3.toFixed(1)} h` : ''].filter(Boolean).join(' · ');
      if (HC.on && Date.now() - h.at > 3600e3) HC.pull().then(x => { if (x && this.top() && this.top().key === 'checkin' && !this._ciTouched) this.openCheckin(beforeWorkout); });
    } else if (HC.on) HC.pull().then(x => { if (x && this.top() && this.top().key === 'checkin' && !this._ciTouched) this.openCheckin(beforeWorkout); });
    this._ciFilled = filled;
    // Soreness: estimated from how recovered your trained muscles are
    const rec = Coach.recovery(), worst = Math.min(100, ...Object.entries(rec).filter(([m]) => !['full_body', 'cardio', 'mobility'].includes(m)).map(([, p]) => p));
    this.ci.soreness = worst < 40 ? 4 : worst < 60 ? 3 : worst < 85 ? 2 : 1;
    this.ci.energy = null;
    const autoNote = worst < 85 ? `Soreness estimated from your recent training (${Object.entries(rec).filter(([m, p]) => p === worst && MUSCLES[m]).map(([m]) => MUSCLES[m]).slice(0, 2).join(', ')} still recovering).` : 'Soreness estimated from your recent training: everything is recovered.';
    this._ciAutoNote = autoNote; this._ciNote = watchNote; this._ciFilledList = filled;
  },
  checkinBody(beforeWorkout) {
    const c = this.ci, watchNote = this._ciNote, filled = this._ciFilledList || [];
    const seg = (k, label, opts) => `<div class="ci"><div class="ci-label">${label}</div><div class="seg">${opts.map(([v, l]) => `<button class="seg-btn ${c[k] === v ? 'on' : ''}" data-a="ciSet" data-id="${k}:${v}" aria-pressed="${c[k] === v}">${l}</button>`).join('')}</div></div>`;
    const moods = [[1, 'mood-sad', 'Drained'], [2, 'mood-sad-2', 'Low'], [3, 'mood-empty', 'OK'], [4, 'mood-smile', 'Good'], [5, 'mood-happy', 'Great']];
    return `${watchNote ? `<div class="card ci-auto sm">${icon('circle-check')} <b>Filled in for you</b><div>${esc(watchNote)}.</div><div class="muted">${esc(this._ciAutoNote)}</div></div>`
        : `<div class="card ci-auto sm">${icon('circle-check')} <b>Filled in for you</b><div class="muted">${esc(this._ciAutoNote)}</div>${HC.on ? '' : `<div class="muted">Sleep fills in by itself if you <button class="link sm" data-a="devices">link Health Connect</button> (Samsung Health, Sleep as Android, watches).</div>`}</div>`}
      <div class="ci-mood-q">One tap: how is your energy today?</div>
      <div class="moods">${moods.map(([v, ic, l]) => `<button class="mood ${c.energy === v ? 'on' : ''}" data-a="ciMood" data-id="${v}">${icon(ic)}<span>${l}</span></button>`).join('')}</div>
      <p class="sm muted center">Tapping saves. Your readiness score is worked out from everything above.</p>
      <details class="ci-more" ${this._ciOpen ? 'open' : ''}><summary data-a="ciMore">Adjust the details</summary>
        ${filled.includes('sleep') ? '' : seg('sleep', 'Sleep last night', [[4, '≤4 h'], [5, '5 h'], [6, '6 h'], [7, '7 h'], [8, '8 h'], [9, '9+ h']])}
        ${seg('quality', 'Sleep quality' + (filled.includes('quality') ? ' (from your sleep stages)' : ''), [[1, 'Bad'], [2, 'Poor'], [3, 'OK'], [4, 'Good'], [5, 'Great']])}
        ${seg('soreness', 'Muscle soreness (estimated)', [[1, 'None'], [2, 'Mild'], [3, 'Sore'], [4, 'Very'], [5, 'Painful']])}
        ${seg('stress', 'Stress', [[1, 'Calm'], [2, 'Low'], [3, 'Some'], [4, 'High'], [5, 'Very']])}
        ${filled.includes('sleep') ? `<div class="sm muted">Sleep: ${c.sleep} h from your sleep app.</div>` : ''}
      </details>
`;
  },

  openWelcome() {
    this.openSheet('welcome', 'Welcome', () => `<div class="celebrate">${icon('barbell')}<h2>Welcome to Gym App</h2><div class="muted sm">Every feature free. No account. No ads.</div></div>
      <div class="card list">
        <div class="li static col"><b>${icon('sparkles')} A coach that adapts</b><span class="sm muted">It suggests when to add reps, sets or weight, and when to back off.</span></div>
        <div class="li static col"><b>${icon('lock')} Private by design</b><span class="sm muted">Your workouts stay on this phone. Nothing is uploaded.</span></div>
        <div class="li static col"><b>${icon('cloud')} Optional encrypted sync</b><span class="sm muted">Turn it on in You, Backup and sync to back up and use several phones. Only you can read the data.</span></div>
        <div class="li static col"><b>${icon('file-import')} Bring your history</b><span class="sm muted">Import from Hevy, Strong, FitNotes, Strava or Garmin in You, Backup and sync.</span></div>
      </div>
      ${DISCLAIMER_HTML}
      <button class="btn primary wide" data-a="onboardDone">I understand, let's train</button>`);
  },

  openDevices() {
    this.openSheet('devices', 'Health Connect', () => {
      const h = Store.data.health, s = Store.data.settings;
      const native = !!Cap();
      return `${native ? '' : '<div class="card warn-card sm">Device connections work in the Android app. This browser preview can only show the screens.</div>'}
      <div class="section-head"><h3>${icon('device-watch')} Smartwatches</h3><span class="sm muted">via Health Connect</span></div>
      <div class="card">
        ${HC.on ? `<div class="li static"><span>Status</span><span class="sm acc">${icon('check')} Linked</span></div>
          ${h ? `<div class="li static"><span>Last read</span><span class="sm muted">${fmtTime(h.at)}${h.steps ? ' · ' + fmtNum(h.steps) + ' steps' : ''}${h.sleepH ? ' · ' + h.sleepH + ' h sleep' : ''}${h.rhr ? ' · RHR ' + h.rhr.latest : ''}</span></div>` : ''}
          ${h && h.sleep ? `<div class="li static"><span>Last night</span><span class="sm muted">${h.sleepH} h from ${esc(h.sleep.source)}${h.sleepQ ? ' · quality ' + h.sleepQ + '/5' : ''}</span></div>` : ''}
          <label class="field">Sleep source<select data-setting="sleepSource"><option value="auto">Automatic (prefers Sleep as Android)</option>${(s.sleepSources || []).map(x => `<option value="${esc(x.id)}" ${s.sleepSource === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
          <div class="grid2" style="margin-top:8px"><button class="btn sm" data-a="hcPull">${icon('refresh')} Read now</button><button class="btn sm" data-a="hcSettings">${icon('settings')} Permissions</button></div>
          <button class="btn sm ghost wide" data-a="hcDisconnect">Unlink</button>`
        : `<p class="sm">Link Health Connect to use your watch's data. Sleep, resting heart rate and HRV feed the readiness score. Weight and body fat appear in measurements. Runs, rides and swims recorded on the watch show up in your history, and heart rate is added to your workouts.</p>
          <button class="btn primary wide" data-a="hcConnect">${icon('link')} Link Health Connect</button>`}
        <details class="sm muted"><summary>Samsung Health and Sleep as Android setup</summary>
          <p><b>Samsung Health:</b> open Samsung Health, tap the menu, Settings, Health Connect, and allow it to write Sleep, Heart rate, Steps, Weight and Exercise. Samsung writes sleep stages, so quality is estimated for you. If it doesn't write resting heart rate, Gym App uses your lowest heart rate during sleep instead.</p>
          <p><b>Sleep as Android:</b> open Settings, Services, Health Connect, and turn it on (allow Sleep and Heart rate). Each tracked night is written when you stop tracking, so your morning check-in is filled in when you open Gym App.</p>
          <p>If both apps track the same night, Gym App uses one of them (Sleep as Android first) so hours aren't counted twice. Change it with Sleep source above.</p>
          <button class="btn sm" data-a="hcSettings">${icon('settings')} Open Health Connect</button></details>
        <details class="sm muted"><summary>Which watches work?</summary>
          <p><b>Samsung Galaxy Watch:</b> Samsung Health, Settings, Health Connect, then allow sharing.<br><b>Pixel Watch and Fitbit:</b> the Fitbit app syncs to Health Connect.<br><b>Xiaomi and Redmi:</b> Mi Fitness, Profile, Health Connect.<br><b>Amazfit:</b> Zepp app, Profile, Add accounts, Health Connect.<br><b>Garmin:</b> Garmin Connect, Settings, Health Connect.<br><b>Honor and Huawei:</b> depends on model and region.<br><b>Apple Watch:</b> not possible. It only pairs with iPhone.</p></details>
      </div>
      <div class="section-head"><h3>${icon('layout-dashboard')} Home-screen widget</h3></div>
      <div class="card sm">Long-press your home screen, tap Widgets, and add <b>Gym App</b>. It shows your next workout, this week's progress, your streak and readiness.</div>
      <p class="sm muted">Smart scales (Xiaomi, Withings, Renpho, Eufy and others) sync weight into Health Connect through their own app, and it shows up in your measurements.</p>`;
    });
  },

  openAccount() { this.openData(); },
  // Encrypted sync: the top section of Backup and sync
  accountBody() {
    {
      const a = Sync.acct;
      if (!a || !a.token) {
        const mode = this.authMode || 'new';
        if (mode === 'login' || mode === 'recover') {
          const rec = mode === 'recover';
          return `<p class="sm muted">For accounts made with an email before version 2.0. New accounts use an account key instead.</p>
          <label class="field">Email<input id="authEmail" type="email" autocomplete="email" value="${esc(a && !a.keyAccount ? a.email : '')}"></label>
          ${rec ? '<label class="field">Recovery key<input id="authCode" autocapitalize="characters" autocomplete="off" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"></label>' : ''}
          <label class="field">${rec ? 'New password' : 'Password'}<input id="authPw" type="password" autocomplete="${rec ? 'new-password' : 'current-password'}"></label>
          ${rec ? '<label class="field">Confirm new password<input id="authPw2" type="password" autocomplete="new-password"></label>' : ''}
          ${this.authErr ? `<div class="sm err-text">${esc(this.authErr)}</div>` : ''}
          <button class="btn primary wide" data-a="authSubmit">${this.authBusy ? 'Working…' : rec ? 'Reset password and sync' : 'Log in and sync'}</button>
          <button class="btn wide ghost" data-a="authMode" data-id="${rec ? 'login' : 'recover'}">${rec ? 'Back to email log in' : 'Forgot password'}</button>
          <button class="btn wide ghost" data-a="authMode" data-id="new">${icon('arrow-left')} Use an account key</button>`;
        }
        return `<div class="card tip-card sm"><b>${icon('shield-lock')} No email, no password</b><p>Your account is a random key made on this phone. Nothing personal is stored on the server, and your data is encrypted before it leaves the phone, so nobody else can read it, even if the server were hacked.</p></div>
        ${a && !a.token ? `<div class="card warn-card sm">You were signed out on this device. Enter your account key again.</div>` : ''}
        <button class="btn primary wide big-btn" data-a="keyCreate">${this.authBusy === 'new' ? 'Creating…' : `${icon('key')} Create my account key`}</button>
        <div class="section-head"><h3>Already have a key?</h3></div>
        <label class="field">Account key<input id="authKey" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"></label>
        ${this.authErr ? `<div class="sm err-text">${esc(this.authErr)}</div>` : ''}
        <button class="btn wide" data-a="keyLogin">${this.authBusy === 'key' ? 'Checking…' : `${icon('login')} Log in with key`}</button>
        <p class="sm muted">Sync is optional. Without an account everything still works offline on this phone.</p>
        <button class="btn wide ghost" data-a="authMode" data-id="login">I made an account with an email before</button>`;
      }
      const snaps = this.snaps;
      return `<div class="card"><div class="li static"><span>${icon(a.keyAccount ? 'key' : 'user')} ${a.keyAccount ? 'Account key …' + esc((a.key || '').slice(-5)) : esc(a.email)}</span>${a.keyAccount && a.key ? '<button class="btn sm" data-a="showKey">Show key</button>' : ''}</div>
        <div class="li static"><span>Status</span><span class="sm ${Sync.state === 'error' ? 'warn' : 'muted'}">${esc(Sync.label())}</span></div>
        ${Sync.err ? `<div class="sm warn" style="padding:0 14px 10px">${esc(Sync.err)}</div>` : ''}</div>
      <button class="btn primary wide" data-a="syncNow">${icon('refresh')} Sync now</button>
      <label class="field row"><input type="checkbox" data-setting="autoSync" ${Store.data.settings.autoSync !== false ? 'checked' : ''}> Sync automatically (app start, after workouts, after changes)</label>
      <p class="sm muted">Log in with the same account on another phone and your training merges across both. Everything is encrypted on the phone before upload.</p>
      <div class="section-head"><h3>Cloud backups</h3><button class="link" data-a="loadSnapshots">${snaps ? 'Refresh' : 'Show'}</button></div>
      <p class="sm muted">The server keeps a daily snapshot for the last 14 days.</p>
      ${snaps ? (snaps.length ? `<div class="card list">${snaps.map(s => `<div class="li static"><span>${fmtDate(s.created, { weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(s.created)}<span class="sm muted"> · ${Math.max(1, Math.round(s.size / 1024))} KB</span></span><button class="btn sm" data-a="restoreSnap" data-id="${s.id}">Restore</button></div>`).join('')}</div>` : '<div class="empty">The first backup appears a day after you start syncing.</div>') : ''}
      <div class="section-head"><h3>Account</h3></div>
      ${a.keyAccount ? '' : a.hasRecovery ? `<div class="card sm">${icon('key')} Recovery key is set. <button class="link sm" data-a="makeRecovery">Make a new one</button></div>` : `<div class="card warn-card sm"><b>No recovery key yet.</b> Without one, a forgotten password means your cloud copy is lost.<button class="btn sm primary wide" style="margin-top:8px" data-a="makeRecovery">${icon('key')} Create recovery key</button></div>`}
      ${a.keyAccount ? '' : `<button class="btn wide" data-a="changePwSheet">${icon('lock')} Change password</button>`}
      <button class="btn wide" data-a="signOut">${icon('logout')} Sign out</button>
      <button class="btn wide danger-ghost" data-a="deleteAccount">${icon('trash')} Delete account and cloud data</button>`;
    }
  },

  // The account key is the only way into the account, so make saving it easy
  showAccountKey(key, isNew) {
    this.recCode = key;
    this.openSheet('acctkey', 'Your account key', () => `<div class="celebrate">${icon('key')}<h2>${isNew ? 'Save your account key' : 'Your account key'}</h2></div>
      <div class="card center"><div class="reccode">${esc(this.recCode)}</div></div>
      <div class="card warn-card sm">This key is your whole account. Use it to log in on another phone. If you lose the key and this phone, the cloud copy can't be recovered, because there's no email to reset it. Keep it in a password manager or a private note. Anyone with the key can see your training data.</div>
      <div class="grid2"><button class="btn" data-a="copyRecovery">${icon('copy')} Copy</button><button class="btn" data-a="shareKey">${icon('share')} Save or share</button></div>
      ${isNew ? `<button class="btn primary wide" data-a="savedKey">I've saved it</button>` : `<button class="btn primary wide" data-a="closeSheet">Done</button>`}`);
  },

  showRecoveryCode(code) {
    this.recCode = code;
    this.openSheet('reccode', 'Your recovery key', () => `<div class="celebrate">${icon('key')}<h2>Save this recovery key</h2></div>
      <div class="card center"><div class="reccode">${esc(this.recCode)}</div></div>
      <div class="card warn-card sm">This is the only way to get back into your account if you forget your password. It's shown once. Store it in a password manager, or write it down and keep it somewhere safe. Anyone with it and your email can reset your password.</div>
      <button class="btn wide" data-a="copyRecovery">${icon('copy')} Copy</button>
      <button class="btn primary wide" data-a="savedRecovery">I've saved it</button>`);
  },

  openPrograms() {
    this.progGoal = this.progGoal || 'all';
    this.openSheet('programs', 'Plans', () => {
      const added = new Set(Store.data.routines.map(r => r.program).filter(Boolean));
      const list = PROGRAMS.filter(p => this.progGoal === 'all' || p.goal === this.progGoal);
      const b = Plan.block();
      return `<button class="card accent-card" data-a="builder">${icon('wand')}<div><b>Build my own program</b><div class="sm">Pick your goal, days and equipment. A plan is generated from the exercise library.</div></div></button>
      <div class="card"><b>${icon('calendar-stats')} Training blocks</b><p class="sm muted">5-week cycles: build intensity for 4 weeks, then a planned deload week. Works with any routine or program.</p>
        ${b && !b.done ? `<div class="sm">Current: ${esc(b.name)}, week ${b.week} of ${b.total}. <button class="link sm" data-a="endBlock">End block</button></div>` : `<div class="grid2"><button class="btn sm" data-a="startBlock" data-id="hypertrophy">Muscle block</button><button class="btn sm" data-a="startBlock" data-id="strength">Strength block</button></div>`}</div>
      ${(() => { const ph = Climb.phase(); return `<button class="card row-card" data-a="climbStats">${icon('hand-grab')}<div><b>Climbing plan</b><div class="sm muted">${ph ? `${esc(ph.name)} phase, week ${ph.week} of 4. Tap to change or end it.` : '16 weeks in four phases (base, strength, power, perform) with hangboard work, built from your days and experience.'}</div></div></button>`; })()}
      <div class="section-head"><h3>Ready-made programs</h3></div>
      <p class="sm muted">${PROGRAMS.length} ready-made plans, all free. Adding one creates its routines, and the coach handles progression.</p>
      <div class="chips">${[['all', 'All'], ...Object.entries(PROGRAM_GOALS)].map(([k, v]) => `<button class="chip ${this.progGoal === k ? 'on' : ''}" data-a="progGoal" data-id="${k}">${v}</button>`).join('')}</div>
      ${list.map(p => `<div class="card prog-card" data-a="programDetail" data-id="${p.id}" role="button" tabindex="0"><div class="row-between"><div><b>${esc(p.name)}</b>
        <div class="chips" style="margin:6px 0 4px"><span class="chip ghost">${p.days} day${p.days > 1 ? 's' : ''}/week</span><span class="chip ghost">${esc(p.level)}</span><span class="chip ghost">${esc(p.equip)}</span></div>
        <div class="sm muted">${esc(p.desc)}</div></div>
        ${added.has(p.name) ? `<span class="sm acc nowrap">${icon('check')} Added</span>` : icon('chevron-right', 'muted big-chev')}</div>
        <div class="sm acc" style="margin-top:8px">${icon('list-details')} Tap to see the plan and how it works</div></div>`).join('')}`;
    });
  },

  // A program explained: who it's for, the weekly schedule, each workout with clear targets
  openProgramDetail(id) {
    const p = PROGRAMS.find(x => x.id === id); if (!p) return;
    const added = Store.data.routines.some(r => r.program === p.name);
    const days = { 1: ['Any day'], 2: ['Mon', 'Thu'], 3: ['Mon', 'Wed', 'Fri'], 4: ['Mon', 'Tue', 'Thu', 'Fri'], 5: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'], 6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 7: ['Every day'] }[p.days] || [];
    const goalTip = { strength: 'Rest 2–3 minutes between heavy sets. Stop each set with 1–2 good reps left.', muscle: 'Rest 1–2 minutes. Take most sets close to failure (1–3 reps left).',
      sport: 'Do these alongside your sport, not right before it. Skip the session if your fingers or joints hurt.', mobility: 'Breathe slowly and ease into each hold. Never force a stretch into pain.',
      fat_loss: 'Keep rests short and the pace up. Pair it with walking and a small calorie deficit.', general: 'Start lighter than you think. Consistency beats intensity.',
      home: 'Clear some floor space. Use a backpack with books if you need more load.', endurance: 'Most of the work should feel easy. Only the hard sessions should be hard.' }[p.goal] || 'Warm up for 5–10 minutes first.';
    this.openSheet('progdetail', esc(p.name), () => `
      <div class="chips"><span class="chip">${p.days} day${p.days > 1 ? 's' : ''} a week</span><span class="chip ghost">${esc(p.level)}</span><span class="chip ghost">${esc(p.equip)}</span><span class="chip ghost">${esc(PROGRAM_GOALS[p.goal] || p.goal)}</span></div>
      <p>${esc(p.desc)}</p>
      <div class="card tip-card sm"><b>${icon('info-circle')} How it works</b><ol>
        <li>Tap <b>Add program</b>. It creates ${p.routines.length} routine${p.routines.length > 1 ? 's' : ''} on your Home tab, in a folder called "${esc(p.name)}".</li>
        <li>Train ${p.days} day${p.days > 1 ? 's' : ''} a week${days.length > 1 ? `, for example ${days.join(', ')}` : ''}. Home always shows which workout is next. Do them in order and repeat.</li>
        <li>"3 sets × 8–12 reps" means: pick a weight you can lift at least 8 times, do 3 sets, and rest in between. When you hit 12 reps on every set, the coach raises the weight.</li>
        <li>Times like "3 × 30–60 s" are holds or rounds in seconds. Climbing sessions are logged as time.</li>
        <li>${esc(goalTip)}</li></ol></div>
      ${p.routines.map(([name, list], k) => `<div class="section-head"><h3>Workout ${k + 1}: ${esc(name)}</h3><span class="muted sm">${days[k % Math.max(1, days.length)] || ''}</span></div>
        <div class="card list">${list.map(([exId, sets, a, b]) => { const ex = Store.ex(exId); return `<button class="li" data-a="exDetail" data-id="${exId}"><span class="grow left"><b>${esc(ex.name)}</b><span class="sm muted">${esc(howTo(ex).steps.split('. ')[0])}.</span></span><span class="tag-next nowrap">${esc(targetText(ex, { sets, repMin: a, repMax: b }))}</span></button>`; }).join('')}</div>`).join('')}
      <div style="height:70px"></div>`,
      { footer: () => `<div class="sheet-foot">${added ? `<div class="center sm acc">${icon('check')} Added. Find it on Home.</div>` : `<button class="btn primary wide" data-a="addProgram" data-id="${p.id}">${icon('plus')} Add program</button>`}</div>` });
  },

  // Library list for one discipline: search, category chips, grouped cards with what each one is
  discList(key) {
    const st = this.disc || { q: '', grp: 'all' };
    const q = st.q.toLowerCase().trim();
    const all = Store.allExercises().filter(e => e.discipline === key);
    let list = all.filter(e => (st.grp === 'all' || exGroup(e) === st.grp) && (!q || e.name.toLowerCase().includes(q) || exGroup(e).toLowerCase().includes(q) || (MUSCLES[e.muscle] || '').toLowerCase().includes(q)));
    const groups = {};
    list.forEach(e => (groups[exGroup(e)] = groups[exGroup(e)] || []).push(e));
    const kind = { wr: 'Weight × reps', wbw: 'Added weight × reps', bw: 'Reps', dur: 'Timed', hang: 'Edge, grip, load, time', wdur: 'Weight × time', dist: 'Distance', climb: 'Session time' };
    if (!list.length) return '<div class="empty">No matches. Try another word or category.</div>';
    if (!q && st.grp === 'all' && Object.keys(groups).length > 1 && list.length > 10)
      return `<div class="tile-grid">${Object.entries(groups).map(([g, items]) => `<button class="card tile-btn" data-a="discGroup" data-id="${esc(g)}"><b>${esc(g)}</b><span class="sm muted">${items.length} · ${esc(items.slice(0, 3).map(e => e.name).join(', '))}</span></button>`).join('')}</div>`;
    return Object.entries(groups).map(([g, items]) => `<div class="section-head"><h3>${esc(g)}</h3><span class="muted sm">${items.length}</span></div>
      <div class="ex-cards">${items.map(e => `<div class="card ex-card">
        <button class="ex-card-main" data-a="exDetail" data-id="${e.id}"><b>${esc(e.name)}</b><span class="sm muted clamp">${esc(howTo(e).steps)}</span>
          <span class="sm acc">${esc(kind[e.type] || '')}${e.muscle !== 'mobility' && e.muscle !== 'cardio' ? ' · ' + esc(MUSCLES[e.muscle] || e.muscle) : ''}${e.equipment !== 'none' ? ' · ' + esc(e.equipment) : ''}</span></button>
        <button class="btn sm primary ex-start" data-a="quickStart" data-id="${e.id}" aria-label="Start ${esc(e.name)}">${icon('player-play')}</button></div>`).join('')}</div>`).join('');
  },

  openCustomEx() {
    this.cx = { name: '', muscle: 'chest', equipment: 'barbell', type: 'wr', discipline: 'strength', compound: false };
    const sel = (k, opts) => `<select data-cx="${k}">${opts.map(([v, l]) => `<option value="${v}" ${this.cx[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    this.openSheet('customex', 'Custom exercise', () => `
      <label class="field">Name<input data-cx="name" placeholder="Landmine press"></label>
      <label class="field">Tracking ${sel('type', [['wr', 'Weight and reps'], ['bw', 'Bodyweight reps'], ['wbw', 'Weighted bodyweight'], ['dur', 'Time (holds, rounds)'], ['wdur', 'Weight and hold time'], ['dist', 'Distance and time'], ['climb', 'Climbing session (time)']])}</label>
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

  // Climbing strength: finger strength as % of body weight, hangboard trend, plan
  openClimbing() {
    this.openSheet('climbing', 'Climbing strength', () => {
      const f = Climb.fingers(), streak = Climb.fingerDays(), ph = Climb.phase(), pp = Climb.pullPct(), trend = Climb.hangTrend(), bw = +Store.data.settings.bodyweight || 0;
      return `<div class="card ${ph ? 'accent-card col' : ''}">${ph ? `<b>${icon('calendar-stats')} ${esc(ph.name)} phase · week ${ph.week} of 4</b><div class="sm">${esc(ph.desc)}</div>
          <div class="phase-bar">${(Climb.PHASES[Climb.plan().focus] || Climb.PHASES.boulder).map((p, k) => `<span class="${k === ph.idx ? 'on' : k < ph.idx ? 'done' : ''}">${esc(p[0])}</span>`).join('')}</div>
          <div class="grid2"><button class="btn sm" data-a="climbPlan">${icon('adjustments')} Change plan</button><button class="btn sm ghost" data-a="climbPlanEnd">End plan</button></div>`
          : `<b>${icon('route')} Get a climbing plan</b><div class="sm muted">A 16-week plan in four phases (base, strength, power, perform), built from your focus, days, experience and equipment. The coach then adjusts every session to the phase you're in.</div><button class="btn primary wide" data-a="climbPlan">${icon('wand')} Build my climbing plan</button>`}</div>
        <div class="section-head"><h3>Finger strength</h3><span class="muted sm">% of body weight</span></div>
        <div class="stats3"><div class="stat"><div class="muted sm">Strongest hang</div><b>${f && f.hang ? f.hang.pct + '%' : '–'}</b></div><div class="stat"><div class="muted sm">Block lift</div><b>${f && f.lift ? f.lift.pct + '%' : '–'}</b></div><div class="stat"><div class="muted sm">Pull-up 1RM</div><b>${pp ? pp + '%' : '–'}</b></div></div>
        ${trend.length > 1 ? `<div class="card"><b>Strongest hang per session</b><div class="sm muted">Body weight plus added weight, adjusted to a 20 mm edge</div>${lineChart(trend, { label: 'strongest hang', fmt: v => Math.round(v) + '%' })}</div>` : ''}
        <div class="card">${f && f.hang ? `<div class="li static col"><b>Best hang</b><span class="sm muted">${esc(f.hang.name)}: ${f.hang.w ? (f.hang.w > 0 ? '+' : '') + fmtW(f.hang.w) + ' ' + U() : 'body weight'} for ${f.hang.t}s${f.hang.edge ? ' on ' + f.hang.edge + ' mm' : ''}</span></div>`
          : `<div class="sm">${bw ? 'Log a Max Hang (Added Weight) to see your finger strength.' : 'Log your body weight (You, Body weight), then do a max hang to see your finger strength.'}</div>`}
          <button class="btn sm wide" data-a="quickStart" data-id="max_hang_added_weight">${icon('hand-grab')} Do the finger test</button></div>
        <div class="card sm">${icon(streak >= 3 ? 'alert-triangle' : 'circle-check')} ${streak ? `${streak} day(s) in a row on your fingers.${streak >= 3 ? ' Take a rest day soon: pulleys recover slower than muscles.' : ''}` : 'Fingers rested.'}</div>
        <div class="section-head"><h3>Hangboard timers</h3></div>
        <div class="timer-tiles">${TIMER_GROUPS.hang.list.map(t => `<button class="card timer-tile" data-a="timerSetup" data-id="${t}">${icon(TIMER_PRESETS[t].icon)}<span><b>${TIMER_PRESETS[t].name}</b><span class="sm muted">${esc(TIMER_PRESETS[t].about)}</span></span></button>`).join('')}</div>`;
    });
  },

  // Climbing plan builder: big tap targets, one question per row
  openClimbPlan() {
    const pl = Climb.plan();
    const sessions = Climb.climbSessions();
    this.cplan = this.cplan || { focus: pl ? pl.focus : 'boulder', days: pl ? pl.days : 3, level: pl ? pl.level : (sessions < 25 ? 'new' : 'mid'), hangboard: pl ? pl.hangboard : true };
    const seg = (k, label, opts) => `<div class="ci"><div class="ci-label">${label}</div><div class="seg">${opts.map(([v, l]) => `<button class="seg-btn ${this.cplan[k] === v ? 'on' : ''}" data-a="cplanSet" data-id="${k}:${v}">${l}</button>`).join('')}</div></div>`;
    this.openSheet('climbplan', 'Climbing plan', () => {
      const p = Climb.buildPlan(this.cplan), phases = Climb.PHASES[this.cplan.focus];
      return `${seg('focus', 'What do you want to get better at?', [['boulder', 'Bouldering'], ['route', 'Routes']])}
        ${seg('days', 'Climbing or training days per week', [[2, '2'], [3, '3'], [4, '4'], [5, '5']])}
        ${seg('level', 'Experience', [['new', 'Under 1 year'], ['mid', '1–3 years'], ['adv', '3+ years']])}
        ${seg('hangboard', 'Do you have a hangboard?', [[true, 'Yes'], [false, 'No']])}
        ${this.cplan.level === 'new' ? '<div class="card tip-card sm">In your first year, climbing itself is the best training. The plan uses lots of climbing and safe strength work, with no hangboard or campus board.</div>' : ''}
        <div class="section-head"><h3>16 weeks, 4 phases</h3></div>
        <div class="card list">${phases.map(([n, d], k) => `<div class="li static col"><b>Weeks ${k * 4 + 1}–${k * 4 + 4}: ${esc(n)}</b><span class="sm muted">${esc(d)}</span></div>`).join('')}</div>
        <div class="section-head"><h3>Your week</h3></div>
        ${p.routines.map(([n, list]) => `<div class="card"><b>${esc(n)}</b>${list.map(([id, sets, a, b]) => { const ex = Store.ex(id); return `<div class="li static"><span class="sm">${esc(ex.name)}</span><span class="tag-next nowrap">${esc(targetText(ex, { sets, repMin: a, repMax: b }))}</span></div>`; }).join('')}</div>`).join('')}
        <div style="height:70px"></div>`;
    }, { footer: () => `<div class="sheet-foot"><button class="btn primary wide" data-a="cplanSave">${icon('check')} ${pl ? 'Replace my plan' : 'Start this plan'}</button></div>` });
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
    else if (ex.type === 'wdur') charts = `<div class="card"><b>Heaviest hold (${U()})</b>${lineChart(hist.map(h => ({ x: h.date, y: Math.max(...h.sets.filter(s => (+s.t || 0) >= 5).map(s => +s.w || 0), 0) })), { label: 'heaviest hold' })}</div>${(() => { const f = Climb.fingers(); return f && f.hang && !Climb.LIFT.includes(ex.id) ? `<div class="card sm">Strongest hang: <b>${f.hang.pct}% of body weight</b> (${f.hang.w ? '+' + fmtW(f.hang.w) + ' ' + U() : 'body weight'} for ${f.hang.t}s).</div>` : ''; })()}`;
    else if (ex.type === 'climb') charts = `<div class="card"><b>Session time (minutes)</b>${lineChart(hist.filter(h => h.sets.some(s => +s.t)).map(h => ({ x: h.date, y: Math.round(h.sets.reduce((a, s) => a + (+s.t || 0), 0) / 60) })), { label: 'session minutes' })}</div>`;
    else if (ex.type === 'hang') charts = `<div class="card"><b>Most added weight (${U()})</b>${lineChart(hist.map(h => ({ x: h.date, y: Math.max(...h.sets.filter(s => (+s.t || 0) >= 5).map(s => +s.w || 0), 0) })), { label: 'added weight' })}</div><button class="btn wide" data-a="climbStats">${icon('hand-grab')} Climbing strength</button>`;
    else if (ex.type === 'dur') charts = `<div class="card"><b>Longest hold or round (sec)</b>${lineChart(hist.map(h => ({ x: h.date, y: Math.max(...h.sets.map(s => +s.t || 0)) })), { label: 'longest' })}</div>`;
    else if (ex.type === 'dist') charts = `<div class="card"><b>Distance (km)</b>${lineChart(hist.map(h => ({ x: h.date, y: h.sets.reduce((a, s) => a + (+s.d || 0), 0) })), { label: 'distance' })}</div>
      <div class="card"><b>Pace (min/km)</b>${lineChart(hist.filter(h => h.sets[0].d).map(h => ({ x: h.date, y: h.sets[0].t / h.sets[0].d / 60 })), { label: 'pace', fmt: v => fmtDur(v * 60) })}</div>`;
    const b = bestOf(id);
    const best = Math.max(0, ...hist.flatMap(h => h.sets.map(s => Coach.e1rm(s.w, s.r))));
    const ladder = Coach.ladderFor(id);
    this.openSheet('exdetail', esc(ex.name), () => `
      <div class="chips"><span class="chip">${MUSCLES[ex.muscle] || ex.muscle}</span>${(ex.secondary || []).map(m => `<span class="chip ghost">${MUSCLES[m] || m}</span>`).join('')}<span class="chip ghost">${ex.equipment}</span>${ladder ? `<span class="chip ghost">${icon('stairs-up')} ${esc(ladder.name)}</span>` : ''}</div>
      ${(() => { const h = howTo(ex); return `<div class="card howto"><b>${icon('list-check')} How to do it</b><p class="sm">${esc(h.steps)}</p><p class="sm muted">${icon('bulb')} ${esc(h.tip)}</p><p class="sm muted">${icon('pencil')} ${esc(trackingText(ex))}</p></div>`; })()}
      <div class="coach ${sug.kind}"><div class="coach-head">${icon('sparkles')}<b>Coach: ${esc(sug.title)}</b></div><div class="sm">${esc(sug.text)}</div></div>
      <button class="btn primary wide" data-a="quickStart" data-id="${id}">${icon('player-play')} Start a workout with this</button>
      <div class="card center">${BodyMap.svg({}, 'sets', { primary: ex.muscle, secondary: ex.secondary })}${BodyMap.legend('exercise')}</div>
      <button class="btn wide" data-a="watchDemo" data-id="${id}">${icon('brand-youtube')} Watch how to do it</button>
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
      <div class="stats3"><div class="stat"><div class="muted sm">Duration</div><b>${Math.round(((w.end || w.start) - w.start) / 60000)} min</b></div>${workoutVolume(w) > 0 ? `<div class="stat"><div class="muted sm">Volume</div><b>${fmtNum(workoutVolume(w))}</b></div>` : `<div class="stat"><div class="muted sm">${workoutStat(w).icon === 'mountain' ? 'Climbs' : 'Result'}</div><b class="sm">${esc(workoutStat(w).text)}</b></div>`}<div class="stat"><div class="muted sm">Sets</div><b>${w.exercises.reduce((a, e) => a + e.sets.length, 0)}</b></div></div>
      ${w.hr ? `<div class="card sm">${icon('heart')} Heart rate: ${w.hr.avg} bpm average, ${w.hr.max} max</div>` : ''}
      ${w.notes ? `<div class="card sm">${esc(w.notes)}</div>` : ''}
      ${w.exercises.map(e => { const ex = Store.ex(e.exId); let n = 0; return `<div class="card"><button class="ex-title" data-a="exDetail" data-id="${e.exId}">${esc(ex.name)}</button>${e.notes ? `<div class="sm muted">${esc(e.notes)}</div>` : ''}
        ${e.sets.map(s => `<div class="sm set-line"><span class="set-type t-${s.type || 'N'} mini">${(s.type || 'N') === 'N' ? ++n : s.type}</span>${prevText(ex, s)}${s.rpe ? ' @ RPE ' + s.rpe : ''}</div>`).join('')}</div>`; }).join('')}
      <button class="btn wide" data-a="shareWorkout" data-id="${w.id}">${icon('share')} Share as image</button>
      <button class="btn primary wide" data-a="repeatWorkout" data-id="${w.id}">${icon('repeat')} Repeat this workout</button>
      <button class="btn wide" data-a="saveAsRoutine" data-id="${w.id}">${icon('device-floppy')} Save as routine</button>
      <button class="btn wide danger-ghost" data-a="deleteWorkout" data-id="${w.id}">${icon('trash')} Delete</button>`);
  },

  openDiscipline(key) {
    const d = DISCIPLINES[key], list = Store.allExercises().filter(e => e.discipline === key);
    const timers = { combat: ['boxing', 'bjj'], conditioning: ['hiit', 'tabata', 'emom', 'amrap'], climbing: ['maxhang', 'repeaters', 'abrahang'] }[key] || [];
    const extra = {
      cardio: 'Log distance and time. The coach applies the 10% rule for distance and nudges your pace. You can import GPX and TCX files from Strava, Garmin and other trackers.',
      combat: 'Use the round timers, then log rounds. The coach adds rounds over time.',
      mobility: 'Timed holds. The coach adds about 10% hold time each session.',
      climbing: 'Log climbing sessions as time. Hangboard exercises track edge depth, grip, added weight and seconds, so you can see finger strength as a % of body weight. The coach adds weight when every hang holds and tells you when your fingers need a rest day.',
      calisthenics: 'Follow the skill ladders. Once you hit a step\'s goal, the coach tells you to move up.',
      conditioning: 'Interval timers keep running with the screen off, using notifications.',
      strength: 'Double progression: add reps until you top the range, then add weight.'
    }[key];
    this.disc = { q: '', grp: 'all' };
    this.openSheet('disc', d.name, () => `<div class="card tip-card sm"><b>${icon(d.icon)} How ${esc(d.name.toLowerCase())} works here</b><p>${extra}</p><p class="muted">Tap any exercise to see how to do it. Tap Start to begin a workout with it.</p></div>
      ${key === 'climbing' ? `<button class="btn wide" data-a="climbStats">${icon('hand-grab')} Climbing strength: fingers, hangboard and plan</button>` : ''}
      ${key === 'calisthenics' ? `<div class="section-head"><h3>Skill ladders</h3></div>${LADDERS.map(l => { const p = Coach.ladderProgress(l); return `<button class="card ladder" data-a="ladder" data-id="${l.id}"><div class="row-between"><b>${l.name}</b><span class="sm muted">${p}/${l.steps.length}</span></div><div class="progress"><div style="width:${p / l.steps.length * 100}%"></div></div><div class="sm muted">${p >= l.steps.length ? 'Ladder complete' : 'Current step: ' + esc(Store.ex(l.steps[Math.min(p, l.steps.length - 1)].exId).name)}</div></button>`; }).join('')}` : ''}
      ${timers.length ? `<div class="section-head"><h3>Timers</h3></div><div class="timer-tiles">${timers.map(t => `<button class="card timer-tile" data-a="timerSetup" data-id="${t}">${icon(TIMER_PRESETS[t].icon)}<span><b>${TIMER_PRESETS[t].name}</b><span class="sm muted">${esc(TIMER_PRESETS[t].about)}</span></span></button>`).join('')}</div>` : ''}
      <div class="section-head"><h3>Exercises</h3></div>
      <input class="search" type="search" data-f="discq" placeholder="Search ${list.length} exercises" value="${esc(this.disc.q)}" aria-label="Search exercises">
      <div class="chips">${['all', ...new Set(list.map(exGroup))].map(g => `<button class="chip ${this.disc.grp === g ? 'on' : ''}" data-a="discGroup" data-id="${esc(g)}">${g === 'all' ? 'All' : esc(g)}</button>`).join('')}</div>
      <div id="discList">${this.discList(key)}</div>`);
    this.top().discKey = key;
  },

  openLadder(id) {
    const l = LADDERS.find(x => x.id === id);
    this.openSheet('ladder', esc(l.name), () => { const p = Coach.ladderProgress(l); return `<p class="sm muted">Reach each step's goal (sets × reps or seconds) to unlock the next one. Progress updates from your logged workouts.</p>
      ${l.steps.map((st, i) => { const ex = Store.ex(st.exId); const state = i < p ? 'done' : i === p ? 'current' : 'locked'; return `<div class="card step ${state}">
        <div class="row-between"><span>${icon(state === 'done' ? 'circle-check' : state === 'current' ? 'player-play' : 'lock')} <b>${esc(ex.name)}</b></span><span class="sm muted">${st.sets} × ${st.goal}${ex.type === 'dur' ? 's' : ''}</span></div>
        ${state === 'current' ? `<button class="btn sm primary" data-a="quickStart" data-id="${st.exId}">Train this step</button>` : ''}</div>`; }).join('')}`; });
  },

  openTimerGroup(key) {
    const g = TIMER_GROUPS[key];
    this.openSheet('tgroup', g.name + ' timers', () => `<p class="sm muted">Pick a timer. You can change the times before you start. Timers keep running with the screen off.</p>
      <div class="timer-tiles">${g.list.map(t => `<button class="card timer-tile" data-a="timerSetup" data-id="${t}">${icon(TIMER_PRESETS[t].icon)}<span><b>${TIMER_PRESETS[t].name}</b><span class="sm muted">${esc(TIMER_PRESETS[t].about)}</span></span></button>`).join('')}</div>`);
  },

  openCalculators() {
    const list = [['onerm', 'calculator', '1RM calculator', 'Your one-rep max from any set, and the weight for each %'], ['rpe', 'gauge', 'RPE chart', 'The weight for a rep count at a target effort'],
      ['standards', 'trophy', 'Strength level', 'Squat, bench, deadlift and press compared with others at your body weight'], ['cali', 'stretching', 'Calisthenics 1RM', 'Max added weight for pull-ups, dips and more'],
      ['convert', 'arrows-exchange', 'Bodyweight and barbell', 'What your pull-ups or dips mean on a barbell, and back']];
    this.openSheet('calc', 'Calculators', () => `<div class="card list">${list.map(([id, ic, n, d]) => `<button class="li" data-a="tool" data-id="${id}">${icon(ic)}<span class="grow left"><b>${n}</b><span class="sm muted">${d}</span></span>${icon('chevron-right', 'muted')}</button>`).join('')}</div>
      <p class="sm muted">Plate loading is on every barbell exercise in a workout (tap Plates). Warm-up sets are in the exercise menu.</p>`);
  },

  openTimerSetup(type) {
    const p = TIMER_PRESETS[type];
    this.tconf = { type, name: p.name, work: p.work, rest: p.rest, rounds: p.rounds, prep: 10, moves: (p.moves || []).slice(), reps: p.reps || 1, setRest: p.setRest || 0 };
    const f = (k, label, unit) => `<label class="field">${label}<div class="row"><input inputmode="numeric" data-tc="${k}" value="${this.tconf[k]}"><span class="muted sm">${unit}</span></div></label>`;
    this.openSheet('tsetup', p.name + ' timer', () => `
      <div class="card tip-card sm"><b>${icon(p.icon)} What is ${esc(p.name)}?</b><p>${esc(p.about)}</p><b>How to do it</b><ol>${p.how.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>
      ${type === 'bjj' ? '' : `<label class="field">${type === 'amrap' ? 'Circuit' : type === 'emom' ? 'Each minute' : 'Moves'} <span class="muted sm">(one per line${type === 'amrap' ? '' : ', rotates each round'})</span><textarea data-tc="moves" rows="${Math.max(3, this.tconf.moves.length)}">${esc(this.tconf.moves.join('\n'))}</textarea></label>`}
      ${type === 'amrap' ? f('work', 'Time cap', 'seconds') : f('work', type === 'emom' ? 'Interval' : 'Work', 'seconds')}
      ${type === 'amrap' || type === 'emom' ? '' : f('rest', p.reps ? 'Off between hangs' : 'Rest', 'seconds')}
      ${p.reps ? f('reps', 'Hangs per set', '') + f('setRest', 'Rest between sets', 'seconds') : ''}
      ${type === 'amrap' ? '' : f('rounds', type === 'emom' ? 'Minutes' : p.reps ? 'Sets' : 'Rounds', '')}
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
      if (T.finished && T.conf.type === 'hang') return `<div class="celebrate">${icon('trophy')}<h2>Hangs done</h2><div class="muted">${timerSummary(T.conf)}</div></div>
        <button class="btn primary wide" data-a="hangDone">${icon('check')} Mark the sets done</button><button class="btn wide" data-a="closeSheet">Back to the workout</button>`;
      if (T.finished) return `<div class="celebrate">${icon('trophy')}<h2>Done</h2><div class="muted">${timerSummary(T.conf)}</div></div>
        ${T.conf.type === 'amrap' ? `<div class="center big">${T.amrapRounds} rounds</div>` : ''}
        <button class="btn primary wide" data-a="timerSave">${icon('device-floppy')} Save to history</button><button class="btn wide" data-a="closeSheet">Close without saving</button>`;
      return `<div class="timer ${ph.kind}"><svg viewBox="0 0 200 200" class="ring"><circle cx="100" cy="100" r="90" class="ring-bg"/><circle id="tRing" cx="100" cy="100" r="90" class="ring-fg" style="stroke-dasharray:565;stroke-dashoffset:0"/></svg>
        <div class="timer-in"><div class="phase">${esc(ph.label)}</div><div class="tbig" id="tLeft">${fmtDur(ph.secs)}</div><div class="sm muted">${T.phases[T.i + 1] ? 'Next: ' + esc(T.phases[T.i + 1].move || T.phases[T.i + 1].label) : 'Final interval'}</div></div></div>
        ${(() => { const mv = T.conf.moves || []; if (!mv.length) return '';
          if (T.conf.type === 'amrap') return `<div class="card timer-move"><div class="muted sm">Circuit, in order</div>${mv.map(m => `<div class="big-move">${esc(m)}</div>`).join('')}</div>`;
          const cur = ph.kind === 'work' ? ph.move : (T.phases[T.i + 1] && T.phases[T.i + 1].move);
          return cur ? `<div class="card timer-move ${ph.kind}"><div class="muted sm">${ph.kind === 'work' ? 'Do now' : 'Get ready for'}</div><div class="big-move">${esc(cur)}</div></div>` : ''; })()}
        ${T.conf.type === 'amrap' ? `<button class="btn wide big-btn" data-a="timerRound">${icon('plus')} Round done (${T.amrapRounds})</button>` : ''}
        <div class="grid2"><button class="btn big-btn" data-a="timerPause">${icon(T.paused ? 'player-play' : 'player-pause')} ${T.paused ? 'Resume' : 'Pause'}</button><button class="btn big-btn danger-ghost" data-a="timerStop">${icon('player-stop')} Stop</button></div>`;
    }, { onClose: () => { if (!Timer.finished) Timer.stop(); } });
    Timer.tick();
  },

  openTool(id, preset) {
    const s = Store.data.settings;
    const best = id => { const b = bestOf(id); return b.e1 ? String(Math.round(b.e1)) : ''; };
    this.toolState = { target: '100', bar: String(s.bar), w: '100', r: '5', ex: 'pull_up', bw: String(s.bodyweight || 75), add: '0', reps: '8', sex: s.sex || 'm',
      squat: best('squat_barbell'), bench: best('bench_press_barbell'), deadlift: best('deadlift_barbell'), ohp: best('overhead_press_barbell'), lift: 'bench', one: best('bench_press_barbell') || '80', rpe: '8', ...(preset || {}) };
    const titles = { plates: 'Plate loading', onerm: '1RM calculator', cali: 'Calisthenics 1RM', convert: 'Bodyweight ↔ barbell', standards: 'Strength level', rpe: 'RPE chart' };
    const inp = (k, label, mode = 'decimal') => `<label class="field">${label}<input inputmode="${mode}" data-tool="${k}" value="${esc(this.toolState[k])}"></label>`;
    const sel = (k, label, opts) => `<label class="field">${label}<select data-tool="${k}">${opts.map(([v, l]) => `<option value="${v}" ${this.toolState[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const caliOpts = Object.entries(Strength.CALI).map(([k, v]) => [k, v[0]]);
    this.toolId = id;
    this.openSheet('tool', titles[id], () => `
      ${id === 'plates' ? `<label class="field">Target weight (${U()})<input inputmode="decimal" data-tool="target" value="${this.toolState.target}"></label><label class="field">Bar (${U()})<input inputmode="decimal" data-tool="bar" value="${this.toolState.bar}"></label>` : ''}
      ${id === 'onerm' ? `<div class="grid2"><label class="field">Weight<input inputmode="decimal" data-tool="w" value="${this.toolState.w}"></label><label class="field">Reps<input inputmode="numeric" data-tool="r" value="${this.toolState.r}"></label></div>` : ''}
      ${id === 'cali' ? `${sel('ex', 'Exercise', caliOpts)}<div class="grid3">${inp('bw', 'Body weight (' + U() + ')')}${inp('add', 'Added (' + U() + ')')}${inp('reps', 'Reps', 'numeric')}</div><p class="sm muted">Added weight: a belt or vest. Use a negative number for band or machine assistance.</p>` : ''}
      ${id === 'convert' ? `<div class="card tip-card sm">Rough estimates. Leverage, technique and training history change these a lot, so use them as a starting point, not a test result.</div>
        <div class="section-head"><h3>From bodyweight to barbell</h3></div>${sel('ex', 'Exercise', caliOpts)}<div class="grid3">${inp('bw', 'Body weight (' + U() + ')')}${inp('add', 'Added (' + U() + ')')}${inp('reps', 'Reps', 'numeric')}</div>` : ''}
      ${id === 'standards' ? `<div class="grid2">${sel('sex', 'Standards for', [['m', 'Men'], ['f', 'Women']])}${inp('bw', 'Body weight (' + U() + ')')}</div><div class="grid2">${inp('squat', 'Squat 1RM')}${inp('bench', 'Bench 1RM')}${inp('deadlift', 'Deadlift 1RM')}${inp('ohp', 'Overhead press 1RM')}</div><p class="sm muted">Filled in from your best estimated 1RMs. Change them to try other numbers.</p>` : ''}
      ${id === 'rpe' ? `<div class="grid2">${inp('one', '1RM (' + U() + ')')}${sel('rpe', 'Target RPE', [['10', '10 (max)'], ['9.5', '9.5'], ['9', '9 (1 left)'], ['8.5', '8.5'], ['8', '8 (2 left)'], ['7.5', '7.5'], ['7', '7 (3 left)'], ['6', '6 (4 left)']])}</div>` : ''}
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
    const kg = Store.data.settings.unit === 'lb' ? 0.45359237 : 1, W = v => `${fmtW(Coach.roundW(v))} ${U()}`;
    if (this.toolId === 'cali' || this.toolId === 'convert') {
      const bw = num(t.bw), reps = num(t.reps); if (!bw || !reps) return '<div class="sm muted">Enter body weight and reps.</div>';
      const c = Strength.cali(t.ex, bw, num(t.add), reps), name = Strength.CALI[t.ex][0];
      if (this.toolId === 'cali') return `<div class="card center"><div class="muted sm">Estimated 1-rep max for ${esc(name.toLowerCase())}</div>
          <div class="big">${c.maxAdded >= 0 ? '+' + W(c.maxAdded) : W(c.maxAdded)}</div><div class="sm muted">${c.maxAdded >= 0 ? 'added weight for a single rep' : 'assistance needed for a single rep'} · total load ${W(c.one)}</div></div>
        <div class="card list">${c.table.map(x => `<div class="li static"><span>${x.r} rep${x.r > 1 ? 's' : ''}</span><b>${x.added >= 0 ? '+' + W(x.added) : W(x.added) + ' (assisted)'}</b></div>`).join('')}</div>
        <p class="sm muted">Total load counts the share of your body weight the exercise moves (${Math.round(Strength.CALI[t.ex][1] * 100)}% for ${esc(name.toLowerCase())}).</p>`;
      const pl = Strength.predictLifts(t.ex, bw, num(t.add), reps);
      const back = [['bench', 'Bench press'], ['pulldown', 'Lat pulldown'], ['ohp', 'Overhead press']].map(([k, n]) => { const one = k === 'bench' ? num(t.bench) : k === 'ohp' ? num(t.ohp) : 0; return one ? Strength.repsFrom(k, one, bw).map(([x, r]) => `<div class="li static"><span>${n} ${W(one)} → ${x}</span><b>about ${r} reps</b></div>`).join('') : ''; }).join('');
      return `<div class="card list">${pl.map(([n, v]) => `<div class="li static"><span>${esc(n)}</span><b>~${W(v)}</b></div>`).join('') || '<div class="li static">No barbell match for this exercise.</div>'}</div>
        ${back ? `<div class="section-head"><h3>From your barbell lifts</h3></div><div class="card list">${back}</div>` : ''}`;
    }
    if (this.toolId === 'standards') {
      const bw = num(t.bw); if (!bw) return '';
      const rows = [['squat', 'Squat'], ['bench', 'Bench press'], ['deadlift', 'Deadlift'], ['ohp', 'Overhead press']].map(([k, n]) => { const v = num(t[k]); if (!v) return ''; const r = v / bw, L = Strength.level(t.sex, k, r);
        return `<div class="li static col"><div class="row-between" style="width:100%"><span><b>${n}</b> <span class="sm muted">${r.toFixed(2)}× body weight</span></span><span class="tag-next">${L.name}</span></div><div class="lvl-bar">${Strength.LEVELS.map((x, i) => `<span class="${i <= L.idx ? 'on' : ''}"></span>`).join('')}</div>${L.next ? `<span class="sm muted">Next level at ${W(L.next * bw)}</span>` : ''}</div>`; }).join('');
      const total = num(t.squat) + num(t.bench) + num(t.deadlift), dots = total && num(t.squat) && num(t.bench) && num(t.deadlift) ? Strength.dots(total * kg, bw * kg, t.sex) : 0;
      return `<div class="card list">${rows || '<div class="li static">Enter at least one lift.</div>'}</div>
        ${dots ? `<div class="card center"><div class="muted sm">DOTS score (squat + bench + deadlift)</div><div class="big">${Math.round(dots)}</div><div class="sm muted">Compares strength across body weights. Around 300 is a solid gym lifter, 400+ is competitive.</div></div>` : ''}
        <p class="sm muted">Levels are approximate, based on common strength-standard tables.</p>`;
    }
    if (this.toolId === 'rpe') {
      const one = num(t.one), rpe = num(t.rpe); if (!one) return '';
      return `<div class="card list">${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(r => { const p = Strength.rpePct(r, rpe); return `<div class="li static"><span>${r} rep${r > 1 ? 's' : ''} @ RPE ${rpe}</span><b>${W(one * p)} <span class="sm muted">${Math.round(p * 100)}%</span></b></div>`; }).join('')}</div>
        <p class="sm muted">RPE 8 means you could have done 2 more reps. Weights are rounded to what you can load.</p>`;
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
      <label class="field">Units<select data-setting="unit"><option value="kg" ${s.unit === 'kg' ? 'selected' : ''}>Kilograms (kg)</option><option value="lb" ${s.unit === 'lb' ? 'selected' : ''}>Pounds (lb)</option></select></label>
      <p class="sm muted">Changing units doesn't convert weights you've already logged.</p>
      <div class="grid2">
        <label class="field">Default rest (sec)<input inputmode="numeric" data-setting="rest" value="${s.rest}"></label>
        <label class="field">Weekly workout goal<input inputmode="numeric" data-setting="weekGoal" value="${s.weekGoal}"></label>
        <label class="field">Bar weight (${s.unit})<input inputmode="decimal" data-setting="bar" value="${s.bar}"></label>
        <label class="field">Body weight (${s.unit})<input inputmode="decimal" data-setting="bodyweight" value="${s.bodyweight}"></label>
      </div>
      <div class="field">Workout reminders
        <div class="chips" style="margin-top:6px">${[[2, 'Mon'], [3, 'Tue'], [4, 'Wed'], [5, 'Thu'], [6, 'Fri'], [7, 'Sat'], [1, 'Sun']].map(([n, l]) => `<button class="chip ${((s.reminders || {}).days || []).includes(n) ? 'on' : ''}" data-a="toggleReminder" data-id="${n}" aria-pressed="${((s.reminders || {}).days || []).includes(n)}">${l}</button>`).join('')}</div>
        <input type="time" data-a-change="reminderTime" value="${esc((s.reminders || {}).time || '18:00')}" style="margin-top:6px" aria-label="Reminder time"></div>
      <div class="grid2">
        <label class="field">Theme<select data-setting="theme"><option value="system" ${(s.theme || 'system') === 'system' ? 'selected' : ''}>Match phone</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option></select></label>
        <label class="field">Text size<select data-setting="textSize"><option value="1" ${(s.textSize || '1') == '1' ? 'selected' : ''}>Normal</option><option value="1.12" ${s.textSize == '1.12' ? 'selected' : ''}>Large</option><option value="1.25" ${s.textSize == '1.25' ? 'selected' : ''}>Extra large</option></select></label>
      </div>
      <div class="field">My gym has <span class="muted sm">(the coach and program builder only use this equipment)</span>
        <div class="chips" style="margin-top:6px">${Object.entries(EQUIPMENT).map(([k, v]) => `<button class="chip ${Plan.gym().includes(k) ? 'on' : ''}" data-a="toggleGym" data-id="${k}">${v}</button>`).join('')}</div></div>
      <label class="field row"><input type="checkbox" data-setting="keepAwake" ${s.keepAwake !== false ? 'checked' : ''}> Keep the screen on during workouts and timers</label>
      <label class="field">Available plates (${s.unit}, comma separated)<input data-setting="plates" value="${s.plates.join(', ')}"></label>
      <div class="section-head"><h3>App updates</h3></div>
      ${this.updatesBody()}`);
  },

  openUpdates() { this.openSettings(); },
  updatesBody() {
    const s = Store.data.settings;
    {
      const st = { idle: 'Not checked yet', checking: 'Checking…', current: 'You\'re up to date', downloading: 'Downloading update…', ready: `Update ${Updater.info && Updater.info.version} downloaded. It switches over when you next leave the app.`, apk: 'A new app version is available', web: 'A new version is available', error: 'Check failed: ' + (Updater.err || '') }[Updater.state];
      const apk = { downloading: 'Downloading the new app version in the background…', ready: Updater.apkStatus && Updater.apkStatus.silent ? 'New app version downloaded. It installs by itself when you leave the app (not during a workout).' : 'New app version downloaded. Tap Install.', permission: 'Needs a one-time permission to install its own updates.', installing: 'Installing…', tap: 'Tap Install to finish the update.', manual: 'This version can\'t install updates by itself. Install the new APK once and future updates are automatic.', error: 'App update failed: ' + (Updater.err || ''), done: 'Installed. Gym App restarts with the new version.' }[Updater.apkState];
      return `<div class="card"><div class="li static"><span>App content version</span><b>${esc(Updater.bundleVersion)}</b></div><div class="li static"><span>Android app version</span><b>${esc(Updater.nativeVersion || 'browser')}${Updater.nativeBuild ? ' (build ' + Updater.nativeBuild + ')' : ''}</b></div>
        <div class="li static"><span>Status</span><span class="sm">${esc(st)}</span></div>${apk ? `<div class="li static"><span>App update</span><span class="sm">${esc(apk)}</span></div>` : ''}</div>
      <label class="field row"><input type="checkbox" data-setting="autoUpdate" ${s.autoUpdate !== false ? 'checked' : ''}> Update automatically (downloads in the background and installs when you leave the app, never during a workout)</label>
      <button class="btn primary wide" data-a="checkUpdate">${icon('refresh')} Check now</button>
      ${Updater.state === 'ready' ? `<button class="btn wide" data-a="applyUpdate">${icon('player-play')} Restart and apply now</button>` : ''}
      ${Updater.apkState === 'permission' ? `<button class="btn primary wide" data-a="allowUpdates">${icon('shield-check')} Allow automatic updates</button>` : ''}
      ${['ready', 'tap'].includes(Updater.apkState) ? `<button class="btn wide" data-a="installUpdate">${icon('download')} Install app update now</button>` : ''}
      ${Updater.apkState === 'manual' ? `<button class="btn wide" data-a="openApk">${icon('download')} Download new APK</button>` : ''}
      <p class="sm muted">Updates are automatic. New features and fixes switch over quietly when you leave the app. New app versions download in the background and install themselves too: on Android 12 and newer this happens silently after you allow it once. Android always checks that an update is signed by the same developer key.</p>`;
    }
  },

  openData() {
    this.impUnit = this.impUnit || U();
    this.openSheet('data', 'Backup and sync', () => {
      const r = this.importResult;
      let res = '';
      if (r && r.error) res = `<div class="card warn-card"><b>Couldn't import ${esc(r.file)}</b><div class="sm">${esc(r.error)}</div><button class="btn sm" data-a="importCancel">OK</button></div>`;
      else if (r) {
        const sets = r.workouts.reduce((a, w) => a + w.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
        const range = r.workouts.length ? `${fmtDate(Math.min(...r.workouts.map(w => w.start)), { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDate(Math.max(...r.workouts.map(w => w.start)), { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
        res = `<div class="card accent-card col"><b>${esc(r.source)} file: ${esc(r.file)}</b><div class="sm">${r.workouts.length} workouts · ${sets} sets · ${range}</div>${r.exercisesCreated ? `<div class="sm">${r.exercisesCreated} exercises weren't in the library and were added as custom exercises.</div>` : ''}<div class="sm">Duplicates are skipped automatically.</div>
          <div class="grid2"><button class="btn primary" data-a="importCommit">Import</button><button class="btn" data-a="importCancel">Cancel</button></div></div>`;
      }
      return `<div class="section-head"><h3>${icon('cloud')} Encrypted sync</h3><span class="sm muted">optional</span></div>
      ${this.accountBody()}
      <div class="section-head"><h3>${icon('database-export')} Backup file</h3></div>
      <button class="btn wide primary" data-a="exportJSON">${icon('database-export')} Save a full backup (.json)</button>
      <button class="btn wide" data-a="exportStrong">${icon('table-export')} Spreadsheet (.csv, opens in Strong and Hevy)</button>
      <p class="sm muted">Android also backs up the app's data to your Google account if Backup is on in your phone's settings.</p>
      <div class="section-head"><h3>${icon('file-import')} Import from other apps</h3></div>
      <div class="card sm">
        <div class="fmt"><b>Hevy</b>: Settings, Export data, Export workouts (CSV)</div>
        <div class="fmt"><b>Strong</b>: Settings, Export data (CSV)</div>
        <div class="fmt"><b>FitNotes</b>: Settings, Spreadsheet export (CSV)</div>
        <div class="fmt"><b>Strava, Garmin, Nike Run, Coros, Polar</b>: GPX or TCX activity files</div>
        <div class="fmt"><b>Any spreadsheet</b>: CSV with Date, Exercise, Weight and Reps columns</div>
        <div class="fmt"><b>Gym App backup</b>: .json from this app</div>
      </div>
      <label class="field">Weight unit in the file (when the file doesn't say)<select data-imp="1"><option value="kg" ${this.impUnit === 'kg' ? 'selected' : ''}>kg</option><option value="lb" ${this.impUnit === 'lb' ? 'selected' : ''}>lb</option></select></label>
      <label class="btn primary wide">${icon('file-import')} Choose file<input type="file" accept=".csv,.json,.gpx,.tcx,text/csv,application/json,application/gpx+xml,application/xml,text/xml" data-a-change="importFile" hidden></label>
      ${res}
      <div class="section-head"><h3>Danger zone</h3></div>
      <button class="btn wide danger-ghost" data-a="wipeData">${icon('trash')} Delete all data</button>`;
    });
  }
});

document.addEventListener('DOMContentLoaded', () => UI.init());
