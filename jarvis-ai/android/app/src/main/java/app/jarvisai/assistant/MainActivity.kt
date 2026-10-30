package app.jarvisai.assistant

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.provider.Settings
import android.view.View
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject

/**
 * The whole app: a full-screen WebView showing the shared JARVIS interface,
 * plus native services the page reaches through a small JSON bridge
 * (see shared/ui/js/platform.js): speech in/out, encrypted storage, the
 * microphone permission, file picking and opening links.
 */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var speechIn: SpeechInput
    private lateinit var speechOut: SpeechOutput
    private lateinit var secure: SecureStore
    private lateinit var assetServer: AssetServer
    private val main = Handler(Looper.getMainLooper())
    private var pageReady = false

    // Bridge calls waiting for the user (permission dialog, file picker).
    private var pendingMicStart: ((Boolean) -> Unit)? = null
    private var pendingPick: Int? = null
    private var pendingSave: Pair<Int, String>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_Jarvis)
        super.onCreate(savedInstanceState)
        val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        WebView.setWebContentsDebuggingEnabled(debuggable)

        secure = SecureStore(this)
        assetServer = AssetServer(assets)
        speechIn = SpeechInput(this, ::emit)
        speechOut = SpeechOutput(this, ::emit)

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#02070D"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                allowContentAccess = false
                setSupportZoom(false)
                // The page is served over https from the APK; this lets it reach a
                // plain-http server on your own Wi-Fi for testing. The page only
                // accepts http:// for private network addresses (api.js).
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assetServer.handle(request)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    // Keep the app on its own page; anything else opens in the browser.
                    if (request.url.host == AssetServer.HOST) return false
                    openExternal(request.url.toString())
                    return true
                }

                override fun onPageFinished(view: WebView, url: String) {
                    pageReady = true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    if (debuggable) android.util.Log.d("JarvisUI", "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                    return true
                }
            }
            addJavascriptInterface(JsInterface(), "JarvisAndroid")
        }

        // Draw edge to edge on every Android version (Android 15 enforces it) and
        // pad the page clear of the status bar, navigation bar and keyboard.
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#02070D"))
            addView(webView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        }
        root.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
        setContentView(root)

        // Keep the splash screen up until the interface has loaded (max 2 s).
        val shownAt = System.currentTimeMillis()
        root.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                if (pageReady || System.currentTimeMillis() - shownAt > 2000) {
                    root.viewTreeObserver.removeOnPreDrawListener(this)
                    return true
                }
                root.postInvalidateDelayed(50)
                return false
            }
        })

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { handleBack() }
        }

        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        else webView.loadUrl(AssetServer.START_URL)
    }

    // ---- bridge -------------------------------------------------------------

    /** Methods visible to JavaScript as window.JarvisAndroid. Called on a background thread. */
    inner class JsInterface {
        @JavascriptInterface
        fun postMessage(raw: String) {
            main.post { handleMessage(raw) }
        }
    }

    private fun emit(event: String, data: JSONObject) {
        send(JSONObject().put("event", event).put("data", data))
    }

    private fun send(message: JSONObject) {
        val js = "window.JarvisBridge && window.JarvisBridge.receive(${JSONObject.quote(message.toString())})"
        if (Looper.myLooper() == Looper.getMainLooper()) webView.evaluateJavascript(js, null)
        else main.post { webView.evaluateJavascript(js, null) }
    }

    private fun reply(id: Int, result: Any?) = send(JSONObject().put("id", id).put("result", result ?: JSONObject.NULL))

    private fun fail(id: Int, message: String, code: String = "error") =
        send(JSONObject().put("id", id).put("error", JSONObject().put("message", message).put("code", code)))

    private fun handleMessage(raw: String) {
        // Only our own bundled page may use the bridge.
        if (Uri.parse(webView.url ?: "").host != AssetServer.HOST) return
        val msg = try { JSONObject(raw) } catch (e: Exception) { return }
        val id = msg.optInt("id")
        val params = msg.optJSONObject("params") ?: JSONObject()
        try {
            when (msg.optString("method")) {
                "host.info" -> reply(id, JSONObject()
                    .put("platform", "android")
                    .put("version", packageManager.getPackageInfo(packageName, 0).versionName)
                    .put("capabilities", JSONObject()
                        .put("stt", speechIn.available)
                        .put("tts", speechOut.available)
                        .put("wakeWord", false)
                        .put("pcTools", false)
                        .put("files", true)
                        .put("secureStorage", true)
                        .put("permissions", true)))

                "storage.get" -> reply(id, secure.get(params.getString("key")))
                "storage.set" -> { secure.set(params.getString("key"), params.getString("value")); reply(id, true) }
                "storage.remove" -> { secure.remove(params.getString("key")); reply(id, true) }

                "stt.start" -> withMicrophone { granted ->
                    if (granted) {
                        speechIn.start(params.optString("lang", "en-GB"))
                        reply(id, true)
                    } else {
                        fail(id, "Microphone permission is off.", "permission_denied")
                    }
                }
                "stt.stop" -> { speechIn.stop(); reply(id, true) }
                "stt.cancel" -> { speechIn.cancel(); reply(id, true) }

                "tts.voices" -> speechOut.voices { reply(id, it) }
                "tts.speak" -> {
                    speechOut.speak(
                        params.getString("text"),
                        params.getString("id"),
                        params.optDouble("rate", 1.0).toFloat(),
                        params.optDouble("pitch", 1.0).toFloat(),
                        params.optDouble("volume", 1.0).toFloat(),
                        params.optString("voice").takeIf { it.isNotBlank() && it != "null" },
                        params.optString("lang").takeIf { it.isNotBlank() },
                    )
                    reply(id, true)
                }
                "tts.stop" -> { speechOut.stop(); reply(id, true) }

                "app.permission" -> reply(id, JSONObject().put("microphone", micStatus()))
                "app.requestPermission" -> withMicrophone { reply(id, JSONObject().put("microphone", micStatus())) }
                "app.openSystemSettings" -> {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
                    reply(id, true)
                }
                "app.openExternal" -> { openExternal(params.getString("url")); reply(id, true) }

                "file.pick" -> {
                    pendingPick = id
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/*", "application/json", "application/xml", "application/javascript", "application/x-yaml", "application/octet-stream"))
                    }
                    startActivityForResult(intent, REQ_PICK)
                }
                "file.save" -> {
                    pendingSave = id to params.getString("text")
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "application/json"
                        putExtra(Intent.EXTRA_TITLE, params.optString("name", "jarvis-export.json"))
                    }
                    startActivityForResult(intent, REQ_SAVE)
                }

                else -> fail(id, "${msg.optString("method")} is not available on Android", "unsupported")
            }
        } catch (e: Exception) {
            fail(id, e.message ?: e.toString())
        }
    }

    // ---- microphone permission ------------------------------------------------

    private fun micStatus(): String = when {
        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED -> "granted"
        getSharedPreferences("jarvis_state", MODE_PRIVATE).getBoolean("mic_asked", false) && !shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO) -> "denied"
        else -> "prompt"
    }

    private fun withMicrophone(then: (Boolean) -> Unit) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) return then(true)
        if (micStatus() == "denied") {
            Toast.makeText(this, R.string.mic_rationale, Toast.LENGTH_LONG).show()
            return then(false)
        }
        pendingMicStart?.invoke(false)
        pendingMicStart = then
        getSharedPreferences("jarvis_state", MODE_PRIVATE).edit().putBoolean("mic_asked", true).apply()
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_MIC) {
            val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
            pendingMicStart?.invoke(granted)
            pendingMicStart = null
        }
    }

    // ---- files -----------------------------------------------------------------

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uri = data?.data
        when (requestCode) {
            REQ_PICK -> {
                val id = pendingPick ?: return
                pendingPick = null
                if (resultCode != RESULT_OK || uri == null) return reply(id, null)
                try {
                    val name = displayName(uri)
                    val bytes = contentResolver.openInputStream(uri)?.use { it.readNBytesCompat(TextFiles.MAX_BYTES + 1) } ?: ByteArray(0)
                    when (val r = TextFiles.decode(name, bytes)) {
                        is TextFiles.Result.Ok -> reply(id, JSONObject().put("name", name).put("text", r.text))
                        is TextFiles.Result.Rejected -> fail(id, r.reason, "rejected")
                    }
                } catch (e: Exception) {
                    fail(id, "Couldn't read that file: ${e.message}")
                }
            }
            REQ_SAVE -> {
                val (id, text) = pendingSave ?: return
                pendingSave = null
                if (resultCode != RESULT_OK || uri == null) return fail(id, "Export cancelled", "cancelled")
                try {
                    contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
                    reply(id, true)
                } catch (e: Exception) {
                    fail(id, "Couldn't save the file: ${e.message}")
                }
            }
        }
    }

    private fun displayName(uri: Uri): String {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) return c.getString(0) ?: "file.txt"
        }
        return uri.lastPathSegment ?: "file.txt"
    }

    private fun java.io.InputStream.readNBytesCompat(limit: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(16384)
        while (out.size() < limit) {
            val n = read(buf, 0, minOf(buf.size, limit - out.size()))
            if (n < 0) break
            out.write(buf, 0, n)
        }
        return out.toByteArray()
    }

    private fun openExternal(url: String) {
        if (!TextFiles.isSafeExternalUrl(url)) return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show()
        }
    }

    // ---- back button and lifecycle -------------------------------------------------

    private fun handleBack() {
        // The page closes its open drawer/dialog first; otherwise leave the app.
        webView.evaluateJavascript("window.jarvisBack ? window.jarvisBack() : false") { handled ->
            if (handled != "true") moveTaskToBack(true)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        handleBack()
    }

    override fun onPause() {
        super.onPause()
        // Never keep the microphone on in the background.
        speechIn.cancel()
        emit("app.pause", JSONObject())
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        emit("app.resume", JSONObject())
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        speechIn.cancel()
        speechOut.shutdown()
        webView.removeJavascriptInterface("JarvisAndroid")
        webView.destroy()
        super.onDestroy()
    }

    private companion object {
        const val REQ_MIC = 1
        const val REQ_PICK = 2
        const val REQ_SAVE = 3
    }
}
