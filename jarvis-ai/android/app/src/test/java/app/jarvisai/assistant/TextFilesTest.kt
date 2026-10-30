package app.jarvisai.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TextFilesTest {
    @Test
    fun utf8TextIsDecoded() {
        val r = TextFiles.decode("Player.cs", "class Player { string name = \"Zoë\"; }".toByteArray(Charsets.UTF_8))
        assertEquals(TextFiles.Result.Ok("class Player { string name = \"Zoë\"; }"), r)
    }

    @Test
    fun byteOrderMarkIsStripped() {
        val bytes = byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()) + "hi".toByteArray()
        assertEquals(TextFiles.Result.Ok("hi"), TextFiles.decode("a.txt", bytes))
    }

    @Test
    fun windows1252FallbackForNonUtf8() {
        val bytes = byteArrayOf('c'.code.toByte(), 'a'.code.toByte(), 'f'.code.toByte(), 0xE9.toByte())
        assertEquals(TextFiles.Result.Ok("café"), TextFiles.decode("old.txt", bytes))
    }

    @Test
    fun binaryAndHugeFilesAreRejected() {
        assertTrue(TextFiles.decode("image.png", byteArrayOf(0x89.toByte(), 0x50, 0x00, 0x47)) is TextFiles.Result.Rejected)
        assertTrue(TextFiles.decode("big.txt", ByteArray(TextFiles.MAX_BYTES + 1) { 'a'.code.toByte() }) is TextFiles.Result.Rejected)
    }

    @Test
    fun rmsLevelIsClamped() {
        assertEquals(0.0, TextFiles.rmsToLevel(-10f), 0.0001)
        assertEquals(1.0, TextFiles.rmsToLevel(30f), 0.0001)
        assertEquals(0.5, TextFiles.rmsToLevel(4f), 0.0001)
    }

    @Test
    fun onlyWebLinksOpenExternally() {
        assertTrue(TextFiles.isSafeExternalUrl("https://docs.unity3d.com"))
        assertFalse(TextFiles.isSafeExternalUrl("intent://evil#Intent;end"))
        assertFalse(TextFiles.isSafeExternalUrl("file:///sdcard/x"))
        assertFalse(TextFiles.isSafeExternalUrl("javascript:alert(1)"))
    }
}
