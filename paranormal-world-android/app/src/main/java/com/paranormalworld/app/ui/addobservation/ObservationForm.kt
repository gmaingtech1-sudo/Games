package com.paranormalworld.app.ui.addobservation

import com.paranormalworld.app.data.Observation
import com.paranormalworld.app.data.ObservationCategory
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/** What the user has typed into the Add/Edit Observation form so far. */
data class ObservationForm(
    val title: String = "",
    val observedAt: LocalDateTime = LocalDateTime.now().truncatedTo(ChronoUnit.MINUTES),
    val category: ObservationCategory? = null, // null until the user picks one.
    val investigatorName: String = "",
    val notes: String = "",
    val possibleExplanations: String = "",
) {
    /** A brand-new observation for case [investigationId]. The repository fills in id and createdAt. */
    fun toNewObservation(investigationId: Long, zone: ZoneId = ZoneId.systemDefault()) = Observation(
        investigationId = investigationId,
        title = title.trim(),
        observedAt = observedAt.atZone(zone).toInstant().toEpochMilli(),
        category = requireNotNull(category) { "Validate the form before saving" },
        investigatorName = investigatorName.trim(),
        notes = notes.trim(),
        possibleExplanations = possibleExplanations.trim(),
        createdAt = 0,
    )

    /** The existing observation [original] with this form's changes (keeps its id, case and createdAt). */
    fun applyTo(original: Observation, zone: ZoneId = ZoneId.systemDefault()) =
        toNewObservation(original.investigationId, zone).copy(id = original.id, createdAt = original.createdAt)

    companion object {
        fun from(observation: Observation, zone: ZoneId = ZoneId.systemDefault()) = ObservationForm(
            title = observation.title,
            observedAt = LocalDateTime.ofInstant(Instant.ofEpochMilli(observation.observedAt), zone),
            category = observation.category,
            investigatorName = observation.investigatorName,
            notes = observation.notes,
            possibleExplanations = observation.possibleExplanations,
        )

        const val TITLE_MAX = 80
        const val INVESTIGATOR_MAX = 80
        const val NOTES_MAX = 4000
        const val EXPLANATIONS_MAX = 2000
    }
}

/** One message per field that has a problem; null means the field is fine. */
data class ObservationFormErrors(
    val title: String? = null,
    val observedAt: String? = null,
    val category: String? = null,
    val investigatorName: String? = null,
    val notes: String? = null,
    val possibleExplanations: String? = null,
) {
    val hasErrors: Boolean
        get() = listOf(title, observedAt, category, investigatorName, notes, possibleExplanations).any { it != null }
}

/** Checks the form. [now] is a parameter so tests can pick the current time. */
fun validateObservationForm(
    form: ObservationForm,
    now: LocalDateTime = LocalDateTime.now(),
): ObservationFormErrors = ObservationFormErrors(
    title = when {
        form.title.isBlank() -> "Give the observation a short title, e.g. \"Knocking from north wall\"."
        form.title.trim().length > ObservationForm.TITLE_MAX -> "Keep the title under ${ObservationForm.TITLE_MAX} characters."
        else -> null
    },
    // A minute of slack, so "now" picked a moment ago still counts.
    observedAt = if (form.observedAt.isAfter(now.plusMinutes(1))) {
        "The time can't be in the future. Pick when it actually happened."
    } else {
        null
    },
    category = if (form.category == null) "Choose the category that fits best. Use \"Other\" if none do." else null,
    investigatorName = when {
        form.investigatorName.isBlank() -> "Enter who made the observation."
        form.investigatorName.trim().length > ObservationForm.INVESTIGATOR_MAX -> "Keep the name under ${ObservationForm.INVESTIGATOR_MAX} characters."
        else -> null
    },
    notes = when {
        form.notes.isBlank() -> "Describe what happened: what you saw, heard or measured, and where."
        form.notes.trim().length > ObservationForm.NOTES_MAX -> "Keep the notes under ${ObservationForm.NOTES_MAX} characters."
        else -> null
    },
    possibleExplanations = when {
        form.possibleExplanations.trim().length > ObservationForm.EXPLANATIONS_MAX -> "Keep this under ${ObservationForm.EXPLANATIONS_MAX} characters."
        else -> null
    },
)
