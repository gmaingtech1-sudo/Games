package app.jarvisai.assistant

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import org.json.JSONObject

/**
 * Voice input with Android's built-in speech recogniser (usually Google's).
 * Must be used from the main thread. Results go to the UI as bridge events:
 * stt.ready, stt.partial, stt.final, stt.level, stt.error, stt.end.
 */
class SpeechInput(private val context: Context, private val emit: (String, JSONObject) -> Unit) {
    private var recognizer: SpeechRecognizer? = null
    private var active = false

    val available: Boolean get() = SpeechRecognizer.isRecognitionAvailable(context)

    fun start(language: String) {
        if (!available) {
            emit("stt.error", JSONObject().put("code", "unsupported").put("message", "No speech recognition service on this phone. Install or enable the Google app, or type instead."))
            emit("stt.end", JSONObject())
            return
        }
        cancel()
        val r = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = r
        active = true
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = emit("stt.ready", JSONObject())
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) = emit("stt.level", JSONObject().put("level", TextFiles.rmsToLevel(rmsdB)))
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}

            override fun onError(error: Int) {
                if (!active) return
                active = false
                emit("stt.error", JSONObject().put("code", errorCode(error)).put("message", errorMessage(error)))
                emit("stt.end", JSONObject())
                release()
            }

            override fun onResults(results: Bundle?) {
                if (!active) return
                active = false
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (text.isBlank()) emit("stt.error", JSONObject().put("code", "no_match").put("message", "Nothing recognised"))
                else emit("stt.final", JSONObject().put("text", text))
                emit("stt.end", JSONObject())
                release()
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                if (text.isNotBlank()) emit("stt.partial", JSONObject().put("text", text))
            }

            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
        r.startListening(intent)
    }

    /** Stop listening and return what was heard so far. */
    fun stop() {
        recognizer?.stopListening()
    }

    /** Stop listening and discard the result. */
    fun cancel() {
        if (recognizer == null) return
        val wasActive = active
        active = false
        recognizer?.cancel()
        release()
        if (wasActive) emit("stt.end", JSONObject())
    }

    private fun release() {
        recognizer?.destroy()
        recognizer = null
    }

    private fun errorCode(error: Int) = when (error) {
        SpeechRecognizer.ERROR_NO_MATCH -> "no_match"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech_timeout"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission_denied"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
        SpeechRecognizer.ERROR_AUDIO -> "audio"
        SpeechRecognizer.ERROR_CLIENT -> "aborted"
        else -> "error_$error"
    }

    private fun errorMessage(error: Int) = when (error) {
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Didn't catch that."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is off."
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech recognition needs a connection (or download offline speech in your phone's settings)."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "The speech recogniser is busy. Try again."
        SpeechRecognizer.ERROR_AUDIO -> "Couldn't record audio."
        else -> "Speech recognition error ($error)."
    }
}
