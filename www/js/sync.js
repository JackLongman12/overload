// Account, end-to-end encrypted cloud sync and server backups (Cloudflare Worker in /server).
//
// Keys: a random 256-bit MASTER key encrypts everything (AES-GCM). It's stored on the server only
// in wrapped (encrypted) form: once with a key derived from the password, once with a key derived
// from the recovery key. The password, recovery key and master key never leave the phone.
//
// Data is split into chunks so no single upload hits a size limit: "core" (settings, routines,
// measurements, check-ins, custom exercises, deletions) and one chunk of workouts per quarter ("w-2026-4").
'use strict';

const SYNC_URL = 'https://gym-app-sync.lp-reports.workers.dev';
const SYNC_KEY = 'gymapp.sync.v1';
const SYNC_COLLS = ['workouts', 'routines', 'measurements', 'checkins', 'customExercises'];
const CORE_COLLS = ['routines', 'measurements', 'checkins', 'customExercises'];
const SYNC_SETTINGS = ['unit', 'name', 'weekGoal', 'rest', 'bar', 'plates', 'bodyweight', 'gym', 'block'];

const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hexOf = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const te = new TextEncoder(), td = new TextDecoder();
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, so it's easy to copy by hand

const Sync = {
  acct: null, state: 'off', err: '', busy: false, _t: null, _key: null, _quiet: false,

  async load() {
    let raw = null;
    try { raw = localStorage.getItem(SYNC_KEY); } catch (e) { }
    if (!raw) raw = await Store.readFile('sync.json');
    try { this.acct = raw ? JSON.parse(raw) : null; } catch (e) { this.acct = null; }
    this.state = this.acct ? 'idle' : 'off';
    if (this.acct) {
      this.acct.revs = this.acct.revs || {}; this.acct.hashes = this.acct.hashes || {};
      if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', () => this.schedule(1000));
      setTimeout(() => this.run('start'), 2500);
    }
  },
  persist() {
    const s = this.acct ? JSON.stringify(this.acct) : '';
    try { if (s) localStorage.setItem(SYNC_KEY, s); else localStorage.removeItem(SYNC_KEY); } catch (e) { }
    const fs = Plugin('Filesystem');
    if (fs) { if (s) fs.writeFile({ path: 'sync.json', data: s, directory: 'DATA', encoding: 'utf8' }).catch(() => { }); else fs.deleteFile({ path: 'sync.json', directory: 'DATA' }).catch(() => { }); }
  },

  // ---- Key derivation and wrapping
  async pbkdf2(secret, ctx, iterations = 310000) {
    const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations, salt: te.encode(ctx) }, base, 256);
  },
  async derive(email, password) {
    const [a, e] = await Promise.all([this.pbkdf2(password, `gymapp:auth:${email}`), this.pbkdf2(password, `gymapp:enc:${email}`)]);
    return { authKey: hexOf(a), encKey: b64(e) }; // encKey = password key (and the master key of accounts made before 1.5)
  },
  async deriveRecovery(email, code) {
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const [a, w] = await Promise.all([this.pbkdf2(c, `gymapp:recauth:${email}`, 100000), this.pbkdf2(c, `gymapp:recwrap:${email}`, 100000)]);
    return { recAuth: hexOf(a), recKey: b64(w) };
  },
  newRecoveryCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(25)); // 25 x 5 bits = 125 bits
    const chars = [...bytes].map(b => B32[b % 32]).join('');
    return chars.match(/.{5}/g).join('-');
  },
  async aes(rawB64) { return crypto.subtle.importKey('raw', unb64(rawB64), 'AES-GCM', false, ['encrypt', 'decrypt']); },
  async wrap(masterB64, wrapKeyB64) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.aes(wrapKeyB64), unb64(masterB64));
    return 'k1.' + b64(iv) + '.' + b64(ct);
  },
  async unwrap(wrapped, wrapKeyB64) {
    const [, iv, ct] = wrapped.split('.');
    try { return b64(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await this.aes(wrapKeyB64), unb64(ct))); }
    catch (e) { throw new Error("Couldn't unlock your data with that key."); }
  },
  async key() { if (!this._key) this._key = await this.aes(this.acct.encKey); return this._key; },

  // ---- Data encryption
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
    catch (e) { throw new Error("Couldn't decrypt your cloud data. Log out and back in on this phone."); }
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
  setAcct(email, token, master) {
    this.acct = { email, token, encKey: master, revs: {}, hashes: {}, last: 0 };
    this._key = null; this.persist(); this.state = 'idle';
  },

  // ---- Account
  // Returns the recovery code; the UI must show it once
  async signup(email, password) {
    email = email.trim().toLowerCase();
    const k = await this.derive(email, password);
    const master = b64(crypto.getRandomValues(new Uint8Array(32)));
    const code = this.newRecoveryCode(), rec = await this.deriveRecovery(email, code);
    const r = await this.api('POST', '/signup', { email, authKey: k.authKey, wrappedPw: await this.wrap(master, k.encKey), wrappedRec: await this.wrap(master, rec.recKey), recAuth: rec.recAuth });
    this.setAcct(email, r.token, master);
    this.acct.hasRecovery = true; this.persist();
    this.run('signup');
    return code;
  },
  // ---- Account key: no email or password. A random 125-bit key is the only credential.
  // The server sees an id derived from the key (shaped like an email so the API stays the same).
  normKey(key) { return String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); },
  fmtKey(key) { return (this.normKey(key).match(/.{1,5}/g) || []).join('-'); },
  async keyId(key) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode('gymapp:id:' + this.normKey(key))));
    return 'k' + [...h.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('') + '@key.gymapp.app';
  },
  async deriveFromKey(id, key) {
    const k = this.normKey(key); // high entropy, so a lower iteration count is plenty
    const [a, e] = await Promise.all([this.pbkdf2(k, `gymapp:auth:${id}`, 20000), this.pbkdf2(k, `gymapp:enc:${id}`, 20000)]);
    return { authKey: hexOf(a), encKey: b64(e) };
  },
  async keySignup() {
    const key = this.newRecoveryCode(), id = await this.keyId(key), k = await this.deriveFromKey(id, key);
    const master = b64(crypto.getRandomValues(new Uint8Array(32)));
    const r = await this.api('POST', '/signup', { email: id, authKey: k.authKey, wrappedPw: await this.wrap(master, k.encKey) });
    this.setAcct(id, r.token, master);
    this.acct.key = this.fmtKey(key); this.acct.keyAccount = true; this.persist();
    this.run('signup');
    return this.acct.key;
  },
  async keyLogin(key) {
    if (this.normKey(key).length !== 25) throw new Error('An account key has 25 letters and numbers.');
    const id = await this.keyId(key), k = await this.deriveFromKey(id, key);
    let r;
    try { r = await this.api('POST', '/login', { email: id, authKey: k.authKey }); }
    catch (e) { throw new Error(/401|wrong/i.test(e.message) ? "That key doesn't match an account. Check it and try again." : e.message); }
    const master = await this.unwrap(r.wrappedPw, k.encKey);
    this.setAcct(id, r.token, master);
    this.acct.key = this.fmtKey(key); this.acct.keyAccount = true; this.persist();
    await this.run('login');
  },
  async login(email, password) {
    email = email.trim().toLowerCase();
    const k = await this.derive(email, password);
    const r = await this.api('POST', '/login', { email, authKey: k.authKey });
    let master;
    if (r.wrappedPw) { this.acct = { token: r.token }; master = await this.unwrap(r.wrappedPw, k.encKey); }
    else { master = k.encKey; this.acct = { token: r.token }; await this.api('POST', '/keys', { wrappedPw: await this.wrap(master, k.encKey) }); } // upgrade an account made before 1.5
    this.setAcct(email, r.token, master);
    this.acct.hasRecovery = !!r.hasRecovery; this.persist();
    await this.run('login');
  },
  // Make a new recovery key (signed in). Returns the code to show once.
  async createRecovery() {
    const code = this.newRecoveryCode(), rec = await this.deriveRecovery(this.acct.email, code);
    await this.api('POST', '/keys', { wrappedRec: await this.wrap(this.acct.encKey, rec.recKey), recAuth: rec.recAuth });
    this.acct.hasRecovery = true; this.persist(); this.emit();
    return code;
  },
  async changePassword(current, next) {
    const e = this.acct.email;
    const [cur, nk] = await Promise.all([this.derive(e, current), this.derive(e, next)]);
    await this.api('POST', '/password', { currentAuthKey: cur.authKey, newAuthKey: nk.authKey, wrappedPw: await this.wrap(this.acct.encKey, nk.encKey) });
  },
  // Forgot password: recovery code + new password (signed out)
  async recover(email, code, newPassword) {
    email = email.trim().toLowerCase();
    const rec = await this.deriveRecovery(email, code);
    const start = await this.api('POST', '/recover/start', { email, recAuth: rec.recAuth });
    const master = await this.unwrap(start.wrappedRec, rec.recKey);
    const nk = await this.derive(email, newPassword);
    const r = await this.api('POST', '/recover/finish', { email, recAuth: rec.recAuth, newAuthKey: nk.authKey, wrappedPw: await this.wrap(master, nk.encKey) });
    this.setAcct(email, r.token, master);
    this.acct.hasRecovery = true; this.persist();
    await this.run('login');
  },
  async logout() {
    try { await this.api('POST', '/logout'); } catch (e) { }
    this.acct = null; this._key = null; this.state = 'off'; this.persist(); this.emit();
  },
  async deleteAccount() {
    await this.api('DELETE', '/account');
    this.acct = null; this._key = null; this.state = 'off'; this.persist(); this.emit();
  },

  // ---- Chunks
  quarter(ts) { const d = new Date(ts); return `w-${d.getFullYear()}-${Math.floor(d.getMonth() / 3) + 1}`; },
  localChunks() {
    const d = Store.data, settings = {};
    SYNC_SETTINGS.forEach(k => settings[k] = d.settings[k]);
    const out = { core: { v: 2, settings, deleted: d.deleted || {} } };
    CORE_COLLS.forEach(k => out.core[k] = d[k]);
    d.workouts.forEach(w => { const n = this.quarter(w.start); (out[n] = out[n] || { workouts: [] }).workouts.push(w); });
    return out;
  },
  async hash(obj) { return hexOf(await crypto.subtle.digest('SHA-256', te.encode(JSON.stringify(obj)))); },

  // ---- Merge
  stamp(r) { return r.u || r.end || r.start || r.date || 0; },
  merge(remote) {
    const d = Store.data;
    const del = { ...(d.deleted || {}) };
    for (const [id, t] of Object.entries(remote.deleted || {})) if (!del[id] || del[id] < t) del[id] = t;
    const cutoff = Date.now() - 180 * 864e5;
    Object.keys(del).forEach(id => { if (del[id] < cutoff) delete del[id]; });
    let changed = false;
    for (const k of SYNC_COLLS) {
      const map = new Map();
      (remote[k] || []).forEach(r => map.set(r.id, r));
      (d[k] || []).forEach(r => { const o = map.get(r.id); if (!o || this.stamp(r) >= this.stamp(o)) map.set(r.id, r); else changed = true; });
      const before = (d[k] || []).length;
      d[k] = [...map.values()].filter(r => r && r.id && !(del[r.id] && del[r.id] >= this.stamp(r)));
      if (k === 'routines') d[k].forEach(r => { if (!Array.isArray(r.exercises)) r.exercises = []; });
      if (k === 'workouts') d[k].forEach(w => { if (!Array.isArray(w.exercises)) w.exercises = []; w.exercises.forEach(e => { if (!Array.isArray(e.sets)) e.sets = []; }); });
      if (d[k].length !== before) changed = true;
    }
    d.deleted = del;
    if (!d.settings.syncedSettings && remote.settings) { SYNC_SETTINGS.forEach(s => { if (remote.settings[s] != null) d.settings[s] = remote.settings[s]; }); d.settings.syncedSettings = true; changed = true; }
    return changed;
  },

  // ---- Sync
  schedule(ms = 8000) {
    if (!this.acct || !this.acct.token || this._quiet || Store.data.settings.autoSync === false) return;
    clearTimeout(this._t); this._t = setTimeout(() => this.run('auto'), ms);
  },
  async run(reason) {
    if (!this.acct || !this.acct.token || this.busy) return;
    this.busy = true; this.state = 'syncing'; this.err = ''; this.emit();
    try {
      const a = this.acct;
      a.revs = a.revs || {}; a.hashes = a.hashes || {};
      // 1) Pull every remote chunk that changed since our last sync, core first (it carries deletions)
      const remote = await this.api('GET', '/chunks');
      const rmap = {}; remote.forEach(c => rmap[c.name] = c);
      const names = Object.keys(rmap).sort((x, y) => (x === 'core' ? -1 : y === 'core' ? 1 : x.localeCompare(y)));
      let changed = false;
      for (const n of names) {
        if (rmap[n].rev === a.revs[n]) continue;
        const c = await this.api('GET', '/chunks/' + n);
        if (c.data) { if (this.merge(await this.decrypt(c.data))) changed = true; }
        a.revs[n] = c.rev; a.hashes[n] = null; // force a re-check of what we have locally
      }
      if (changed) { this._quiet = true; Store.save(true); this._quiet = false; }
      // 2) Push chunks whose content differs from what we last uploaded
      const local = this.localChunks();
      for (const n of Object.keys(local)) {
        const h = await this.hash(local[n]);
        if (h === a.hashes[n]) continue;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const put = await this.api('PUT', '/chunks/' + n, { baseRev: a.revs[n] || 0, data: await this.encrypt(local[n]) });
            a.revs[n] = put.rev; a.hashes[n] = h; break;
          } catch (e) {
            if (e.status !== 409 || attempt === 3) throw e;
            const c = await this.api('GET', '/chunks/' + n); // another device wrote first: merge theirs, then retry
            if (c.data && this.merge(await this.decrypt(c.data))) { this._quiet = true; Store.save(true); this._quiet = false; }
            a.revs[n] = c.rev; local[n] = this.localChunks()[n];
          }
        }
      }
      await this.syncPhotos();
      a.last = Date.now(); this.persist(); this.state = 'ok';
    } catch (e) {
      this.err = e.message; this.state = 'error';
      if (e.status === 401) { this.acct.token = ''; this.state = 'signedout'; this.persist(); }
    }
    this.busy = false; this.emit();
    if (reason !== 'auto' && typeof UI !== 'undefined' && UI.stack && !UI.stack.some(s => s.key === 'workout')) UI.render();
  },

  async syncPhotos() {
    const remote = await this.api('GET', '/photos');
    const rIds = new Set(remote.map(p => p.id)), lIds = new Set(Store.photos.map(p => p.id));
    const del = Store.data.deleted || {};
    for (const p of Store.photos) if (!rIds.has(p.id)) {
      const src = await Photos.dataUrl(p); if (src) await this.api('PUT', '/photos/' + p.id, { data: await this.encrypt({ date: p.date, src }) });
    }
    for (const r of remote) {
      if (del[r.id]) { await this.api('DELETE', '/photos/' + r.id).catch(() => { }); continue; }
      if (lIds.has(r.id)) continue;
      try { const g = await this.api('GET', '/photos/' + r.id); const o = await this.decrypt(g.data); await Photos.add(o.src, o.date, r.id); } catch (e) { }
    }
  },

  // ---- Server backups: snapshots are per chunk; grouped by day for restoring
  async snapshots() {
    const list = await this.api('GET', '/snapshots');
    const days = {};
    list.forEach(s => { const k = new Date(s.created).toDateString(); (days[k] = days[k] || { created: s.created, size: 0, ids: [] }); days[k].ids.push(s.id); days[k].size += s.size; days[k].created = Math.max(days[k].created, s.created); });
    return Object.values(days).sort((a, b) => b.created - a.created).map(d => ({ id: d.ids.join(','), created: d.created, size: d.size }));
  },
  async restore(ids) {
    const d = Store.data;
    const parts = await Promise.all(String(ids).split(',').map(id => this.api('GET', '/snapshots/' + id)));
    const got = {};
    for (const s of parts) {
      const data = await this.decrypt(s.data);
      SYNC_COLLS.forEach(k => { if (data[k]) got[k] = (got[k] || []).concat(data[k]); });
    }
    // Workout chunks not in the snapshot keep their current contents; restored ones replace theirs
    const restoredQuarters = new Set((got.workouts || []).map(w => this.quarter(w.start)));
    if (got.workouts) d.workouts = d.workouts.filter(w => !restoredQuarters.has(this.quarter(w.start))).concat(got.workouts);
    CORE_COLLS.forEach(k => { if (got[k]) d[k] = got[k]; });
    const now = Date.now();
    SYNC_COLLS.forEach(k => d[k].forEach(r => r.u = now)); // restored copies win on other devices
    d.deleted = {};
    this._quiet = true; Store.save(true); this._quiet = false;
    this.acct.hashes = {}; this.persist();
    await this.run('restore');
  },

  label() {
    if (!this.acct) return 'Off';
    if (this.state === 'syncing') return 'Syncing…';
    if (this.state === 'error') return 'Sync failed';
    if (this.state === 'signedout' || !this.acct.token) return 'Signed out';
    if (!this.acct.last) return 'Not synced yet';
    const m = Math.round((Date.now() - this.acct.last) / 60000);
    return 'Synced ' + (m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : fmtDate(this.acct.last));
  },
  emit() { if (typeof UI !== 'undefined' && UI.onSyncState) UI.onSyncState(); }
};
