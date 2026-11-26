# Gym App privacy policy

_Last updated: 26 November 2026 (added watches, scales, heart-rate monitors and the camera rep counter)_

Gym App is a workout tracker. This policy explains what happens to your data.

## What we collect
**Without an account: nothing.** Gym App has no analytics, ads or tracking.

**With an account (optional):**
- **Email address:** to identify your account. It isn't used for marketing or shared with anyone.
- **Encrypted training data:** workouts, routines, measurements, check-ins and progress photos, encrypted on your phone with a key made from your password. The password and key never leave your phone, so the developer and the hosting provider can't read this data.
- **A login check value** derived from your password (not the password itself), and session tokens.

## Where your data is stored
Your workouts, routines, measurements, check-ins and progress photos are stored only on your device, in the app's private storage.

If Android Backup is turned on in your phone's settings, Android may include the app's data in your personal Google account backup. That's handled by Google under your Google account settings, not by Gym App.

## Network requests the app makes
- **Sync (only with an account):** encrypted data is sent to our sync server on Cloudflare Workers (https://gym-app-sync.lp-reports.workers.dev), stored in Cloudflare D1. The server keeps a daily encrypted snapshot for 14 days as a backup. Cloudflare may log IP addresses for security ([Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/)).
- **Update check:** when the app starts, it downloads a small public file (`update.json`) from GitHub to see whether a new version exists. If one does, it downloads the update from GitHub. No personal data is sent. GitHub may log your IP address as with any web request ([GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)). You can turn this off in **You > App updates**.
- **Links you open** (like this policy) open in your browser.

## Health Connect, watches and sensors (optional)
- **Health Connect:** if you link it, Gym App reads sleep, resting heart rate, heart-rate variability, heart rate, steps, weight, body fat and workout sessions written by your other apps and watches. It writes weight and body fat you log. This data is used on your phone only: for the readiness score, measurements, workout heart rate and importing watch cardio sessions. It's never sold, shared or used for advertising. If you also use sync, imported measurements and workouts are encrypted like everything else. You can revoke access at any time in Health Connect settings.
- **Bluetooth:** used only to read your smart scale's weight broadcast and heart rate from a heart-rate monitor you choose. Readings stay on your phone.
- **Camera (rep counter):** video is processed live on your phone by an on-device AI model and is never recorded, saved or uploaded. The model files are downloaded once from jsDelivr and Google's MediaPipe storage, and checked against fingerprints built into the app.

## Files you import or export
Imported files (Hevy, Strong, FitNotes, GPX, TCX, backups) are read on your device and never uploaded. Exported files go wherever you choose to share or save them.

## Permissions
- **Notifications:** rest-timer and interval-timer alerts.
- **Alarms:** so those alerts fire on time with the screen off.
- **Vibration:** timer alerts.
- **Internet:** update checks, the one-time AI pack download, and sync if you create an account.
- **Camera:** rep counter only, processed on the phone.
- **Bluetooth:** smart scale and heart-rate monitor.
- **Health Connect:** only the data types listed above, and only if you link it.

## Children
Gym App doesn't knowingly collect any data from anyone, including children.

## Deleting your data
- **On the phone:** use **You > Import, export and sync > Delete all data**, or uninstall the app.
- **In the cloud:** use **You > Account and sync > Delete account and cloud data**. Your account, encrypted data, photos and backups are deleted from the server immediately.

## Contact
Open an issue at https://github.com/JackLongman12/overload/issues.
