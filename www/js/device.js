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
  async read(dataType, fromMs, limit = 200) {
    try { const r = await this.api.readSamples({ dataType, startDate: this.iso(fromMs), endDate: this.iso(Date.now()), limit }); return r.samples || []; }
    catch (e) { return []; }
  },

  // Pulls the numbers the coach uses, plus weight and watch cardio sessions
  async pull() {
    if (!this.on) return null;
    const now = Date.now(), d = Store.data, h = {};
    // Last night's sleep: asleep, light, deep and REM time in the last 30 hours
    const sleep = await this.read('sleep', now - 30 * 3600e3, 300);
    let mins = 0;
    sleep.forEach(s => {
      if (s.stages && s.stages.length) s.stages.forEach(st => { if (st.stage !== 'awake' && st.stage !== 'inBed') mins += st.durationMinutes; });
      else if (!s.sleepState || !['awake', 'inBed'].includes(s.sleepState)) mins += (Date.parse(s.endDate) - Date.parse(s.startDate)) / 60000;
    });
    if (mins > 0) h.sleepH = Math.round(mins / 6) / 10;
    // Resting heart rate and HRV vs your 2-week baseline
    const base = async type => {
      const s = (await this.read(type, now - 15 * 864e5, 200)).sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate));
      if (!s.length) return null;
      const prev = s.slice(1).map(x => x.value);
      return { latest: Math.round(s[0].value), base: prev.length ? Math.round(prev.reduce((a, b) => a + b, 0) / prev.length) : null, fresh: now - Date.parse(s[0].startDate) < 36 * 3600e3 };
    };
    h.rhr = await base('restingHeartRate');
    h.hrv = await base('heartRateVariability');
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

// ---------- Bluetooth: Xiaomi scales (passive broadcast) and standard heart-rate straps/watches
const BLE = {
  inited: false, hr: null, hrDevice: null, scanning: false,
  get api() { return window.capacitorCommunityBluetoothLe ? window.capacitorCommunityBluetoothLe.BleClient : null; },
  uuid: n => '0000' + n.toString(16).padStart(4, '0') + '-0000-1000-8000-00805f9b34fb',
  async init() {
    if (!this.api) throw new Error("Bluetooth isn't available here.");
    if (!this.inited) { await this.api.initialize({ androidNeverForLocation: true }); this.inited = true; }
    try { if (Cap() && !(await this.api.isEnabled())) await this.api.requestEnable(); } catch (e) { }
  },

  // Xiaomi Mi Body Composition Scale 2 (and similar): 13-byte service data on 0x181B
  parseMi2(b) {
    if (b.length < 13) return null;
    const lbs = b[0] & 1, catty = (b[1] >> 6) & 1, stable = (b[1] >> 5) & 1, removed = (b[1] >> 7) & 1, hasImp = (b[1] >> 1) & 1;
    const w = ((b[12] << 8) | b[11]) / (lbs || catty ? 100 : 200);
    const kg = lbs ? w * 0.45359237 : catty ? w / 2 : w;
    const imp = (b[10] << 8) | b[9];
    return { kg: Math.round(kg * 100) / 100, stable: !!stable && !removed, impedance: hasImp && imp > 0 && imp < 3000 ? imp : null, model: 'Mi Body Composition Scale' };
  },
  // Xiaomi Mi Smart Scale 1 and the standard Weight Scale service: data on 0x181D
  parseMi1(b) {
    if (b.length < 3) return null;
    const lbs = b[0] & 1, catty = (b[0] >> 4) & 1, stable = (b[0] >> 5) & 1, removed = (b[0] >> 7) & 1;
    const w = ((b[2] << 8) | b[1]) / (lbs || catty ? 100 : 200);
    const kg = lbs ? w * 0.45359237 : catty ? w / 2 : w;
    return { kg: Math.round(kg * 100) / 100, stable: !!stable && !removed, impedance: null, model: 'Mi Smart Scale' };
  },
  async scanScale(onUpdate, ms = 60000) {
    await this.init();
    if (this.scanning) await this.stopScan();
    this.scanning = true;
    const k2 = this.uuid(0x181b), k1 = this.uuid(0x181d);
    await this.api.requestLEScan({ allowDuplicates: true }, r => {
      for (const [key, dv] of Object.entries(r.serviceData || {})) {
        const k = key.toLowerCase(), bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
        const reading = k === k2 ? this.parseMi2(bytes) : k === k1 ? this.parseMi1(bytes) : null;
        if (reading && reading.kg > 2) onUpdate(reading);
      }
    });
    this._scanT = setTimeout(() => this.stopScan().then(() => onUpdate(null)), ms);
  },
  async stopScan() { clearTimeout(this._scanT); if (this.scanning) { this.scanning = false; try { await this.api.stopLEScan(); } catch (e) { } } },

  // Standard Bluetooth heart-rate profile (0x180D / 0x2A37): chest straps (Polar, Garmin, Wahoo, Coros)
  // and watches with "broadcast heart rate" (Garmin, Amazfit, Huawei, Honor and others)
  async connectHR(deviceId) {
    await this.init();
    const svc = this.uuid(0x180d), chr = this.uuid(0x2a37);
    const dev = deviceId ? { deviceId, name: Store.data.settings.hrName } : await this.api.requestDevice({ services: [svc] });
    await this.api.connect(dev.deviceId, () => { this.hr = null; this.hrDevice = null; UI.onDeviceState(); });
    await this.api.startNotifications(dev.deviceId, svc, chr, dv => {
      const flags = dv.getUint8(0);
      this.hr = flags & 1 ? dv.getUint16(1, true) : dv.getUint8(1);
      const a = Store.data.active;
      if (a && this.hr > 30) { a.hr = a.hr || []; const last = a.hr[a.hr.length - 1]; if (!last || Date.now() - last[0] > 4000) a.hr.push([Date.now(), this.hr]); }
      $$('.hrLive').forEach(el => el.textContent = this.hr);
    });
    this.hrDevice = dev;
    Store.data.settings.hrDeviceId = dev.deviceId; Store.data.settings.hrName = dev.name || 'Heart-rate monitor'; Store.save();
    UI.onDeviceState();
  },
  async disconnectHR(forget) {
    if (this.hrDevice) { try { await this.api.disconnect(this.hrDevice.deviceId); } catch (e) { } }
    this.hr = null; this.hrDevice = null;
    if (forget) { delete Store.data.settings.hrDeviceId; Store.save(); }
    UI.onDeviceState();
  },
  // Reconnect the remembered strap when a workout starts
  async autoHR() { const id = Store.data.settings.hrDeviceId; if (id && !this.hrDevice && Cap()) { try { await this.connectHR(id); } catch (e) { } } }
};
