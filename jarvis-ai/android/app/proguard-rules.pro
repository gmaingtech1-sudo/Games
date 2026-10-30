# Methods called from JavaScript must keep their names.
-keepclassmembers class app.jarvisai.assistant.MainActivity$JsInterface {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
