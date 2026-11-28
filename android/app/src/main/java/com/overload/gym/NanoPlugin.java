package com.overload.gym;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.MoreExecutors;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.common.GenAiException;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;

/**
 * On-device Gemini Nano through Android's AICore (ML Kit GenAI Prompt API).
 * Used only for the optional "Ask the coach" chat; nothing leaves the phone.
 * Phones without Gemini Nano report "unavailable" and the app hides the chat.
 */
@CapacitorPlugin(name = "Nano")
public class NanoPlugin extends Plugin {
    private GenerativeModelFutures model;

    private GenerativeModelFutures model() {
        if (model == null) model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
        return model;
    }

    private static String statusName(int s) {
        switch (s) {
            case FeatureStatus.AVAILABLE: return "available";
            case FeatureStatus.DOWNLOADABLE: return "downloadable";
            case FeatureStatus.DOWNLOADING: return "downloading";
            default: return "unavailable";
        }
    }

    private static String reason(Throwable t) {
        Throwable c = t;
        while (c != null && !(c instanceof GenAiException) && c.getCause() != null && c.getCause() != c) c = c.getCause();
        if (c instanceof GenAiException) {
            int code = ((GenAiException) c).getErrorCode();
            switch (code) {
                case GenAiException.ErrorCode.BUSY: return "busy";
                case GenAiException.ErrorCode.BACKGROUND_USE_BLOCKED: return "background";
                case GenAiException.ErrorCode.PER_APP_BATTERY_USE_QUOTA_EXCEEDED: return "quota";
                case GenAiException.ErrorCode.REQUEST_TOO_LARGE: return "tooLarge";
                case GenAiException.ErrorCode.NOT_AVAILABLE:
                case GenAiException.ErrorCode.NOT_SUPPORTED:
                case GenAiException.ErrorCode.AICORE_INCOMPATIBLE: return "unavailable";
                default: return "error " + code;
            }
        }
        return t == null || t.getMessage() == null ? "error" : t.getMessage();
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            Futures.addCallback(model().checkStatus(), new FutureCallback<Integer>() {
                public void onSuccess(Integer s) { JSObject r = new JSObject(); r.put("status", statusName(s == null ? 0 : s)); call.resolve(r); }
                public void onFailure(Throwable t) { JSObject r = new JSObject(); r.put("status", "unavailable"); r.put("reason", reason(t)); call.resolve(r); }
            }, MoreExecutors.directExecutor());
        } catch (Throwable t) { JSObject r = new JSObject(); r.put("status", "unavailable"); r.put("reason", reason(t)); call.resolve(r); }
    }

    /** Asks AICore to fetch Gemini Nano if the phone supports it but hasn't got it yet. */
    @PluginMethod
    public void download(PluginCall call) {
        try {
            model().download(new com.google.mlkit.genai.common.DownloadCallback() {
                public void onDownloadStarted(long bytes) { progress("started", bytes); }
                public void onDownloadProgress(long bytes) { progress("progress", bytes); }
                public void onDownloadCompleted() { progress("done", 0); }
                public void onDownloadFailed(GenAiException e) { progress("failed: " + reason(e), 0); }
            });
            call.resolve();
        } catch (Throwable t) { call.reject(reason(t)); }
    }

    private void progress(String state, long bytes) {
        JSObject r = new JSObject(); r.put("state", state); r.put("bytes", bytes);
        notifyListeners("download", r);
    }

    @PluginMethod
    public void generate(PluginCall call) {
        String prompt = call.getString("prompt", "");
        if (prompt.isEmpty()) { call.reject("empty"); return; }
        try {
            GenerateContentRequest.Builder b = new GenerateContentRequest.Builder(new TextPart(prompt));
            b.setTemperature(call.getFloat("temperature", 0.3f));
            b.setTopK(call.getInt("topK", 16));
            b.setMaxOutputTokens(call.getInt("maxTokens", 320));
            ListenableFuture<GenerateContentResponse> f = model().generateContent(b.build());
            Futures.addCallback(f, new FutureCallback<GenerateContentResponse>() {
                public void onSuccess(GenerateContentResponse res) {
                    String text = "";
                    try { text = res.getCandidates().get(0).getText(); } catch (Exception ignored) { }
                    JSObject r = new JSObject(); r.put("text", text == null ? "" : text); call.resolve(r);
                }
                public void onFailure(Throwable t) { call.reject(reason(t)); }
            }, MoreExecutors.directExecutor());
        } catch (Throwable t) { call.reject(reason(t)); }
    }

    @Override
    protected void handleOnDestroy() {
        try { if (model != null) model.getGenerativeModel().close(); } catch (Throwable ignored) { }
        super.handleOnDestroy();
    }
}
