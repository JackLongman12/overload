// Gym App sync server (Cloudflare Worker + D1).
//
// Zero-knowledge design. The phone holds a random master key that encrypts all data (AES-GCM).
// The server only ever stores:
//   - SHA-256(salt + authKey), where authKey is derived from the password on the phone (PBKDF2)
//   - the master key wrapped (encrypted) by a password-derived key, and by a recovery-code-derived key
//   - SHA-256(salt + recAuth) to check recovery codes
//   - opaque encrypted data chunks and photos
// Neither the password, the recovery code nor the master key ever reaches the server.

const MAX_CHUNK = 1_900_000;     // D1 row limit is 2 MB
const MAX_PHOTO = 1_900_000;
const SESSION_DAYS = 365;
const SNAPSHOT_EVERY_MS = 24 * 3600e3;
const SNAPSHOT_DAYS = 14;

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '86400' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const err = (status, message) => json({ error: message }, status);

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const safeEq = (a, b) => { if (!a || !b || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const validEmail = e => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validKey = k => typeof k === 'string' && /^[0-9a-f]{64}$/.test(k);
const validWrap = w => w == null || (typeof w === 'string' && w.length < 400 && /^k1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(w));
const validChunk = n => typeof n === 'string' && /^[a-z0-9-]{1,32}$/.test(n);

async function body(req) { try { return await req.json(); } catch { return null; } }

async function userFromToken(req, env) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const row = await env.DB.prepare('SELECT user_id, expires FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).first();
  if (!row || row.expires < Date.now()) return null;
  return row.user_id;
}
async function newSession(env, userId) {
  const token = randHex(32);
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, Date.now(), Date.now() + SESSION_DAYS * 864e5).run();
  return token;
}

// Throttle failures per email: 8 per 15 minutes (logins and recovery attempts)
async function throttled(env, key) {
  const r = await env.DB.prepare('SELECT count, first FROM fails WHERE email = ?').bind(key).first();
  return r && Date.now() - r.first < 15 * 60e3 && r.count >= 8;
}
async function recordFail(env, key) {
  const r = await env.DB.prepare('SELECT count, first FROM fails WHERE email = ?').bind(key).first();
  if (!r || Date.now() - r.first > 15 * 60e3) await env.DB.prepare('INSERT OR REPLACE INTO fails (email, count, first) VALUES (?, 1, ?)').bind(key, Date.now()).run();
  else await env.DB.prepare('UPDATE fails SET count = count + 1 WHERE email = ?').bind(key).run();
}

async function getChunk(env, uid, name) {
  return env.DB.prepare('SELECT rev, data, updated FROM chunks WHERE user_id = ? AND name = ?').bind(uid, name).first();
}
async function putChunk(env, uid, name, b) {
  if (!b || typeof b.data !== 'string' || !Number.isInteger(b.baseRev)) return err(400, 'Bad request');
  if (b.data.length > MAX_CHUNK) return err(413, 'Data too large to sync');
  const cur = await getChunk(env, uid, name);
  const curRev = cur ? cur.rev : 0;
  if (b.baseRev !== curRev) return err(409, 'Changed on another device');
  const rev = curRev + 1, now = Date.now();
  const stmts = [env.DB.prepare('INSERT INTO chunks (user_id, name, rev, data, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, name) DO UPDATE SET rev = excluded.rev, data = excluded.data, updated = excluded.updated').bind(uid, name, rev, b.data, now)];
  // Daily backup snapshot of the previous version of this chunk
  if (cur) {
    const last = await env.DB.prepare('SELECT created FROM snapshots WHERE user_id = ? AND name = ? ORDER BY created DESC LIMIT 1').bind(uid, name).first();
    if (!last || now - last.created > SNAPSHOT_EVERY_MS) stmts.push(env.DB.prepare('INSERT INTO snapshots (user_id, name, rev, data, created) VALUES (?, ?, ?, ?, ?)').bind(uid, name, cur.rev, cur.data, now));
  }
  stmts.push(env.DB.prepare('DELETE FROM snapshots WHERE user_id = ? AND created < ?').bind(uid, now - SNAPSHOT_DAYS * 864e5));
  await env.DB.batch(stmts);
  return json({ rev, updated: now });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url), p = url.pathname, M = req.method;
    try {
      if (p === '/' && M === 'GET') return json({ service: 'gym-app-sync', ok: true, v: 2 });

      // ---- Accounts
      if (p === '/signup' && M === 'POST') {
        const b = await body(req);
        const email = (b && b.email || '').trim().toLowerCase();
        if (!validEmail(email) || !validKey(b.authKey) || !validWrap(b.wrappedPw) || !validWrap(b.wrappedRec) || (b.recAuth != null && !validKey(b.recAuth))) return err(400, 'Invalid request');
        if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return err(409, 'An account with this email already exists');
        const id = randHex(16), salt = randHex(16), recSalt = randHex(16);
        await env.DB.prepare('INSERT INTO users (id, email, auth_hash, auth_salt, created, wrapped_pw, wrapped_rec, rec_hash, rec_salt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, email, await sha256(salt + b.authKey), salt, Date.now(), b.wrappedPw || null, b.wrappedRec || null, b.recAuth ? await sha256(recSalt + b.recAuth) : null, recSalt).run();
        return json({ token: await newSession(env, id) });
      }
      if (p === '/login' && M === 'POST') {
        const b = await body(req);
        const email = (b && b.email || '').trim().toLowerCase();
        if (!validEmail(email) || !validKey(b.authKey)) return err(400, 'Invalid email or key');
        if (await throttled(env, email)) return err(429, 'Too many attempts. Try again in 15 minutes.');
        const u = await env.DB.prepare('SELECT id, auth_hash, auth_salt, wrapped_pw, rec_hash FROM users WHERE email = ?').bind(email).first();
        if (!u || !safeEq(await sha256(u.auth_salt + b.authKey), u.auth_hash)) { await recordFail(env, email); return err(401, 'Wrong email or password'); }
        await env.DB.prepare('DELETE FROM fails WHERE email = ?').bind(email).run();
        return json({ token: await newSession(env, u.id), wrappedPw: u.wrapped_pw, hasRecovery: !!u.rec_hash });
      }
      // Account recovery with the recovery code (signed out)
      if (p === '/recover/start' && M === 'POST') {
        const b = await body(req);
        const email = (b && b.email || '').trim().toLowerCase();
        if (!validEmail(email) || !validKey(b.recAuth)) return err(400, 'Invalid request');
        if (await throttled(env, 'rec:' + email)) return err(429, 'Too many attempts. Try again in 15 minutes.');
        const u = await env.DB.prepare('SELECT rec_hash, rec_salt, wrapped_rec FROM users WHERE email = ?').bind(email).first();
        if (!u || !u.rec_hash || !safeEq(await sha256(u.rec_salt + b.recAuth), u.rec_hash)) { await recordFail(env, 'rec:' + email); return err(401, 'Wrong email or recovery key'); }
        return json({ wrappedRec: u.wrapped_rec });
      }
      if (p === '/recover/finish' && M === 'POST') {
        const b = await body(req);
        const email = (b && b.email || '').trim().toLowerCase();
        if (!validEmail(email) || !validKey(b.recAuth) || !validKey(b.newAuthKey) || !validWrap(b.wrappedPw) || !b.wrappedPw) return err(400, 'Invalid request');
        if (await throttled(env, 'rec:' + email)) return err(429, 'Too many attempts. Try again in 15 minutes.');
        const u = await env.DB.prepare('SELECT id, rec_hash, rec_salt FROM users WHERE email = ?').bind(email).first();
        if (!u || !u.rec_hash || !safeEq(await sha256(u.rec_salt + b.recAuth), u.rec_hash)) { await recordFail(env, 'rec:' + email); return err(401, 'Wrong email or recovery key'); }
        const salt = randHex(16);
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET auth_hash = ?, auth_salt = ?, wrapped_pw = ? WHERE id = ?').bind(await sha256(salt + b.newAuthKey), salt, b.wrappedPw, u.id),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(u.id) // sign out everywhere
        ]);
        await env.DB.prepare('DELETE FROM fails WHERE email = ?').bind('rec:' + email).run();
        return json({ token: await newSession(env, u.id) });
      }

      // Everything below needs a session
      const uid = await userFromToken(req, env);
      if (!uid) return err(401, 'Signed out. Log in again.');

      if (p === '/logout' && M === 'POST') {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(req.headers.get('authorization').slice(7))).run();
        return json({ ok: true });
      }
      if (p === '/account' && M === 'DELETE') {
        await env.DB.batch(['photos', 'snapshots', 'chunks', 'blobs', 'sessions'].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(uid))
          .concat(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid)));
        return json({ ok: true });
      }
      // Store wrapped keys / recovery check value (used after upgrading an older account, or regenerating the recovery key)
      if (p === '/keys' && M === 'POST') {
        const b = await body(req);
        if (!b || !validWrap(b.wrappedPw) || !validWrap(b.wrappedRec) || (b.recAuth != null && !validKey(b.recAuth))) return err(400, 'Invalid request');
        if (b.wrappedPw) await env.DB.prepare('UPDATE users SET wrapped_pw = ? WHERE id = ?').bind(b.wrappedPw, uid).run();
        if (b.wrappedRec && b.recAuth) {
          const salt = randHex(16);
          await env.DB.prepare('UPDATE users SET wrapped_rec = ?, rec_hash = ?, rec_salt = ? WHERE id = ?').bind(b.wrappedRec, await sha256(salt + b.recAuth), salt, uid).run();
        }
        return json({ ok: true });
      }
      // Change password: requires the current password's auth key
      if (p === '/password' && M === 'POST') {
        const b = await body(req);
        if (!b || !validKey(b.currentAuthKey) || !validKey(b.newAuthKey) || !validWrap(b.wrappedPw) || !b.wrappedPw) return err(400, 'Invalid request');
        const u = await env.DB.prepare('SELECT email, auth_hash, auth_salt FROM users WHERE id = ?').bind(uid).first();
        if (await throttled(env, u.email)) return err(429, 'Too many attempts. Try again in 15 minutes.');
        if (!safeEq(await sha256(u.auth_salt + b.currentAuthKey), u.auth_hash)) { await recordFail(env, u.email); return err(401, 'Current password is wrong'); }
        const salt = randHex(16), token = req.headers.get('authorization').slice(7);
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET auth_hash = ?, auth_salt = ?, wrapped_pw = ? WHERE id = ?').bind(await sha256(salt + b.newAuthKey), salt, b.wrappedPw, uid),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(uid, await sha256(token)) // sign out other devices
        ]);
        return json({ ok: true });
      }

      // ---- Chunked data
      if (p === '/chunks' && M === 'GET') {
        const r = await env.DB.prepare('SELECT name, rev, updated, length(data) AS size FROM chunks WHERE user_id = ?').bind(uid).all();
        return json(r.results);
      }
      const ch = p.match(/^\/chunks\/([a-z0-9-]{1,32})$/);
      if (ch && M === 'GET') return json((await getChunk(env, uid, ch[1])) || { rev: 0, data: null, updated: 0 });
      if (ch && M === 'PUT') return putChunk(env, uid, ch[1], await body(req));
      // Back-compat for app versions before 1.5 (single blob = the "core" chunk)
      if (p === '/data' && M === 'GET') return json((await getChunk(env, uid, 'core')) || { rev: 0, data: null, updated: 0 });
      if (p === '/data' && M === 'PUT') return putChunk(env, uid, 'core', await body(req));

      // ---- Backups
      if (p === '/snapshots' && M === 'GET') {
        const r = await env.DB.prepare('SELECT id, name, rev, created, length(data) AS size FROM snapshots WHERE user_id = ? ORDER BY created DESC').bind(uid).all();
        return json(r.results);
      }
      const snap = p.match(/^\/snapshots\/(\d+)$/);
      if (snap && M === 'GET') {
        const r = await env.DB.prepare('SELECT id, name, rev, data, created FROM snapshots WHERE user_id = ? AND id = ?').bind(uid, +snap[1]).first();
        return r ? json(r) : err(404, 'Backup not found');
      }

      // ---- Photos (each encrypted separately)
      if (p === '/photos' && M === 'GET') {
        const r = await env.DB.prepare('SELECT id, created FROM photos WHERE user_id = ?').bind(uid).all();
        return json(r.results);
      }
      const ph = p.match(/^\/photos\/([A-Za-z0-9_-]{1,40})$/);
      if (ph && M === 'GET') {
        const r = await env.DB.prepare('SELECT data FROM photos WHERE user_id = ? AND id = ?').bind(uid, ph[1]).first();
        return r ? json(r) : err(404, 'Photo not found');
      }
      if (ph && M === 'PUT') {
        const b = await body(req);
        if (!b || typeof b.data !== 'string') return err(400, 'Bad request');
        if (b.data.length > MAX_PHOTO) return err(413, 'Photo too large');
        await env.DB.prepare('INSERT OR REPLACE INTO photos (user_id, id, data, created) VALUES (?, ?, ?, ?)').bind(uid, ph[1], b.data, Date.now()).run();
        return json({ ok: true });
      }
      if (ph && M === 'DELETE') {
        await env.DB.prepare('DELETE FROM photos WHERE user_id = ? AND id = ?').bind(uid, ph[1]).run();
        return json({ ok: true });
      }

      return err(404, 'Not found');
    } catch (e) {
      return err(500, 'Server error');
    }
  }
};
