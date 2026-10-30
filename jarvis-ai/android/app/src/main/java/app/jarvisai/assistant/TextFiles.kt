package app.jarvisai.assistant

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

/** Rules for files you attach to a message: text and code only, size-limited. Pure Kotlin, unit-tested. */
object TextFiles {
    const val MAX_BYTES = 1_200_000

    sealed class Result {
        data class Ok(val text: String) : Result()
        data class Rejected(val reason: String) : Result()
    }

    fun decode(name: String, bytes: ByteArray): Result {
        if (bytes.size > MAX_BYTES) return Result.Rejected("$name is too large to attach (over ${MAX_BYTES / 1000} KB).")
        if (bytes.any { it == 0.toByte() }) return Result.Rejected("$name looks like a binary file. Attach text or code files.")
        val start = if (bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte()) 3 else 0
        val decoder = StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
        val text = try {
            decoder.decode(ByteBuffer.wrap(bytes, start, bytes.size - start)).toString()
        } catch (e: CharacterCodingException) {
            // Not UTF-8: fall back to Windows-1252, common for older text files.
            String(bytes, start, bytes.size - start, charset("windows-1252"))
        }
        return Result.Ok(text)
    }

    /** Maps the recogniser's RMS dB (about -2..10) to a 0..1 level for the visualiser. */
    fun rmsToLevel(rmsDb: Float): Double = ((rmsDb + 2f) / 12f).coerceIn(0f, 1f).toDouble()

    /** Only plain web links may be opened from the app. */
    fun isSafeExternalUrl(url: String): Boolean =
        url.startsWith("https://", ignoreCase = true) || url.startsWith("http://", ignoreCase = true)
}
