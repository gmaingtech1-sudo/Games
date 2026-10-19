package com.paranormalworld.app.ui.addobservation

import com.paranormalworld.app.data.Observation
import com.paranormalworld.app.data.ObservationCategory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneOffset

class ObservationFormValidationTest {

    private val now = LocalDateTime.of(2026, 10, 19, 22, 0)

    private val validForm = ObservationForm(
        title = "Knocking sound",
        observedAt = LocalDateTime.of(2026, 10, 19, 21, 40),
        category = ObservationCategory.AUDIO,
        investigatorName = "Sam Carter",
        notes = "Three knocks from the north wall.",
    )

    @Test
    fun validFormHasNoErrors() {
        assertFalse(validateObservationForm(validForm, now).hasErrors)
    }

    @Test
    fun emptyFormFlagsRequiredFields() {
        val errors = validateObservationForm(ObservationForm(observedAt = now), now)
        assertNotNull(errors.title)
        assertNotNull(errors.category)
        assertNotNull(errors.investigatorName)
        assertNotNull(errors.notes)
        assertNull("Explanations are optional", errors.possibleExplanations)
        assertNull(errors.observedAt)
    }

    @Test
    fun futureTimeIsRejected() {
        val errors = validateObservationForm(validForm.copy(observedAt = now.plusHours(1)), now)
        assertNotNull(errors.observedAt)
    }

    @Test
    fun timeWithinAMinuteOfNowIsAccepted() {
        val errors = validateObservationForm(validForm.copy(observedAt = now.plusSeconds(30)), now)
        assertNull(errors.observedAt)
    }

    @Test
    fun savingConvertsTimeAndTrims() {
        val observation = validForm.copy(title = "  Knocking sound ").toNewObservation(investigationId = 3, zone = ZoneOffset.UTC)
        assertEquals("Knocking sound", observation.title)
        assertEquals(3L, observation.investigationId)
        assertEquals(validForm.observedAt.toInstant(ZoneOffset.UTC).toEpochMilli(), observation.observedAt)
    }

    @Test
    fun editingRoundTripKeepsIdsAndCreatedAt() {
        val original = validForm.toNewObservation(investigationId = 3, zone = ZoneOffset.UTC).copy(id = 9, createdAt = 555)
        val form = ObservationForm.from(original, zone = ZoneOffset.UTC)
        assertEquals(validForm, form)

        val edited: Observation = form.copy(notes = "Four knocks.").applyTo(original, zone = ZoneOffset.UTC)
        assertEquals(9L, edited.id)
        assertEquals(3L, edited.investigationId)
        assertEquals(555L, edited.createdAt)
        assertEquals("Four knocks.", edited.notes)
    }
}
