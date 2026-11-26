// Publish an update to GitHub. Usage:
//   Content update (no reinstall): bump "version" in www/version.json, then: node scripts/release.mjs
//   New APK as well:               bump apkVersionCode/apkVersionName in release.config.json, then: node scripts/release.mjs --apk
// Uploads files to GitHub Releases and commits update.json, which phones read from
// https://raw.githubusercontent.com/<repo>/main/update.json
import fs from 'node:fs'; import { execSync } from 'node:child_process'; import AdmZip from 'adm-zip';
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

// 3) Feed
const feed = { version, bundle: dl(tag, zipName), notes: cfg.notes, apkVersionCode: cfg.apkVersionCode, apk: dl(apkTag, apkName) };
fs.writeFileSync('update.json', JSON.stringify(feed, null, 2) + '\n');
sh('git add update.json www/version.json release.config.json');
try { sh(`git commit -m "Release ${version}${withApk ? ' (APK ' + cfg.apkVersionName + ')' : ''}"`); } catch { console.log('Nothing new to commit'); }
sh('git push');
console.log('\nPublished. Phones pick this up on their next launch.\n' + JSON.stringify(feed, null, 2));
