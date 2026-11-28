package com.overload.gym;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        registerPlugin(NanoPlugin.class);
        super.onCreate(savedInstanceState);
        // The page scrolls inside its own panels; the WebView's own scrollbar only showed up as a stray bar
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setVerticalScrollBarEnabled(false);
            getBridge().getWebView().setHorizontalScrollBarEnabled(false);
        }
    }
}
