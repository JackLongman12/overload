// Builds the signed release APK (sideloading) and AAB (Play Store): node scripts/build-apk.mjs
// Output: dist/overload-<versionName>.apk and dist/overload-<versionName>.aab
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process'; import os from 'node:os';
if (!fs.existsSync('keys/keystore.properties')) { console.error('No release key. Run: node scripts/setup-keys.mjs'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync('release.config.json', 'utf8'));
const env = { ...process.env };
if (!env.ANDROID_HOME) env.ANDROID_HOME = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const jdks = fs.existsSync('C:/Program Files/Microsoft') ? fs.readdirSync('C:/Program Files/Microsoft').filter(d => /^jdk-21/.test(d)) : [];
if (jdks.length) env.JAVA_HOME = path.join('C:/Program Files/Microsoft', jdks.sort().pop());
// Stamp the version into the Android project
const gradle = 'android/app/build.gradle';
let g = fs.readFileSync(gradle, 'utf8');
g = g.replace(/versionCode \d+/, `versionCode ${cfg.apkVersionCode}`).replace(/versionName "[^"]*"/, `versionName "${cfg.apkVersionName}"`);
fs.writeFileSync(gradle, g);
const run = (cmd, cwd = '.') => { console.log('> ' + cmd); execSync(cmd, { stdio: 'inherit', env, cwd }); };
run('npx cap sync android');
const gw = process.platform === 'win32' ? `"${path.resolve('android/gradlew.bat')}"` : './gradlew';
run(`${gw} assembleRelease bundleRelease`, 'android');
fs.mkdirSync('dist', { recursive: true });
const base = `dist/gym-app-${cfg.apkVersionName}`;
fs.copyFileSync('android/app/build/outputs/apk/release/app-release.apk', base + '.apk');
fs.copyFileSync('android/app/build/outputs/bundle/release/app-release.aab', base + '.aab');
console.log('\nReady:\n  ' + path.resolve(base + '.apk') + '  (install on phones)\n  ' + path.resolve(base + '.aab') + '  (upload to Google Play)');
