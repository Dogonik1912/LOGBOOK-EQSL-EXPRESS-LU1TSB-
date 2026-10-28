package com.logbookeqslexpress

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.logbookeqslexpress.nativebridge.AndroidEQSLGalleryBridge

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private val appUrl = "https://logbook-eqsl-express-lu-1-tsb.vercel.app/"
    private val trustedHost = "logbook-eqsl-express-lu-1-tsb.vercel.app"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW

        // Expose native gallery saving only inside this app's trusted, HTTPS WebView.
        webView.addJavascriptInterface(AndroidEQSLGalleryBridge(applicationContext), "AndroidEQSL")
        webView.addJavascriptInterface(AppControlBridge(), "LogBookApp")

        // Keep the native close action separate from browser/window close behavior.

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == trustedHost) return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (_: Exception) {
                    true
                }
            }
        }
        setContentView(webView)
        if (savedInstanceState == null) webView.loadUrl(appUrl)
        else webView.restoreState(savedInstanceState)
    }

    private inner class AppControlBridge {
        @android.webkit.JavascriptInterface
        fun closeApp() {
            runOnUiThread { finishAndRemoveTask() }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
