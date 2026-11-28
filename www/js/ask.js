'use strict';
// "Today" recommendation and the "Ask the coach" chat.
// Answers come from the app's own coach (works on every phone, offline). On phones with
// Gemini Nano (Android AICore), the on-device model rewrites the answer and handles free-text
// questions, grounded in the same facts. Nothing is sent anywhere.

const DAY = 864e5;
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const exIsFinger = ex => ex.type === 'climb' || ex.type === 'hang' || Climb.FINGER.includes(ex.id);

// Headline number for a finished workout, picked by what was trained (no more "0 kg" on a climbing day)
function workoutStat(w) {
  const vol = workoutVolume(w);
  if (vol > 0) return { icon: 'weight', text: `${fmtNum(vol)} ${U()}` };
  let climbs = 0, sends = 0, best = null, cat = 'boulder', km = 0, sets = 0;
  for (const e of w.exercises) {
    const ex = Store.ex(e.exId);
    for (const s of e.sets) {
      if (s.done === false) continue;
      sets++;
      if (ex.type === 'climb') {
        climbs++;
        const c = Climb.cat(ex), v = Climb.value(s.g, c);
        if (s.sent) { sends++; if (v != null && (best == null || v > best)) { best = v; cat = c; } }
      }
      if (ex.type === 'dist') km += +s.d || 0;
    }
  }
  if (climbs) return { icon: 'mountain', text: `${climbs} climb${climbs > 1 ? 's' : ''}${best != null ? ' · top ' + Climb.label(best, cat) : sends ? '' : ' · no sends'}` };
  if (km) return { icon: 'route', text: `${Math.round(km * 10) / 10} km` };
  return { icon: 'list-check', text: `${sets} set${sets === 1 ? '' : 's'}` };
}

// Does this person lift weights? (decides whether volume in kg is worth showing)
function liftsWeights(days = 56) {
  const since = Date.now() - days * DAY;
  return Store.data.workouts.some(w => w.start > since && workoutVolume(w) > 0);
}

const Today = {
  nextRoutine() {
    const d = Store.data; if (!d.routines.length) return null;
    const g = routineGroups(d).find(x => x.next);
    const r = g ? d.routines.find(x => x.id === g.next) : null;
    return r ? { r, group: g.name } : null;
  },
  musclesOf(r) {
    const m = new Set();
    r.exercises.forEach(e => { const ex = Store.ex(e.exId); if (MUSCLES[ex.muscle] && !['cardio', 'mobility', 'full_body'].includes(ex.muscle)) m.add(ex.muscle); });
    return [...m];
  },
  // One clear answer to "what should I do today?"
  get(now = Date.now()) {
    const d = Store.data, ci = Store.latestCheckin(), score = ci ? ci.score : null;
    const doneToday = d.workouts.filter(w => sameDay(w.start, now));
    const nx = this.nextRoutine();
    const rec = Coach.recovery(now, true);
    const fd = Climb.fingerDays(now), lr = Climb.loadRatio(now);
    const thisWeek = d.workouts.filter(w => w.start > startOfWeek()).length, goal = d.settings.weekGoal || 3;
    const base = { routine: nx ? nx.r : null, score, thisWeek, goal };
    if (doneToday.length) return { ...base, kind: 'done', title: 'You trained today', text: `${doneToday.map(w => w.name).join(' and ')} is logged. Recovery starts now: protein with your next meal and 7–9 hours of sleep.` };
    if (!nx) return { ...base, kind: 'none', title: d.workouts.length ? 'No routine planned' : 'Start here', text: d.workouts.length ? 'Pick a program or make a routine and the coach will plan each day.' : 'Pick a ready-made program, or start an empty workout and log as you go.' };
    const r = nx.r, mus = this.musclesOf(r), sore = mus.filter(m => rec.pct[m] < 60);
    const fingers = r.exercises.some(e => exIsFinger(Store.ex(e.exId)));
    const ready = m => (rec.pct[m] == null ? 100 : rec.pct[m]) >= 75;
    const alt = () => d.routines.find(x => x.id !== r.id && this.musclesOf(x).every(ready) && !(fingers && fd >= 2 && x.exercises.some(e => exIsFinger(Store.ex(e.exId)))));
    if (score != null && score < 45) return { ...base, kind: 'rest', title: 'Take it easy today', text: `Readiness is ${score}/100. A walk, mobility or an easy session will do more for you than a hard one. ${r.name} can wait for tomorrow.` };
    if (fingers && fd >= 3) return { ...base, kind: 'rest', title: 'Rest your fingers', text: `${fd} days in a row on your fingers. Pulleys recover slower than muscles, so take today off climbing.${alt() ? ` If you want to train, do ${alt().name}.` : ''}`, alt: alt() };
    if (fingers && lr && lr.ratio > 1.5) return { ...base, kind: 'easy', title: `${r.name}, but easy`, text: `This week's climbing load is ${lr.ratio}× your usual. Big jumps are when finger injuries happen, so keep today to moderate climbs and skip limit attempts.` };
    if (mus.length && sore.length >= Math.ceil(mus.length / 2)) {
      const a = alt(), names = sore.map(m => MUSCLES[m].toLowerCase()).join(', ');
      return { ...base, kind: 'easy', title: a ? `Do ${a.name} instead` : `${r.name}, lighter`, text: a ? `Your ${names} are still recovering, so swap in ${a.name} today. ${r.name} stays next in line.` : `Your ${names} are still recovering. Do ${r.name} with one fewer set per exercise.`, alt: a };
    }
    const why = [score != null ? `readiness ${score}` : '', mus.length ? `${mus.length === 1 ? MUSCLES[mus[0]].toLowerCase() + ' is' : 'the muscles it uses are'} recovered` : '', thisWeek < goal ? `${thisWeek} of ${goal} this week` : ''].filter(Boolean).join(', ');
    return { ...base, kind: 'go', title: `${r.name} today`, text: (score != null && score >= 85 ? 'You\'re primed, a good day to push for records. ' : 'Good to train as planned. ') + (why ? `(${why})` : '') };
  }
};

const Ask = {
  TOPICS: [
    ['today', 'What should I do today?', 'calendar-event'],
    ['progress', 'Am I making progress?', 'trending-up'],
    ['stuck', 'Where am I stuck?', 'alert-triangle'],
    ['recovery', 'What needs rest?', 'bed'],
    ['climb', 'How do I climb harder?', 'mountain'],
    ['week', 'How is my week going?', 'calendar-stats']
  ],
  nano: 'unknown', // unknown | unavailable | downloadable | downloading | available
  history: [],

  plugin() { return window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.Nano; },
  async init() {
    const p = this.plugin();
    if (!p) { this.nano = 'unavailable'; return; }
    try {
      const r = await p.status(); this.nano = r.status || 'unavailable';
      if (!this._listening && p.addListener) { this._listening = true; p.addListener('download', e => { if (e.state === 'done') this.nano = 'available'; else if (/^failed/.test(e.state)) this.nano = 'downloadable'; else this.nano = 'downloading'; if (UI.top() && UI.top().key === 'ask') UI.refreshSheet(); }); }
    } catch (e) { this.nano = 'unavailable'; }
  },
  async download() { const p = this.plugin(); if (!p) return; this.nano = 'downloading'; try { await p.download(); } catch (e) { this.nano = 'downloadable'; toast('Couldn\'t start the download. Check your connection.'); } },

  // Map a free-text question to a topic
  match(q) {
    const s = (q || '').toLowerCase();
    const rules = [['climb', /climb|boulder|grade|v\d|route|project|finger|hang|crimp|send/], ['recovery', /rest|sore|recover|tired|fatigue|sleep|hurt/], ['stuck', /stuck|plateau|stall|not (improv|progress)|weak/],
      ['progress', /progress|improv|better|stronger|gain|pr\b|record/], ['week', /week|volume|how much|enough|often/], ['today', /today|now|should i|what.*(do|train)|workout/]];
    const hit = rules.find(([, re]) => re.test(s));
    return hit ? hit[0] : null;
  },

  // ---- Facts about the user, in plain sentences (shared by local answers and the AI prompt)
  facts() {
    const d = Store.data, s = d.settings, ws = Store.workoutsSorted(), out = [];
    out.push(`Units: ${U()}.${s.bodyweight ? ` Body weight: ${s.bodyweight} ${U()}.` : ''}`);
    out.push(`Workouts logged: ${ws.length}. This week: ${ws.filter(w => w.start > startOfWeek()).length} of a ${s.weekGoal} goal. Week streak: ${weekStreak()}.`);
    const ci = Store.latestCheckin(); if (ci) out.push(`Readiness today: ${ci.score}/100.`);
    if (d.health && d.health.sleepH) out.push(`Sleep last night: ${d.health.sleepH} h.`);
    ws.slice(0, 5).forEach(w => out.push(`${fmtDate(w.start)}: ${w.name}, ${Math.round(((w.end || w.start) - w.start) / 60000)} min, ${workoutStat(w).text}. Exercises: ${w.exercises.slice(0, 5).map(e => Store.ex(e.exId).name).join(', ')}.`));
    const rec = Coach.recovery(Date.now(), true), sore = Object.entries(rec.pct).filter(([m, p]) => p < 80 && MUSCLES[m]).map(([m, p]) => `${MUSCLES[m]} ${p}%`);
    out.push(sore.length ? `Still recovering: ${sore.join(', ')}.` : 'All muscles recovered.');
    const lifts = topLifts().slice(0, 5); if (lifts.length) out.push(`Best lifts (estimated 1RM): ${lifts.map(l => `${Store.ex(l.exId).name} ${Math.round(l.e1)} ${U()}`).join(', ')}.`);
    ['boulder', 'route'].forEach(cat => { const st = Climb.stats(cat, 90); if (st && st.max != null) out.push(`${cat === 'boulder' ? 'Bouldering' : 'Routes'} (90 days): hardest send ${Climb.label(st.max, cat)}, flash ${Climb.label(st.flash, cat)}, top-5 average ${Climb.label(st.top5, cat)}, send rate ${Math.round(st.sendRate * 100)}%, ${st.sessions} sessions.`); });
    const lr = Climb.loadRatio(); if (lr) out.push(`Climbing load this week: ${lr.ratio}× the 4-week average.`);
    const fd = Climb.fingerDays(); if (fd) out.push(`Days in a row on fingers: ${fd}.`);
    const ph = Climb.phase(); if (ph) out.push(`Climbing plan phase: ${ph.name}, week ${ph.week} of 4.`);
    Coach.insights().slice(0, 5).forEach(i => out.push('Coach note: ' + i.text));
    const t = Today.get(); out.push(`Today's plan: ${t.title}. ${t.text}`);
    return out;
  },

  // ---- Answers from the app's own coach
  local(topic) {
    const d = Store.data, ws = Store.workoutsSorted(), now = Date.now();
    if (!ws.length && topic !== 'today') return 'Log a couple of workouts first. Once there is some history, I can tell you how you are progressing, what needs rest and where you are stuck.';
    if (topic === 'today') {
      const t = Today.get(), r = t.alt || t.routine, lines = [`${t.title}. ${t.text}`];
      if (r && (t.kind === 'go' || t.kind === 'easy')) r.exercises.slice(0, 4).forEach(e => { const s = Coach.suggest(e.exId, e.target); lines.push(`• ${Store.ex(e.exId).name}: ${s.title}`); });
      return lines.join('\n');
    }
    if (topic === 'recovery') {
      const rec = Coach.recovery(now, true), list = Object.entries(rec.pct).filter(([m, p]) => p < 95 && MUSCLES[m] && !['cardio', 'mobility', 'full_body'].includes(m)).sort((a, b) => a[1] - b[1]);
      const fd = Climb.fingerDays(now);
      const lines = list.length ? list.map(([m, p]) => `• ${MUSCLES[m]}: ${p}% recovered${rec.left[m] ? `, ready in about ${rec.left[m] >= 24 ? Math.round(rec.left[m] / 24 * 10) / 10 + ' days' : rec.left[m] + ' h'}` : ''}`) : ['Everything is recovered. A good day for a hard session.'];
      if (fd >= 2) lines.push(`Fingers: ${fd} days in a row. ${fd >= 3 ? 'Take a rest day from climbing and hangs.' : 'One more day is fine, then rest.'}`);
      const ci = Store.latestCheckin(); if (ci && ci.score < 55) lines.push(`Readiness is ${ci.score}/100, so go easier than planned.`);
      return lines.join('\n');
    }
    if (topic === 'week') {
      const wk = ws.filter(w => w.start > startOfWeek()), goal = d.settings.weekGoal, mins = Math.round(wk.reduce((a, w) => a + ((w.end || w.start) - w.start) / 60000, 0));
      const lines = [`${wk.length} of ${goal} workouts so far, ${Math.floor(mins / 60)} h ${mins % 60} min in total.${wk.length >= goal ? ' Goal reached, nice.' : ` ${goal - wk.length} to go.`}`];
      const lr = Climb.loadRatio(now); if (lr) lines.push(`Climbing load is ${lr.ratio}× your 4-week average${lr.ratio > 1.5 ? ', a big jump. Keep the rest of the week easy.' : lr.ratio < 0.7 ? ', a light week.' : ', a steady build.'}`);
      if (liftsWeights(14)) { const v = Coach.weeklySets(), low = ['chest', 'lats', 'upper_back', 'quads', 'hamstrings'].filter(m => (v[m] || 0) < 6); if (low.length) lines.push(`Low weekly sets for ${low.map(m => MUSCLES[m].toLowerCase()).join(', ')}. Around 10 hard sets a week per muscle is a good target.`); }
      return lines.join('\n');
    }
    if (topic === 'progress') {
      const span = 28 * DAY, a = ws.filter(w => w.start > now - span), b = ws.filter(w => w.start <= now - span && w.start > now - 2 * span);
      const lines = [`Last 4 weeks: ${a.length} workouts (the 4 weeks before: ${b.length}).`];
      const prs = a.reduce((s, w) => s + (w.prs || 0), 0); if (prs) lines.push(`${prs} personal record${prs > 1 ? 's' : ''} in that time.`);
      const va = a.reduce((s, w) => s + workoutVolume(w), 0), vb = b.reduce((s, w) => s + workoutVolume(w), 0);
      if (va && vb) lines.push(`Lifting volume ${va >= vb ? 'up' : 'down'} ${Math.abs(Math.round((va / vb - 1) * 100))}%.`);
      ['boulder', 'route'].forEach(cat => {
        const now30 = Climb.stats(cat, 30), all = Climb.stats(cat, 120);
        if (now30 && now30.top5 != null && all && all.top5 != null) lines.push(`${cat === 'boulder' ? 'Bouldering' : 'Routes'}: top-5 average ${Climb.label(now30.top5, cat)} this month vs ${Climb.label(all.top5, cat)} over 4 months${now30.top5 > all.top5 + 0.2 ? ', so you are climbing harder.' : now30.top5 < all.top5 - 0.5 ? ', a dip. Normal in a base or tired phase.' : ', holding steady.'}`);
      });
      Coach.insights().filter(i => i.tone === 'success').slice(0, 3).forEach(i => lines.push('• ' + i.text));
      if (lines.length === 1) lines.push('Keep logging. Trends need about 3 weeks of data.');
      return lines.join('\n');
    }
    if (topic === 'stuck') {
      const lines = Coach.insights().filter(i => i.tone === 'warning' || /flat|deload|reduce/i.test(i.text)).slice(0, 4).map(i => '• ' + i.text);
      ['boulder', 'route'].forEach(cat => Climb.projects(cat).filter(p => p.sessions >= 3).slice(0, 2).forEach(p => lines.push(`• ${p.g} project: ${p.tries} tries over ${p.sessions} sessions, best high point ${Math.round(p.best * 100)}%. Break it into sections, rest 3–5 minutes between goes, and try it first in the session while fresh.`)));
      const pr = Climb.profile(); if (pr.level) pr.advice.filter(a => a.tone === 'warn').forEach(a => lines.push('• ' + a.text));
      return lines.length ? lines.join('\n') : 'Nothing looks stuck right now. Lifts are moving and nothing has stalled for 3 sessions.';
    }
    if (topic === 'climb') {
      const pr = Climb.profile(), lines = [];
      if (pr.level) lines.push(`You climb about ${Climb.label(pr.level.v, pr.level.cat)} (top-5 average).`);
      pr.advice.forEach(a => lines.push('• ' + a.text));
      const ph = Climb.phase(); if (ph) lines.push(`Plan phase: ${ph.name} (week ${ph.week} of 4). ${ph.desc}`);
      else lines.push('• Build a climbing plan (Train > Climbing > Climbing coach) for 4-week phases that rotate base, strength, power and performance.');
      return lines.join('\n');
    }
    return this.local('today');
  },

  // What the user says beats the estimate
  caveat(q) {
    const s = (q || '').toLowerCase(), NL = String.fromCharCode(10);
    if (/pain|hurt|injur|\bpop|tweak|swell|numb/.test(s)) return 'Sharp pain, a pop, swelling or numbness is a reason to stop and see a physio, not to train through. Soreness is different.' + NL;
    const m = Object.entries(MUSCLES).find(([k, n]) => s.includes(n.toLowerCase()) || s.includes(k.replace('_', ' ')) || (k === 'forearms' && /finger|forearm|grip/.test(s)));
    if (/sore|tired|stiff|achy|fatigued/.test(s)) return `If your ${m ? m[1].toLowerCase() : 'muscles'} feel sore, trust that over the estimate below: train something else today or keep it light.` + NL;
    return '';
  },

  prompt(q, topic) {
    return `You are a friendly, direct strength and climbing coach inside a training app. Answer the user's question using ONLY the facts below. If the facts don't cover something, say so and suggest what to log. Never invent numbers or exercises the user hasn't done. For pain or injury, recommend seeing a physio. Reply in at most 110 words, plain text, short sentences, no headings.

FACTS:
${this.facts().map(f => '- ' + f).join('\n')}
${topic ? `\nTHE APP'S COACH SAYS:\n${this.local(topic)}\n` : ''}
QUESTION: ${q}
ANSWER:`;
  },

  async ask(q, topicHint) {
    const topic = topicHint || this.match(q);
    const local = topic ? this.local(topic) : null;
    if (this.nano === 'available') {
      try {
        const r = await this.plugin().generate({ prompt: this.prompt(q, topic), temperature: 0.3, maxTokens: 260 });
        const text = (r.text || '').trim();
        if (text) return { text, src: 'nano', topic };
      } catch (e) {
        const msg = String(e && e.message || e);
        if (/unavailable/.test(msg)) this.nano = 'unavailable';
        if (local) return { text: local, src: 'coach', topic, note: /busy|quota/.test(msg) ? 'On-device AI is busy, so this is the built-in coach.' : '' };
        return { text: 'The on-device AI couldn\'t answer right now. Try one of the questions below.', src: 'coach' };
      }
    }
    if (local) return { text: this.caveat(q) + local, src: 'coach', topic };
    return { text: 'I can answer these from your training data: ' + this.TOPICS.map(t => t[1].toLowerCase()).join(' · '), src: 'coach' };
  }
};

// ---- Screens and actions for the coach chat
Object.assign(UI, {
  todayCard() {
    const t = Today.get(), r = t.alt || t.routine;
    const tone = { go: 'go', easy: 'easy', rest: 'rest', done: 'done', none: 'none' }[t.kind];
    const ic = { go: 'player-play', easy: 'feather', rest: 'bed', done: 'circle-check', none: 'compass' }[t.kind];
    const btn = (t.kind === 'go' || t.kind === 'easy') && r ? `<button class="btn primary" data-a="startRoutine" data-id="${r.id}">${icon('player-play')} Start ${esc(r.name)}</button>`
      : t.kind === 'none' ? `<button class="btn primary" data-a="programs">${icon('books')} Programs</button>`
      : t.kind === 'rest' ? `<button class="btn" data-a="discipline" data-id="mobility">${icon('stretching')} Easy mobility</button>` : '';
    return `<div class="card today today-${tone}"><div class="today-head">${icon(ic, 'today-ic')}<div><div class="muted sm">Today</div><b>${esc(t.title)}</b></div></div>
      <div class="sm">${esc(t.text)}</div>
      <div class="today-actions">${btn}<button class="btn" data-a="ask">${icon('message-chatbot')} Ask coach</button></div></div>`;
  },

  openAsk(topic) {
    Ask.init().then(() => { if (this.top() && this.top().key === 'ask') this.refreshSheet(); });
    if (topic && !this._askBusy) this.askRun(Ask.TOPICS.find(x => x[0] === topic)[1], topic);
    this.openSheet('ask', 'Ask the coach', () => {
      const n = Ask.nano, ai = n === 'available';
      const msgs = Ask.history.map(m => `<div class="msg me">${esc(m.q)}</div>${m.a ? `<div class="msg coach">${esc(m.a.text).replace(/\n/g, '<br>')}<div class="msg-src">${m.a.src === 'nano' ? `${icon('cpu')} Gemini Nano, on this phone. AI can be wrong; numbers come from your log.` : `${icon('sparkles')} Built-in coach`}${m.a.note ? ' · ' + esc(m.a.note) : ''}</div></div>` : `<div class="msg coach typing"><span></span><span></span><span></span></div>`}`).join('');
      return `${!Ask.history.length ? `<div class="ask-intro">${icon('message-chatbot', 'ask-ic')}<div><b>Ask about your training</b><div class="sm muted">Answers use your own log, recovery and check-ins. Everything stays on this phone.</div></div></div>` : ''}
        <div class="msgs" id="msgs">${msgs}</div>
        <div class="ask-topics">${Ask.TOPICS.map(([k, l, ic]) => `<button class="ask-chip" data-a="askTopic" data-id="${k}" ${this._askBusy ? 'disabled' : ''}>${icon(ic)}<span>${l}</span></button>`).join('')}</div>
        ${n === 'downloadable' ? `<div class="card sm"><b>${icon('cpu')} On-device AI available</b><div class="muted">This phone supports Gemini Nano. Download it (once, via Android) for free-form answers.</div><button class="btn sm primary" data-a="nanoDownload">Download Gemini Nano</button></div>` : ''}
        ${n === 'downloading' ? `<div class="sm muted center">${icon('download')} Gemini Nano is downloading in the background. The built-in coach answers meanwhile.</div>` : ''}
        ${!ai && n !== 'downloadable' && n !== 'downloading' ? `<div class="sm muted center" style="margin-top:8px">${n === 'unknown' ? 'Checking for on-device AI…' : 'Typed questions are matched to the topics above. Phones with Gemini Nano (such as Galaxy S25/S26 and Pixel 9 or newer) get free-form answers.'}</div>` : ''}`;
    }, {
      footer: () => `<form class="ask-bar" data-a-submit="askSend"><input id="askQ" type="text" enterkeyhint="send" autocomplete="off" placeholder="${Ask.nano === 'available' ? 'Ask anything about your training' : 'Ask, e.g. what needs rest?'}" ${this._askBusy ? 'disabled' : ''}><button class="icon-btn primary" data-a="askSend" aria-label="Send" ${this._askBusy ? 'disabled' : ''}>${icon('send')}</button></form>`,
      mount: () => { const m = $('#msgs'); if (m && m.lastElementChild) m.lastElementChild.scrollIntoView({ block: 'end' }); }
    });
  },
  async askRun(q, topic) {
    q = (q || '').trim(); if (!q || this._askBusy) return;
    const item = { q, a: null }; Ask.history.push(item); if (Ask.history.length > 20) Ask.history.shift();
    this._askBusy = true; if (this.top() && this.top().key === 'ask') this.refreshSheet();
    try { item.a = await Ask.ask(q, topic); } catch (e) { item.a = { text: 'Something went wrong answering that.', src: 'coach' }; }
    this._askBusy = false;
    if (this.top() && this.top().key === 'ask') this.refreshSheet();
  }
});

Object.assign(Actions, {
  ask() { this.openAsk(); },
  askTopic(el, d) { this.askRun(Ask.TOPICS.find(x => x[0] === d.id)[1], d.id); },
  askSend() { const i = $('#askQ'); if (i && i.value.trim()) { const q = i.value; i.value = ''; this.askRun(q); } },
  nanoDownload() { Ask.download().then(() => this.refreshSheet()); this.refreshSheet(); }
});

// Enter in the chat box sends instead of reloading the page
document.addEventListener('submit', e => { const f = e.target; if (f.dataset && f.dataset.aSubmit) { e.preventDefault(); const fn = Actions[f.dataset.aSubmit]; if (fn) fn.call(UI, f, f.dataset); } });
