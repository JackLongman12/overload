// Data store: localStorage cache + native file mirror (Capacitor Filesystem) so data
// survives WebView storage clears. Everything stays on the device.
'use strict';

const DB_KEY = 'overload.v1';
const PHOTO_KEY = 'overload.photos.v1';
const FILE_NAME = 'overload-data.json';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const Cap = () => (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? window.Capacitor : null;
const Plugin = name => { const c = Cap(); return c && c.Plugins ? c.Plugins[name] : null; };

const Store = {
  data: null,
  photos: [],
  _t: null,

  defaults() {
    return {
      schema: 1,
      settings: {
        unit: 'kg', rest: 120, bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], bodyweight: 75,
        updateUrl: 'https://raw.githubusercontent.com/JackLongman12/overload/main/update.json', autoUpdate: true, coachLevel: 'standard', weekGoal: 4, name: ''
      },
      customExercises: [], routines: [], workouts: [], measurements: [], checkins: [],
      active: null, onboarded: false
    };
  },

  async load() {
    let raw = null;
    try { raw = localStorage.getItem(DB_KEY); } catch (e) { }
    if (!raw) raw = await this.readFile();
    let d = null;
    try { d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; }
    const def = this.defaults();
    this.data = d ? { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) } } : def;
    if (!this.data.settings.updateUrl) this.data.settings.updateUrl = def.settings.updateUrl;
    try { this.photos = JSON.parse(localStorage.getItem(PHOTO_KEY) || '[]'); } catch (e) { this.photos = []; }
  },

  save(now) {
    clearTimeout(this._t);
    const go = () => {
      const s = JSON.stringify(this.data);
      try { localStorage.setItem(DB_KEY, s); } catch (e) { toast('Storage full. Export a backup.'); }
      this.writeFile(s);
    };
    if (now) go(); else this._t = setTimeout(go, 300);
  },

  savePhotos() {
    try { localStorage.setItem(PHOTO_KEY, JSON.stringify(this.photos)); return true; }
    catch (e) { toast('Not enough space for more photos'); return false; }
  },

  async readFile() {
    const fs = Plugin('Filesystem');
    if (!fs) return null;
    try { const r = await fs.readFile({ path: FILE_NAME, directory: 'DATA', encoding: 'utf8' }); return r.data; }
    catch (e) { return null; }
  },

  async writeFile(s) {
    const fs = Plugin('Filesystem');
    if (!fs) return;
    try { await fs.writeFile({ path: FILE_NAME, data: s, directory: 'DATA', encoding: 'utf8' }); } catch (e) { }
  },

  // ---- Exercises
  allExercises() { return BUILTIN_EXERCISES.concat(this.data.customExercises); },
  ex(id) {
    return this._exMap()[id] || { id, name: id.replace(/_/g, ' '), muscle: 'full_body', secondary: [], equipment: 'other', type: 'wr', discipline: 'strength' };
  },
  _exMap() {
    if (!this.__m || this.__mc !== this.data.customExercises.length) {
      this.__m = {}; this.allExercises().forEach(e => this.__m[e.id] = e); this.__mc = this.data.customExercises.length;
    }
    return this.__m;
  },
  addCustomExercise(e) {
    const ex = { id: 'c_' + slug(e.name) + '_' + uid().slice(-4), secondary: [], builtin: false, compound: false, ...e };
    this.data.customExercises.push(ex); this.save(); return ex;
  },

  // ---- Workouts
  workoutsSorted() { return this.data.workouts.slice().sort((a, b) => b.start - a.start); },

  // Completed sessions of one exercise, newest first: [{date, workoutId, sets:[...]}]
  sessions(exId, limit = 12) {
    const out = [];
    for (const w of this.workoutsSorted()) {
      for (const e of w.exercises) {
        if (e.exId !== exId) continue;
        const sets = e.sets.filter(s => s.done && s.type !== 'W');
        if (sets.length) out.push({ date: w.start, workoutId: w.id, sets, target: e.target });
      }
      if (out.length >= limit) break;
    }
    return out;
  },

  lastSets(exId) {
    for (const w of this.workoutsSorted()) {
      const e = w.exercises.find(x => x.exId === exId);
      if (e) return e.sets.filter(s => s.done);
    }
    return [];
  },

  latestCheckin() {
    const c = this.data.checkins[this.data.checkins.length - 1];
    return c && Date.now() - c.date < 16 * 3600e3 ? c : null;
  },

  exportJSON() {
    return JSON.stringify({ app: 'overload', exported: new Date().toISOString(), data: this.data, photos: this.photos }, null, 1);
  }
};
