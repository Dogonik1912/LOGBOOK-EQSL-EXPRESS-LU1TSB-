package com.logbookeqslexpress.nativebridge

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.io.IOException

/**
 * WebView bridge for the optional Android-only eQSL gallery fallback.
 *
 * Register on the app WebView as:
 *   webView.addJavascriptInterface(AndroidEQSLGalleryBridge(context), "AndroidEQSL")
 *
 * The web app expects saveToGallery(dataUrl, filename) to return JSON. "ok": true
 * is returned only after the bytes have been written, the stream closed, and the
 * MediaStore item finalized. This is intentionally not used by the standalone web site.
 */
class AndroidEQSLGalleryBridge(private val context: Context) {
    @JavascriptInterface
    fun saveToGallery(dataUrl: String?, filename: String?): String {
        var uri: Uri? = null
        return try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                return failure("Android 10 or later is required for verified gallery saving.")
            }
            if (dataUrl.isNullOrBlank() || !dataUrl.startsWith("data:image/")) {
                return failure("Invalid image data.")
            }
            val comma = dataUrl.indexOf(',')
            if (comma < 0) return failure("Invalid image data URL.")
            val header = dataUrl.substring(0, comma)
            if (!header.contains(";base64")) return failure("Image data must be base64 encoded.")

            val mimeType = header.substringAfter("data:").substringBefore(';')
            if (mimeType !in setOf("image/png", "image/jpeg", "image/webp")) {
                return failure("Unsupported image format.")
            }
            val bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
            if (bytes.isEmpty()) return failure("The image is empty.")

            val extension = when (mimeType) {
                "image/jpeg" -> ".jpg"
                "image/webp" -> ".webp"
                else -> ".png"
            }
            val safeName = (filename ?: "eQSL$extension")
                .replace(Regex("[^A-Za-z0-9_.-]"), "_")
                .let { if (it.endsWith(extension, ignoreCase = true)) it else it.substringBeforeLast('.') + extension }
            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, safeName)
                put(MediaStore.Images.Media.MIME_TYPE, mimeType)
                put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/LogBook eQSL Express")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                ?: return failure("Android could not create a gallery item.")

            val output = resolver.openOutputStream(uri, "w")
                ?: throw IOException("Could not open the gallery image for writing.")
            output.use {
                it.write(bytes)
                it.flush()
            }

            val finalized = ContentValues().apply {
                put(MediaStore.Images.Media.IS_PENDING, 0)
            }
            val updatedRows = resolver.update(uri, finalized, null, null)
            if (updatedRows != 1) throw IOException("Android could not finalize the gallery image.")

            // Read back metadata to verify the MediaStore entry is available.
            resolver.query(uri, arrayOf(MediaStore.Images.Media._ID), null, null, null).use { cursor ->
                if (cursor == null || !cursor.moveToFirst()) {
                    throw IOException("The saved image could not be verified in MediaStore.")
                }
            }
            JSONObject().put("ok", true).put("uri", uri.toString()).toString()
        } catch (error: Exception) {
            if (uri != null) {
                try { context.contentResolver.delete(uri, null, null) } catch (_: Exception) { }
            }
            failure(error.message ?: "Could not save the image to Gallery.")
        }
    }

    private fun failure(message: String): String =
        JSONObject().put("ok", false).put("error", message).toString()
}
