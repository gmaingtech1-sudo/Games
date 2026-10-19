package com.paranormalworld.app.ui.createcase

import com.paranormalworld.app.data.CaseStatus
import com.paranormalworld.app.data.Investigation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class CaseFormValidationTest {

    private val validForm = CaseForm(
        title = "Old Mill cellar",
        locationName = "Riverside Lane",
        date = LocalDate.of(2026, 10, 19),
        leadInvestigator = "Sam Carter",
    )

    @Test
    fun validFormHasNoErrors() {
        assertFalse(validateCaseForm(validForm).hasErrors)
    }

    @Test
    fun emptyFormFlagsEveryRequiredField() {
        val errors = validateCaseForm(CaseForm())
        assertNotNull(errors.title)
        assertNotNull(errors.locationName)
        assertNotNull(errors.leadInvestigator)
        assertNull("Description is optional", errors.description)
        assertTrue(errors.hasErrors)
    }

    @Test
    fun spacesOnlyCountAsEmpty() {
        assertNotNull(validateCaseForm(validForm.copy(title = "   ")).title)
    }

    @Test
    fun overlongTitleIsRejected() {
        val errors = validateCaseForm(validForm.copy(title = "x".repeat(CaseForm.TITLE_MAX + 1)))
        assertNotNull(errors.title)
    }

    @Test
    fun savingTrimsSpaces() {
        val investigation = validForm.copy(title = "  Old Mill cellar  ").toNewInvestigation()
        assertEquals("Old Mill cellar", investigation.title)
    }

    @Test
    fun editingKeepsIdAndCreatedAt() {
        val original = Investigation(
            id = 7,
            title = "Old",
            locationName = "Somewhere",
            date = LocalDate.of(2026, 1, 1),
            description = "",
            leadInvestigator = "Sam",
            status = CaseStatus.OPEN,
            createdAt = 1234,
            updatedAt = 1234,
        )
        val edited = validForm.copy(status = CaseStatus.CLOSED).applyTo(original)
        assertEquals(7L, edited.id)
        assertEquals(1234L, edited.createdAt)
        assertEquals("Old Mill cellar", edited.title)
        assertEquals(CaseStatus.CLOSED, edited.status)
    }
}
