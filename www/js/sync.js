// Account, end-to-end encrypted cloud sync and server backups (Cloudflare Worker in /server).
// The password never leaves the phone: PBKDF2 derives an auth key (sent) and an encryption
// key (kept). Data is gzipped and AES-GCM encrypted before upload.
'use strict';

const SYNC_URL = 'https://gym-app-sync.lp-reports.workers.dev';
const SYNC_KEY = 'gymapp.sync.v1';
const SYNC_COLLS = ['workouts', 'routines', 'measurements', 'checkins', 'customExercises'];
const SYNC_SETTINGS = ['unit', 'name', 'weekGoal', 'rest', 'bar', 'plates', 'bodyweight'];

const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hexOf = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const te = new TextEncoder(), td = new TextDecoder();

const Sync = {
  acct: null, state: 'off', err: '', busy: false, _t: null, _key: null, _quiet: false,

  async load() {
    let raw = null;
    try { raw = localStorage.getItem(SYNC_KEY); } catch (e) { }
    if (!raw) raw = await Store.readFile('sync.json');
    try { this.acct = raw ? JSON.parse(raw) : null; } catch (e) { this.acct = null; }
    this.state = this.acct ? 'idle' : 'off';
    if (this.acct) {
      window.addEventListener('online', () => this.schedule(1000));
      setTimeout(() => this.run('start'), 2500);
    }
  },
  persist() {
    const s = this.acct ? JSON.stringify(this.acct) : '';
    try { if (s) localStorage.setItem(SYNC_KEY, s); else localStorage.removeItem(SYNC_KEY); } catch (e) { }
    const fs = Plugin('Filesystem');
    if (fs) { if (s) fs.writeFile({ path: 'sync.json', data: s, directory: 'DATA', encoding: 'utf8' }).catch(() => { }); else fs.deleteFile({ path: 'sync.json', directory: 'DATA' }).catch(() => { }); }
  },

  // ---- Crypto
  async derive(email, password) {
    const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = ctx => crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 310000, salt: te.encode(`gymapp:${ctx}:${email}`) }, base, 256);
    const [a, e] = await Promise.all([bits('auth'), bits('enc')]);
    return { authKey: hexOf(a), encKey: b64(e) };
  },
  async key() {
    if (!this._key) this._key = await crypto.subtle.importKey('raw', unb64(this.acct.encKey), 'AES-GCM', false, ['encrypt', 'decrypt']);
    return this._key;
  },
  async gzip(bytes, inflate) {
    if (typeof CompressionStream === 'undefined') return bytes;
    const s = new Blob([bytes]).stream().pipeThrough(inflate ? new DecompressionStream('gzip') : new CompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  },
  async encrypt(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const z = typeof CompressionStream !== 'undefined';
    const plain = await this.gzip(te.encode(JSON.stringify(obj)));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key(), plain);
    return (z ? 'z1.' : 'p1.') + b64(iv) + '.' + b64(ct);
  },
  async decrypt(str) {
    const [fmt, iv, ct] = str.split('.');
    let plain;
    try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await this.key(), unb64(ct))); }
    catch (e) { throw new Error('Couldn\'t decrypt your cloud data. Was the password changed on another device?'); }
    if (fmt === 'z1') plain = await this.gzip(plain, true);
    return JSON.parse(td.decode(plain));
  },

  // ---- HTTP
  async api(method, path, data) {
    const headers = { 'content-type': 'application/json' };
    if (this.acct && this.acct.token) headers.authorization = 'Bearer ' + this.acct.token;
    let r;
    try { r = await fetch(SYNC_URL + path, { method, headers, body: data ? JSON.stringify(data) : undefined }); }
    catch (e) { const x = new Error('No connection'); x.status = 0; throw x; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const x = new Error(j.error || 'Server error ' + r.status); x.status = r.status; throw x; }
    return j;
  },

  // ---- Account
  async signup(email, password) {
    email = email.trim().toLowerCase();
    const k = await this.derive(email, password);
    const r = await this.api('POST', '/signup', { email, authKey: k.authKey });
    this.acct = { email, token: r.token, encKey: k.encKey, rev: 0, last: 0 }; this._key = null;
    this.persist(); this.state = 'idle';
    await this.run('signup');
  },
  async login(email, password) {
    email = email.trim().toLowerCase();
    const k = await this.derive(email, password);
    const r = await this.api('POST', '/login', { email, authKey: k.authKey });
    this.acct = { email, token: r.token, encKey: k.encKey, rev: 0, last: 0 }; this._key = null;
    this.persist(); this.state = 'idle';
    await this.run('login'); // pulls and merges what's in the cloud with what's on this phone
  },
  async logout() {
    try { await this.api('POST', '/logout'); } catch (e) { }
    this.acct = null; this._key = null; this.state = 'off'; this.persist(); this.emit();
  },
  async deleteAccount() {
    await this.api('DELETE', '/account');
    this.acct = null; this._key = null; this.state = 'off'; this.persist(); this.emit();
  },

  // ---- Merge
  payload() {
    const d = Store.data, settings = {};
    SYNC_SETTINGS.forEach(k => settings[k] = d.settings[k]);
    const out = { v: 1, settings, deleted: d.deleted || {} };
    SYNC_COLLS.forEach(k => out[k] = d[k]);
    return out;
  },
  stamp(r) { return r.u || r.end || r.start || r.date || 0; },
  merge(remote) {
    const d = Store.data;
    const del = { ...(remote.deleted || {}), ...(d.deleted || {}) };
    for (const [id, t] of Object.entries(remote.deleted || {})) if (!d.deleted || !d.deleted[id] || d.deleted[id] < t) del[id] = t;
    const cutoff = Date.now() - 180 * 864e5;
    Object.keys(del).forEach(id => { if (del[id] < cutoff) delete del[id]; });
    let changed = false;
    for (const k of SYNC_COLLS) {
      const map = new Map();
      (remote[k] || []).forEach(r => map.set(r.id, r));
      (d[k] || []).forEach(r => { const o = map.get(r.id); if (!o || this.stamp(r) >= this.stamp(o)) map.set(r.id, r); else changed = true; });
      const before = (d[k] || []).length;
      d[k] = [...map.values()].filter(r => !(del[r.id] && del[r.id] >= this.stamp(r)));
      if (d[k].length !== before) changed = true;
    }
    d.deleted = del;
    if (!d.settings.syncedSettings && remote.settings) { SYNC_SETTINGS.forEach(s => { if (remote.settings[s] != null) d.settings[s] = remote.settings[s]; }); d.settings.syncedSettings = true; changed = true; }
    return changed;
  },

  // ---- Sync
  schedule(ms = 8000) {
    if (!this.acct || this._quiet || Store.data.settings.autoSync === false) return;
    clearTimeout(this._t); this._t = setTimeout(() => this.run('auto'), ms);
  },
  async run(reason) {
    if (!this.acct || this.busy) return;
    this.busy = true; this.state = 'syncing'; this.err = ''; this.emit();
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const cur = await this.api('GET', '/data');
        let changed = false;
        if (cur.data) changed = this.merge(await this.decrypt(cur.data));
        if (changed) { this._quiet = true; Store.save(true); this._quiet = false; }
        try {
          const put = await this.api('PUT', '/data', { baseRev: cur.rev, data: await this.encrypt(this.payload()) });
          this.acct.rev = put.rev; break;
        } catch (e) { if (e.status !== 409 || attempt === 3) throw e; } // another device wrote first: pull, merge, retry
      }
      await this.syncPhotos();
      this.acct.last = Date.now(); this.persist(); this.state = 'ok';
    } catch (e) {
      this.err = e.message; this.state = 'error';
      if (e.status === 401) { this.acct.token = ''; this.state = 'signedout'; this.persist(); }
    }
    this.busy = false; this.emit();
    if (reason !== 'auto' && typeof UI !== 'undefined' && !UI.stack.some(s => s.key === 'workout')) UI.render();
  },

  async syncPhotos() {
    const remote = await this.api('GET', '/photos');
    const rIds = new Set(remote.map(p => p.id)), lIds = new Set(Store.photos.map(p => p.id));
    const del = Store.data.deleted || {};
    for (const p of Store.photos) if (!rIds.has(p.id)) {
      const src = await Photos.dataUrl(p); if (src) await this.api('PUT', '/photos/' + p.id, { data: await this.encrypt({ date: p.date, src }) });
    }
    let added = 0;
    for (const r of remote) {
      if (del[r.id]) { await this.api('DELETE', '/photos/' + r.id).catch(() => { }); continue; }
      if (lIds.has(r.id)) continue;
      try { const g = await this.api('GET', '/photos/' + r.id); const o = await this.decrypt(g.data); await Photos.add(o.src, o.date, r.id); added++; } catch (e) { }
    }
    return added;
  },

  // ---- Server backups
  snapshots() { return this.api('GET', '/snapshots'); },
  async restore(id) {
    const s = await this.api('GET', '/snapshots/' + id);
    const data = await this.decrypt(s.data), d = Store.data;
    SYNC_COLLS.forEach(k => d[k] = data[k] || []);
    d.deleted = {};
    this._quiet = true; Store.save(true); this._quiet = false;
    const cur = await this.api('GET', '/data');
    const put = await this.api('PUT', '/data', { baseRev: cur.rev, data: await this.encrypt(this.payload()) });
    this.acct.rev = put.rev; this.acct.last = Date.now(); this.persist();
  },

  label() {
    if (!this.acct) return 'Off';
    if (this.state === 'syncing') return 'Syncing…';
    if (this.state === 'error') return 'Sync failed';
    if (this.state === 'signedout') return 'Signed out';
    if (!this.acct.last) return 'Not synced yet';
    const m = Math.round((Date.now() - this.acct.last) / 60000);
    return 'Synced ' + (m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : fmtDate(this.acct.last));
  },
  emit() { if (typeof UI !== 'undefined' && UI.onSyncState) UI.onSyncState(); }
};
