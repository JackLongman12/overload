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
  3. Phones download the update in the background at startup and apply it on the next launch.
- **Native updates** (new plugins, Android changes): bump `apkVersionCode` and `apkVersionName` in `release.config.json`, then run:
  ```
  node scripts/build-apk.mjs
  node scripts/release.mjs --apk
  ```
  The app shows a "new app version, Download" banner.

The latest APK is always at https://github.com/JackLongman12/overload/releases.


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
| `www/js/coach.js` | Personal trainer: double progression, stall detection, deloads, readiness, volume balance, recovery |
| `www/js/store.js` | Local data and native file mirror |
| `www/js/importers.js` | Hevy, Strong, FitNotes, GPX, TCX import; CSV and JSON export |
| `www/js/updater.js` | Content and APK auto-update |
| `www/js/app.js`, `actions.js`, `views.js` | Screens and interactions |
