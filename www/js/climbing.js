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
const CLIMB_RESULTS = [['', 'Project'], ['sent', 'Sent'], ['flash', 'Flash'], ['onsight', 'Onsight'], ['redpoint', 'Redpoint'], ['repeat', 'Repeat']];
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
  resultLabel(s) { return s.sent ? ((CLIMB_RESULTS.find(r => r[0] === s.st) || [0, 'Sent'])[1]) : 'Project'; },
  isFlash(c) { return c.sent && (c.st === 'flash' || c.st === 'onsight' || (c.a === 1 && (!c.st || c.st === 'sent'))); },

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
          out.push({ date: w.start, wid: w.id, exId: e.exId, cat: c, v, g: s.g, sent: !!s.sent, st: s.st || '', a: Math.max(1, +s.a || 1), ang: s.ang || '' });
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

  // Strongest finger effort as % of body weight. Hangs: (body + added) / body. Block lifts: weight / body.
  fingers() {
    const bw = +Store.data.settings.bodyweight || 0;
    if (!bw) return null;
    const out = {};
    for (const w of Store.data.workouts) for (const e of w.exercises) {
      const ex = Store.ex(e.exId); if (ex.type !== 'wdur') continue;
      const lift = this.LIFT.includes(ex.id);
      for (const s of e.sets) {
        if (s.type === 'W' || s.done === false || (+s.t || 0) < 5) continue;
        const pct = Math.round((lift ? +s.w || 0 : bw + (+s.w || 0)) / bw * 100);
        if (!pct) continue;
        const k = lift ? 'lift' : 'hang';
        if (!out[k] || pct > out[k].pct) out[k] = { pct, w: +s.w || 0, t: +s.t, date: w.start, name: ex.name };
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
