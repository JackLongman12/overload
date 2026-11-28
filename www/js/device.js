// Device features: keep screen awake, Health Connect (watches), Bluetooth scale and heart-rate straps.
'use strict';

// ---------- Keep the screen on during workouts and timers
const Wake = {
  on: false, sentinel: null,
  async set(want) {
    if (Store.data.settings.keepAwake === false) want = false;
    if (want === this.on) return;
    this.on = want;
    const ka = Plugin('KeepAwake');
    try {
      if (ka) { want ? await ka.keepAwake() : await ka.allowSleep(); return; }
      if (want && navigator.wakeLock) this.sentinel = await navigator.wakeLock.request('screen');
      else if (!want && this.sentinel) { await this.sentinel.release(); this.sentinel = null; }
    } catch (e) { this.on = false; }
  }
};

function openExternal(url) {
  const br = Plugin('Browser');
  if (br) br.open({ url }); else window.open(url, '_blank', 'noopener');
}

// ---------- Health Connect (Samsung, Pixel/Fitbit, Xiaomi, Amazfit, Garmin, many Honor watches)
const HC = {
  READ: ['sleep', 'restingHeartRate', 'heartRateVariability', 'heartRate', 'weight', 'bodyFat', 'steps', 'workouts'],
  WRITE: ['weight', 'bodyFat'],
  get api() { return Cap() && window.capacitorHealth ? window.capacitorHealth.Health : null; },
  get on() { return !!Store.data.settings.healthConnect && !!this.api; },
  iso: t => new Date(t).toISOString(),

  async available() {
    if (!this.api) return { available: false, reason: 'Only available in the Android app.' };
    try { return await this.api.isAvailable(); } catch (e) { return { available: false, reason: e.message }; }
  },
  async connect() {
    const a = await this.available();
    if (!a.available) throw new Error(a.reason || "Health Connect isn't available. On Android 13 or older, install Health Connect from the Play Store.");
    const r = await this.api.requestAuthorization({ read: this.READ, write: this.WRITE });
    Store.data.settings.healthConnect = (r.readAuthorized || []).length > 0;
    Store.save(true);
    if (Store.data.settings.healthConnect) await this.pull();
    return r;
  },
  disconnect() { Store.data.settings.healthConnect = false; Store.save(true); },
  openSettings() { try { return this.api.openHealthConnectSettings(); } catch (e) { } },

  // Apps that write sleep to Health Connect. When several track the same night,
  // a dedicated sleep app wins over a watch app, unless you pick a source.
  SLEEP_APPS: { 'com.urbandroid.sleep': 'Sleep as Android', 'com.sec.android.app.shealth': 'Samsung Health', 'com.fitbit.FitbitMobile': 'Fitbit',
    'com.google.android.apps.fitness': 'Google Fit', 'com.ouraring.oura': 'Oura', 'com.garmin.android.apps.connectmobile': 'Garmin Connect', 'com.mi.health': 'Mi Fitness',
    'com.xiaomi.wearable': 'Mi Fitness', 'com.huami.watch.hmwatchmanager': 'Zepp', 'com.huawei.health': 'Huawei Health', 'com.hihonor.health': 'Honor Health', 'com.withings.wiscale2': 'Withings', 'com.whoop.android': 'WHOOP' },
  SLEEP_PRIORITY: ['com.urbandroid.sleep', 'com.ouraring.oura', 'com.whoop.android', 'com.sec.android.app.shealth', 'com.fitbit.FitbitMobile', 'com.garmin.android.apps.connectmobile'],
  appName(id, name) { return this.SLEEP_APPS[id] || (name && name !== id ? name : (id || 'Unknown app')); },

  // Last night from raw sleep sessions: one source, the main sleep plus pieces close to it,
  // time asleep, stage minutes, efficiency and an estimated quality (1 to 5).
  summarizeSleep(samples, now = Date.now(), pref = 'auto') {
    const recent = (samples || []).filter(s => { const e = Date.parse(s.endDate); return e > now - 30 * 3600e3 && e <= now + 600e3; });
    if (!recent.length) return null;
    const groups = {};
    recent.forEach(s => { const k = s.sourceId || s.sourceName || 'unknown'; (groups[k] = groups[k] || []).push(s); });
    const dur = s => (Date.parse(s.endDate) - Date.parse(s.startDate)) / 60000;
    const ids = Object.keys(groups), total = k => groups[k].reduce((a, s) => a + dur(s), 0);
    let src = pref && pref !== 'auto' && groups[pref] ? pref : this.SLEEP_PRIORITY.find(k => groups[k]);
    if (!src) src = ids.sort((a, b) => total(b) - total(a))[0];
    // Main sleep = longest session; pieces within 3 hours of it belong to the same night (not naps)
    const list = groups[src].slice().sort((a, b) => dur(b) - dur(a)), main = list[0];
    let start = Date.parse(main.startDate), end = Date.parse(main.endDate);
    const night = list.filter(s => Date.parse(s.startDate) < end + 3 * 3600e3 && Date.parse(s.endDate) > start - 3 * 3600e3);
    night.forEach(s => { start = Math.min(start, Date.parse(s.startDate)); end = Math.max(end, Date.parse(s.endDate)); });
    const m = { asleep: 0, deep: 0, rem: 0, light: 0, awake: 0 };
    let staged = false;
    night.forEach(s => {
      if (s.stages && s.stages.length) {
        staged = true;
        s.stages.forEach(st => { const k = st.stage, mins = +st.durationMinutes || 0; if (k === 'awake' || k === 'inBed') m.awake += mins; else { m.asleep += mins; if (m[k] != null) m[k] += mins; } });
      } else if (s.sleepState === 'awake' || s.sleepState === 'inBed') m.awake += dur(s);
      else m.asleep += dur(s);
    });
    if (m.asleep <= 0) return null;
    const out = { sleepH: Math.round(m.asleep / 6) / 10, start, end, source: this.appName(src, groups[src][0].sourceName), sourceId: src,
      sources: ids.map(k => ({ id: k, name: this.appName(k, groups[k][0].sourceName) })) };
    if (staged) {
      const inBed = m.asleep + m.awake, detail = m.deep + m.rem > 0;
      out.deepMin = Math.round(m.deep); out.remMin = Math.round(m.rem); out.awakeMin = Math.round(m.awake);
      out.eff = inBed ? Math.round(m.asleep / inBed * 100) / 100 : null;
      let q = 3;
      if (detail) { const share = (m.deep + m.rem) / m.asleep; q += share >= 0.45 ? 1 : share < 0.3 ? -1 : 0; out.restorative = Math.round(share * 100); }
      if (out.eff != null) q += out.eff >= 0.9 ? 1 : out.eff < 0.8 ? -1 : 0;
      if (m.awake >= 60) q -= 1;
      if (m.asleep < 300) q -= 1;
      out.quality = Math.max(1, Math.min(5, q));
    }
    return out;
  },

  // Lowest heart rate while asleep (average of the 3 lowest readings). Used when the
  // watch app (Samsung Health, for example) doesn't write resting heart rate.
  sleepingHR(samples) {
    const v = (samples || []).map(s => +s.value).filter(x => x > 25 && x < 200).sort((a, b) => a - b);
    if (v.length < 5) return null;
    const low = v.slice(0, 3);
    return Math.round(low.reduce((a, b) => a + b, 0) / low.length);
  },

  // One line per day so baselines and sleep averages work for any app
  logDay(h) {
    const d = Store.data, day = new Date(h.at).toISOString().slice(0, 10);
    d.healthLog = (d.healthLog || []).filter(x => x.day !== day);
    d.healthLog.push({ day, sleepH: h.sleepH || null, quality: h.sleepQ || null, rhr: h.rhr ? h.rhr.latest : null, hrv: h.hrv ? h.hrv.latest : null });
    d.healthLog = d.healthLog.sort((a, b) => a.day < b.day ? -1 : 1).slice(-45);
  },
  // Average over the previous days (not today)
  logAvg(key, days, today = new Date().toISOString().slice(0, 10)) {
    const v = (Store.data.healthLog || []).filter(x => x.day < today && x[key] != null).slice(-days).map(x => x[key]);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  },
  async read(dataType, fromMs, limit = 200) {
    try { const r = await this.api.readSamples({ dataType, startDate: this.iso(fromMs), endDate: this.iso(Date.now()), limit }); return r.samples || []; }
    catch (e) { return []; }
  },

  // Pulls the numbers the coach uses, plus weight and watch cardio sessions
  async pull() {
    if (!this.on) return null;
    const now = Date.now(), d = Store.data, h = {};
    // Last night's sleep from one app (Sleep as Android, Samsung Health, a watch app...)
    const night = this.summarizeSleep(await this.read('sleep', now - 42 * 3600e3, 300), now, d.settings.sleepSource || 'auto');
    if (night) {
      h.sleepH = night.sleepH; h.sleepQ = night.quality || null; h.sleep = night;
      d.settings.sleepSources = night.sources; // remembered for the source picker
    }
    // Resting heart rate and HRV vs your 2-week baseline
    const base = async type => {
      const s = (await this.read(type, now - 15 * 864e5, 200)).sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate));
      if (!s.length) return null;
      const prev = s.slice(1).map(x => x.value);
      return { latest: Math.round(s[0].value), base: prev.length ? Math.round(prev.reduce((a, b) => a + b, 0) / prev.length) : null, fresh: now - Date.parse(s[0].startDate) < 36 * 3600e3 };
    };
    h.rhr = await base('restingHeartRate');
    h.hrv = await base('heartRateVariability');
    // No resting HR from the watch app: use the lowest heart rate during last night's sleep
    if ((!h.rhr || !h.rhr.fresh) && night) {
      const shr = this.sleepingHR(await this.read('heartRate', night.start, 3000).then(x => x.filter(s => Date.parse(s.startDate) <= night.end)));
      if (shr) { const b = this.logAvg('rhr', 14); h.rhr = { latest: shr, base: b ? Math.round(b) : null, fresh: true, sleeping: true }; }
    }
    if (h.hrv && !h.hrv.base) { const b = this.logAvg('hrv', 14); if (b) h.hrv.base = Math.round(b); }
    if (h.rhr && !h.rhr.base) { const b = this.logAvg('rhr', 14); if (b) h.rhr.base = Math.round(b); }
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    h.steps = Math.round((await this.read('steps', midnight.getTime(), 1000)).reduce((a, s) => a + (s.value || 0), 0));
    // Weight and body fat from other apps and scales
    const toUnit = kg => d.settings.unit === 'lb' ? Math.round(kg / 0.45359237 * 10) / 10 : Math.round(kg * 10) / 10;
    const have = new Set(d.measurements.map(m => m.id)), del = d.deleted || {};
    for (const s of await this.read('weight', now - 60 * 864e5, 200)) {
      const id = 'hc_' + (s.platformId || s.startDate);
      if (have.has(id) || del[id] || (s.sourceId || '').includes('com.overload.gym')) continue;
      d.measurements.push({ id, date: Date.parse(s.startDate), weight: toUnit(s.value), source: s.sourceName || 'Health Connect' }); have.add(id);
    }
    for (const s of await this.read('bodyFat', now - 60 * 864e5, 200)) {
      const id = 'hcbf_' + (s.platformId || s.startDate);
      if (have.has(id) || del[id] || (s.sourceId || '').includes('com.overload.gym')) continue;
      d.measurements.push({ id, date: Date.parse(s.startDate), bodyfat: Math.round(s.value * 10) / 10, source: s.sourceName || 'Health Connect' }); have.add(id);
    }
    h.imported = await this.importWorkouts(now - 30 * 864e5);
    h.at = now;
    d.health = h;
    this.logDay(h);
    h.sleepAvg3 = this.logAvg('sleepH', 3);
    Store.save(true);
    return h;
  },

  WORKOUT_MAP: { running: 'running', runningTreadmill: 'treadmill_run', walking: 'walking', hiking: 'hiking', cycling: 'cycling', bikingStationary: 'stationary_bike',
    swimming: 'swimming', swimmingPool: 'swimming', swimmingOpenWater: 'swimming', rowing: 'rowing_machine', rowingMachine: 'rowing_machine', elliptical: 'elliptical',
    stairClimbing: 'stair_climber', stairClimbingMachine: 'stair_climber', yoga: 'yoga_session', boxing: 'heavy_bag_rounds', kickboxing: 'heavy_bag_rounds', martialArts: 'bjj_rolling',
    highIntensityIntervalTraining: 'interval_session', jumpRope: 'jump_rope', climbing: 'bouldering', rockClimbing: 'bouldering' },

  // Cardio sessions recorded on the watch show up in your history
  async importWorkouts(fromMs) {
    let list = [];
    try { list = (await this.api.queryWorkouts({ startDate: this.iso(fromMs), endDate: this.iso(Date.now()), limit: 100 })).workouts || []; } catch (e) { return 0; }
    const d = Store.data, have = new Set(d.workouts.map(w => w.id)), del = d.deleted || {};
    let n = 0;
    for (const w of list) {
      const exId = this.WORKOUT_MAP[w.workoutType];
      const id = 'hc_' + (w.platformId || w.startDate);
      if (!exId || have.has(id) || del[id] || (w.sourceId || '').includes('com.overload.gym')) continue;
      const start = Date.parse(w.startDate), end = Date.parse(w.endDate), ex = Store.ex(exId);
      const secs = Math.round(w.duration || (end - start) / 1000);
      const set = ex.type === 'dist' ? { type: 'N', d: w.totalDistance ? Math.round(w.totalDistance / 10) / 100 : '', t: secs, done: true } : { type: 'N', t: secs, done: true };
      const hr = await this.workoutHR(start, end);
      d.workouts.push({ id, name: ex.name, start, end, imported: w.sourceName || 'Health Connect', notes: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned) + ' kcal' : '', hr, u: Date.now(), exercises: [{ exId, sets: [set], notes: '' }] });
      n++;
    }
    return n;
  },
  async workoutHR(start, end) {
    if (!this.on) return null;
    try {
      const r = await this.api.readSamples({ dataType: 'heartRate', startDate: this.iso(start), endDate: this.iso(end), limit: 2000 });
      const v = (r.samples || []).map(s => s.value).filter(Boolean);
      return v.length ? { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.round(Math.max(...v)) } : null;
    } catch (e) { return null; }
  },
  async saveWeight(value, bodyfat) {
    if (!this.on) return;
    const kg = Store.data.settings.unit === 'lb' ? value * 0.45359237 : value;
    try { await this.api.saveSample({ dataType: 'weight', value: kg, unit: 'kilogram' }); if (bodyfat) await this.api.saveSample({ dataType: 'bodyFat', value: bodyfat, unit: 'percent' }); } catch (e) { }
  }
};

// ---------- Home-screen widget (native code in android/)
const Companion = {
  _t: null, _last: '',
  schedule() { clearTimeout(this._t); this._t = setTimeout(() => this.push(), 700); },
  push() {
    const d = Store.data, a = d.active;
    const groups = d.routines.length ? routineGroups(d) : [];
    const next = groups.map(g => g.routines.find(r => r.id === g.next)).filter(Boolean)[0];
    const ci = Store.latestCheckin();
    // Widget
    const w = Plugin('WidgetBridge');
    if (w) {
      const json = JSON.stringify({ active: !!a, next: a ? a.name : (next ? next.name : 'Start an empty workout'), week: d.workouts.filter(x => x.start > startOfWeek()).length, goal: d.settings.weekGoal, streak: weekStreak(), readiness: ci ? String(ci.score) : '' });
      if (json !== this._lastW) { this._lastW = json; w.update({ json }).catch(() => { }); }
    }
  },
  init() { this.push(); }
};
