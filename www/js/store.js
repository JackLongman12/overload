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
        updateUrl: 'https://raw.githubusercontent.com/JackLongman12/overload/main/update.json', autoUpdate: true, autoSync: true, keepAwake: true, coachLevel: 'standard', weekGoal: 4, name: ''
      },
      customExercises: [], routines: [], workouts: [], measurements: [], checkins: [], deleted: {},
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
    let pr = null;
    try { pr = localStorage.getItem(PHOTO_KEY); } catch (e) { }
    if (!pr) pr = await this.readFile('photos/index.json');
    try { this.photos = JSON.parse(pr || '[]'); } catch (e) { this.photos = []; }
    await Photos.migrate();
    await Photos.resolve();
  },

  save(now) {
    clearTimeout(this._t);
    const go = () => {
      const s = JSON.stringify(this.data);
      try { localStorage.setItem(DB_KEY, s); } catch (e) { toast('Storage full. Export a backup.'); }
      this.writeFile(s);
      if (typeof Sync !== 'undefined') Sync.schedule();
      if (typeof Companion !== 'undefined') Companion.schedule();
    };
    if (now) go(); else this._t = setTimeout(go, 300);
  },

  // Photo metadata only (images are files on native). `url` is runtime-only.
  savePhotos() {
    const s = JSON.stringify(this.photos.map(({ url, ...p }) => p));
    const fs = Plugin('Filesystem');
    if (fs) fs.writeFile({ path: 'photos/index.json', data: s, directory: 'DATA', encoding: 'utf8', recursive: true }).catch(() => { });
    try { localStorage.setItem(PHOTO_KEY, s); return true; }
    catch (e) { if (fs) return true; toast('Not enough space for more photos'); return false; }
  },

  async readFile(path = FILE_NAME) {
    const fs = Plugin('Filesystem');
    if (!fs) return null;
    try { const r = await fs.readFile({ path, directory: 'DATA', encoding: 'utf8' }); return r.data; }
    catch (e) { return null; }
  },

  async writeFile(s) {
    const fs = Plugin('Filesystem');
    if (!fs) return;
    try { await fs.writeFile({ path: FILE_NAME, data: s, directory: 'DATA', encoding: 'utf8' }); } catch (e) { }
  },

  // Remember deletions so sync removes the item on other devices too
  tombstone(id) { (this.data.deleted = this.data.deleted || {})[id] = Date.now(); },

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

  async exportJSON() {
    const photos = await Photos.asDataUrls();
    this.data.settings.lastBackup = Date.now(); this.save(true);
    return JSON.stringify({ app: 'overload', exported: new Date().toISOString(), data: this.data, photos }, null, 1);
  }
};

// Progress photos: stored as JPEG files in the app's private storage on Android
// (no size cap, included in Android auto-backup). Browser falls back to data URLs.
const Photos = {
  src(p) { return p.url || p.src || ''; },

  async add(dataUrl, date = Date.now(), id = uid()) {
    const fs = Plugin('Filesystem');
    if (fs) {
      const path = `photos/${id}.jpg`;
      await fs.writeFile({ path, data: dataUrl.split(',')[1], directory: 'DATA', recursive: true });
      Store.photos.push({ id, date, path });
    } else Store.photos.push({ id, date, src: dataUrl });
    await this.resolve();
    return Store.savePhotos();
  },

  async remove(id) {
    const p = Store.photos.find(x => x.id === id), fs = Plugin('Filesystem');
    Store.tombstone(id);
    if (p && p.path && fs) { try { await fs.deleteFile({ path: p.path, directory: 'DATA' }); } catch (e) { } }
    Store.photos = Store.photos.filter(x => x.id !== id); Store.savePhotos();
  },

  // Turn file paths into URLs the WebView can show
  async resolve() {
    const fs = Plugin('Filesystem'), C = Cap();
    if (!fs || !C) return;
    for (const p of Store.photos) {
      if (p.path && !p.url) { try { const r = await fs.getUri({ path: p.path, directory: 'DATA' }); p.url = C.convertFileSrc(r.uri); } catch (e) { } }
    }
  },

  // Move any photos still held as data URLs (older versions, imported backups) into files
  async migrate() {
    const fs = Plugin('Filesystem');
    if (!fs) return;
    let changed = false;
    for (const p of Store.photos) {
      if (!p.src || p.path) continue;
      try { p.path = `photos/${p.id}.jpg`; await fs.writeFile({ path: p.path, data: p.src.split(',')[1], directory: 'DATA', recursive: true }); delete p.src; changed = true; }
      catch (e) { delete p.path; }
    }
    if (changed) Store.savePhotos();
  },

  async dataUrl(p) {
    if (p.src) return p.src;
    const fs = Plugin('Filesystem');
    if (p.path && fs) { try { const r = await fs.readFile({ path: p.path, directory: 'DATA' }); return 'data:image/jpeg;base64,' + r.data; } catch (e) { } }
    return null;
  },

  // For backups: embed every image
  async asDataUrls() {
    const fs = Plugin('Filesystem'), out = [];
    for (const p of Store.photos) {
      if (p.src) { out.push({ id: p.id, date: p.date, src: p.src }); continue; }
      if (p.path && fs) { try { const r = await fs.readFile({ path: p.path, directory: 'DATA' }); out.push({ id: p.id, date: p.date, src: 'data:image/jpeg;base64,' + r.data }); } catch (e) { } }
    }
    return out;
  }
};
