package com.overload.gym;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Result of a self-update. If Android needs the user to confirm, shows its confirmation screen. */
public class InstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { ctx.startActivity(confirm); AppUpdatePlugin.report("confirm", msg); }
                catch (Exception e) { AppUpdatePlugin.report("needsTap", msg); } // app was in the background
            }
            return;
        }
        AppUpdatePlugin.report(status == PackageInstaller.STATUS_SUCCESS ? "success" : "failed", msg);
    }
}
