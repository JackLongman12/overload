// Coach depth: gym equipment profile, training blocks (periodization), % of max loading,
// live RPE autoregulation and the program builder.
'use strict';

const EQUIPMENT = { barbell: 'Barbell and rack', dumbbell: 'Dumbbells', machine: 'Machines', cable: 'Cable station', kettlebell: 'Kettlebells', band: 'Bands', bodyweight: 'Pull-up bar / dip bars', other: 'Other (box, ab wheel, sled)' };

const Plan = {
  // ---------- Gym profile
  gym() { const g = Store.data.settings.gym; return g && g.length ? g : Object.keys(EQUIPMENT); },
  available(ex) { if (!ex) return false; if (['none'].includes(ex.equipment)) return true; return this.gym().includes(ex.equipment); },

  // ---------- Training blocks: 4 build weeks + 1 deload week
  BLOCKS: {
    hypertrophy: { name: 'Muscle building', weeks: [
      { label: 'Base', rpe: 7, sets: 0, note: 'Leave 3 reps in the tank. Focus on form and full range.' },
      { label: 'Build', rpe: 8, sets: 0, note: 'Leave 2 reps in the tank.' },
      { label: 'Overload', rpe: 8.5, sets: 1, note: 'One extra set on each exercise. Leave 1–2 reps in the tank.' },
      { label: 'Peak', rpe: 9, sets: 1, note: 'Hardest week. Last set close to failure.' },
      { label: 'Deload', rpe: 6, sets: -99, deload: true, note: 'Recovery week: half the sets, about 10% lighter. You come back stronger.' }] },
    strength: { name: 'Strength', weeks: [
      { label: 'Volume', rpe: 7, sets: 0, reps: 2, note: 'More reps at moderate weight.' },
      { label: 'Build', rpe: 8, sets: 0, reps: 1, note: 'Slightly heavier, slightly fewer reps.' },
      { label: 'Intensity', rpe: 8.5, sets: 0, reps: 0, note: 'Heavy. Crisp reps, no grinding.' },
      { label: 'Peak', rpe: 9, sets: 0, reps: -1, pct: 2.5, note: 'Heaviest week. Try a top set.' },
      { label: 'Deload', rpe: 6, sets: -99, deload: true, note: 'Recovery week: half the sets, about 10% lighter.' }] }
  },
  block() {
    const b = Store.data.settings.block;
    if (!b || !b.start) return null;
    const def = this.BLOCKS[b.type] || this.BLOCKS.hypertrophy;
    const week = Math.floor((Date.now() - b.start) / (7 * 864e5));
    if (week >= def.weeks.length) return { done: true, type: b.type, name: def.name, total: def.weeks.length };
    return { ...def.weeks[week], week: week + 1, total: def.weeks.length, type: b.type, name: def.name };
  },
  countIfDone() { const b = this.block(); if (b && b.done) Store.data.settings.blocksDone = (Store.data.settings.blocksDone || 0) + 1; },
  startBlock(type) { this.countIfDone(); Store.data.settings.block = { type, start: startOfWeek() }; Store.save(true); },
  endBlock() { this.countIfDone(); delete Store.data.settings.block; Store.save(true); },

  // ---------- % of max
  // Training max = 90% of your best estimated 1RM in the last 8 weeks
  trainingMax(exId) {
    const since = Date.now() - 56 * 864e5;
    let best = 0;
    for (const s of Store.sessions(exId, 30)) if (s.date > since) best = Math.max(best, Coach.bestE1(s.sets));
    return best ? best * 0.9 : 0;
  },

  // Applied after the base suggestion (before readiness)
  apply(ex, t, s, hist) {
    if (!s || !s.sets || !hist.length) return s;
    const loaded = ex.type === 'wr' || ex.type === 'wbw';
    // % of max loading
    if (loaded && t.pct) {
      const tm = this.trainingMax(ex.id);
      if (tm) {
        const bump = (this.block() || {}).pct || 0;
        const w = Coach.roundW(tm * (t.pct + bump) / 100, ex);
        s = { ...s, kind: 'pct', title: `${t.pct + bump}% of your training max: ${w} ${U()}`, tag: (t.pct + bump) + '%',
          text: `Training max is ${Math.round(tm)} ${U()} (90% of your best estimated 1RM). Aim for ${t.repMax} reps per set${t.rpe ? ` at RPE ${t.rpe}` : ''}.`,
          sets: Array.from({ length: t.sets }, () => ({ w, r: t.repMax })) };
      }
    }
    // Training block week
    const b = this.block();
    if (b && !b.done) {
      let sets = s.sets.slice();
      if (b.deload) {
        sets = sets.slice(0, Math.max(1, Math.ceil(sets.length / 2))).map(x => ({ ...x, w: loaded && x.w ? Coach.roundW(x.w * 0.9, ex) : x.w, r: x.r }));
        s = { ...s, kind: 'deload', tag: 'deload week', title: `Deload week (week ${b.week} of ${b.total})`, text: b.note, sets };
      } else {
        if (b.sets > 0 && sets.length < 6) for (let i = 0; i < b.sets; i++) sets.push({ ...sets[sets.length - 1] });
        if (b.reps && loaded) sets = sets.map(x => ({ ...x, r: Math.max(1, (+x.r || 0) + b.reps) }));
        s = { ...s, sets, text: `${s.text} Week ${b.week} of ${b.total} (${b.label}): ${b.note}` };
      }
      s.rpeTarget = b.rpe;
    }
    if (t.rpe) s.rpeTarget = t.rpe;
    return s;
  },

  // ---------- Live RPE autoregulation: called when a set is completed
  // Easy set (2+ RPE under target) -> next sets +2.5%; grinder (1+ over) -> next sets -5%
  autoregulate(e, j) {
    const ex = Store.ex(e.exId), s = e.sets[j];
    if (!(ex.type === 'wr' || ex.type === 'wbw') || !s.rpe || !+s.w || s.type === 'W') return null;
    const target = (e.target && e.target.rpe) || (this.block() || {}).rpe || 8;
    const diff = +s.rpe - target;
    let k = 0;
    if (diff <= -2) k = 1.025; else if (diff >= 1) k = 0.95;
    if (!k) return null;
    const next = e.sets.slice(j + 1).filter(x => !x.done && x.type !== 'W');
    if (!next.length) return null;
    const w = Coach.roundW(+s.w * k, ex);
    if (w === +s.w) return null;
    next.forEach(x => { if (x.w === '' || x.w == null || +x.w === +s.w) { x.w = ''; x.p = { ...(x.p || {}), w }; } });
    return k > 1 ? `RPE ${s.rpe} was easy, so the next sets go up to ${w} ${U()}` : `RPE ${s.rpe} was very hard, so the next sets drop to ${w} ${U()}`;
  },

  // ---------- Program builder
  PATTERNS: {
    squat: ['squat_barbell', 'front_squat_barbell', 'hack_squat_machine', 'leg_press_machine', 'goblet_squat', 'bulgarian_split_squat_bodyweight', 'bodyweight_squat'],
    hinge: ['deadlift_barbell', 'romanian_deadlift_barbell', 'romanian_deadlift_dumbbell', 'kettlebell_swing', 'hip_thrust_barbell', 'glute_bridge', 'nordic_hamstring_curl'],
    lunge: ['bulgarian_split_squat', 'walking_lunge_dumbbell', 'split_squat', 'bulgarian_split_squat_bodyweight'],
    hpush: ['bench_press_barbell', 'bench_press_dumbbell', 'chest_press_machine', 'incline_bench_press_dumbbell', 'push_up'],
    ipush: ['incline_bench_press_barbell', 'incline_bench_press_dumbbell', 'chest_dip', 'pseudo_planche_push_up', 'diamond_push_up'],
    vpush: ['overhead_press_barbell', 'seated_shoulder_press_dumbbell', 'shoulder_press_machine', 'arnold_press_dumbbell', 'pike_push_up'],
    hpull: ['bent_over_row_barbell', 'dumbbell_row', 'seated_cable_row', 't_bar_row', 'pendlay_row_barbell'],
    vpull: ['pull_up_weighted', 'lat_pulldown_cable', 'pull_up', 'chin_up', 'band_assisted_pull_up', 'negative_pull_up'],
    quadIso: ['leg_extension_machine', 'bulgarian_split_squat', 'split_squat', 'shrimp_squat'],
    hamIso: ['lying_leg_curl_machine', 'seated_leg_curl_machine', 'romanian_deadlift_dumbbell', 'nordic_hamstring_curl', 'glute_bridge'],
    chestIso: ['cable_fly_crossovers', 'pec_deck_machine', 'chest_fly_dumbbell', 'push_up'],
    sideDelt: ['lateral_raise_dumbbell', 'lateral_raise_cable', 'upright_row_barbell', 'pike_push_up'],
    rearDelt: ['face_pull', 'reverse_pec_deck', 'rear_delt_fly_dumbbell'],
    biceps: ['bicep_curl_barbell', 'bicep_curl_dumbbell', 'hammer_curl_dumbbell', 'bicep_curl_cable', 'chin_up'],
    triceps: ['triceps_pushdown_cable', 'skullcrusher_ez_bar', 'overhead_triceps_extension_cable', 'triceps_dip', 'diamond_push_up'],
    calves: ['standing_calf_raise_machine', 'seated_calf_raise'],
    core: ['hanging_leg_raise', 'cable_crunch', 'ab_wheel_rollout', 'plank', 'hollow_body_hold', 'pallof_press']
  },
  ISOLATION: ['quadIso', 'hamIso', 'chestIso', 'sideDelt', 'rearDelt', 'biceps', 'triceps', 'calves', 'core'],
  SPLITS: {
    full2: [['Full body A', ['squat', 'hpush', 'hpull', 'hinge', 'sideDelt', 'core']], ['Full body B', ['hinge', 'vpush', 'vpull', 'lunge', 'biceps', 'triceps']]],
    full3: [['Full body A', ['squat', 'hpush', 'hpull', 'hamIso', 'sideDelt', 'core']], ['Full body B', ['hinge', 'vpush', 'vpull', 'lunge', 'triceps', 'calves']], ['Full body C', ['squat', 'ipush', 'hpull', 'hinge', 'biceps', 'rearDelt']]],
    ppl: [['Push', ['hpush', 'vpush', 'ipush', 'sideDelt', 'triceps', 'chestIso']], ['Pull', ['vpull', 'hpull', 'hinge', 'rearDelt', 'biceps', 'core']], ['Legs', ['squat', 'hinge', 'lunge', 'hamIso', 'calves', 'quadIso']]],
    ul: [['Upper A', ['hpush', 'hpull', 'vpush', 'vpull', 'biceps', 'triceps']], ['Lower A', ['squat', 'hinge', 'lunge', 'hamIso', 'calves', 'core']], ['Upper B', ['ipush', 'vpull', 'hpull', 'sideDelt', 'chestIso', 'rearDelt']], ['Lower B', ['hinge', 'squat', 'quadIso', 'hamIso', 'calves', 'core']]]
  },
  splitFor(days, level, goal) {
    if (days <= 2) return { key: 'full2', name: 'Full body' };
    if (days === 3) return goal === 'muscle' && level !== 'Beginner' ? { key: 'ppl', name: 'Push pull legs' } : { key: 'full3', name: 'Full body' };
    if (days === 4) return { key: 'ul', name: 'Upper lower' };
    if (days === 5) return { key: 'ul+ppl', name: 'Upper lower + push pull legs' };
    return { key: 'ppl2', name: 'Push pull legs twice' };
  },
  build({ goal = 'muscle', days = 3, minutes = 60, level = 'Intermediate' }) {
    const split = this.splitFor(days, level, goal);
    let templates;
    if (split.key === 'ul+ppl') templates = this.SPLITS.ul.slice(0, 2).concat(this.SPLITS.ppl);
    else if (split.key === 'ppl2') templates = this.SPLITS.ppl.map(([n, p]) => [n + ' A', p]).concat(this.SPLITS.ppl.map(([n, p]) => [n + ' B', p]));
    else templates = this.SPLITS[split.key];
    const perDay = minutes <= 30 ? 3 : minutes <= 45 ? 4 : minutes <= 60 ? 5 : 6;
    const usage = {}; // spread exercise choices so A/B days differ
    const pick = (pattern, variant) => {
      const opts = (this.PATTERNS[pattern] || []).map(id => Store.ex(id)).filter(ex => ex && ex.builtin && this.available(ex));
      if (!opts.length) return null;
      const lvl = level === 'Beginner' ? opts.filter(e => !/archer|one arm|pistol|planche|dragon|muscle up|snatch|clean/i.test(e.name)) : opts;
      const list = lvl.length ? lvl : opts;
      const sorted = list.slice().sort((a, b) => (usage[a.id] || 0) - (usage[b.id] || 0));
      const choice = variant && sorted.length > 1 && (usage[sorted[0].id] || 0) === (usage[sorted[1].id] || 0) ? sorted[1] : sorted[0];
      usage[choice.id] = (usage[choice.id] || 0) + 1;
      return choice;
    };
    const reps = (pattern, first) => {
      const iso = this.ISOLATION.includes(pattern);
      if (goal === 'strength') return first ? [3, 5] : iso ? [8, 12] : [5, 8];
      if (goal === 'general') return iso ? [10, 15] : [8, 12];
      return iso ? [10, 15] : [6, 10];
    };
    const routines = templates.map(([name, patterns], di) => {
      const exs = [];
      for (const pat of patterns) {
        if (exs.length >= perDay) break;
        const ex = pick(pat, /B$/.test(name));
        if (!ex || exs.some(x => x.exId === ex.id)) continue;
        const [lo, hi] = reps(pat, exs.length === 0);
        const isT = ex.type === 'dur';
        exs.push({ exId: ex.id, sets: exs.length === 0 && goal === 'strength' ? 4 : 3, repMin: isT ? 30 : lo, repMax: isT ? 60 : hi, rest: exs.length === 0 ? (goal === 'strength' ? 180 : 150) : this.ISOLATION.includes(pat) ? 75 : 120 });
      }
      return { name, exercises: exs };
    });
    const goalName = { muscle: 'muscle', strength: 'strength', general: 'fitness' }[goal] || goal;
    return { name: `My ${days}-day ${split.name.toLowerCase()} (${goalName})`, split: split.name, routines };
  }
};
