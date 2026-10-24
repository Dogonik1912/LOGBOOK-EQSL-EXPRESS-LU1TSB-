# Android Gallery fallback integration

The React/Vercel website remains the primary, independent web experience. It starts a normal browser download first. The Android gallery fallback appears only when the hosting Android app exposes the `AndroidEQSL.saveToGallery(dataUrl, filename)` bridge.

## Native implementation

`app/src/main/java/com/logbookeqslexpress/nativebridge/AndroidEQSLGalleryBridge.kt` implements the bridge for Android 10 (API 29) and newer using MediaStore. It writes into **Pictures/LogBook eQSL Express**, finalizes the item, reads back the MediaStore record, and only then returns `{"ok":true,"uri":"content://..."}`. On any failure it returns `{"ok":false,"error":"..."}` and attempts to remove the incomplete item.

The hosting Android WebView must register this object as `AndroidEQSL` before loading the app URL:

```kotlin
webView.addJavascriptInterface(AndroidEQSLGalleryBridge(applicationContext), "AndroidEQSL")
```

Only expose the bridge to trusted app content. Do not register it in arbitrary external webviews or on untrusted origins.

## Important current repository status

The repository currently contains the Vite/React website and does **not** contain a generated Android application/WebView host. This source is the native bridge implementation to integrate into that host; it does not by itself create or install an APK. Until a native host registers it, the deployed web app continues to use the independent browser-download path and will not show a native Gallery action.
