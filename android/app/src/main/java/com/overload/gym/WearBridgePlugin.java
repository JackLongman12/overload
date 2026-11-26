package com.overload.gym;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;
import java.nio.charset.StandardCharsets;

/**
 * Phone side of the Wear OS companion. The app pushes the live workout state to the watch
 * (Data Layer item /gymapp/state), and the watch sends actions back (message /gymapp/action):
 * complete set, +30 s rest, skip rest. Nothing leaves the phone-watch connection.
 */
@CapacitorPlugin(name = "WearBridge")
public class WearBridgePlugin extends Plugin implements MessageClient.OnMessageReceivedListener {

    @Override
    public void load() {
        Wearable.getMessageClient(getContext()).addListener(this);
    }

    @Override
    protected void handleOnDestroy() {
        Wearable.getMessageClient(getContext()).removeListener(this);
    }

    @PluginMethod
    public void sendState(PluginCall call) {
        String json = call.getString("json", "{}");
        PutDataMapRequest req = PutDataMapRequest.create("/gymapp/state");
        req.getDataMap().putString("json", json);
        req.getDataMap().putLong("t", System.currentTimeMillis());
        PutDataRequest put = req.asPutDataRequest().setUrgent();
        Wearable.getDataClient(getContext()).putDataItem(put)
            .addOnSuccessListener(i -> call.resolve())
            .addOnFailureListener(e -> call.reject("No watch connected"));
    }

    @PluginMethod
    public void connected(PluginCall call) {
        Wearable.getNodeClient(getContext()).getConnectedNodes()
            .addOnSuccessListener(nodes -> { JSObject r = new JSObject(); r.put("count", nodes.size()); r.put("name", nodes.isEmpty() ? "" : nodes.get(0).getDisplayName()); call.resolve(r); })
            .addOnFailureListener(e -> { JSObject r = new JSObject(); r.put("count", 0); call.resolve(r); });
    }

    @Override
    public void onMessageReceived(MessageEvent ev) {
        if (!"/gymapp/action".equals(ev.getPath())) return;
        JSObject r = new JSObject();
        r.put("action", new String(ev.getData(), StandardCharsets.UTF_8));
        notifyListeners("wearAction", r, true);
    }
}
