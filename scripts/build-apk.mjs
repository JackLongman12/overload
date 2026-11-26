// Builds the Android APK: node scripts/build-apk.mjs
// Output: dist/overload-<versionName>.apk
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process'; import os from 'node:os';
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
run(process.platform === 'win32' ? `"${path.resolve('android/gradlew.bat')}" assembleDebug` : './gradlew assembleDebug', 'android');
fs.mkdirSync('dist', { recursive: true });
const out = `dist/overload-${cfg.apkVersionName}.apk`;
fs.copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', out);
console.log('\nAPK ready: ' + path.resolve(out));
