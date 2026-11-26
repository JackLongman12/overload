package com.overload.gym.wear;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Gym App on the watch: shows the current exercise, set and target from the phone,
 * a rest countdown, and buttons to complete the set, add 30 s or skip rest.
 */
public class WearMainActivity extends Activity implements DataClient.OnDataChangedListener {
    private static final int ACC = Color.parseColor("#3d8bfd"), MUTED = Color.parseColor("#8b93a1"), TEXT = Color.parseColor("#eef0f3");
    private TextView title, exercise, setLine, target, rest, hint;
    private Button complete, add30, skip;
    private LinearLayout restRow;
    private JSONObject state = new JSONObject();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean vibrated = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.BLACK);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = (int) (getResources().getDisplayMetrics().widthPixels * 0.12);
        col.setPadding(pad, pad / 2 + 8, pad, pad);
        scroll.addView(col);

        title = text(col, 13, MUTED, false);
        exercise = text(col, 18, TEXT, true);
        setLine = text(col, 13, MUTED, false);
        target = text(col, 22, ACC, true);
        rest = text(col, 30, Color.parseColor("#34c77b"), true);
        complete = button(col, "Complete set", ACC);
        complete.setOnClickListener(v -> send("complete"));
        restRow = new LinearLayout(this);
        restRow.setOrientation(LinearLayout.HORIZONTAL);
        col.addView(restRow);
        add30 = button(restRow, "+30 s", Color.parseColor("#20242c"));
        skip = button(restRow, "Skip", Color.parseColor("#20242c"));
        add30.setOnClickListener(v -> send("add30"));
        skip.setOnClickListener(v -> send("skip"));
        hint = text(col, 12, MUTED, false);
        setContentView(scroll);
        render();
    }

    private TextView text(LinearLayout parent, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(sp); t.setTextColor(color); t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, 4, 0, 4);
        parent.addView(t);
        return t;
    }

    private Button button(LinearLayout parent, String label, int bg) {
        Button btn = new Button(this);
        btn.setText(label); btn.setTextColor(Color.WHITE); btn.setAllCaps(false);
        GradientDrawable d = new GradientDrawable(); d.setColor(bg); d.setCornerRadius(60);
        btn.setBackground(d);
        LinearLayout.LayoutParams lp = parent.getOrientation() == LinearLayout.HORIZONTAL
            ? new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            : new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(4, 8, 4, 0);
        parent.addView(btn, lp);
        return btn;
    }

    @Override
    protected void onResume() {
        super.onResume();
        Wearable.getDataClient(this).addListener(this);
        Wearable.getDataClient(this).getDataItems(Uri.parse("wear://*/gymapp/state")).addOnSuccessListener(items -> {
            for (DataItem item : items) apply(item);
            items.release();
        });
        handler.post(tick);
    }

    @Override
    protected void onPause() {
        super.onPause();
        Wearable.getDataClient(this).removeListener(this);
        handler.removeCallbacks(tick);
    }

    @Override
    public void onDataChanged(DataEventBuffer events) {
        for (DataEvent e : events) if (e.getType() == DataEvent.TYPE_CHANGED) apply(e.getDataItem());
    }

    private void apply(DataItem item) {
        if (!"/gymapp/state".equals(item.getUri().getPath())) return;
        try {
            state = new JSONObject(DataMapItem.fromDataItem(item).getDataMap().getString("json", "{}"));
            vibrated = false;
            runOnUiThread(this::render);
        } catch (Exception ignored) { }
    }

    private void render() {
        boolean active = state.optBoolean("active", false);
        if (active) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (!active) {
            title.setText("Gym App");
            exercise.setText("No workout running");
            setLine.setText(state.optString("next", "").isEmpty() ? "" : "Up next: " + state.optString("next"));
            target.setText(""); rest.setText("");
            complete.setVisibility(View.GONE); restRow.setVisibility(View.GONE);
            hint.setText("Start a workout on your phone. It shows up here.");
            return;
        }
        JSONObject ex = state.optJSONObject("ex");
        title.setText(state.optString("name", "Workout") + (state.optInt("hr", 0) > 0 ? "  ♥ " + state.optInt("hr") : ""));
        if (ex == null) {
            exercise.setText("All sets done");
            setLine.setText("Finish the workout on your phone");
            target.setText(""); complete.setVisibility(View.GONE);
        } else {
            exercise.setText(ex.optString("name"));
            setLine.setText(ex.optString("set"));
            target.setText(ex.optString("target"));
            complete.setVisibility(View.VISIBLE);
        }
        hint.setText(state.optString("coach", ""));
        tick.run();
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            long end = state.optLong("restEnd", 0), left = (end - System.currentTimeMillis()) / 1000;
            if (end > 0 && left > 0) {
                rest.setText(String.format("%d:%02d", left / 60, left % 60));
                restRow.setVisibility(View.VISIBLE);
            } else {
                if (end > 0 && left <= 0 && !vibrated) {
                    vibrated = true;
                    Vibrator v = getSystemService(Vibrator.class);
                    if (v != null) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 300, 150, 300}, -1));
                    rest.setText("Go!");
                } else if (end == 0) rest.setText("");
                restRow.setVisibility(View.GONE);
            }
            handler.removeCallbacks(this);
            handler.postDelayed(this, 500);
        }
    };

    private void send(String action) {
        byte[] data = action.getBytes(StandardCharsets.UTF_8);
        Wearable.getNodeClient(this).getConnectedNodes().addOnSuccessListener(nodes -> {
            if (nodes.isEmpty()) { hint.setText("Phone not connected"); return; }
            for (Node n : nodes) Wearable.getMessageClient(this).sendMessage(n.getId(), "/gymapp/action", data);
            Vibrator v = getSystemService(Vibrator.class);
            if (v != null) v.vibrate(VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE));
        });
    }
}
