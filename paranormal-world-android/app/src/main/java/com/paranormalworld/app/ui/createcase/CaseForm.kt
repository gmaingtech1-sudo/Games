package com.paranormalworld.app.ui.createcase

import com.paranormalworld.app.data.CaseStatus
import com.paranormalworld.app.data.Investigation
import java.time.LocalDate

/** What the user has typed into the Create/Edit Case form so far. */
data class CaseForm(
    val title: String = "",
    val locationName: String = "",
    val date: LocalDate = LocalDate.now(),
    val description: String = "",
    val leadInvestigator: String = "",
    val status: CaseStatus = CaseStatus.OPEN,
) {
    /** A brand-new case to save. The repository fills in the id and timestamps. */
    fun toNewInvestigation() = Investigation(
        title = title.trim(),
        locationName = locationName.trim(),
        date = date,
        description = description.trim(),
        leadInvestigator = leadInvestigator.trim(),
        status = status,
        createdAt = 0,
        updatedAt = 0,
    )

    /** The existing case [original] with this form's changes applied (keeps its id and createdAt). */
    fun applyTo(original: Investigation) = original.copy(
        title = title.trim(),
        locationName = locationName.trim(),
        date = date,
        description = description.trim(),
        leadInvestigator = leadInvestigator.trim(),
        status = status,
    )

    companion object {
        fun from(investigation: Investigation) = CaseForm(
            title = investigation.title,
            locationName = investigation.locationName,
            date = investigation.date,
            description = investigation.description,
            leadInvestigator = investigation.leadInvestigator,
            status = investigation.status,
        )

        const val TITLE_MAX = 80
        const val LOCATION_MAX = 120
        const val INVESTIGATOR_MAX = 80
        const val DESCRIPTION_MAX = 2000
    }
}

/** One message per field that has a problem; null means the field is fine. */
data class CaseFormErrors(
    val title: String? = null,
    val locationName: String? = null,
    val leadInvestigator: String? = null,
    val description: String? = null,
) {
    val hasErrors: Boolean
        get() = listOf(title, locationName, leadInvestigator, description).any { it != null }
}

/** Checks the form. Kept separate from the screen so it can be unit tested. */
fun validateCaseForm(form: CaseForm): CaseFormErrors = CaseFormErrors(
    title = when {
        form.title.isBlank() -> "Give the case a title, e.g. \"Old Mill cellar\"."
        form.title.trim().length > CaseForm.TITLE_MAX -> "Keep the title under ${CaseForm.TITLE_MAX} characters."
        else -> null
    },
    locationName = when {
        form.locationName.isBlank() -> "Enter where the investigation takes place."
        form.locationName.trim().length > CaseForm.LOCATION_MAX -> "Keep the location under ${CaseForm.LOCATION_MAX} characters."
        else -> null
    },
    leadInvestigator = when {
        form.leadInvestigator.isBlank() -> "Enter the name of the person leading the investigation."
        form.leadInvestigator.trim().length > CaseForm.INVESTIGATOR_MAX -> "Keep the name under ${CaseForm.INVESTIGATOR_MAX} characters."
        else -> null
    },
    description = when {
        form.description.trim().length > CaseForm.DESCRIPTION_MAX -> "Keep the description under ${CaseForm.DESCRIPTION_MAX} characters."
        else -> null
    },
)
