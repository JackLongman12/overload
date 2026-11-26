package com.overload.gym;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** Home-screen widget: next workout, this week's progress, streak and readiness. Tap opens the app. */
public class GymWidget extends AppWidgetProvider {
    static final String PREFS = "gymapp_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, GymWidget.class));
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_gym);
        String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("json", "{}");
        try {
            JSONObject j = new JSONObject(raw);
            boolean active = j.optBoolean("active", false);
            v.setTextViewText(R.id.w_title, active ? "Workout in progress" : "Up next");
            v.setTextViewText(R.id.w_next, j.optString("next", "Open Gym App to start"));
            v.setTextViewText(R.id.w_week, j.optInt("week", 0) + " / " + j.optInt("goal", 4) + " this week");
            int streak = j.optInt("streak", 0);
            v.setTextViewText(R.id.w_streak, streak > 0 ? streak + "-week streak" : "Start a streak");
            String ready = j.optString("readiness", "");
            v.setTextViewText(R.id.w_ready, ready.isEmpty() ? "Check in for readiness" : "Readiness " + ready);
        } catch (Exception e) {
            v.setTextViewText(R.id.w_next, "Open Gym App");
        }
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }
}
