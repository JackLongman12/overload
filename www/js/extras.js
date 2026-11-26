// Body map, share-as-image, reminders, achievements, PDF reports, rest-timer notification actions.
'use strict';

// ---------- Body map (front and back), colored by weekly sets or by recovery
const BodyMap = {
  // [muscle, view, svg shape]
  SHAPES: [
    ['shoulders', 'f', '<ellipse cx="36" cy="58" rx="11" ry="9"/><ellipse cx="104" cy="58" rx="11" ry="9"/>'],
    ['chest', 'f', '<rect x="45" y="56" width="24" height="22" rx="6"/><rect x="71" y="56" width="24" height="22" rx="6"/>'],
    ['biceps', 'f', '<rect x="25" y="70" width="12" height="26" rx="6"/><rect x="103" y="70" width="12" height="26" rx="6"/>'],
    ['forearms', 'f', '<rect x="20" y="99" width="11" height="28" rx="5"/><rect x="109" y="99" width="11" height="28" rx="5"/>'],
    ['abs', 'f', '<rect x="56" y="81" width="28" height="38" rx="6"/>'],
    ['quads', 'f', '<rect x="47" y="128" width="20" height="46" rx="8"/><rect x="73" y="128" width="20" height="46" rx="8"/>'],
    ['adductors', 'f', '<rect x="64" y="126" width="12" height="22" rx="5"/>'],
    ['calves', 'f', '<rect x="50" y="182" width="14" height="36" rx="6"/><rect x="76" y="182" width="14" height="36" rx="6"/>'],
    ['traps', 'b', '<path d="M52 46 L70 40 L88 46 L84 58 L56 58 Z"/>'],
    ['shoulders', 'b', '<ellipse cx="36" cy="58" rx="11" ry="9"/><ellipse cx="104" cy="58" rx="11" ry="9"/>'],
    ['upper_back', 'b', '<rect x="48" y="58" width="44" height="18" rx="6"/>'],
    ['lats', 'b', '<path d="M47 76 L66 76 L64 104 L52 96 Z"/><path d="M93 76 L74 76 L76 104 L88 96 Z"/>'],
    ['triceps', 'b', '<rect x="25" y="70" width="12" height="26" rx="6"/><rect x="103" y="70" width="12" height="26" rx="6"/>'],
    ['forearms', 'b', '<rect x="20" y="99" width="11" height="28" rx="5"/><rect x="109" y="99" width="11" height="28" rx="5"/>'],
    ['lower_back', 'b', '<rect x="58" y="104" width="24" height="16" rx="5"/>'],
    ['glutes', 'b', '<ellipse cx="59" cy="132" rx="13" ry="11"/><ellipse cx="81" cy="132" rx="13" ry="11"/>'],
    ['hamstrings', 'b', '<rect x="47" y="145" width="20" height="32" rx="8"/><rect x="73" y="145" width="20" height="32" rx="8"/>'],
    ['calves', 'b', '<rect x="50" y="182" width="14" height="36" rx="6"/><rect x="76" y="182" width="14" height="36" rx="6"/>']
  ],
  OUTLINE: '<circle cx="70" cy="24" r="13"/><rect x="62" y="36" width="16" height="8"/><path d="M38 50 Q70 40 102 50 L116 66 L124 128 L108 130 L100 84 L94 122 L96 176 L92 222 L74 222 L70 150 L66 222 L48 222 L44 176 L46 122 L40 84 L32 130 L16 128 L24 66 Z"/>',
  // values: {muscle: number}; mode 'sets' (0..20+) or 'recovery' (0..100, lower = more fatigued); or a Set of highlighted muscles
  svg(values, mode = 'sets', highlight) {
    const color = m => {
      if (highlight) return highlight.primary === m ? 'bm-3' : (highlight.secondary || []).includes(m) ? 'bm-1' : 'bm-0';
      const v = values[m] || 0;
      if (mode === 'recovery') return v >= 90 ? 'bm-0' : v >= 70 ? 'bm-1' : v >= 45 ? 'bm-2' : 'bm-3';
      return v <= 0 ? 'bm-0' : v < 6 ? 'bm-1' : v < 12 ? 'bm-2' : 'bm-3';
    };
    const view = (v, dx, label) => `<g transform="translate(${dx} 0)"><g class="bm-outline">${this.OUTLINE}</g>${this.SHAPES.filter(s => s[1] === v).map(([m, , shape]) => `<g class="${color(m)}"><title>${MUSCLES[m]}${highlight ? '' : ': ' + Math.round(values[m] || 0) + (mode === 'recovery' ? '% recovered' : ' sets')}</title>${shape}</g>`).join('')}<text x="70" y="238" class="axis" text-anchor="middle">${label}</text></g>`;
    return `<svg viewBox="0 0 300 244" class="bodymap" role="img" aria-label="Body map">${view('f', 0, 'Front')}${view('b', 158, 'Back')}</svg>`;
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
    const stats = [['Duration', mins + ' min'], ['Volume', fmtNum(workoutVolume(w)) + ' ' + U()], ['Sets', String(sets)]];
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
    ['block', 'Periodized', 'Finish a 5-week training block', s => s.blocks >= 1]
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
      disciplines: disc.size, blocks: d.settings.blocksDone || 0
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
    line(`${fmtDate(since, { day: 'numeric', month: 'long', year: 'numeric' })} to ${fmtDate(Date.now(), { day: 'numeric', month: 'long', year: 'numeric' })}${d.settings.name ? ' · ' + d.settings.name : ''}`, 11, false, [110, 110, 110]);
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
