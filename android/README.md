# Android wrapper and verified Gallery fallback

The Vite/React website on Vercel remains the primary, independent web experience. It first starts a normal browser download. The response page then gives the user a short opportunity to use the Android-only fallback if the file did not appear in Gallery; otherwise it returns to the homepage automatically.

## Native implementation

- `app/src/main/java/com/logbookeqslexpress/MainActivity.kt` is a minimal Android WebView host for the existing production website.
- `app/src/main/java/com/logbookeqslexpress/nativebridge/AndroidEQSLGalleryBridge.kt` saves images into **Pictures/LogBook eQSL Express** with Android MediaStore (Android 10 / API 29+).
- The bridge returns `{"ok":true,"uri":"content://..."}` only after bytes are written, the stream is closed, the MediaStore entry is finalized, and the saved record can be queried. On failure it returns `{"ok":false,"error":"..."}` and attempts to remove the incomplete item.
- The WebView exposes the bridge as `AndroidEQSL` and only allows in-WebView navigation to the trusted production hostname. Other links open outside the app.

## Build and validation

Open the `android` directory in Android Studio, install Android SDK 35 and a JDK 17-compatible Gradle toolchain, sync, then build and test on a physical Android 10+ device. This repository update adds the Android source project but does not itself produce or install an APK; the Android build and device verification still need to be run.

The normal website does not require this Android project or bridge. In Chrome and other browsers, the browser download remains the only available method, because ordinary web pages cannot verify or force a file into the device Gallery.
