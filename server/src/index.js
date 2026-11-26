// Gym App sync server (Cloudflare Worker + D1).
//
// Zero-knowledge design: the phone derives two keys from the user's password.
//   authKey (sent here)  -> proves identity. Stored only as SHA-256(salt + authKey).
//   encKey  (never sent) -> AES-GCM encrypts all workout data and photos on the phone.
// The server stores opaque ciphertext it cannot read.

const MAX_BLOB = 1_900_000;      // D1 row limit is 2 MB
const MAX_PHOTO = 1_900_000;
const SESSION_DAYS = 365;
const SNAPSHOT_EVERY_MS = 24 * 3600e3;
const SNAPSHOTS_KEPT = 14;

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const err = (status, message) => json({ error: message }, status);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '86400' };

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const validEmail = e => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validKey = k => typeof k === 'string' && /^[0-9a-f]{64}$/.test(k);

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

// Throttle failed logins per email: 8 failures per 15 minutes
async function throttled(env, email) {
  const r = await env.DB.prepare('SELECT count, first FROM fails WHERE email = ?').bind(email).first();
  return r && Date.now() - r.first < 15 * 60e3 && r.count >= 8;
}
async function recordFail(env, email) {
  const r = await env.DB.prepare('SELECT count, first FROM fails WHERE email = ?').bind(email).first();
  if (!r || Date.now() - r.first > 15 * 60e3) await env.DB.prepare('INSERT OR REPLACE INTO fails (email, count, first) VALUES (?, 1, ?)').bind(email, Date.now()).run();
  else await env.DB.prepare('UPDATE fails SET count = count + 1 WHERE email = ?').bind(email).run();
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url), p = url.pathname, M = req.method;
    try {
      if (p === '/' && M === 'GET') return json({ service: 'gym-app-sync', ok: true });

      // ---- Accounts
      if (p === '/signup' && M === 'POST') {
        const b = await body(req);
        const email = (b && b.email || '').trim().toLowerCase();
        if (!validEmail(email) || !validKey(b.authKey)) return err(400, 'Invalid email or key');
        if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return err(409, 'An account with this email already exists');
        const id = randHex(16), salt = randHex(16);
        await env.DB.prepare('INSERT INTO users (id, email, auth_hash, auth_salt, created) VALUES (?, ?, ?, ?, ?)')
          .bind(id, email, await sha256(salt + b.authKey), salt, Date.now()).run();
        return json({ token: await newSession(env, id) });
      }
      if (p === '/login' && M === 'POST') {
        const b = await body(req);
        const email = (b && b.email || '').trim().toLowerCase();
        if (!validEmail(email) || !validKey(b.authKey)) return err(400, 'Invalid email or key');
        if (await throttled(env, email)) return err(429, 'Too many attempts. Try again in 15 minutes.');
        const u = await env.DB.prepare('SELECT id, auth_hash, auth_salt FROM users WHERE email = ?').bind(email).first();
        if (!u || !safeEq(await sha256(u.auth_salt + b.authKey), u.auth_hash)) { await recordFail(env, email); return err(401, 'Wrong email or password'); }
        await env.DB.prepare('DELETE FROM fails WHERE email = ?').bind(email).run();
        return json({ token: await newSession(env, u.id) });
      }

      // Everything below needs a session
      const uid = await userFromToken(req, env);
      if (!uid) return err(401, 'Signed out. Log in again.');

      if (p === '/logout' && M === 'POST') {
        const t = req.headers.get('authorization').slice(7);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(t)).run();
        return json({ ok: true });
      }
      if (p === '/account' && M === 'DELETE') {
        await env.DB.batch(['photos', 'snapshots', 'blobs', 'sessions'].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(uid))
          .concat(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(uid)));
        return json({ ok: true });
      }

      // ---- Data blob (optimistic concurrency on rev)
      if (p === '/data' && M === 'GET') {
        const r = await env.DB.prepare('SELECT rev, data, updated FROM blobs WHERE user_id = ?').bind(uid).first();
        return json(r || { rev: 0, data: null, updated: 0 });
      }
      if (p === '/data' && M === 'PUT') {
        const b = await body(req);
        if (!b || typeof b.data !== 'string' || !Number.isInteger(b.baseRev)) return err(400, 'Bad request');
        if (b.data.length > MAX_BLOB) return err(413, 'Data too large to sync');
        const cur = await env.DB.prepare('SELECT rev, data, updated FROM blobs WHERE user_id = ?').bind(uid).first();
        const curRev = cur ? cur.rev : 0;
        if (b.baseRev !== curRev) return err(409, 'Changed on another device');
        const rev = curRev + 1, now = Date.now();
        const stmts = [env.DB.prepare('INSERT INTO blobs (user_id, rev, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET rev = excluded.rev, data = excluded.data, updated = excluded.updated').bind(uid, rev, b.data, now)];
        // Daily backup snapshot of the previous version
        const last = await env.DB.prepare('SELECT created FROM snapshots WHERE user_id = ? ORDER BY created DESC LIMIT 1').bind(uid).first();
        if (cur && (!last || now - last.created > SNAPSHOT_EVERY_MS)) {
          stmts.push(env.DB.prepare('INSERT INTO snapshots (user_id, rev, data, created) VALUES (?, ?, ?, ?)').bind(uid, cur.rev, cur.data, now));
          stmts.push(env.DB.prepare(`DELETE FROM snapshots WHERE user_id = ? AND id NOT IN (SELECT id FROM snapshots WHERE user_id = ? ORDER BY created DESC LIMIT ${SNAPSHOTS_KEPT})`).bind(uid, uid));
        }
        await env.DB.batch(stmts);
        return json({ rev, updated: now });
      }

      // ---- Backups
      if (p === '/snapshots' && M === 'GET') {
        const r = await env.DB.prepare('SELECT id, rev, created, length(data) AS size FROM snapshots WHERE user_id = ? ORDER BY created DESC').bind(uid).all();
        return json(r.results);
      }
      const snap = p.match(/^\/snapshots\/(\d+)$/);
      if (snap && M === 'GET') {
        const r = await env.DB.prepare('SELECT id, rev, data, created FROM snapshots WHERE user_id = ? AND id = ?').bind(uid, +snap[1]).first();
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
