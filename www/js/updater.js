// Auto-update, without the user having to do anything:
// 1) Content updates (OTA): downloads the new web bundle quietly and switches to it the next time
//    you leave the app (or on next launch). Uses @capgo/capacitor-updater in manual mode.
// 2) App (APK) updates: downloads the new APK in the background, checks its SHA-256 from the signed
//    feed, and installs it when you leave the app. On Android 12+ this is silent after a one-time
//    "allow installs" permission (AppUpdate native plugin). Never during a workout or timer.
// A bundle only applies when the installed APK is at least `minApk`, so web code never runs on
// an APK that lacks the native parts it needs.
// update.json format (host it anywhere, e.g. GitHub Releases or raw.githubusercontent.com):
// { "version": "1.0.1", "bundle": "https://.../bundle-1.0.1.zip", "notes": "...",
//   "apkVersionCode": 2, "apk": "https://.../overload-2.apk" }
'use strict';

const Updater = {
  bundleVersion: '0.0.0', nativeBuild: 0, nativeVersion: '', state: 'idle', info: null, lastCheck: 0, apkState: '', apkStatus: null,

  cmp(a, b) { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; },

  async init() {
    try { const v = await (await fetch('version.json', { cache: 'no-store' })).json(); this.bundleVersion = v.version; } catch (e) { }
    const app = Plugin('App');
    if (app) { try { const i = await app.getInfo(); this.nativeBuild = +i.build || 0; this.nativeVersion = i.version; } catch (e) { } }
    const up = Plugin('CapacitorUpdater');
    if (up) { try { await up.notifyAppReady(); } catch (e) { } }
    // Tell the user once that an update went in
    try {
      const key = 'gymapp.lastVersion', was = localStorage.getItem(key), now = this.bundleVersion + '/' + this.nativeBuild;
      if (was && was !== now && this.bundleVersion !== '0.0.0') setTimeout(() => toast(`Updated to ${this.bundleVersion}`), 1500);
      localStorage.setItem(key, now);
    } catch (e) { }
    const au = Plugin('AppUpdate');
    if (au && au.addListener) au.addListener('installStatus', r => this.onInstallStatus(r));
    if (app) {
      app.addListener('pause', () => this.onLeave());
      app.addListener('resume', () => this.onReturn());
    }
    if (Store.data.settings.autoUpdate !== false && Store.data.settings.updateUrl) setTimeout(() => this.check(false), 4000);
  },

  // Never interrupt a workout or a running timer
  busy() { return !!Store.data.active || (typeof Timer !== 'undefined' && Timer.iv && !Timer.finished && Timer.phases.length > 0); },

  // Leaving the app is the quiet moment to switch versions
  onLeave() {
    if (Store.data.settings.autoUpdate === false || this.busy()) return;
    if (this.apkState === 'ready' && this.apkStatus && this.apkStatus.silent) { this.installApk(false); return; }
    const up = Plugin('CapacitorUpdater');
    if (this.state === 'ready' && this._bundleId && up && !this.apkState) { this._applied = true; up.set({ id: this._bundleId }).catch(() => { }); }
  },
  async onReturn() {
    // Back from the "allow installs" screen: install straight away, the user is waiting for it
    if (this.apkState === 'permission') {
      const au = Plugin('AppUpdate'); if (!au) return;
      try { this.apkStatus = await au.status(); } catch (e) { return; }
      if (this.apkStatus.canInstall) { this.apkState = 'ready'; this.emit(); if (this._wantInstall) this.installApk(true); }
      return;
    }
    if (Store.data.settings.autoUpdate !== false && Date.now() - this.lastCheck > 6 * 3600e3) this.check(false);
  },
  onInstallStatus(r) {
    if (r.status === 'success') { this.apkState = 'done'; toast('Update installed. Gym App will restart.'); }
    else if (r.status === 'needsTap') this.apkState = 'tap';
    else if (r.status === 'failed') { this.apkState = 'ready'; this.err = r.message || 'Install failed'; ErrorLog.add('update', 'Install failed: ' + this.err); }
    this.emit();
  },

  // Download the new APK in the background (checked against the signed SHA-256)
  async prepareApk(info) {
    const au = Plugin('AppUpdate');
    if (!au || !/^[0-9a-f]{64}$/i.test(info.apkSha256 || '')) { this.apkState = 'manual'; this.emit(); return; } // APKs before 2.1 can't self-install
    if (['downloading', 'installing', 'done'].includes(this.apkState)) return;
    this.apkState = 'downloading'; this.emit();
    try {
      await au.download({ url: info.apk, sha256: info.apkSha256 });
      this.apkStatus = await au.status();
      this.apkState = this.apkStatus.canInstall ? 'ready' : 'permission';
    } catch (e) { this.apkState = 'error'; this.err = e.message || String(e); }
    this.emit();
  },
  // force = the user tapped a button (it's fine to show a system screen now)
  async installApk(force) {
    const au = Plugin('AppUpdate'); if (!au) return this.openApk();
    try {
      this.apkStatus = await au.status();
      if (!this.apkStatus.canInstall) { this.apkState = 'permission'; this.emit(); if (force) { this._wantInstall = true; await au.openInstallSettings(); } return; }
      if (!this.apkStatus.downloaded) { await this.prepareApk(this.info); if (this.apkState !== 'ready') return; }
      this.apkState = 'installing'; this.emit();
      await au.install({ sha256: this.info.apkSha256 });
    } catch (e) { this.apkState = 'ready'; this.err = e.message || String(e); this.emit(); if (force) toast('Update failed: ' + this.err); }
  },

  async check(manual) {
    const url = Store.data.settings.updateUrl;
    if (!url) { if (manual) toast('Add an update URL in Settings first'); return; }
    this.state = 'checking'; this.emit();
    try {
      const signed = await (await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' })).json();
      const info = await this.verify(signed); // throws if the feed wasn't signed with our private key
      this.info = info; this.lastCheck = Date.now();
      const needApk = info.apkVersionCode && this.nativeBuild && info.apkVersionCode > this.nativeBuild && info.apk;
      if (needApk) await this.prepareApk(info);
      // The new content works on this APK? Then it updates quietly too, even while an APK update waits
      const bundleOk = !this.nativeBuild || !info.minApk || this.nativeBuild >= info.minApk;
      if (needApk && !bundleOk) { this.state = 'apk'; this.emit(); return; }
      if (this.state === 'ready' && this._bundleId && this.info.version === info.version) return;
      if (info.version && this.cmp(info.version, this.bundleVersion) > 0 && info.bundle) {
        const up = Plugin('CapacitorUpdater');
        if (!up) { this.state = 'web'; this.emit(); return; } // browser: reload gets new files
        this.state = 'downloading'; this.emit();
        if (!/^[0-9a-f]{64}$/i.test(info.checksum || '')) throw new Error('Update has no checksum');
        const b = await up.download({ url: info.bundle, version: info.version, checksum: info.checksum }); // plugin rejects a zip whose SHA-256 differs
        await up.next({ id: b.id }); // applies on next app start
        this._bundleId = b.id; this.state = 'ready'; this.emit();
        return;
      }
      // The current content runs fine on this APK, so a newer APK never interrupts: it installs
      // silently when you leave the app if Android allows that, otherwise it waits in Settings
      this.state = 'current'; this.emit();
      if (manual) toast(needApk ? 'You\'re on the latest version. A newer app build is optional; see Settings.' : 'You\'re on the latest version');
    } catch (e) {
      this.state = 'error'; this.err = e.message || String(e); this.emit();
      if (manual) toast('Update check failed: ' + this.err);
    }
  },

  // update.json = { payload: "<json string>", sig: "<base64 ECDSA P-256 / SHA-256 signature>" }
  async verify(signed) {
    if (!signed || typeof signed.payload !== 'string' || !signed.sig) throw new Error('Update feed is not signed');
    const der = Uint8Array.from(atob(UPDATE_PUBLIC_KEY), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sig = Uint8Array.from(atob(signed.sig), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(signed.payload));
    if (!ok) throw new Error('Update signature is invalid, so the update was ignored');
    return JSON.parse(signed.payload);
  },

  async applyNow() {
    const up = Plugin('CapacitorUpdater');
    if (up && this._bundleId) { try { await up.set({ id: this._bundleId }); } catch (e) { toast('Couldn\'t apply update: ' + e.message); } }
    else location.reload();
  },

  openApk() {
    const url = this.info && this.info.apk; if (!url) return;
    const br = Plugin('Browser');
    if (br) br.open({ url }); else window.open(url, '_blank');
  },

  emit() { if (typeof UI !== "undefined" && UI.onUpdateState) UI.onUpdateState(); }
};
