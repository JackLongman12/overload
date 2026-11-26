// Climbing: grade systems (V, Font, YDS, French), the result and wall angle of each climb,
// climbing stats (grade pyramid, hardest send, flash grade, top-5 average, send rate),
// finger strength relative to body weight, and finger-load tracking for the coach.
'use strict';

// Each grade has a difficulty value so different systems can be compared and converted.
// Boulders: value = V number. Routes: value = position on the YDS scale (5.5 = 0).
const GRADE_SYSTEMS = {
  V: { cat: 'boulder', name: 'V scale (V0, V5)', list: [['VB', -1], ...Array.from({ length: 18 }, (_, i) => ['V' + i, i])] },
  Font: { cat: 'boulder', name: 'Font (6A, 7B+)', list: [['3', -1], ['4', 0], ['4+', 0.5], ['5', 1], ['5+', 2], ['6A', 3], ['6A+', 3.5], ['6B', 4], ['6B+', 4.5], ['6C', 5], ['6C+', 5.5],
    ['7A', 6], ['7A+', 7], ['7B', 8], ['7B+', 8.5], ['7C', 9], ['7C+', 10], ['8A', 11], ['8A+', 12], ['8B', 13], ['8B+', 14], ['8C', 15], ['8C+', 16], ['9A', 17]] },
  YDS: { cat: 'route', name: 'YDS (5.10a)', list: ['5.5', '5.6', '5.7', '5.8', '5.9', ...[10, 11, 12, 13, 14].flatMap(n => ['a', 'b', 'c', 'd'].map(l => `5.${n}${l}`)), '5.15a', '5.15b', '5.15c'].map((g, i) => [g, i]) },
  French: { cat: 'route', name: 'French (6a, 7b+)', list: [['4', 0], ['4+', 1], ['5a', 2], ['5b', 3], ['5c', 4], ['6a', 5], ['6a+', 6], ['6b', 7], ['6b+', 8], ['6c', 9], ['6c+', 10],
    ['7a', 12], ['7a+', 13], ['7b', 14], ['7b+', 15], ['7c', 16], ['7c+', 17], ['8a', 18], ['8a+', 19], ['8b', 20], ['8b+', 21], ['8c', 22], ['8c+', 23], ['9a', 24], ['9a+', 25], ['9b', 26], ['9b+', 27]] }
};

// How a climb went. Anything except "Project" counts as a send.
// Not sent: how far you got (high point) so effort on projects still counts
const CLIMB_RESULTS = [['', 'Not sent'], ['p25', 'Fell low'], ['p50', 'Fell midway'], ['p85', 'Fell high'], ['sent', 'Sent'], ['flash', 'Flash'], ['onsight', 'Onsight'], ['redpoint', 'Redpoint'], ['repeat', 'Repeat']];
const CLIMB_ANGLES = [['', 'Any'], ['slab', 'Slab'], ['vert', 'Vertical'], ['over', 'Overhang'], ['roof', 'Roof']];

const Climb = {
  BOULDER: ['bouldering', 'outdoor_bouldering', 'board_climbing', 'spray_wall'],
  // Weighted holds where the weight is lifted (not added to body weight)
  LIFT: ['no_hang_block_lift', 'pinch_block_lift'],
  // Exercises that load the fingers hard (for rest-day advice)
  FINGER: ['hangboard_hang', 'max_hang_added_weight', 'repeaters_7_3', 'minimum_edge_hang', 'one_arm_hang', 'campus_board', 'campus_ladder', 'no_hang_block_lift', 'pinch_block_lift'],

  cat(ex) { return this.BOULDER.includes(ex.id) || /boulder|board|spray/i.test(ex.name || '') ? 'boulder' : 'route'; },
  system(cat) {
    const s = Store.data.settings, k = cat === 'boulder' ? s.boulderScale : s.routeScale;
    return GRADE_SYSTEMS[k] && GRADE_SYSTEMS[k].cat === cat ? k : (cat === 'boulder' ? 'V' : 'YDS');
  },
  grades(cat) { return GRADE_SYSTEMS[this.system(cat)].list.map(g => g[0]); },
  // Difficulty value of a grade in any system of that category (user's own system first)
  value(g, cat) {
    if (g == null || g === '') return null;
    const keys = [this.system(cat), ...Object.keys(GRADE_SYSTEMS)];
    for (const exact of [true, false]) for (const k of keys) {
      const sys = GRADE_SYSTEMS[k]; if (sys.cat !== cat) continue;
      const f = sys.list.find(x => exact ? x[0] === g : x[0].toLowerCase() === String(g).trim().toLowerCase());
      if (f) return f[1];
    }
    return null;
  },
  // Grade in the user's system for a difficulty value. Rounds down so it never overstates.
  label(v, cat) {
    if (v == null) return '–';
    const list = GRADE_SYSTEMS[this.system(cat)].list;
    let best = list[0][0];
    for (const [g, val] of list) if (val <= v + 1e-9) best = g;
    return best;
  },
  // Index in the user's system for a difficulty value
  index(v, cat) { const list = GRADE_SYSTEMS[this.system(cat)].list; let i = 0; list.forEach((x, k) => { if (x[1] <= v + 1e-9) i = k; }); return i; },
  show(g, cat) { const v = this.value(g, cat); return v == null ? (g || '?') : this.label(v, cat); },
  highPoint(s) { return s.sent ? 1 : { p25: 0.25, p50: 0.5, p85: 0.85 }[s.st] || 0.5; },
  resultLabel(s) { return s.sent ? ((CLIMB_RESULTS.find(r => r[0] === s.st) || [0, 'Sent'])[1]) : ((CLIMB_RESULTS.find(r => r[0] === s.st) || [0, 'Not sent'])[1]); },
  isFlash(c) { return c.sent && (c.st === 'flash' || c.st === 'onsight' || (c.a === 1 && (!c.st || c.st === 'sent'))); },

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

  // Every logged climb with its difficulty value
  climbs(days, cat) {
    const since = days ? Date.now() - days * 864e5 : 0, out = [];
    for (const w of Store.data.workouts) {
      if (w.start < since) continue;
      for (const e of w.exercises) {
        const ex = Store.ex(e.exId); if (ex.type !== 'climb') continue;
        const c = this.cat(ex); if (cat && c !== cat) continue;
        for (const s of e.sets) {
          if (s.done === false) continue;
          const v = this.value(s.g, c); if (v == null) continue;
          out.push({ date: w.start, wid: w.id, exId: e.exId, cat: c, v, g: s.g, sent: !!s.sent, st: s.st || '', a: Math.max(1, +s.a || 1), ang: s.ang || '', hp: this.highPoint(s), mins: ((w.end || w.start) - w.start) / 60000 });
        }
      }
    }
    return out;
  },

  stats(cat, days = 90) {
    const all = this.climbs(days, cat);
    if (!all.length) return null;
    const sends = all.filter(c => c.sent), vals = sends.map(c => c.v).sort((a, b) => b - a);
    const flash = sends.filter(c => this.isFlash(c)).map(c => c.v);
    const top5 = vals.slice(0, 5);
    // Grade pyramid in the user's system, hardest first
    const pyr = {};
    all.forEach(c => { const l = this.label(c.v, cat), p = pyr[l] = pyr[l] || { g: l, v: this.value(l, cat), sent: 0, tried: 0 }; p.tried++; if (c.sent) p.sent++; });
    const pyramid = Object.values(pyr).sort((a, b) => b.v - a.v);
    // By wall angle: how many and the average sent grade
    const angles = {};
    sends.filter(c => c.ang).forEach(c => { const a = angles[c.ang] = angles[c.ang] || { n: 0, sum: 0 }; a.n++; a.sum += c.v; });
    Object.values(angles).forEach(a => { a.avg = a.sum / a.n; });
    // Hardest send per session, for the trend chart
    const bySession = {};
    sends.forEach(c => { bySession[c.wid] = bySession[c.wid] && bySession[c.wid].y >= c.v ? bySession[c.wid] : { x: c.date, y: c.v }; });
    const sessions = new Set(all.map(c => c.wid)).size;
    return {
      cat, n: all.length, sends: sends.length, sessions, perWeek: sessions / (days / 7),
      max: vals.length ? vals[0] : null, flash: flash.length ? Math.max(...flash) : null,
      top5: top5.length ? top5.reduce((a, b) => a + b, 0) / top5.length : null,
      sendRate: sends.length / all.length,
      triesPerSend: sends.length ? sends.reduce((a, c) => a + c.a, 0) / sends.length : null,
      pyramid, angles, trend: Object.values(bySession).sort((a, b) => a.x - b.x)
    };
  },

  // ---- Workload: every attempt counts, weighted by difficulty and how far you got
  points(c) { return c.cat === 'boulder' ? c.v + 3 : c.v * 0.5 + 2; },
  climbLoad(c) { const p = this.points(c); return c.sent ? p * (1 + (c.a - 1) * 0.6) : p * c.a * c.hp; },
  // Weekly load for the last n weeks (oldest first) and this week vs your 4-week average
  weeklyLoad(weeks = 8, now = Date.now()) {
    const all = this.climbs(weeks * 7 + 7), out = [];
    for (let k = weeks - 1; k >= 0; k--) {
      const end = now - k * 7 * 864e5, start = end - 7 * 864e5;
      out.push({ x: end, y: Math.round(all.filter(c => c.date > start && c.date <= end).reduce((a, c) => a + this.climbLoad(c), 0)) });
    }
    return out;
  },
  loadRatio(now = Date.now()) {
    const w = this.weeklyLoad(5, now), cur = w[4].y, prev = w.slice(0, 4).map(x => x.y), avg = prev.reduce((a, b) => a + b, 0) / 4;
    if (!avg || prev.filter(Boolean).length < 2) return null;
    return { cur, avg: Math.round(avg), ratio: Math.round(cur / avg * 100) / 100 };
  },
  // Climbs harder than your hardest send that you're still working: attempts and best high point
  projects(cat, days = 90) {
    const all = this.climbs(days, cat), sent = all.filter(c => c.sent), max = sent.length ? Math.max(...sent.map(c => c.v)) : -Infinity, out = {};
    all.filter(c => !c.sent && c.v > max).forEach(c => { const l = this.label(c.v, cat), p = out[l] = out[l] || { g: l, v: c.v, tries: 0, best: 0, sessions: new Set(), last: 0 }; p.tries += c.a; p.best = Math.max(p.best, c.hp); p.sessions.add(c.wid); p.last = Math.max(p.last, c.date); });
    return Object.values(out).map(p => ({ ...p, sessions: p.sessions.size })).sort((a, b) => a.v - b.v);
  },
  // Session pace and intensity (relative to your hardest send)
  sessionSummary(cat, days = 90) {
    const all = this.climbs(days, cat); if (!all.length) return null;
    const byW = {}; all.forEach(c => (byW[c.wid] = byW[c.wid] || []).push(c));
    const sent = all.filter(c => c.sent), max = sent.length ? Math.max(...sent.map(c => c.v)) : Math.max(...all.map(c => c.v));
    const ses = Object.values(byW).map(list => ({ n: list.length, load: list.reduce((a, c) => a + this.climbLoad(c), 0), mins: list[0].mins, avg: list.reduce((a, c) => a + c.v, 0) / list.length }));
    const timed = ses.filter(s => s.mins > 10);
    return { load: Math.round(ses.reduce((a, s) => a + s.load, 0) / ses.length), pace: timed.length ? Math.round(timed.reduce((a, s) => a + s.n / s.mins * 60, 0) / timed.length * 10) / 10 : null,
      intensity: Math.round(ses.reduce((a, s) => a + s.avg, 0) / ses.length * 10) / 10, max };
  },

  // ---- Strength profile: what the numbers say about your fingers and pulling, compared with your grade.
  // Rough guide built from published averages (finger strength on a 20 mm edge vs boulder grade).
  FINGER_V: [[100, 0], [118, 2], [128, 4], [140, 6], [155, 8.5], [170, 11], [185, 13]],
  PULL_V: [[120, 1], [135, 3], [150, 5.5], [165, 8], [180, 10.5], [195, 13]],
  interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) if (x <= table[i][0]) { const [a, va] = table[i - 1], [b, vb] = table[i]; return va + (vb - va) * (x - a) / (b - a); }
    return table[table.length - 1][1];
  },
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
  // Your level as a boulder V value (routes converted roughly)
  level() {
    const b = this.stats('boulder', 120), r = this.stats('route', 120);
    if (b && b.top5 != null) return { v: b.top5, cat: 'boulder' };
    if (r && r.top5 != null) return { v: Math.max(0, (r.top5 - 6) / 1.4), cat: 'route' };
    return null;
  },
  profile() {
    const f = this.fingers(), fp = f && f.hang ? f.hang.pct : null, pp = this.pullPct(), lv = this.level();
    const out = { level: lv, fingerPct: fp, pullPct: pp, fingerV: fp ? this.interp(this.FINGER_V, fp) : null, pullV: pp ? this.interp(this.PULL_V, pp) : null, advice: [] };
    const V = v => 'V' + Math.max(0, Math.round(v));
    if (lv && out.fingerV != null) {
      const gap = out.fingerV - lv.v;
      if (gap >= 2) out.advice.push({ tone: 'good', text: `Your fingers are strong for your grade (they match about ${V(out.fingerV)}, you climb about ${V(lv.v)}). Strength isn't what's holding you back: put more time into technique, footwork, reading problems and styles you avoid.` });
      else if (gap <= -1.5) out.advice.push({ tone: 'warn', text: `Finger strength looks like your limiter (about ${V(out.fingerV)} vs your ${V(lv.v)} climbing). Add max hangs twice a week and keep limit bouldering.` });
      else out.advice.push({ tone: 'info', text: `Finger strength and climbing level are in balance (about ${V(out.fingerV)}). Keep mixing limit bouldering with max hangs.` });
    }
    if (lv && out.pullV != null && out.pullV < lv.v - 2) out.advice.push({ tone: 'warn', text: `Pulling strength is behind your climbing (about ${V(out.pullV)}). Add weighted pull-ups and lock-offs once or twice a week.` });
    const st = this.stats(lv ? lv.cat : 'boulder', 120);
    if (st) {
      const ang = Object.entries(st.angles).filter(([, a]) => a.n >= 3);
      if (ang.length >= 2) {
        ang.sort((a, b) => a[1].avg - b[1].avg);
        const [weak, w] = ang[0], [strong, s2] = ang[ang.length - 1], name = k => (CLIMB_ANGLES.find(x => x[0] === k) || [0, k])[1].toLowerCase();
        if (s2.avg - w.avg >= 1) out.advice.push({ tone: 'info', text: `You send about ${(s2.avg - w.avg).toFixed(1)} grades harder on ${name(strong)} than on ${name(weak)}. Spend a session a week on ${name(weak)}.` });
      }
      if (st.pyramid.length >= 2) {
        const top = st.pyramid[0].sent ? st.pyramid[0] : st.pyramid.find(p => p.sent);
        const below = top && st.pyramid.find(p => p.v < top.v && p.sent);
        if (top && below && below.sent < 2) out.advice.push({ tone: 'info', text: `Your pyramid is thin below ${top.g}: only ${below.sent} send(s) at ${below.g}. Consolidate ${below.g} before projecting harder.` });
      }
    }
    if (!lv) out.advice.push({ tone: 'info', text: 'Log a few climbing sessions with grades to get a personal profile.' });
    if (!fp) out.advice.push({ tone: 'info', text: 'Do the finger test (a max hang on a 20 mm edge) and set your body weight to see where your finger strength stands.' });
    return out;
  },

  // ---- Training plan: 4 phases of 4 weeks, built from your focus, days, level and equipment
  PHASES: {
    boulder: [['Base', 'Lots of moderate climbing for technique, plus foundation strength. Climb 2 grades below your max, in many styles.'],
      ['Strength', 'Limit bouldering at and just above your max, plus finger training (max hangs once you are past your first year). Few climbs, full rests.'],
      ['Power', 'Explosive moves: board climbing, dynos and campus ladders (advanced). Quality over quantity.'],
      ['Perform', 'Try your projects while fresh. Keep strength work short. The last week is lighter so you recover.']],
    route: [['Base', 'Aerobic base: long easy climbing (ARC), lots of routes 2–3 grades below your max, and technique.'],
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
      limit: ['Limit bouldering', [['bouldering', 8, 0, 0], fingers, ['front_lever_row', 3, 5, 8], ['hanging_leg_raise', 3, 8, 12]]],
      volume: ['Technique and volume', [[o.focus === 'route' ? 'top_rope_climbing' : 'bouldering', 15, 0, 0], ['lock_off_hold', 3, 5, 10], ['frog_stretch', 2, 45, 60]]],
      power: ['Board and power', [[hb ? 'board_climbing' : 'bouldering', 8, 0, 0], adv ? ['campus_ladder', 4, 3, 6] : ['typewriter_pull_up', 3, 3, 6], ['pull_up_weighted', 4, 3, 5]]],
      pe: ['Power endurance', [['4x4_bouldering', 4, 240, 300], hb ? ['repeaters_7_3', 5, 42, 42] : ['frenchies', 3, 3, 5], ['lead_climbing', 4, 0, 0]]],
      aerobic: ['Aerobic routes', [['arc_traversing', 2, 900, 1200], ['auto_belay_laps', 6, 0, 0], hb ? ['density_hang', 4, 20, 40] : ['dead_hang', 3, 30, 45]]],
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

  // Strongest finger effort as % of body weight. Hangs: (body + added) / body. Block lifts: weight / body.
  fingers() {
    const bw = +Store.data.settings.bodyweight || 0;
    if (!bw) return null;
    const out = {};
    for (const w of Store.data.workouts) for (const e of w.exercises) {
      const ex = Store.ex(e.exId); if (ex.type !== 'wdur' && ex.type !== 'hang') continue;
      if (ex.id === 'abrahang' || ex.id === 'one_arm_hang' || ex.id === 'repeaters_7_3' || ex.id === 'density_hang') continue;
      const lift = this.LIFT.includes(ex.id);
      for (const s of e.sets) {
        if (s.type === 'W' || s.done === false || (+s.t || 0) < 5) continue;
        // About 2.5% more load per mm smaller than 20 mm (a rough rule of thumb)
        const edgeAdj = !lift && +s.edge ? 1 + 0.025 * (20 - +s.edge) : 1;
        const pct = Math.round((lift ? +s.w || 0 : bw + (+s.w || 0)) / bw * 100 * edgeAdj);
        if (!pct) continue;
        const k = lift ? 'lift' : 'hang';
        if (!out[k] || pct > out[k].pct) out[k] = { pct, w: +s.w || 0, t: +s.t, date: w.start, name: ex.name, edge: +s.edge || null, grip: s.grip || '' };
      }
    }
    return Object.keys(out).length ? out : null;
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

  // Coach for a climbing session: picks a project grade and lays out a pyramid session
  suggest(ex, hist) {
    const cat = this.cat(ex), list = this.grades(cat);
    if (!hist.length) return { kind: 'new', title: 'First session', tag: 'new', text: 'Log each climb with its grade and how it went (project, flash, redpoint and so on). The coach will pick your next project grade and plan your sessions.', sets: [{ g: '', a: 1 }] };
    const recent = hist.slice(0, 4).flatMap(h => h.sets).filter(s => s.sent);
    const idx = recent.map(s => this.value(s.g, cat)).filter(v => v != null).map(v => this.index(v, cat));
    if (!idx.length) return { kind: 'climb', title: 'Keep sending', tag: 'climb', text: 'Mark climbs you finish as sent so the coach can track your level.', sets: [{ g: '', a: 1 }] };
    const top = Math.max(...idx), countTop = idx.filter(i => i === top).length;
    const g = k => list[Math.max(0, Math.min(list.length - 1, k))];
    const streak = this.fingerDays();
    if (streak >= 3) {
      return { kind: 'deload', title: 'Easy volume today', tag: 'finger rest', text: `You've climbed or trained fingers ${streak} days in a row. Tendons and pulleys recover slower than muscle, so keep today to easy mileage around ${g(top - 2)}, or take a rest day.`,
        sets: [g(top - 3), g(top - 2), g(top - 2), g(top - 3)].map(x => ({ g: x, a: 1 })) };
    }
    const up = countTop >= 3 && top + 1 < list.length;
    const ph = this.phase();
    if (ph && ph.light) return { kind: 'deload', title: 'Light week', tag: ph.name, text: 'Last week of the cycle: climb easy and short so you start the next phase fresh.', sets: [top - 3, top - 2, top - 2, top - 1].map(k => ({ g: g(k), a: 1 })) };
    if (ph && ph.idx === 0) { const sets = [top - 3, top - 2, top - 2, top - 2, top - 2, top - 1, top - 1, top - 1, top - 1, top].map(k => ({ g: g(k), a: 1 }));
      return { kind: 'climb', title: 'Base: volume and technique', tag: `${ph.name} wk ${ph.week}`, text: `${ph.desc} Today: 10 climbs, mostly ${g(top - 2)}–${g(top - 1)}. Focus on quiet feet and different styles.`, sets }; }
    if (ph && (ph.idx === 1 || ph.idx === 2)) { const sets = [top - 2, top - 1, top, top, top + 1, top + 1].map(k => ({ g: g(k), a: k > top ? 4 : 2 }));
      return { kind: 'climb', title: `${ph.name}: limit climbing`, tag: `${ph.name} wk ${ph.week}`, text: `${ph.desc} Warm up well, then 4–6 hard problems at ${g(top)}–${g(top + 1)} with 3–5 minutes rest between tries.`, sets }; }
    if (ph && ph.idx === 3) { const sets = [top - 2, top - 1, top, top + 1].map(k => ({ g: g(k), a: k > top ? 5 : 1 }));
      return { kind: 'climb', title: `Send ${g(top + 1)}`, tag: `${ph.name} wk ${ph.week}`, text: `${ph.desc} Short warm-up, then give your project ${g(top + 1)} your best attempts while fresh.`, sets }; }
    const plan = up ? [top - 2, top - 2, top - 1, top - 1, top, top + 1, top + 1] : [top - 2, top - 2, top - 1, top - 1, top, top];
    const sets = plan.map(k => ({ g: g(k), a: k > top ? 3 : 1 }));
    const desc = Object.entries(sets.reduce((m, s) => (m[s.g] = (m[s.g] || 0) + 1, m), {})).map(([gr, n]) => `${n}× ${gr}`).join(', ');
    if (up) return { kind: 'climb', title: `Project ${g(top + 1)}`, tag: 'grade up', text: `You've sent ${g(top)} ${countTop} times recently, so it's time to try ${g(top + 1)}. Session plan: ${desc}. Warm up on the easier ones and rest 3–5 minutes between hard attempts.`, sets };
    return { kind: 'climb', title: `Consolidate ${g(top)}`, tag: 'volume', text: `Send ${g(top)} ${3 - countTop} more time(s) to unlock the next grade. Session plan: ${desc}. Try different styles (slab, overhang) at the same grade.`, sets };
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
