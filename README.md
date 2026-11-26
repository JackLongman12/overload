# Gym App: a free gym tracker with a progressive overload coach

Every feature is free. No account, no ads. Data stays on your phone.

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

## Watches, scales and sensors
- **Health Connect** (Samsung, Pixel/Fitbit, Xiaomi, Amazfit, Garmin, some Honor): sleep, resting HR and HRV feed the readiness score. Weight and body fat sync into measurements. Watch cardio sessions are imported, and workout heart rate is added. Code is in `www/js/device.js` (`HC`).
- **Xiaomi Bluetooth scales** (Mi Smart Scale and Mi Body Composition Scale 1 and 2): weight is read passively from the scale's broadcast (`BLE.parseMi1` and `BLE.parseMi2`).
- **Heart-rate straps and watches** that broadcast heart rate (standard BLE 0x180D): live bpm during workouts, and average and max are saved.
- Apple Watch isn't supported because it only pairs with iPhone.

## Wear OS watch app
`gym-app-<version>-wear.apk` (on the Releases page) runs on Wear OS 3+ watches, such as Galaxy Watch 4 or newer and Pixel Watch. It shows the current exercise, set and target, counts down rest, and lets you complete sets, add 30 s or skip rest from your wrist. It talks to the phone app through the Wearable Data Layer, so the watch must be paired with the phone and both apps must come from this repo (same signing key).

To sideload it:
1. On the watch, open Settings > About watch > Software, and tap **Software version** 7 times to enable developer options.
2. Go to Settings > Developer options. Turn on **ADB debugging** and **Wireless debugging**, and note the IP address and port.
3. On a computer with Android platform-tools, run:
   ```
   adb connect <ip>:<port>
   adb install gym-app-<version>-wear.apk
   ```
   Galaxy Watch may ask you to pair with a code first: run `adb pair <ip>:<pair-port>`.

Code is in `android/wear/` (watch) and `WearBridgePlugin.java` (phone side).

## Home-screen widget
Long-press the home screen, tap Widgets, then add Gym App. It shows your next workout, this week's progress, streak and readiness. Code is in `GymWidget.java`.

## AI rep counter (on-device)
MediaPipe Pose Landmarker runs on the phone (`www/js/pose.js`). It counts reps from joint angles and gives form cues for squat depth and push-up hip line. The roughly 20 MB AI pack is downloaded on first use and SHA-256-checked against hashes in the signed app. It isn't in the update bundle, so over-the-air updates stay small.

## Import and export
**You > Import, export and sync** reads:
- Hevy CSV
- Strong CSV
- FitNotes CSV
- Any CSV with Date, Exercise, Weight and Reps columns
- GPX and TCX files (Strava, Garmin and others)
- Gym App `.json` backups

It exports a JSON backup, Strong-format CSV (which Hevy can import) and Hevy-format CSV.

## Test in a browser
```
node scripts/serve.mjs
```
Then open http://localhost:5173.

## Code map
| File | What it does |
|---|---|
| `www/js/exercises.js` | Exercise library (180+), skill ladders, climbing grades, programs |
| `www/js/coach.js` | Personal trainer: double progression, stall detection, deloads, readiness, volume balance, recovery; strength calculators |
| `www/js/climbing.js` | Grades, hangboard protocols, climbing coach, workload, profile, 16-week climbing plans |
| `www/js/howto.js` | Directions for every exercise |
| `www/vendor/bodymap-art.js` | Muscle map artwork from [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter) (MIT) |
| `www/js/store.js` | Local data and native file mirror |
| `www/js/importers.js` | Hevy, Strong, FitNotes, GPX, TCX import; CSV and JSON export |
| `www/js/updater.js` | Content and APK auto-update |
| `www/js/app.js`, `actions.js`, `views.js` | Screens and interactions |
