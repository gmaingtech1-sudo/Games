package app.jarvisai.assistant

import android.content.Context
import android.media.AudioAttributes
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * Spoken replies with Android's text-to-speech engine. Sentences are queued
 * so speech starts while the reply is still arriving. Events: tts.start,
 * tts.done (also sent when an utterance is stopped or fails).
 */
class SpeechOutput(context: Context, private val emit: (String, JSONObject) -> Unit) {
    private var ready = false
    private var failed = false
    private val waiting = ArrayList<() -> Unit>()

    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        ready = status == TextToSpeech.SUCCESS
        failed = !ready
        if (ready) waiting.forEach { it() }
        waiting.clear()
    }

    init {
        tts.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) = emit("tts.start", JSONObject().put("id", utteranceId))
            override fun onDone(utteranceId: String) = emit("tts.done", JSONObject().put("id", utteranceId))
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String) = emit("tts.done", JSONObject().put("id", utteranceId).put("error", "tts_error"))
            override fun onStop(utteranceId: String, interrupted: Boolean) = emit("tts.done", JSONObject().put("id", utteranceId).put("stopped", true))
            override fun onRangeStart(utteranceId: String, start: Int, end: Int, frame: Int) = emit("tts.boundary", JSONObject().put("id", utteranceId))
        })
    }

    val available: Boolean get() = !failed

    private fun whenReady(action: () -> Unit) {
        if (ready) action() else if (!failed) waiting.add(action)
    }

    fun voices(callback: (JSONArray) -> Unit) = whenReady {
        val list = JSONArray()
        val all = try { tts.voices.orEmpty() } catch (e: Exception) { emptySet() }
        all.filter { !it.features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) }
            .sortedBy { it.name }
            .forEach { v ->
                val label = v.locale.displayName + (if (v.isNetworkConnectionRequired) " · online" else "") + " · " + v.name
                list.put(JSONObject().put("id", v.name).put("name", label).put("lang", v.locale.toLanguageTag()))
            }
        callback(list)
    }

    fun speak(text: String, id: String, rate: Float, pitch: Float, volume: Float, voiceName: String?, language: String?) = whenReady {
        val voice = voiceName?.let { name -> tts.voices?.firstOrNull { it.name == name } }
        if (voice != null) tts.voice = voice
        else if (!language.isNullOrBlank()) tts.language = Locale.forLanguageTag(language)
        tts.setSpeechRate(rate.coerceIn(0.25f, 3f))
        tts.setPitch(pitch.coerceIn(0.25f, 2f))
        val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume.coerceIn(0f, 1f)) }
        val result = tts.speak(text, TextToSpeech.QUEUE_ADD, params, id)
        if (result != TextToSpeech.SUCCESS) emit("tts.done", JSONObject().put("id", id).put("error", "tts_error"))
    }

    fun stop() {
        if (ready) tts.stop()
    }

    fun shutdown() {
        tts.stop()
        tts.shutdown()
    }
}
