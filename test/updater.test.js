const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh } = require('./harness');

// A fake phone: App, CapacitorUpdater and AppUpdate plugins that record what the updater does
function phone(app, { build = 7, canInstall = true, silent = true } = {}) {
  const calls = [], listeners = {};
  const P = {
    App: { getInfo: async () => ({ build: String(build), version: 'x' }), addListener: (ev, fn) => { listeners[ev] = fn; } },
    CapacitorUpdater: { notifyAppReady: async () => { }, download: async o => { calls.push(['bundle', o.version]); return { id: 'b1' }; }, next: async () => calls.push(['next']), set: async () => calls.push(['set']) },
    AppUpdate: { addListener: (ev, fn) => { listeners['au:' + ev] = fn; }, status: async () => ({ canInstall, silent, downloaded: 1, sdk: 34 }),
      download: async o => { calls.push(['apk', o.sha256.slice(0, 4)]); return { size: 1 }; }, install: async () => calls.push(['install']), openInstallSettings: async () => calls.push(['settings']) }
  };
  app.ctx.Capacitor = { isNativePlatform: () => true, Plugins: P };
  app.ctx.fetch = async () => ({ json: async () => ({ version: '1.0.0' }) });
  app.Updater.verify = async x => x;
  app.UI.onUpdateState = () => { }; app.ctx.setTimeout = (fn, ms) => ms > 1000 ? 0 : setTimeout(fn, ms);
  return { calls, listeners };
}
const FEED = { version: '9.9.9', bundle: 'https://x/b.zip', checksum: 'a'.repeat(64), apkVersionCode: 9, apk: 'https://x/a.apk', apkSha256: 'b'.repeat(64), minApk: 5 };
const feedFetch = app => { app.ctx.fetch = async () => ({ json: async () => FEED }); };

test('new APK downloads in the background and installs silently when you leave the app', async () => {
  const app = await fresh(); const { calls, listeners } = phone(app);
  await app.Updater.init(); feedFetch(app);
  await app.Updater.check(false);
  assert.equal(app.Updater.apkState, 'ready');
  assert.ok(calls.some(c => c[0] === 'apk'));
  assert.ok(calls.some(c => c[0] === 'bundle'), 'content still updates while the APK waits');
  listeners.pause();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(calls.some(c => c[0] === 'install'));
});

test('never installs during a workout', async () => {
  const app = await fresh(); const { calls, listeners } = phone(app);
  await app.Updater.init(); feedFetch(app);
  await app.Updater.check(false);
  app.Store.data.active = { id: 'w', exercises: [] };
  listeners.pause();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(!calls.some(c => c[0] === 'install' || c[0] === 'set'));
});

test('asks once for the install permission, then installs on return', async () => {
  const app = await fresh(); const ph = phone(app, { canInstall: false });
  await app.Updater.init(); feedFetch(app);
  await app.Updater.check(false);
  assert.equal(app.Updater.apkState, 'permission');
  await app.Updater.installApk(true);
  assert.ok(ph.calls.some(c => c[0] === 'settings'));
  app.ctx.Capacitor.Plugins.AppUpdate.status = async () => ({ canInstall: true, silent: true, downloaded: 1 });
  await ph.listeners.resume();
  await new Promise(r => setTimeout(r, 10));
  assert.ok(ph.calls.some(c => c[0] === 'install'));
});

test('content that needs a newer APK is not applied to an old one', async () => {
  const app = await fresh(); const { calls } = phone(app, { build: 4 });
  await app.Updater.init(); feedFetch(app);
  await app.Updater.check(false);
  assert.ok(!calls.some(c => c[0] === 'bundle'));
  assert.equal(app.Updater.state, 'apk');
});

test('an APK without the installer falls back to a one-time download', async () => {
  const app = await fresh(); phone(app);
  delete app.ctx.Capacitor.Plugins.AppUpdate;
  await app.Updater.init(); feedFetch(app);
  await app.Updater.check(false);
  assert.equal(app.Updater.apkState, 'manual');
});

test('an optional APK never puts up a bar or sends you out of the app', async () => {
  const app = await fresh(); phone(app, { canInstall: false, silent: false });
  let banner = '';
  const el = { set innerHTML(v) { banner += v; }, get innerHTML() { return banner; } };
  app.ctx.document.querySelector = s => (s === '#updbar' ? el : { innerHTML: '' });
  await app.Updater.init(); feedFetch(app);
  await app.Updater.check(false);
  assert.equal(app.Updater.state, 'ready', 'content updates quietly');
  app.UI.renderBanner();
  assert.equal(banner, '');
  delete app.ctx.Capacitor.Plugins.AppUpdate;
  app.Updater.apkState = ''; await app.Updater.check(false);
  app.UI.renderBanner();
  assert.ok(!/Download/.test(banner));
});
