package app.jarvisai.assistant

import android.Manifest
import android.content.pm.PackageManager
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper

/**
 * Boots the real MainActivity on Robolectric (Android framework on the JVM)
 * and talks to the native bridge exactly as the web page does.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class MainActivityTest {
    private fun findWebView(v: View): WebView? {
        if (v is WebView) return v
        if (v is ViewGroup) for (i in 0 until v.childCount) findWebView(v.getChildAt(i))?.let { return it }
        return null
    }

    private fun start(): Pair<MainActivity, WebView> {
        val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        val webView = findWebView(activity.window.decorView)
        assertNotNull("the activity shows a WebView", webView)
        return activity to webView!!
    }

    /** Sends a bridge request and returns the JSON reply the page would receive. */
    private fun call(webView: WebView, id: Int, method: String, params: JSONObject = JSONObject()): JSONObject {
        val bridge = shadowOf(webView).getJavascriptInterface("JarvisAndroid") as MainActivity.JsInterface
        bridge.postMessage(JSONObject().put("id", id).put("method", method).put("params", params).toString())
        ShadowLooper.idleMainLooper()
        val js = shadowOf(webView).lastEvaluatedJavascript
        val quoted = js.substringAfter("receive(").removeSuffix(")")
        return JSONObject(JSONObject("{\"v\":$quoted}").getString("v"))
    }

    @Test
    fun startsAndLoadsTheBundledInterface() {
        val (_, webView) = start()
        assertEquals("https://appassets.androidplatform.net/ui/index.html", shadowOf(webView).lastLoadedUrl)
        assertTrue(webView.settings.javaScriptEnabled)
        assertTrue("files on the device are not exposed to the page", !webView.settings.allowFileAccess)
    }

    @Test
    fun bridgeReportsAndroidCapabilities() {
        val (_, webView) = start()
        val reply = call(webView, 1, "host.info")
        assertEquals(1, reply.getInt("id"))
        val info = reply.getJSONObject("result")
        assertEquals("android", info.getString("platform"))
        assertEquals("1.0.0", info.getString("version"))
        assertEquals(false, info.getJSONObject("capabilities").getBoolean("pcTools"))
    }

    @Test
    fun unknownMethodsAreRefused() {
        val (_, webView) = start()
        val reply = call(webView, 7, "tools.execute")
        assertEquals("unsupported", reply.getJSONObject("error").getString("code"))
    }

    @Test
    fun microphoneIsRequestedAndADenialIsReported() {
        val (activity, webView) = start()
        val bridge = shadowOf(webView).getJavascriptInterface("JarvisAndroid") as MainActivity.JsInterface
        bridge.postMessage(JSONObject().put("id", 3).put("method", "stt.start").put("params", JSONObject().put("lang", "en-GB")).toString())
        ShadowLooper.idleMainLooper()
        val request = shadowOf(activity).lastRequestedPermission
        assertNotNull("the runtime permission dialog is shown", request)
        assertEquals(Manifest.permission.RECORD_AUDIO, request.requestedPermissions[0])
        activity.onRequestPermissionsResult(request.requestCode, arrayOf(Manifest.permission.RECORD_AUDIO), intArrayOf(PackageManager.PERMISSION_DENIED))
        ShadowLooper.idleMainLooper()
        val js = shadowOf(webView).lastEvaluatedJavascript
        assertTrue(js, js.contains("permission_denied"))
    }

    @Test
    fun speechStartsOnceMicrophoneIsAllowed() {
        val (activity, webView) = start()
        shadowOf(activity.application).grantPermissions(Manifest.permission.RECORD_AUDIO)
        val reply = call(webView, 4, "stt.start", JSONObject().put("lang", "en-GB"))
        // Either it started, or (on a runtime with no recogniser) it said so clearly.
        val ok = reply.optBoolean("result", false)
        val js = shadowOf(webView).lastEvaluatedJavascript
        assertTrue(js, ok || js.contains("unsupported"))
        assertNull(shadowOf(activity).lastRequestedPermission)
    }

    @Test
    fun onlyWebLinksAreOpened() {
        val (activity, webView) = start()
        call(webView, 5, "app.openExternal", JSONObject().put("url", "javascript:alert(1)"))
        assertNull(shadowOf(activity).nextStartedActivity)
        call(webView, 6, "app.openExternal", JSONObject().put("url", "https://docs.unity3d.com/"))
        assertEquals("https://docs.unity3d.com/", shadowOf(activity).nextStartedActivity.dataString)
    }
}
