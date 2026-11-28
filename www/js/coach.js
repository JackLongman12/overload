// The personal trainer: progressive overload suggestions, stall detection, deloads,
// readiness autoregulation, weekly volume balance, skill ladder progression.
'use strict';

const Coach = {
  e1rm(w, r) { w = +w || 0; r = +r || 0; if (!w || !r) return 0; if (r === 1) return w; return w * (1 + Math.min(r, 15) / 30); },

  increment(ex) {
    const lb = Store.data.settings.unit === 'lb';
    const lower = ['quads', 'hamstrings', 'glutes', 'lower_back'].includes(ex.muscle);
    if (ex.equipment === 'barbell' && ex.compound && lower) return lb ? 10 : 5;
    if (ex.equipment === 'barbell') return lb ? 5 : 2.5;
    if (ex.equipment === 'dumbbell' || ex.equipment === 'kettlebell') return lb ? 5 : 2;
    if (ex.type === 'wbw') return lb ? 5 : 2.5;
    return lb ? 5 : 2.5;
  },

  roundW(w, ex) {
    const s = Store.data.settings;
    let step = s.unit === 'lb' ? 2.5 : 1.25;
    if (ex && ex.equipment === 'barbell') step = 2 * Math.min(...(s.plates && s.plates.length ? s.plates : [s.unit === 'lb' ? 2.5 : 1.25]));
    else if (ex && (ex.equipment === 'dumbbell' || ex.equipment === 'kettlebell')) step = s.unit === 'lb' ? 5 : 2;
    return Math.max(0, Math.round(w / step) * step);
  },

  defaultTarget(ex) {
    if (ex.type === 'dur') return { sets: 3, repMin: 30, repMax: 60 };
    if (ex.type === 'wdur') return { sets: 5, repMin: 7, repMax: 10 };
    if (ex.type === 'hang') return { ...Climb.protocol(ex).target };
    if (ex.type === 'dist' || ex.type === 'climb') return { sets: 1, repMin: 0, repMax: 0 };
    if (ex.type === 'bw') return { sets: 3, repMin: 8, repMax: 15 };
    return ex.compound ? { sets: 3, repMin: 6, repMax: 10 } : { sets: 3, repMin: 10, repMax: 15 };
  },

  readiness() {
    const c = Store.latestCheckin();
    return c ? c.score : null;
  },

  weeklySets() {
    const since = Date.now() - 7 * 864e5, m = {};
    for (const w of Store.data.workouts) {
      if (w.start < since) continue;
      for (const e of w.exercises) {
        const ex = Store.ex(e.exId);
        const n = e.sets.filter(s => s.done && s.type !== 'W').length;
        m[ex.muscle] = (m[ex.muscle] || 0) + n;
        (ex.secondary || []).forEach(s => m[s] = (m[s] || 0) + n * 0.5);
      }
    }
    return m;
  },

  bestE1(sets) { return Math.max(0, ...sets.map(s => this.e1rm(s.w, s.r))); },

  // Main entry. Returns {kind, title, text, sets:[{w,r,t,d}], tag}
  suggest(exId, target) {
    const ex = Store.ex(exId);
    const hist = Store.sessions(exId, 8);
    const lastTarget = hist.find(h => h.target) || {};
    const t = { ...this.defaultTarget(ex), ...(lastTarget.target || {}), ...(target || {}) };
    const ready = this.readiness();
    let s;
    if (ex.type === 'dur') s = this.suggestDuration(ex, t, hist);
    else if (ex.type === 'dist') s = this.suggestDistance(ex, t, hist);
    else if (ex.type === 'climb') s = this.suggestClimb(ex, hist);
    else if (ex.type === 'wdur') s = Climb.suggestHold(ex, t, hist);
    else if (ex.type === 'hang') s = Climb.suggestHang(ex, t, hist);
    else if (ex.type === 'bw') s = this.suggestBodyweight(ex, t, hist);
    else s = this.suggestLoaded(ex, t, hist);

    if (typeof Plan !== 'undefined') s = Plan.apply(ex, t, s, hist);

    // Readiness autoregulation
    if (ready != null && s.sets && s.sets.length && hist.length) {
      if (ready < 45) {
        s.sets = s.sets.slice(0, Math.max(1, s.sets.length - 1));
        const loaded = ex.type === 'wr' || ex.type === 'wbw' || ex.type === 'wdur';
        if (loaded) s.sets = s.sets.map(x => ({ ...x, w: x.w ? this.roundW(x.w * 0.92, ex) : x.w }));
        s.text += ex.type === 'climb' ? ` Readiness is low (${ready}), so the hardest attempt is dropped today.`
          : ` Readiness is low (${ready}), so today is lighter: one set fewer${loaded ? ' and about 8% less weight' : ''}.`;
        s.tag = 'light day';
      } else if (ready >= 85 && s.kind === 'reps') {
        s.text += ` Readiness is high (${ready}). If the first set flies, take the weight jump now.`;
      }
    }
    return s;
  },

  suggestLoaded(ex, t, hist) {
    const inc = t.inc || this.increment(ex);
    const unit = Store.data.settings.unit;
    if (!hist.length) {
      return { kind: 'new', title: 'First session', tag: 'new',
        text: `Pick a weight you could lift for about ${t.repMax + 2} reps, then do ${t.repMax}. That leaves 2 reps in the tank, a good starting point.`,
        sets: Array.from({ length: t.sets }, () => ({ w: '', r: t.repMax })) };
    }
    const last = hist[0].sets;
    const topW = Math.max(...last.map(s => +s.w || 0));
    const work = last.filter(s => (+s.w || 0) >= topW * 0.95);
    const allTop = work.every(s => +s.r >= t.repMax);
    const allMin = work.every(s => +s.r >= t.repMin);
    const rpes = work.map(s => +s.rpe).filter(Boolean);
    const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

    // Stall: none of the last 3 sessions beat the session before them on e1RM, top weight,
    // or total reps at that weight (reps count, so high-rep work isn't misread).
    let stalled = false;
    if (hist.length >= 4) {
      const score = h => { const w = Math.max(...h.sets.map(s => +s.w || 0)); return { e1: this.bestE1(h.sets), w, reps: h.sets.filter(s => (+s.w || 0) >= w).reduce((a, s) => a + (+s.r || 0), 0) }; };
      const base = score(hist[3]);
      stalled = !hist.slice(0, 3).some(h => { const x = score(h); return x.e1 > base.e1 * 1.01 || x.w > base.w || (x.w === base.w && x.reps > base.reps); });
    }
    let failStreak = 0;
    for (const h of hist) { if (h.sets.some(s => +s.r < t.repMin)) failStreak++; else break; }

    const nSets = Math.max(t.sets, 1);
    const weekly = this.weeklySets()[ex.muscle] || 0;
    const mk = (w, r, n = nSets) => Array.from({ length: n }, () => ({ w, r }));

    if (stalled && failStreak === 0) {
      const sets = work.map(s => ({ w: topW, r: Math.min(t.repMax, (+s.r || 0) + 1) }));
      return { kind: 'push', title: 'Flat for 3 sessions: push harder', tag: 'push',
        text: `You're hitting your reps but not progressing. Take the last set to 1 rep short of failure and aim for one more rep per set. If you're already maxing out, add a set or try ${this.variations(ex).slice(0, 1).map(e => e.name).join('') || 'a variation'}.`,
        sets };
    }
    if (stalled) {
      const w = this.roundW(topW * 0.9, ex);
      const alt = this.variations(ex).slice(0, 2).map(e => e.name);
      return { kind: 'deload', title: 'Plateau, so deload', tag: 'deload',
        text: `No progress in 3 sessions and you're missing reps. Drop about 10% to ${w} ${unit} for ${t.repMax} reps and build back up.` + (alt.length ? ` A variation for a few weeks can also break the stall: ${alt.join(' or ')}.` : ''),
        sets: mk(w, t.repMax) };
    }
    if (failStreak >= 2) {
      const w = this.roundW(topW * 0.95, ex);
      return { kind: 'reduce', title: 'Reset the weight', tag: 'reset',
        text: `You've missed ${t.repMin} reps for ${failStreak} sessions in a row. Drop to ${w} ${unit} and own the rep range first.`,
        sets: mk(w, t.repMin) };
    }
    if (allTop && (avgRpe == null || avgRpe <= 9.5)) {
      const w = this.roundW(topW + inc, ex);
      let n = nSets, extra = '';
      if (weekly < 8 && nSets < 5) { n = nSets + 1; extra = ` ${MUSCLES[ex.muscle]} only got ${Math.round(weekly)} sets this week, so add one set.`; }
      return { kind: 'weight', title: `Add weight: ${w} ${unit}`, tag: '+' + inc + ' ' + unit,
        text: `You hit ${t.repMax} reps on every set last time. Go up ${inc} ${unit} and aim for ${t.repMin}+ reps.` + extra,
        sets: mk(w, t.repMin, n) };
    }
    if (allMin) {
      const sets = work.map(s => ({ w: topW, r: Math.min(t.repMax, (+s.r || 0) + 1) }));
      while (sets.length < nSets) sets.push({ w: topW, r: t.repMin });
      const total = sets.reduce((a, b) => a + b.r, 0);
      let extra = '';
      if (weekly < 8 && sets.length < 5 && hist.length >= 2) { sets.push({ w: topW, r: t.repMin }); extra = ' Weekly volume is low for this muscle, so one extra set is added.'; }
      return { kind: 'reps', title: 'Beat last time: add reps', tag: '+reps',
        text: `Same weight (${topW} ${unit}). Aim for ${total} total reps across ${sets.length} sets: one more rep per set than last time. Add weight once every set reaches ${t.repMax}.` + extra,
        sets: sets.slice(0, Math.max(sets.length, nSets)) };
    }
    return { kind: 'repeat', title: 'Repeat and own it', tag: 'repeat',
      text: `Some sets fell short of ${t.repMin} reps. Keep ${topW} ${unit} and get every set to ${t.repMin} or more before adding weight.`,
      sets: mk(topW, t.repMin) };
  },

  suggestBodyweight(ex, t, hist) {
    if (!hist.length) return { kind: 'new', title: 'First session', tag: 'new',
      text: `Do as many clean reps as you can, up to ${t.repMax}, and stop 1–2 reps before failure.`, sets: Array.from({ length: t.sets }, () => ({ r: t.repMax })) };
    const last = hist[0].sets;
    const allTop = last.every(s => +s.r >= t.repMax);
    if (allTop) {
      const next = this.nextLadderStep(ex.id);
      const weighted = Store.allExercises().find(e => e.type === 'wbw' && e.name.toLowerCase().startsWith(ex.name.toLowerCase()));
      return { kind: 'level', title: 'Level up', tag: 'level up',
        text: `${t.repMax}+ reps on every set means it's time for a harder version.` + (next ? ` Next step: ${Store.ex(next.exId).name}.` : '') + (weighted ? ` Or switch to ${weighted.name} with 2.5 kg.` : ' Or slow the lowering phase to 3 seconds.'),
        sets: last.map(s => ({ r: +s.r })), nextEx: next ? next.exId : (weighted ? weighted.id : null) };
    }
    const sets = last.map(s => ({ r: Math.min(t.repMax, (+s.r || 0) + 1) }));
    while (sets.length < t.sets) sets.push({ r: t.repMin });
    return { kind: 'reps', title: 'Add a rep per set', tag: '+reps', text: `Last time: ${last.map(s => s.r).join(', ')}. Aim for one more rep on each set.`, sets };
  },

  suggestDuration(ex, t, hist) {
    if (!hist.length) return { kind: 'new', title: 'First session', tag: 'new', text: `Hold each set for ${t.repMin}–${t.repMax}s with good form.`, sets: Array.from({ length: t.sets }, () => ({ t: t.repMin })) };
    const last = hist[0].sets;
    const step = ex.discipline === 'combat' ? 0 : Math.max(5, Math.round(Math.max(...last.map(s => +s.t || 0)) * 0.1 / 5) * 5);
    if (ex.discipline === 'combat') {
      return { kind: 'rounds', title: 'Add a round', tag: '+round', text: `Last time: ${last.length} rounds. Add one round, or keep the same rounds at a higher pace.`, sets: [...last.map(s => ({ t: +s.t })), { t: +last[0].t || 180 }] };
    }
    const sets = last.map(s => ({ t: (+s.t || 0) + step }));
    const next = this.nextLadderStep(ex.id);
    const maxed = last.every(s => +s.t >= t.repMax);
    return { kind: 'time', title: maxed && next ? 'Level up' : `Hold ${step}s longer`, tag: '+' + step + 's',
      text: maxed && next ? `You've reached ${t.repMax}s. Move on to ${Store.ex(next.exId).name}.` : `Add about ${step}s to each hold (10% progression).`, sets, nextEx: maxed && next ? next.exId : null };
  },

  suggestDistance(ex, t, hist) {
    if (!hist.length) return { kind: 'new', title: 'First session', tag: 'new', text: 'Go at a conversational pace and log distance and time. The coach builds from there.', sets: [{ d: '', t: '' }] };
    const last = hist[0].sets[0];
    const weekKm = Store.data.workouts.filter(w => w.start > Date.now() - 7 * 864e5)
      .flatMap(w => w.exercises.filter(e => e.exId === ex.id).flatMap(e => e.sets)).reduce((a, s) => a + (+s.d || 0), 0);
    const pace = last.d ? last.t / last.d : 0;
    const prev = hist[1] && hist[1].sets[0];
    const prevPace = prev && prev.d ? prev.t / prev.d : 0;
    if (!prevPace || pace <= prevPace) {
      const d = Math.round((+last.d || 0) * 1.1 * 10) / 10;
      return { kind: 'distance', title: `Go further: ${d} km`, tag: '+10%', text: `Your pace held or improved. Add about 10% distance (the 10% rule). This week so far: ${weekKm.toFixed(1)} km.`, sets: [{ d, t: Math.round(d * pace) }] };
    }
    const tt = Math.round(last.t * 0.98);
    return { kind: 'pace', title: 'Same distance, a bit faster', tag: '-2% time', text: `Keep ${last.d} km and aim for ${fmtDur(tt)}, a 2% faster pace (${fmtPace(tt / last.d)}).`, sets: [{ d: last.d, t: tt }] };
  },

  suggestClimb(ex, hist) {
    if (typeof Climb !== 'undefined') return Climb.suggest(ex, hist);
    if (!hist.length) return { kind: 'new', title: 'First session', tag: 'new', text: 'Log each climb with its grade and whether you sent it. The coach will pick your next project grade.', sets: [{ g: '', a: 1, sent: false }] };
    const all = hist.slice(0, 4).flatMap(h => h.sets).filter(s => s.sent && s.g);
    const scale = ex.id === 'bouldering' ? CLIMB_GRADES.boulder : CLIMB_GRADES.route;
    const idx = all.map(s => scale.indexOf(s.g)).filter(i => i >= 0);
    if (!idx.length) return { kind: 'climb', title: 'Keep sending', tag: 'climb', text: 'Log sends with a grade so the coach can track your level.', sets: [{ g: '', a: 1 }] };
    const top = Math.max(...idx);
    const countTop = idx.filter(i => i === top).length;
    if (countTop >= 3 && scale[top + 1]) return { kind: 'climb', title: `Project ${scale[top + 1]}`, tag: 'grade up', text: `You've sent ${scale[top]} ${countTop} times recently. Start projecting ${scale[top + 1]}, and keep ${scale[top]} for volume.`, sets: [{ g: scale[top + 1], a: 1 }] };
    return { kind: 'climb', title: `Consolidate ${scale[top]}`, tag: 'volume', text: `Send ${scale[top]} ${3 - countTop} more time(s) to unlock the next grade. Use ${scale[Math.max(0, top - 1)]} for mileage.`, sets: [{ g: scale[top], a: 1 }] };
  },

  variations(ex) {
    return Store.allExercises().filter(e => e.id !== ex.id && e.muscle === ex.muscle && e.type === ex.type && e.compound === ex.compound && (typeof Plan === 'undefined' || Plan.available(e))).slice(0, 4);
  },

  // ---- Skill ladders
  ladderFor(exId) { return LADDERS.find(l => l.steps.some(s => s.exId === exId)); },
  nextLadderStep(exId) {
    for (const l of LADDERS) { const i = l.steps.findIndex(s => s.exId === exId); if (i >= 0 && l.steps[i + 1]) return l.steps[i + 1]; }
    return null;
  },
  ladderProgress(l) {
    let current = 0;
    const weighted = { pull_up: 'pull_up_weighted', chin_up: 'chin_up_weighted', chest_dip: 'chest_dip_weighted' };
    l.steps.forEach((st, i) => {
      const h = Store.sessions(st.exId, 3).concat(weighted[st.exId] ? Store.sessions(weighted[st.exId], 3) : []);
      if (!h.length) return;
      const ex = Store.ex(st.exId);
      const done = h.some(sess => sess.sets.length >= st.sets && sess.sets.slice(0, st.sets).every(s => (ex.type === 'dur' ? +s.t : +s.r) >= st.goal));
      if (done) current = Math.max(current, i + 1); else current = Math.max(current, i);
    });
    return Math.min(current, l.steps.length);
  },

  // ---- Big-picture insights for the Coach screen
  insights() {
    const out = [];
    const ws = Store.data.workouts;
    if (!ws.length) return [{ icon: 'sparkles', tone: 'accent', text: 'Log your first workout and the coach will start building your progression plan.' }];
    const recentEx = {};
    ws.filter(w => w.start > Date.now() - 42 * 864e5).forEach(w => w.exercises.forEach(e => recentEx[e.exId] = 1));
    for (const id of Object.keys(recentEx)) {
      const ex = Store.ex(id);
      if (ex.type !== 'wr' && ex.type !== 'wbw') continue;
      const s = this.suggest(id, null);
      if (s.kind === 'push') out.push({ icon: 'flame', tone: 'accent', text: `${ex.name}: flat for 3 sessions. Push the last set harder.`, exId: id });
      else if (s.kind === 'deload' || s.kind === 'reduce') out.push({ icon: 'alert-triangle', tone: 'warning', text: `${ex.name}: ${s.title.toLowerCase()}. ${s.text}`, exId: id });
      else if (s.kind === 'weight') out.push({ icon: 'trending-up', tone: 'success', text: `${ex.name}: ready for ${s.title.replace('Add weight: ', '')} next session.`, exId: id });
    }
    const vol = this.weeklySets();
    const big = ['chest', 'lats', 'upper_back', 'shoulders', 'quads', 'hamstrings', 'glutes'];
    const trainedAny = Object.keys(vol).length > 0 && liftsWeights(28);
    if (trainedAny) {
      big.forEach(m => { if ((vol[m] || 0) < 6) out.push({ icon: 'target', tone: 'accent', text: `${MUSCLES[m]}: ${Math.round(vol[m] || 0)} sets this week. 10–20 hard sets a week is a good range for growth.` }); });
      Object.entries(vol).forEach(([m, v]) => { if (v > 25 && MUSCLES[m]) out.push({ icon: 'flame', tone: 'warning', text: `${MUSCLES[m]}: ${Math.round(v)} sets this week. That's high, so watch recovery.` }); });
      const push = (vol.chest || 0) + (vol.shoulders || 0) * 0.5, pull = (vol.lats || 0) + (vol.upper_back || 0);
      if (push > 6 && pull < push * 0.7) out.push({ icon: 'scale', tone: 'warning', text: `Push volume (${Math.round(push)}) is well above pull (${Math.round(pull)}). Add rows or pull-ups to keep your shoulders healthy.` });
    }
    // Climbing: load spikes, finger streaks, limiters and stuck projects
    if (Climb.climbs(28).length) {
      const lr = Climb.loadRatio(), fd = Climb.fingerDays();
      if (lr && lr.ratio > 1.5) out.push({ icon: 'alert-triangle', tone: 'warning', text: `Climbing load is ${lr.ratio}x your 4-week average. Big jumps are when finger injuries happen, so keep the next sessions moderate.` });
      if (fd >= 3) out.push({ icon: 'hand-stop', tone: 'warning', text: `${fd} days in a row on your fingers. Take a rest day: pulleys recover slower than muscles.` });
      const pr = Climb.profile();
      pr.advice.filter(a => a.tone !== 'info' || /harder on/.test(a.text)).slice(0, 2).forEach(a => out.push({ icon: a.tone === 'warn' ? 'target' : 'mountain', tone: a.tone === 'warn' ? 'accent' : 'success', text: a.text }));
      ['boulder', 'route'].forEach(cat => { const p = Climb.projects(cat).find(x => x.sessions >= 3); if (p) out.push({ icon: 'flag', tone: 'accent', text: `${p.g} project: ${p.sessions} sessions, best high point ${Math.round(p.best * 100)}%. Try it first while fresh, and work it in sections.` }); });
    }
    const goal = Store.data.settings.weekGoal;
    const thisWeek = ws.filter(w => w.start > startOfWeek()).length;
    out.push({ icon: 'calendar', tone: thisWeek >= goal ? 'success' : 'accent', text: `${thisWeek} of ${goal} workouts this week.` + (thisWeek >= goal ? ' Goal reached.' : '') });
    return out;
  },

  // Recovery estimate per muscle: 0–100%
  // How recovered each muscle is (0-100) from the last 4 days of training.
  // Sets are totalled per muscle per workout; more sets and harder sets take longer.
  recovery(now = Date.now(), withHours) {
    const out = {}, left = {};
    Object.keys(MUSCLES).forEach(m => out[m] = 100);
    const MAIN = ['chest', 'lats', 'upper_back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'quads', 'hamstrings', 'glutes', 'calves'];
    for (const w of Store.data.workouts) {
      if (w.start < now - 5 * 864e5) continue;
      const hrs = (now - (w.end || w.start)) / 3600e3, units = {};
      if (hrs < 0) continue;
      const add = (m, u) => { if (m === 'full_body') MAIN.forEach(x => units[x] = (units[x] || 0) + u * 0.3); else if (MUSCLES[m] && !['cardio', 'mobility'].includes(m)) units[m] = (units[m] || 0) + u; };
      for (const e of w.exercises) {
        const ex = Store.ex(e.exId);
        if (ex.discipline === 'mobility') continue;
        const sets = e.sets.filter(s => s.done !== false && s.type !== 'W');
        // A hard set (RPE 9-10) counts a bit more, an easy one (RPE 6 or less) less
        const u = sets.reduce((a, s) => a + (+s.rpe >= 9 ? 1.25 : s.rpe && +s.rpe <= 6 ? 0.7 : 1), 0) * (ex.type === 'dist' ? 2 : 1);
        if (!u) continue;
        add(ex.muscle, u); (ex.secondary || []).forEach(m => add(m, u * 0.5));
      }
      for (const [m, u] of Object.entries(units)) {
        const need = 18 + Math.min(u, 16) * 4; // 1 set ~ 22 h, 10 sets ~ 58 h, 16+ sets ~ 82 h
        const pct = Math.min(100, Math.round(hrs / need * 100));
        if (pct < out[m]) { out[m] = pct; left[m] = Math.max(0, Math.round(need - hrs)); }
      }
    }
    return withHours ? { pct: out, left } : out;
  }
};

// ---------- Strength calculators
const Strength = {
  // Share of body weight each bodyweight exercise moves (rough figures from biomechanics studies)
  CALI: { pull_up: ['Pull-up', 1], chin_up: ['Chin-up', 1], chest_dip: ['Dip', 0.95], push_up: ['Push-up', 0.64], pistol_squat: ['Pistol squat (per leg)', 0.85], handstand_push_up: ['Handstand push-up', 0.92], inverted_row: ['Inverted row', 0.55] },
  // Average of Epley and Brzycki up to 12 reps; Epley alone for high-rep bodyweight sets (up to 30)
  e1(load, reps) { reps = +reps || 0; if (!load || !reps) return 0; if (reps === 1) return load; if (reps > 12) return load * (1 + Math.min(reps, 30) / 30); return (load * (1 + reps / 30) + load * 36 / (37 - reps)) / 2; },
  // Calisthenics 1RM: total load moved, the most you could add for a single, and added weight for other rep counts
  cali(id, bw, added, reps) {
    const k = (this.CALI[id] || ['', 1])[1], load = bw * k + (+added || 0), one = this.e1(load, reps);
    const at = r => one / (r > 12 ? 1 + r / 30 : (1 + r / 30 + 36 / (37 - r)) / 2) - bw * k;
    return { load, one, maxAdded: one - bw * k, table: [1, 3, 5, 8, 10, 12].map(r => ({ r, added: r === 1 ? one - bw * k : at(r) })) };
  },
  // Bodyweight strength to barbell estimates (rough ratios; individual leverage and technique vary a lot)
  predictLifts(id, bw, added, reps) {
    const c = this.cali(id, bw, added, reps), t = c.one, out = [];
    if (id === 'pull_up' || id === 'chin_up') out.push(['Lat pulldown', t * 0.95], ['Barbell row', t * 0.72], ['Weighted pull-up (added)', c.maxAdded]);
    if (id === 'chest_dip') out.push(['Bench press', t / 1.3], ['Weighted dip (added)', c.maxAdded]);
    if (id === 'push_up') out.push(['Bench press', t * 0.98]);
    if (id === 'handstand_push_up') out.push(['Overhead press', t * 0.68]);
    if (id === 'pistol_squat') out.push(['Back squat', t * 1.55]);
    if (id === 'inverted_row') out.push(['Barbell row', t * 1.2]);
    return out.map(([n, v]) => [n, Math.max(0, v)]);
  },
  // Barbell 1RM to bodyweight reps (the reverse direction)
  repsFrom(lift, oneRM, bw) {
    // Reps you could do with a load, from a 1RM (Epley inverted)
    const reps = load => Math.max(0, Math.round(30 * (oneRM / load - 1)));
    if (lift === 'bench') return [['Push-ups', reps(bw * 0.64 * 0.98)], ['Dips', reps(bw * 0.95 / 1.3)]];
    if (lift === 'pulldown') return [['Pull-ups', reps(bw * 0.95)]];
    if (lift === 'ohp') return [['Handstand push-ups', reps(bw * 0.92 * 0.68)]];
    return [];
  },
  // Strength levels by body-weight ratio (approximate, from common strength-standard tables)
  LEVELS: ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'],
  STANDARDS: {
    m: { squat: [0.75, 1.25, 1.5, 2.0, 2.5], bench: [0.5, 0.75, 1.0, 1.5, 2.0], deadlift: [1.0, 1.5, 2.0, 2.5, 3.0], ohp: [0.35, 0.55, 0.75, 1.0, 1.25] },
    f: { squat: [0.5, 0.75, 1.0, 1.5, 1.9], bench: [0.25, 0.5, 0.65, 1.0, 1.3], deadlift: [0.5, 1.0, 1.25, 1.75, 2.25], ohp: [0.2, 0.35, 0.5, 0.75, 0.95] }
  },
  level(sex, lift, ratio) { const t = this.STANDARDS[sex === 'f' ? 'f' : 'm'][lift]; let i = -1; t.forEach((v, k) => { if (ratio >= v) i = k; }); return { idx: i, name: i < 0 ? 'Getting started' : this.LEVELS[i], next: t[i + 1] || null }; },
  // DOTS score for a powerlifting total (body weight in kg)
  dots(totalKg, bwKg, sex) {
    const c = sex === 'f' ? [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706] : [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093];
    const b = Math.min(Math.max(bwKg, 40), 210), den = c[0] + c[1] * b + c[2] * b ** 2 + c[3] * b ** 3 + c[4] * b ** 4;
    return totalKg * 500 / den;
  },
  // % of 1RM for a rep count at an RPE (reps in reserve = 10 - RPE)
  rpePct(reps, rpe) { const r = reps + (10 - rpe); return r <= 1 ? 1 : 2 / ((1 + r / 30) + 36 / (37 - Math.min(r, 30))); }
};

function startOfWeek() { const d = new Date(); d.setHours(0, 0, 0, 0); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return d.getTime(); }
