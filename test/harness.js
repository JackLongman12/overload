// Loads the app's browser scripts into a Node VM with minimal browser stubs, so the
// coach, importers, sync, device parsers and rep counter can be unit-tested.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILES = ['util', 'exercises', 'store', 'sync', 'device', 'pose', 'extras', 'coach', 'planning', 'importers', 'updatekey', 'updater', 'app', 'actions', 'views'];
const EXPORTS = ['Store', 'Photos', 'Sync', 'Coach', 'IO', 'BLE', 'HC', 'Pose', 'LM', 'UI', 'Actions', 'Timer', 'Updater', 'BUILTIN_EXERCISES', 'PROGRAMS', 'LADDERS',
  'warmupSets', 'readinessScore', 'convertUnits', 'findPRs', 'routineGroups', 'workoutVolume', 'uid', 'parseDur', 'fmtDur', 'ErrorLog', 'Plan', 'EQUIPMENT', 'Achievements', 'BodyMap'];

function load() {
  const storage = new Map();
  const noop = () => { };
  const el = () => ({ textContent: '', innerHTML: '', style: {}, classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, dataset: {} });
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Promise, URL, Blob, Response,
    TextEncoder, TextDecoder, crypto: globalThis.crypto, atob, btoa, CompressionStream, DecompressionStream,
    performance, structuredClone, Uint8Array, DataView, ArrayBuffer,
    localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k), clear: () => storage.clear() },
    navigator: { onLine: true },
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, createElement: el, body: { classList: { add: noop, remove: noop } } },
    alert: noop, confirm: () => true, requestAnimationFrame: noop, cancelAnimationFrame: noop, addEventListener: noop
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const src = FILES.map(f => {
    const p = path.join(__dirname, '..', 'www', 'js', f + '.js');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/^'use strict';/m, '') : '';
  }).join('\n;\n');
  const api = vm.runInContext(src + `\n;({${EXPORTS.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(',')}})`, ctx, { filename: 'app-bundle.js' });
  api.ctx = ctx;
  return api;
}

// Fresh app with empty data
async function fresh() {
  const app = load();
  await app.Store.load();
  app.Store.data.onboarded = true;
  return app;
}

const DAY = 864e5;
function session(app, exId, daysAgo, sets, target, extra = {}) {
  const t = Date.now() - daysAgo * DAY;
  const w = { id: app.uid(), name: 'W', start: t, end: t + 3600e3, exercises: [{ exId, target, sets: sets.map(([w, r, rpe]) => ({ type: 'N', w, r, rpe: rpe || '', done: true })) }], ...extra };
  app.Store.data.workouts.push(w);
  return w;
}

module.exports = { load, fresh, session, DAY };
