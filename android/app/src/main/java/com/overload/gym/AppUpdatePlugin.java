package com.overload.gym;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.InstallSourceInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Self-update for the sideloaded app: downloads a new APK, checks its SHA-256 against the
 * signed update feed, and installs it with PackageInstaller. On Android 12+ an app updating
 * itself can ask for no user action, so after the one-time "Install unknown apps" permission,
 * updates install silently. Android still verifies the APK is signed with the same key.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    static AppUpdatePlugin instance;

    @Override
    public void load() { instance = this; }

    private File apkFile() { return new File(getContext().getCacheDir(), "update.apk"); }

    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("sdk", Build.VERSION.SDK_INT);
        boolean can = Build.VERSION.SDK_INT < 26 || ctx.getPackageManager().canRequestPackageInstalls();
        r.put("canInstall", can);
        r.put("silent", Build.VERSION.SDK_INT >= 31);
        String installer = "";
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                InstallSourceInfo info = ctx.getPackageManager().getInstallSourceInfo(ctx.getPackageName());
                installer = info.getInstallingPackageName() == null ? "" : info.getInstallingPackageName();
            }
        } catch (Exception ignored) { }
        r.put("installer", installer);
        File f = apkFile();
        r.put("downloaded", f.exists() ? f.length() : 0);
        call.resolve(r);
    }

    /** One-time: lets Gym App install its own updates (Settings > Install unknown apps). */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    /** Downloads the APK to the app cache and checks its SHA-256. Skips the download if a matching file is already there. */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url"), sha = call.getString("sha256", "");
        if (url == null || !url.startsWith("https://") || sha.length() != 64) { call.reject("Missing download URL or checksum"); return; }
        new Thread(() -> {
            File out = apkFile();
            try {
                if (out.exists() && sha.equalsIgnoreCase(sha256(out))) { done(call, out); return; }
                File tmp = new File(out.getPath() + ".part");
                URL u = new URL(url);
                HttpURLConnection c = null;
                for (int hop = 0; hop < 6; hop++) { // GitHub release links redirect to a CDN
                    c = (HttpURLConnection) u.openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(20000); c.setReadTimeout(60000);
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) { u = new URL(u, c.getHeaderField("Location")); if (!u.getProtocol().equals("https")) throw new Exception("Insecure redirect"); c.disconnect(); continue; }
                    if (code != 200) throw new Exception("Download failed (HTTP " + code + ")");
                    break;
                }
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[65536]; int n;
                    while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                }
                if (!sha.equalsIgnoreCase(sha256(tmp))) { tmp.delete(); throw new Exception("The downloaded update didn't match its checksum, so it was discarded"); }
                if (out.exists()) out.delete();
                if (!tmp.renameTo(out)) throw new Exception("Couldn't save the update");
                done(call, out);
            } catch (Exception e) { call.reject(e.getMessage()); }
        }).start();
    }

    private void done(PluginCall call, File f) { JSObject r = new JSObject(); r.put("size", f.length()); call.resolve(r); }

    /** Installs the downloaded APK. Silent on Android 12+ when allowed; otherwise Android shows one confirmation. */
    @PluginMethod
    public void install(PluginCall call) {
        File f = apkFile();
        String sha = call.getString("sha256", "");
        if (!f.exists()) { call.reject("No update downloaded"); return; }
        new Thread(() -> {
            try {
                if (sha.length() == 64 && !sha.equalsIgnoreCase(sha256(f))) throw new Exception("Update file changed; download it again");
                Context ctx = getContext();
                PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams p = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                p.setAppPackageName(ctx.getPackageName());
                p.setSize(f.length());
                if (Build.VERSION.SDK_INT >= 31) p.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                int id = pi.createSession(p);
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    try (InputStream in = new FileInputStream(f); OutputStream os = s.openWrite("gymapp.apk", 0, f.length())) {
                        byte[] buf = new byte[65536]; int n;
                        while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                        s.fsync(os);
                    }
                    Intent i = new Intent(ctx, InstallReceiver.class).setAction("com.overload.gym.INSTALL_STATUS");
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    s.commit(PendingIntent.getBroadcast(ctx, id, i, flags).getIntentSender());
                }
                call.resolve();
            } catch (Exception e) { call.reject(e.getMessage()); }
        }).start();
    }

    /** Called by InstallReceiver with the result; the app may already be closing if the update went through. */
    static void report(String status, String message) {
        if (instance == null) return;
        JSObject r = new JSObject();
        r.put("status", status);
        r.put("message", message == null ? "" : message);
        instance.notifyListeners("installStatus", r);
    }

    static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) { byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) md.update(buf, 0, n); }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
