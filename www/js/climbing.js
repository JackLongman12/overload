// Climbing: hangboard protocols and progression, finger strength relative to body weight,
// finger-load tracking for rest days, and the 16-week climbing plan.
// Climbing sessions themselves (bouldering, routes) are logged as session time only.
'use strict';

const Climb = {
  // Weighted holds where the weight is lifted (not added to body weight)
  LIFT: ['no_hang_block_lift', 'pinch_block_lift'],
  // Exercises that load the fingers hard (for rest-day advice)
  FINGER: ['hangboard_hang', 'max_hang_added_weight', 'repeaters_7_3', 'minimum_edge_hang', 'one_arm_hang', 'campus_board', 'campus_ladder', 'no_hang_block_lift', 'pinch_block_lift'],
  // Hangs that don't measure max finger strength (too easy, one arm, or endurance)
  NOT_MAX: ['abrahang', 'one_arm_hang', 'repeaters_7_3', 'density_hang'],

  GRIPS: [['half', 'Half crimp', 'Half'], ['open', 'Open hand', 'Open'], ['full', 'Full crimp', 'Full'], ['3fd', '3-finger drag', '3FD'], ['2f', '2-finger pocket', '2F'], ['pinch', 'Pinch', 'Pinch'], ['sloper', 'Sloper', 'Sloper']],
  EDGES: [6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 30, 35, 40],
  gripName(g) { const f = this.GRIPS.find(x => x[0] === g); return f ? f[1] : (g || ''); },
  smallerEdge(e) { const l = this.EDGES.filter(x => x < +e); return l.length ? l[l.length - 1] : +e; },
  // Hangboard protocols: targets, timer and what each is for
  PROTOCOLS: {
    max_hang_added_weight: { name: 'Max hangs', target: { sets: 5, repMin: 7, repMax: 10 }, timer: { work: 10, rest: 180 }, edge: 20, hard: true,
      how: 'Hang 7–10 s on a 20 mm edge in a half crimp, with a load you could hold about 3 s longer. 5 sets, 3 minutes rest.' },
    hangboard_hang: { name: 'Hangs', target: { sets: 6, repMin: 7, repMax: 10 }, timer: { work: 10, rest: 120 }, edge: 20,
      how: 'Hang 7–10 s at body weight on an edge you can hold with good form. 6 sets, 2 minutes rest.' },
    repeaters_7_3: { name: 'Repeaters', target: { sets: 5, repMin: 42, repMax: 42 }, timer: { work: 7, rest: 3, reps: 6, setRest: 180 }, edge: 20, hard: true,
      how: '7 s on, 3 s off, six hangs per set. 5 sets with 3 minutes rest. A set counts as 42 s when all six hangs are done.' },
    minimum_edge_hang: { name: 'Minimum edge', target: { sets: 4, repMin: 10, repMax: 10 }, timer: { work: 10, rest: 180 }, edge: 14, hard: true,
      how: 'Body weight only. Hang the smallest edge you can hold for 10 s. 4 sets, 3 minutes rest.' },
    one_arm_hang: { name: 'One-arm hangs', target: { sets: 3, repMin: 5, repMax: 10 }, timer: { work: 8, rest: 120, perArm: true }, edge: 20, hard: true,
      how: 'One arm at a time, 5–10 s, with a pulley taking weight off as needed. 3 sets per arm, 2 minutes rest.' },
    density_hang: { name: 'Density hangs', target: { sets: 4, repMin: 20, repMax: 40 }, timer: { work: 30, rest: 120 }, edge: 20,
      how: 'Long 20–40 s hangs at body weight on a medium edge. 4 sets, 2 minutes rest.' },
    abrahang: { name: 'Abrahangs', target: { sets: 30, repMin: 10, repMax: 10 }, timer: { work: 10, rest: 20 }, edge: 20, easy: true,
      how: 'Very easy 10 s hangs with 20 s rest for 10–20 minutes, at 40–60% effort.' }
  },
  protocol(ex) { return this.PROTOCOLS[ex.id] || this.PROTOCOLS.hangboard_hang; },
  // How many climbing sessions you've logged (newer climbers get safer hangboard advice)
  climbSessions() { return Store.data.workouts.filter(w => w.exercises.some(e => Store.ex(e.exId).type === 'climb')).length; },

  suggestHang(ex, t, hist) {
    const P = this.protocol(ex), lb = Store.data.settings.unit === 'lb', inc = lb ? 5 : 2.5, bw = +Store.data.settings.bodyweight || 0;
    const lo = t.repMin || P.target.repMin, hi = t.repMax || P.target.repMax, n = t.sets || P.target.sets;
    const mk = (w, tt, edge, grip, k = n) => Array.from({ length: k }, () => ({ w, t: tt, edge, grip }));
    const load = w => (w > 0 ? '+' : '') + fmtW(w) + ' ' + U();
    const pct = w => (bw ? ` (${Math.round((bw + (+w || 0)) / bw * 100)}% of body weight)` : '');
    const novice = P.hard && this.climbSessions() < 25 ? ' New to hangboarding? Most coaches suggest a year of regular climbing first. Until then, take weight off with your feet on a chair or a pulley, or use No-hang Block Lifts.' : '';
    if (!hist.length) return { kind: 'new', title: `${P.name}: first session`, tag: 'new', text: `${P.how} Log the edge depth, grip, added weight (negative if a pulley takes weight off) and seconds.${novice}`, sets: mk(0, hi, P.edge, 'half') };
    const last = hist[0].sets.filter(s => s.type !== 'W');
    const edge = last[0].edge || P.edge, grip = last[0].grip || 'half', w = Math.max(...last.map(s => +s.w || 0));
    const where = `${edge} mm ${this.gripName(grip).toLowerCase()}`;
    if (P.easy) return { kind: 'hold', title: 'Easy hangs', tag: 'recovery', text: `${P.how} Keep the load the same; these aren't meant to get harder.`, sets: mk(w, 10, edge, grip) };
    const streak = this.fingerDays();
    if (streak >= 3) return { kind: 'deload', title: 'Rest your fingers', tag: 'finger rest', text: `You've loaded your fingers ${streak} days in a row. Tendons need 48 hours or more between hard sessions. Do Abrahangs or take the day off.`, sets: mk(w - inc, lo, edge, grip, Math.max(2, n - 2)) };
    const held = last.filter(s => (+s.t || 0) >= hi).length, short = last.filter(s => (+s.t || 0) < lo).length;
    if (ex.id === 'minimum_edge_hang') {
      const next = this.smallerEdge(edge);
      if (held >= Math.min(n, last.length) && next < edge) return { kind: 'weight', title: `Try ${next} mm`, tag: 'smaller edge', text: `You held ${where} for ${hi}s on every set. Next, try the ${next} mm edge at body weight.`, sets: mk(0, hi, next, grip) };
      return { kind: 'hold', title: `Stay on ${edge} mm`, tag: 'hold', text: `Keep working ${where} until every set reaches ${hi}s.`, sets: mk(0, hi, edge, grip) };
    }
    if (held >= Math.min(n, last.length)) {
      const next = this.smallerEdge(edge);
      return { kind: 'weight', title: ex.id === 'one_arm_hang' && w < 0 ? 'Less assistance' : `Add ${inc} ${U()}`, tag: '+' + inc,
        text: `Every set held ${hi}s at ${load(w)} on ${where}${pct(w)}. Next: ${load(w + inc)}${pct(w + inc)} for ${lo}s${next < edge ? `, or keep ${load(w)} and use the ${next} mm edge` : ''}.${novice}`,
        sets: mk(w + inc, lo, edge, grip) };
    }
    if (short >= Math.ceil(last.length / 2)) return { kind: 'deload', title: `Take ${inc} ${U()} off`, tag: '-' + inc,
      text: `Most sets fell short of ${lo}s on ${where}. Use ${load(w - inc)} so each hang ends with about 3 s in reserve. Hanging to failure raises the risk of finger injuries.`, sets: mk(w - inc, lo, edge, grip) };
    const best = Math.max(...last.map(s => +s.t || 0));
    return { kind: 'reps', title: 'Same load, hold longer', tag: '+time', text: `Keep ${load(w)} on ${where}${pct(w)} and aim for ${Math.min(hi, best + 1)}s on every set.${novice}`, sets: mk(w, Math.min(hi, best + 1), edge, grip) };
  },

  // Pulling strength: best estimated 1RM pull-up as % of body weight
  pullPct() {
    const bw = +Store.data.settings.bodyweight || 0; if (!bw) return null;
    let best = 0;
    for (const w of Store.data.workouts) for (const e of w.exercises) for (const s of e.sets) {
      if (s.type === 'W' || s.done === false) continue;
      if (e.exId === 'pull_up_weighted' || e.exId === 'chin_up_weighted') best = Math.max(best, Coach.e1rm(bw + (+s.w || 0), +s.r || 0) / bw * 100);
      if (e.exId === 'pull_up' && +s.r) best = Math.max(best, Coach.e1rm(bw, +s.r) / bw * 100);
    }
    return best ? Math.round(best) : null;
  },

  // ---- Training plan: 4 phases of 4 weeks, built from your focus, days, level and equipment
  PHASES: {
    boulder: [['Base', 'Lots of moderate climbing for technique, plus foundation strength. Stay well below your limit and climb many styles.'],
      ['Strength', 'Limit bouldering on your hardest problems, plus finger training (max hangs once you are past your first year). Few climbs, full rests.'],
      ['Power', 'Explosive moves: board climbing, dynos and campus ladders (advanced). Quality over quantity.'],
      ['Perform', 'Try your projects while fresh. Keep strength work short. The last week is lighter so you recover.']],
    route: [['Base', 'Aerobic base: long easy climbing (ARC), lots of easy routes, and technique.'],
      ['Strength', 'Limit bouldering and max hangs to raise your ceiling.'],
      ['Power endurance', '4x4s, repeaters and linked circuits to hold on when pumped.'],
      ['Perform', 'Redpoint and onsight attempts with full rests. The last week is lighter.']]
  },
  plan() { return Store.data.settings.climbPlan || null; },
  phase(now = Date.now()) {
    const pl = this.plan(); if (!pl) return null;
    const week = Math.floor((now - pl.start) / (7 * 864e5)), idx = Math.floor(week / 4) % 4, list = this.PHASES[pl.focus] || this.PHASES.boulder;
    return { idx, name: list[idx][0], desc: list[idx][1], week: week % 4 + 1, cycle: Math.floor(week / 16) + 1, light: idx === 3 && week % 4 === 3 };
  },
  buildPlan(o) {
    const adv = o.level === 'adv', nw = o.level === 'new', hb = o.hangboard && !nw;
    const fingers = hb ? ['max_hang_added_weight', 5, 7, 10] : nw ? ['dead_hang', 3, 20, 40] : ['no_hang_block_lift', 4, 7, 10];
    const S = {
      limit: ['Limit bouldering', [['bouldering', 1, 0, 0], fingers, ['front_lever_row', 3, 5, 8], ['hanging_leg_raise', 3, 8, 12]]],
      volume: ['Technique and volume', [[o.focus === 'route' ? 'top_rope_climbing' : 'bouldering', 1, 0, 0], ['lock_off_hold', 3, 5, 10], ['frog_stretch', 2, 45, 60]]],
      power: ['Board and power', [[hb ? 'board_climbing' : 'bouldering', 1, 0, 0], adv ? ['campus_ladder', 4, 3, 6] : ['typewriter_pull_up', 3, 3, 6], ['pull_up_weighted', 4, 3, 5]]],
      pe: ['Power endurance', [['4x4_bouldering', 4, 240, 300], hb ? ['repeaters_7_3', 5, 42, 42] : ['frenchies', 3, 3, 5], ['lead_climbing', 1, 0, 0]]],
      aerobic: ['Aerobic routes', [['arc_traversing', 2, 900, 1200], ['auto_belay_laps', 1, 0, 0], hb ? ['density_hang', 4, 20, 40] : ['dead_hang', 3, 30, 45]]],
      anta: ['Antagonists and mobility', [['push_up', 3, 12, 20], ['shoulder_external_rotation_band', 3, 12, 15], ['reverse_wrist_curl', 3, 15, 20], ['finger_extensor_band', 3, 15, 25], ['high_step_mobility', 2, 8, 12], ['abrahang', 15, 10, 10]]]
    };
    if (nw) { S.limit[0] = 'Technique and strength'; S.power = S.volume; }
    const order = o.focus === 'route' ? ['pe', 'limit', 'aerobic', 'anta', 'volume'] : ['limit', 'volume', 'power', 'anta', 'volume'];
    const days = Math.max(2, Math.min(5, +o.days || 3)), picked = order.slice(0, days);
    const seen = {}, routines = picked.map(k => { seen[k] = (seen[k] || 0) + 1; const [n, list] = S[k]; return [seen[k] > 1 ? n + ' 2' : n, list]; });
    const focus = o.focus === 'route' ? 'Routes' : 'Bouldering';
    return { id: 'climbplan', name: `My climbing plan (${focus.toLowerCase()})`, goal: 'sport', level: { new: 'Beginner', mid: 'Intermediate', adv: 'Advanced' }[o.level] || 'Intermediate', days,
      equip: hb ? 'Climbing gym and hangboard' : 'Climbing gym', desc: `${days} days a week, built around ${focus.toLowerCase()} in 4-week phases.`, routines };
  },

  // Finger strength of one set as % of body weight. Hangs: (body + added) / body, adjusted for edge depth.
  // Block lifts: weight / body.
  setPct(ex, s, bw) {
    if (s.type === 'W' || s.done === false || (+s.t || 0) < 5) return 0;
    const lift = this.LIFT.includes(ex.id);
    // About 2.5% more load per mm smaller than 20 mm (a rough rule of thumb)
    const edgeAdj = !lift && +s.edge ? 1 + 0.025 * (20 - +s.edge) : 1;
    return Math.round((lift ? +s.w || 0 : bw + (+s.w || 0)) / bw * 100 * edgeAdj);
  },
  maxHangEx(ex) { return (ex.type === 'wdur' || ex.type === 'hang') && !this.NOT_MAX.includes(ex.id); },
  // Strongest finger effort as % of body weight
  fingers() {
    const bw = +Store.data.settings.bodyweight || 0;
    if (!bw) return null;
    const out = {};
    for (const w of Store.data.workouts) for (const e of w.exercises) {
      const ex = Store.ex(e.exId); if (!this.maxHangEx(ex)) continue;
      const k = this.LIFT.includes(ex.id) ? 'lift' : 'hang';
      for (const s of e.sets) {
        const pct = this.setPct(ex, s, bw); if (!pct) continue;
        if (!out[k] || pct > out[k].pct) out[k] = { pct, w: +s.w || 0, t: +s.t, date: w.start, name: ex.name, edge: +s.edge || null, grip: s.grip || '' };
      }
    }
    return Object.keys(out).length ? out : null;
  },
  // Strongest hang (% of body weight) per session, oldest first, for the trend chart
  hangTrend() {
    const bw = +Store.data.settings.bodyweight || 0; if (!bw) return [];
    const out = [];
    for (const w of Store.data.workouts.slice().sort((a, b) => a.start - b.start)) {
      let best = 0;
      for (const e of w.exercises) { const ex = Store.ex(e.exId); if (!this.maxHangEx(ex) || this.LIFT.includes(ex.id)) continue; for (const s of e.sets) best = Math.max(best, this.setPct(ex, s, bw)); }
      if (best) out.push({ x: w.start, y: best });
    }
    return out;
  },

  // Days in a row (up to today) with climbing or hard finger training
  fingerDays(now = Date.now()) {
    const days = new Set();
    for (const w of Store.data.workouts) {
      if (w.start < now - 10 * 864e5) continue;
      if (w.exercises.some(e => { const ex = Store.ex(e.exId); return ex.type === 'climb' || this.FINGER.includes(ex.id); })) days.add(new Date(w.start).toDateString());
    }
    let n = 0;
    const d = new Date(now);
    if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
    while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },

  // Coach for a climbing session (logged as time): finger rest, plan phase, or keep it steady
  suggest(ex, hist) {
    const last = hist.length ? (hist[0].sets.find(s => +s.t) || {}) : {}, t = +last.t || 0;
    const one = v => [{ t: v || '' }], round5 = v => Math.max(1800, Math.round(v / 300) * 300);
    if (!hist.length || !t) return { kind: 'new', title: 'Log the session time', tag: 'new', text: 'Log how long you climbed, for example 1:30:00 for 90 minutes. The coach uses it to track finger load and rest days.', sets: one(t) };
    const streak = this.fingerDays();
    if (streak >= 3) return { kind: 'deload', title: 'Easy session or rest', tag: 'finger rest', text: `You've climbed or trained fingers ${streak} days in a row. Tendons and pulleys recover slower than muscle, so keep today short and easy, or take a rest day.`, sets: one(round5(t * 0.6)) };
    const ph = this.phase();
    if (ph && ph.light) return { kind: 'deload', title: 'Light week', tag: ph.name, text: 'Last week of the cycle: climb easy and short so you start the next phase fresh.', sets: one(round5(t * 0.7)) };
    if (ph) return { kind: 'climb', title: `${ph.name} phase`, tag: `${ph.name} wk ${ph.week}`, text: ph.desc, sets: one(t) };
    return { kind: 'climb', title: 'Climb', tag: 'session', text: `Last session: ${fmtDur(t)}. Warm up on easy climbs for 15 minutes before trying anything hard.`, sets: one(t) };
  },

  // Max hangs, block lifts: add weight when every set holds for the top of the range
  suggestHold(ex, t, hist) {
    const lo = t.repMin || 7, hi = t.repMax || 10, n = t.sets || 3, lift = this.LIFT.includes(ex.id);
    const inc = Store.data.settings.unit === 'lb' ? 5 : 2.5;
    if (!hist.length) return { kind: 'new', title: 'First session', tag: 'new', text: lift ? `Pick a weight you can hold for ${hi}s with a good grip. Rest 2–3 minutes between sets.` : `Start with no added weight (or use a pulley to take some off). Hold ${lo}–${hi}s, rest 2–3 minutes. Stop before your fingers open up.`, sets: Array.from({ length: n }, () => ({ w: 0, t: hi })) };
    const last = hist[0].sets.filter(s => s.type !== 'W');
    const w = Math.max(...last.map(s => +s.w || 0)), held = last.filter(s => (+s.t || 0) >= hi).length;
    const short = last.some(s => (+s.t || 0) < lo);
    if (held >= Math.min(n, last.length) && last.length) return { kind: 'weight', title: `Add ${inc} ${U()}`, tag: '+' + inc, text: `Every set held ${hi}s at ${fmtW(w)} ${U()}. Add ${inc} ${U()} and hold ${lo}s.`, sets: Array.from({ length: n }, () => ({ w: w + inc, t: lo })) };
    if (short) return { kind: 'hold', title: 'Same weight', tag: 'hold', text: `Some holds were under ${lo}s. Stay at ${fmtW(w)} ${U()} until every set reaches ${lo}s, then build to ${hi}s.`, sets: Array.from({ length: n }, () => ({ w, t: lo })) };
    return { kind: 'reps', title: 'Hold longer', tag: '+time', text: `Keep ${fmtW(w)} ${U()} and hold each set a little longer, up to ${hi}s.`, sets: Array.from({ length: n }, () => ({ w, t: Math.min(hi, Math.max(...last.map(s => +s.t || 0)) + 1) })) };
  }
};
