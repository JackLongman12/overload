// Publish an update to GitHub. Usage:
//   Content update (no reinstall): bump "version" in www/version.json, then: node scripts/release.mjs
//   New APK as well:               bump apkVersionCode/apkVersionName in release.config.json, then: node scripts/release.mjs --apk
// Uploads files to GitHub Releases and commits update.json, which phones read from
// https://raw.githubusercontent.com/<repo>/main/update.json
import fs from 'node:fs'; import crypto from 'node:crypto'; import { execSync } from 'node:child_process'; import AdmZip from 'adm-zip';
if (!fs.existsSync('keys/update-private.pem')) { console.error('No update-signing key. Run: node scripts/setup-keys.mjs'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync('release.config.json', 'utf8'));
const { version } = JSON.parse(fs.readFileSync('www/version.json', 'utf8'));
const withApk = process.argv.includes('--apk');
const sh = c => { console.log('> ' + c); return execSync(c, { stdio: 'inherit' }); };
const dl = (tag, file) => `https://github.com/${cfg.repo}/releases/download/${tag}/${file}`;
const exists = tag => { try { execSync(`gh release view ${tag} --repo ${cfg.repo}`, { stdio: 'ignore' }); return true; } catch { return false; } };
fs.mkdirSync('dist', { recursive: true });

// 1) Web bundle (index.html at the zip root)
const zipName = `bundle-${version}.zip`;
const zip = new AdmZip(); zip.addLocalFolder('www'); zip.writeZip('dist/' + zipName);
const tag = `v${version}`;
if (exists(tag)) sh(`gh release upload ${tag} dist/${zipName} --clobber --repo ${cfg.repo}`);
else sh(`gh release create ${tag} dist/${zipName} --repo ${cfg.repo} --title "Content update ${version}" --notes "${cfg.notes.replace(/"/g, "'")}"`);

// 2) Optional APK
const apkName = `overload-${cfg.apkVersionName}.apk`, apkTag = `apk-${cfg.apkVersionName}`;
if (withApk) {
  if (!fs.existsSync('dist/' + apkName)) throw new Error('Build the APK first: node scripts/build-apk.mjs');
  if (exists(apkTag)) sh(`gh release upload ${apkTag} dist/${apkName} --clobber --repo ${cfg.repo}`);
  else sh(`gh release create ${apkTag} dist/${apkName} --repo ${cfg.repo} --title "Overload app ${cfg.apkVersionName}" --notes "Install this APK on Android. ${cfg.notes.replace(/"/g, "'")}" --latest`);
}

// 3) Signed feed. The app verifies `sig` with the public key in www/js/updatekey.js,
//    and the updater plugin verifies the zip against `checksum` (SHA-256).
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const feed = { version, bundle: dl(tag, zipName), checksum: sha256('dist/' + zipName), notes: cfg.notes,
  apkVersionCode: cfg.apkVersionCode, apk: dl(apkTag, apkName), apkSha256: fs.existsSync('dist/' + apkName) ? sha256('dist/' + apkName) : '', published: new Date().toISOString() };
const payload = JSON.stringify(feed);
const sig = crypto.sign('sha256', Buffer.from(payload), { key: fs.readFileSync('keys/update-private.pem'), dsaEncoding: 'ieee-p1363' }).toString('base64');
fs.writeFileSync('update.json', JSON.stringify({ payload, sig }, null, 2) + '\n');
sh('git add update.json www/version.json release.config.json');
try { sh(`git commit -m "Release ${version}${withApk ? ' (APK ' + cfg.apkVersionName + ')' : ''}"`); } catch { console.log('Nothing new to commit'); }
sh('git push');
console.log('\nPublished. Phones pick this up on their next launch.\n' + JSON.stringify(feed, null, 2));
