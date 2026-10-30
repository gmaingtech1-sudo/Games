package app.jarvisai.assistant

import android.content.res.AssetManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.IOException

/**
 * Serves the bundled interface from the APK's assets at
 * https://appassets.androidplatform.net/ui/... so the page has a proper
 * https origin (needed for fetch, CORS and secure-context features) while
 * working with no network.
 */
class AssetServer(private val assets: AssetManager) {
    fun handle(request: WebResourceRequest): WebResourceResponse? {
        val url = request.url
        if (url.scheme != "https" || url.host != HOST) return null
        val path = url.path?.removePrefix("/").orEmpty()
        if (!path.startsWith("ui/") || path.contains("..")) return notFound()
        return try {
            val stream = assets.open(path)
            WebResourceResponse(mimeType(path), if (isText(path)) "utf-8" else null, stream).apply {
                responseHeaders = mapOf("Cache-Control" to "no-cache", "X-Content-Type-Options" to "nosniff")
            }
        } catch (e: IOException) {
            notFound()
        }
    }

    private fun notFound() = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), "Not found".byteInputStream())

    private fun isText(path: String) = mimeType(path).let { it.startsWith("text/") || it.endsWith("javascript") || it.endsWith("json") || it.endsWith("svg+xml") }

    private fun mimeType(path: String) = when (path.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "woff2" -> "font/woff2"
        "txt" -> "text/plain"
        else -> "application/octet-stream"
    }

    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val START_URL = "https://$HOST/ui/index.html"
    }
}
