// Body map, share-as-image, reminders, achievements, PDF reports, rest-timer notification actions.
'use strict';

// ---------- Body map (front and back), colored by weekly sets or by recovery
const BodyMap = {
  // Artwork regions (react-native-body-highlighter) for each of our muscle groups
  MAP: { chest: ['chest'], abs: ['abs', 'obliques'], biceps: ['biceps'], triceps: ['triceps'], traps: ['trapezius'], shoulders: ['deltoids'], adductors: ['adductors'],
    quads: ['quadriceps'], calves: ['calves'], forearms: ['forearm'], lats: ['upper-back'], upper_back: ['upper-back'], lower_back: ['lower-back'], glutes: ['gluteal'], hamstrings: ['hamstring'] },
  NAMES: { chest: 'Chest', abs: 'Abs', obliques: 'Obliques', biceps: 'Biceps', triceps: 'Triceps', trapezius: 'Traps', deltoids: 'Shoulders', adductors: 'Adductors', quadriceps: 'Quads',
    calves: 'Calves', forearm: 'Forearms', 'upper-back': 'Lats and upper back', 'lower-back': 'Lower back', gluteal: 'Glutes', hamstring: 'Hamstrings' },
  // values: {muscle: number}; mode 'sets' (weekly sets) or 'recovery' (0..100, lower = more fatigued);
  // highlight: {primary, secondary} to show which muscles one exercise works
  svg(values, mode = 'sets', highlight) {
    const level = m => {
      if (highlight) return highlight.primary === m ? 3 : (highlight.secondary || []).includes(m) ? 1 : 0;
      const v = values[m];
      if (mode === 'recovery') return v == null || v >= 95 ? 0 : v >= 75 ? 1 : v >= 50 ? 2 : 3;
      return !v ? 0 : v < 6 ? 1 : v < 12 ? 2 : 3;
    };
    // Region level = strongest of the muscles drawn there
    const reg = {}, label = {};
    Object.entries(this.MAP).forEach(([m, slugs]) => slugs.forEach(sl => {
      const l = level(m); if (reg[sl] == null || l > reg[sl]) { reg[sl] = l; label[sl] = m; }
    }));
    const pre = mode === 'recovery' && !highlight ? 'rc' : 'bm';
    const tip = sl => { const m = label[sl]; if (!m) return ''; const v = values[m];
      return `<title>${this.NAMES[sl] || sl}${highlight ? '' : mode === 'recovery' ? `: ${v == null ? 100 : v}% recovered` : `: ${Math.round(v || 0)} sets this week`}</title>`; };
    const draw = side => BODY_ART[side].map(p => {
      const cls = ['head', 'hair'].includes(p.s) ? 'bm-head' : ['neck', 'knees', 'hands', 'feet', 'ankles', 'tibialis'].includes(p.s) ? 'bm-skin' : `${pre}-${reg[p.s] || 0}`;
      return `<g class="${cls}">${tip(p.s)}${p.d.map(d => `<path d="${d}"/>`).join('')}</g>`;
    }).join('');
    return `<svg viewBox="40 150 1368 1250" class="bodymap" role="img" aria-label="Body map, front and back">
      <path class="bm-outline" d="${BODY_ART.outline.front}"/><path class="bm-outline" d="${BODY_ART.outline.back}"/>${draw('front')}${draw('back')}
      <text x="362" y="1395" text-anchor="middle">Front</text><text x="1086" y="1395" text-anchor="middle">Back</text></svg>`;
  },
  legend(mode) {
    return mode === 'recovery' ? '<div class="bm-legend sm muted"><span class="rc-0">●</span> Recovered <span class="rc-1">●</span> Nearly <span class="rc-2">●</span> Recovering <span class="rc-3">●</span> Fatigued</div>'
      : mode === 'exercise' ? '<div class="bm-legend sm muted"><span class="bm-3">●</span> Main muscle <span class="bm-1">●</span> Also works</div>'
      : '<div class="bm-legend sm muted"><span class="bm-1">●</span> 1–5 sets <span class="bm-2">●</span> 6–11 <span class="bm-3">●</span> 12+ this week</div>';
  }
};

// ---------- Share a workout as an image
const ShareImage = {
  async render(w) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const g = c.getContext('2d'), acc = '#3d8bfd';
    g.fillStyle = '#0f1115'; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = acc; g.fillRect(0, 0, 1080, 14);
    const font = (s, wgt = 600) => g.font = `${wgt} ${s}px system-ui, -apple-system, Roboto, sans-serif`;
    g.fillStyle = '#8b93a1'; font(34, 500); g.fillText(fmtDate(w.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 72, 110);
    g.fillStyle = '#eef0f3'; font(76, 800); g.fillText(w.name.slice(0, 22), 72, 200);
    const mins = Math.round(((w.end || w.start) - w.start) / 60000), sets = w.exercises.reduce((a, e) => a + e.sets.length, 0);
    const stats = [['Duration', mins + ' min'], workoutVolume(w) > 0 ? ['Volume', fmtNum(workoutVolume(w)) + ' ' + U()] : ['Result', workoutStat(w).text], ['Sets', String(sets)]];
    if (w.prs) stats.push(['Records', String(w.prs)]);
    stats.forEach(([k, v], i) => { const x = 72 + i * 250; g.fillStyle = '#181b21'; g.fillRect(x, 250, 230, 150); g.fillStyle = '#8b93a1'; font(30, 500); g.fillText(k, x + 24, 300); g.fillStyle = '#eef0f3'; font(48, 800); g.fillText(v, x + 24, 370); });
    let y = 480;
    for (const e of w.exercises.slice(0, 7)) {
      const ex = Store.ex(e.exId), best = e.sets.filter(s => s.type !== 'W').sort((a, b) => Coach.e1rm(b.w, b.r) - Coach.e1rm(a.w, a.r) || (+b.r || 0) - (+a.r || 0) || (+b.t || 0) - (+a.t || 0))[0];
      g.fillStyle = '#eef0f3'; font(40, 700); g.fillText(ex.name.slice(0, 30), 72, y);
      g.fillStyle = '#8b93a1'; font(32, 500); g.fillText(`${e.sets.length} sets${best ? ' · best ' + prevText(ex, best) : ''}`, 72, y + 46);
      y += 112;
    }
    if (w.exercises.length > 7) { g.fillStyle = '#8b93a1'; font(32, 500); g.fillText(`+ ${w.exercises.length - 7} more`, 72, y); }
    g.fillStyle = acc; font(36, 800); g.fillText('Gym App', 72, 1290);
    g.fillStyle = '#8b93a1'; font(28, 500); g.fillText('Free, private training log', 260, 1290);
    return c.toDataURL('image/png');
  },
  async share(w) {
    const url = await this.render(w), b64 = url.split(',')[1], name = `workout-${new Date(w.start).toISOString().slice(0, 10)}.png`;
    const fs = Plugin('Filesystem'), sh = Plugin('Share');
    if (fs && sh) { const r = await fs.writeFile({ path: name, data: b64, directory: 'CACHE' }); await sh.share({ title: w.name, url: r.uri, dialogTitle: 'Share workout' }); return; }
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
};

// ---------- Workout reminders (weekly, on chosen days)
const Reminders = {
  BASE: 300,
  async apply() {
    const r = Store.data.settings.reminders || { days: [], time: '18:00' };
    for (let d = 1; d <= 7; d++) await Notify.cancel(this.BASE + d);
    if (!r.days.length) return;
    if (!(await Notify.ensure())) { toast('Allow notifications to get reminders'); return; }
    const ln = Plugin('LocalNotifications'); if (!ln) return;
    const [hour, minute] = r.time.split(':').map(Number);
    const notes = r.days.map(day => ({ id: this.BASE + day, title: 'Time to train', body: this.message(), schedule: { on: { weekday: day, hour, minute }, allowWhileIdle: true } }));
    try { await ln.schedule({ notifications: notes }); } catch (e) { ErrorLog.add('reminders', e.message); }
  },
  message() {
    const next = Store.data.routines.length ? routineGroups(Store.data).map(g => g.routines.find(r => r.id === g.next)).filter(Boolean)[0] : null;
    return next ? `Up next: ${next.name}. Your coach has today's targets ready.` : 'Your coach has today\'s targets ready.';
  }
};

// ---------- Achievements
const Achievements = {
  LIST: [
    ['first', 'First workout', 'Log your first workout', s => s.workouts >= 1],
    ['w10', 'Getting going', '10 workouts', s => s.workouts >= 10],
    ['w50', 'Regular', '50 workouts', s => s.workouts >= 50],
    ['w100', 'Committed', '100 workouts', s => s.workouts >= 100],
    ['w250', 'Iron habit', '250 workouts', s => s.workouts >= 250],
    ['s4', 'Month strong', '4-week streak', s => s.streak >= 4],
    ['s12', 'Quarter strong', '12-week streak', s => s.streak >= 12],
    ['s52', 'Year of iron', '52-week streak', s => s.streak >= 52],
    ['v10', '10 tonnes', 'Lift 10,000 kg in total', s => s.volumeKg >= 10000],
    ['v100', '100 tonnes', 'Lift 100,000 kg in total', s => s.volumeKg >= 100000],
    ['v1000', '1,000 tonnes', 'Lift 1,000,000 kg in total', s => s.volumeKg >= 1000000],
    ['pr10', 'Record breaker', 'Set 10 personal records', s => s.prs >= 10],
    ['pr50', 'Unstoppable', 'Set 50 personal records', s => s.prs >= 50],
    ['bw1', 'Bodyweight bench', 'Bench press your body weight', s => s.benchBW >= 1],
    ['sq15', 'Big squat', 'Squat 1.5x body weight', s => s.squatBW >= 1.5],
    ['dl2', 'Double bodyweight deadlift', 'Deadlift 2x body weight', s => s.deadBW >= 2],
    ['run5', 'First 5K', 'Run 5 km in one go', s => s.longestRun >= 5],
    ['run10', '10K runner', 'Run 10 km in one go', s => s.longestRun >= 10],
    ['ladder', 'Skill unlocked', 'Complete any skill ladder', s => s.laddersDone >= 1],
    ['multi', 'All-rounder', 'Train 4 different disciplines', s => s.disciplines >= 4],
    ['block', 'Periodized', 'Finish a 5-week training block', s => s.blocks >= 1],
    ['c10', 'Regular climber', 'Log 10 climbing sessions', s => s.climbSessions >= 10],
    ['f120', 'Strong fingers', 'Hang 120% of body weight', s => s.fingerPct >= 120],
    ['f150', 'Steel fingers', 'Hang 150% of body weight', s => s.fingerPct >= 150]
  ],
  stats() {
    const d = Store.data, kg = d.settings.unit === 'lb' ? 0.45359237 : 1, bw = d.settings.bodyweight || 0;
    const best = id => { let b = 0; for (const s of Store.sessions(id, 400)) b = Math.max(b, Coach.bestE1(s.sets)); return b; };
    const runs = d.workouts.flatMap(w => w.exercises.filter(e => ['running', 'treadmill_run'].includes(e.exId)).flatMap(e => e.sets.map(s => +s.d || 0)));
    const disc = new Set(d.workouts.flatMap(w => w.exercises.map(e => Store.ex(e.exId).discipline)));
    return {
      workouts: d.workouts.length, streak: weekStreak(), volumeKg: d.workouts.reduce((a, w) => a + workoutVolume(w), 0) * kg,
      prs: d.workouts.reduce((a, w) => a + (w.prs || 0), 0),
      benchBW: bw ? best('bench_press_barbell') / bw : 0, squatBW: bw ? best('squat_barbell') / bw : 0, deadBW: bw ? best('deadlift_barbell') / bw : 0,
      longestRun: Math.max(0, ...runs), laddersDone: LADDERS.filter(l => Coach.ladderProgress(l) >= l.steps.length).length,
      disciplines: disc.size, blocks: d.settings.blocksDone || 0,
      ...(() => { const f = Climb.fingers(); return { climbSessions: Climb.climbSessions(), fingerPct: f && f.hang ? f.hang.pct : 0 }; })()
    };
  },
  unlocked() { const s = this.stats(); return new Set(this.LIST.filter(a => a[3](s)).map(a => a[0])); },
  // Call after a workout: returns newly unlocked achievements
  check() {
    const now = this.unlocked(), seen = new Set(Store.data.settings.achievements || []);
    const fresh = this.LIST.filter(a => now.has(a[0]) && !seen.has(a[0]));
    Store.data.settings.achievements = [...now]; Store.save();
    return fresh;
  }
};

// ---------- PDF progress report (last N days)
const Report = {
  async lib() {
    if (window.jspdf) return window.jspdf;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/jspdf.umd.min.js'; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the PDF engine")); document.head.appendChild(s); });
    return window.jspdf;
  },
  async pdf(days = 30) {
    const { jsPDF } = await this.lib();
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const d = Store.data, since = Date.now() - days * 864e5, ws = Store.workoutsSorted().filter(w => w.start >= since).reverse(), u = U();
    const W = 595, M = 48; let y = 60;
    const line = (txt, size = 11, bold = false, color = [30, 30, 30]) => { if (y > 790) { doc.addPage(); y = 60; } doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); doc.text(String(txt), M, y); y += size + 7; };
    doc.setFillColor(61, 139, 253); doc.rect(0, 0, W, 8, 'F');
    line('Gym App progress report', 22, true);
    line(`${fmtDate(since, { day: 'numeric', month: 'long', year: 'numeric' })} to ${fmtDate(Date.now(), { day: 'numeric', month: 'long', year: 'numeric' })}`, 11, false, [110, 110, 110]);
    y += 6;
    const vol = ws.reduce((a, w) => a + workoutVolume(w), 0), mins = ws.reduce((a, w) => a + ((w.end || w.start) - w.start) / 60000, 0), prs = ws.reduce((a, w) => a + (w.prs || 0), 0);
    line('Summary', 14, true);
    [['Workouts', ws.length], ['Training time', Math.round(mins / 60 * 10) / 10 + ' h'], ['Total volume', fmtNum(vol) + ' ' + u], ['Personal records', prs], ['Week streak', weekStreak()]].forEach(([k, v]) => line(`${k}: ${v}`));
    const m = d.measurements.filter(x => x.weight).sort((a, b) => a.date - b.date);
    const inWin = m.filter(x => x.date >= since);
    if (inWin.length >= 2) line(`Body weight: ${inWin[0].weight} to ${inWin[inWin.length - 1].weight} ${u} (${(inWin[inWin.length - 1].weight - inWin[0].weight > 0 ? '+' : '')}${round1(inWin[inWin.length - 1].weight - inWin[0].weight)})`);
    y += 6;
    // Sets per muscle with bars
    line('Sets per muscle', 14, true);
    const musc = {}; ws.forEach(w => w.exercises.forEach(e => { const ex = Store.ex(e.exId); musc[ex.muscle] = (musc[ex.muscle] || 0) + e.sets.filter(s => s.type !== 'W').length; }));
    const ml = Object.entries(musc).sort((a, b) => b[1] - a[1]), mx = Math.max(1, ...ml.map(x => x[1]));
    ml.forEach(([k, v]) => { if (y > 790) { doc.addPage(); y = 60; } doc.setFontSize(10); doc.setTextColor(30, 30, 30); doc.text(MUSCLES[k] || k, M, y); doc.setFillColor(61, 139, 253); doc.rect(M + 110, y - 8, 300 * v / mx, 9, 'F'); doc.text(String(v), M + 420, y); y += 16; });
    y += 6;
    // Strength progress: best e1RM at start vs end of window
    line('Strength progress (estimated 1RM)', 14, true);
    const lifts = {}; ws.forEach(w => w.exercises.forEach(e => { const ex = Store.ex(e.exId); if (ex.type !== 'wr') return; const b = Coach.bestE1(e.sets.filter(s => s.type !== 'W')); if (!b) return; (lifts[e.exId] = lifts[e.exId] || []).push(b); }));
    Object.entries(lifts).sort((a, b) => Math.max(...b[1]) - Math.max(...a[1])).slice(0, 12).forEach(([id, arr]) => {
      const first = arr[0], best = Math.max(...arr), ch = best - first;
      line(`${Store.ex(id).name}: ${Math.round(best)} ${u}${arr.length > 1 ? ` (${ch >= 0 ? '+' : ''}${Math.round(ch)} since first session in period)` : ''}`, 10);
    });
    y += 6;
    line('Workouts', 14, true);
    ws.forEach(w => {
      line(`${fmtDate(w.start, { weekday: 'short', day: 'numeric', month: 'short' })} · ${w.name} · ${Math.round(((w.end || w.start) - w.start) / 60000)} min · ${fmtNum(workoutVolume(w))} ${u}`, 10, true);
      w.exercises.forEach(e => { const ex = Store.ex(e.exId); line(`   ${ex.name}: ${e.sets.filter(s => s.type !== 'W').map(s => prevText(ex, s)).join(', ')}`, 9, false, [90, 90, 90]); });
    });
    const b64 = doc.output('datauristring').split(',')[1];
    return { name: `gym-app-report-${new Date().toISOString().slice(0, 10)}.pdf`, b64 };
  },
  async share(days) {
    const { name, b64 } = await this.pdf(days);
    const fs = Plugin('Filesystem'), sh = Plugin('Share');
    if (fs && sh) { const r = await fs.writeFile({ path: name, data: b64, directory: 'CACHE' }); await sh.share({ title: name, url: r.uri, dialogTitle: 'Save or share report' }); return; }
    const a = document.createElement('a'); a.href = 'data:application/pdf;base64,' + b64; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
};

// ---------- Rest timer notification with +30 s / Skip buttons (works from the lock screen)
const RestNotif = {
  ID: 2, ready: false,
  async init() {
    const ln = Plugin('LocalNotifications'); if (!ln || this.ready) return;
    this.ready = true;
    try {
      await ln.registerActionTypes({ types: [{ id: 'REST', actions: [{ id: 'add30', title: '+30 s' }, { id: 'skip', title: 'Skip rest' }] }] });
      ln.addListener('localNotificationActionPerformed', a => {
        if (a.actionId === 'add30') { UI.restEnd = Math.max(UI.restEnd, Date.now()) + 30000; UI.restTotal += 30; this.show(); Notify.at(REST_NOTIF, UI.restEnd, 'Rest over', 'Time for your next set'); }
        else if (a.actionId === 'skip') UI.stopRest();
      });
    } catch (e) { }
  },
  async show() {
    const ln = Plugin('LocalNotifications'); if (!ln || !UI.restEnd) return;
    await this.init();
    try {
      await ln.cancel({ notifications: [{ id: this.ID }] });
      await ln.schedule({ notifications: [{ id: this.ID, title: 'Resting', body: `Next set at ${fmtTime(UI.restEnd)}`, actionTypeId: 'REST', ongoing: true, autoCancel: false, schedule: { at: new Date(Date.now() + 300), allowWhileIdle: true } }] });
    } catch (e) { }
  },
  hide() { Notify.cancel(this.ID); }
};
