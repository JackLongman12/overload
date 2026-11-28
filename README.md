# Gym App: a free gym tracker with a progressive overload coach

Every feature is free. No account, no ads. Data stays on your phone.

## How the app is laid out (2.3.0)
- **Home:** the Today card (what to train, readiness, training block), Empty workout and Plans, your routines, this week.
- **Train:** Plans (ready-made programs, build your own, training blocks, the climbing plan), exercises for Strength, Calisthenics (with skill ladders), Cardio and Climbing, three timers (Intervals, Rounds, Hangboard) and one Calculators page. Plate loading sits on each barbell exercise during a workout.
- **Progress:** top coach notes (the full list and questions are on the Coach page), stats, climbing strength, weekly chart, body map, best lifts, history, a PDF report and achievements.
- **You:** body weight, photos, Health Connect, Backup and sync, Settings (app updates at the bottom), exercise library.

## Install on your Android phone
1. Download the latest `gym-app-<version>.apk` from https://github.com/JackLongman12/overload/releases on your phone (or copy it from `dist/`).
2. Open it on the phone. Android asks you to allow installs from that app (Files/Drive). Allow it, then tap **Install**.
3. Open **Gym App**. Allow notifications so the rest timer and interval timers alert you with the screen off.

## Keys: back these up
`keys/` holds two private keys. Git ignores them, so they exist only on this PC.
- `overload-release.jks` and `keystore.properties` sign the APK and AAB. Without them, new APKs can't update existing installs, and you can't update a Play Store listing.
- `update-private.pem` signs `update.json`. The app rejects any update not signed with it, so a leaked or compromised GitHub account can't push code to phones.

Copy the `keys/` folder to a password manager or an encrypted USB drive. To create them on a new machine, run `node scripts/setup-keys.mjs`, but that makes new keys, which means a reinstall for everyone.

## Rebuild the APK after code changes
```
node scripts/build-apk.mjs
```
Outputs a release-signed `dist/gym-app-<version>.apk` (for phones) and `.aab` (for Google Play). Uses JDK 21 and the Android SDK on this PC.

## Auto-update
There are two kinds of update:
The app reads `update.json` from this repo (https://raw.githubusercontent.com/JackLongman12/overload/main/update.json). That URL is built in, so there's nothing to set up on the phone.

- **Content updates** (features, coach logic, fixes; anything in `www/`): no reinstall needed.
  1. Bump `version` in `www/version.json` (for example 1.0.0 to 1.0.1).
  2. Run `node scripts/release.mjs`. It zips `www/`, uploads it to a GitHub Release, and commits and pushes `update.json`.
  3. Phones download the update in the background and switch to it the next time the user leaves the app (or on the next launch). Never during a workout or a running timer.
- **Native updates** (new plugins, Android changes): bump `apkVersionCode` and `apkVersionName` in `release.config.json`, then run:
  ```
  node scripts/build-apk.mjs
  node scripts/release.mjs --apk
  ```
  Phones on 2.1.0 or newer download the APK in the background, check its SHA-256 against the signed feed, and install it themselves when the user leaves the app (`AppUpdatePlugin.java`, Android PackageInstaller). On Android 12+ this is silent once the user has allowed "Install unknown apps" for Gym App (the app asks once). Android also refuses any APK not signed with the same release key.
- `bundleMinApk` in `release.config.json` is the oldest APK build that can run the current `www/`. Raise it when web code starts depending on a new native plugin; phones on older APKs then wait for the APK update instead of getting the bundle.

The latest APK is always at https://github.com/JackLongman12/overload/releases.


## Accounts and cloud sync (server/)
Optional, end-to-end encrypted sync runs on a Cloudflare Worker with a D1 database (free tier).
- **Account keys (2.0+):** there is no email or password. The phone makes a random 25-character key (about 125 bits). The server only sees an ID hashed from the key. From the key the phone derives an **auth key** (stored on the server only as a salted hash) and an **encryption key** (never sent). Data and photos are gzipped and AES-GCM encrypted before upload. Losing the key and the phone means the cloud copy can't be recovered.
- Accounts made with an email before 2.0 still log in from "I made an account with an email before".
- Sync merges records by ID, and deletions sync too. Conflicts are handled with revision numbers.
- The server keeps a daily snapshot for 14 days. You can restore one in the app.
- Live at https://gym-app-sync.lp-reports.workers.dev

To redeploy after changing `server/src/index.js`:
```
cd server
npx wrangler deploy
```

## Health Connect
- Samsung, Pixel/Fitbit, Xiaomi, Amazfit, Garmin and some Honor watches: sleep, resting HR and HRV feed the readiness score. Weight and body fat (including from smart scales that sync to Health Connect) go into measurements. Watch cardio sessions are imported, and workout heart rate is added. Code is in `www/js/device.js` (`HC`).
- Apple Watch isn't supported because it only pairs with iPhone.

## Home-screen widget
Long-press the home screen, tap Widgets, then add Gym App. It shows your next workout, this week's progress, streak and readiness. Code is in `GymWidget.java`.

## Import and export
**You > Backup and sync** holds encrypted sync, the backup file and import. It reads:
- Hevy CSV
- Strong CSV
- FitNotes CSV
- Any CSV with Date, Exercise, Weight and Reps columns
- GPX and TCX files (Strava, Garmin and others)
- Gym App `.json` backups

It exports a JSON backup and a Strong-format CSV (Hevy and Strong can both import it).

## Test in a browser
```
node scripts/serve.mjs
```
Then open http://localhost:5173.

## Ask the coach and Gemini Nano
The chat answers six common questions (today, progress, stuck, recovery, fingers, this week) from the app's own coach, offline, on every phone. On phones with Gemini Nano in Android AICore (Galaxy S25/S26, Pixel 9 and newer, and others), it also takes free-form questions: the app sends Nano a prompt with facts from your log and the built-in coach's answer, and Nano writes the reply on the device. Nothing leaves the phone. The Prompt API is in beta, and Android only allows it while the app is on screen.

## Code map
| File | What it does |
|---|---|
| `www/js/exercises.js` | Exercise library (180+), skill ladders, programs |
| `www/js/coach.js` | Personal trainer: double progression, stall detection, deloads, readiness, volume balance, recovery; strength calculators |
| `www/js/climbing.js` | Hangboard protocols and progression, finger strength as % of body weight, finger rest days, 16-week climbing plans. Climbing sessions are logged as time (no grades) |
| `www/js/howto.js` | Directions for every exercise |
| `www/vendor/bodymap-art.js` | Muscle map artwork from [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter) (MIT) |
| `www/js/store.js` | Local data and native file mirror |
| `www/js/importers.js` | Hevy, Strong, FitNotes, GPX, TCX import; CSV and JSON export |
| `www/js/updater.js` | Content and APK auto-update |
| `www/js/ask.js` | Today card and the Ask the coach chat (built-in answers, plus on-device Gemini Nano when the phone has it) |
| `android/.../NanoPlugin.java` | Gemini Nano bridge (ML Kit GenAI Prompt API on AICore). Phones without it report unavailable |
| `www/js/app.js`, `actions.js`, `views.js` | Screens and interactions |
