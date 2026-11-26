// Auto-update.
// 1) Content updates (OTA): downloads a new web bundle zip and applies it on next launch,
//    or right away when you tap "Restart". Uses @capgo/capacitor-updater in manual mode.
// 2) Native updates: if update.json says a newer APK exists, offers to download it.
// update.json format (host it anywhere, e.g. GitHub Releases or raw.githubusercontent.com):
// { "version": "1.0.1", "bundle": "https://.../bundle-1.0.1.zip", "notes": "...",
//   "apkVersionCode": 2, "apk": "https://.../overload-2.apk" }
'use strict';

const Updater = {
  bundleVersion: '0.0.0', nativeBuild: 0, nativeVersion: '', state: 'idle', info: null, lastCheck: 0,

  cmp(a, b) { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; },

  async init() {
    try { const v = await (await fetch('version.json', { cache: 'no-store' })).json(); this.bundleVersion = v.version; } catch (e) { }
    const app = Plugin('App');
    if (app) { try { const i = await app.getInfo(); this.nativeBuild = +i.build || 0; this.nativeVersion = i.version; } catch (e) { } }
    const up = Plugin('CapacitorUpdater');
    if (up) { try { await up.notifyAppReady(); } catch (e) { } }
    if (Store.data.settings.autoUpdate && Store.data.settings.updateUrl) setTimeout(() => this.check(false), 4000);
  },

  async check(manual) {
    const url = Store.data.settings.updateUrl;
    if (!url) { if (manual) toast('Add an update URL in Settings first'); return; }
    this.state = 'checking'; this.emit();
    try {
      const signed = await (await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' })).json();
      const info = await this.verify(signed); // throws if the feed wasn't signed with our private key
      this.info = info; this.lastCheck = Date.now();
      if (info.apkVersionCode && this.nativeBuild && info.apkVersionCode > this.nativeBuild && info.apk) {
        this.state = 'apk'; this.emit(); return;
      }
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
      this.state = 'current'; this.emit();
      if (manual) toast('You\'re on the latest version');
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
