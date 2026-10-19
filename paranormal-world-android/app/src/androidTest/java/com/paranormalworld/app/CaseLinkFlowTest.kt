package com.paranormalworld.app

import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Taps through the main CaseLink journey in the real app, like a person would:
 * create a case, add an observation, see it on the timeline, delete it, then delete the case.
 *
 * It uses the app's real database, so run it on an emulator, not on a phone with real cases.
 */
@RunWith(AndroidJUnit4::class)
class CaseLinkFlowTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private fun waitForText(text: String, substring: Boolean = false) {
        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule.onAllNodes(hasText(text, substring = substring)).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun typeInto(label: String, text: String) {
        composeRule.onNodeWithText(label).performScrollTo().performTextInput(text)
    }

    private fun tap(text: String, scroll: Boolean = true) {
        val node = composeRule.onNodeWithText(text)
        if (scroll) node.performScrollTo()
        node.performClick()
    }

    @Test
    fun createCaseAddObservationThenDeleteBoth() {
        val caseTitle = "UI test case ${System.currentTimeMillis()}"

        // Home: the empty state's button on a fresh install, otherwise the floating button.
        val hasEmptyState = composeRule.onAllNodes(hasText("Create a case")).fetchSemanticsNodes().isNotEmpty()
        tap(if (hasEmptyState) "Create a case" else "New case", scroll = false)

        // Saving an empty form shows a helpful message instead of saving.
        waitForText("Save case")
        tap("Save case")
        waitForText("Give the case a title", substring = true)

        typeInto("Case title *", caseTitle)
        typeInto("Location *", "Test Location")
        typeInto("Lead investigator *", "Test Investigator")
        tap("Save case")

        // Saving opens the new case's details.
        waitForText("Case details")
        composeRule.onNodeWithText(caseTitle).assertExists()
        waitForText("None recorded yet", substring = true)

        // Add an observation.
        tap("Add observation")
        waitForText("Save observation")
        typeInto("Title *", "Knocking sound")
        tap("Audio")
        typeInto("What happened *", "Three knocks from the north wall.")
        tap("Save observation")
        waitForText("1 observation recorded.")

        // It appears on the timeline.
        tap("View timeline")
        waitForText("Knocking sound")

        // Deleting asks first; confirming removes it.
        tap("Delete", scroll = false)
        waitForText("Delete this observation?")
        composeRule.onNode(hasText("Delete") and hasAnyAncestor(isDialog())).performClick()
        waitForText("No observations yet")

        // Back on Case Detail, delete the whole case. Cancel first: nothing should change.
        composeRule.onNodeWithContentDescription("Back").performClick()
        waitForText("Case details")
        tap("Delete case")
        waitForText("Delete this case?")
        composeRule.onNode(hasText("Cancel") and hasAnyAncestor(isDialog())).performClick()
        composeRule.onNodeWithText(caseTitle).assertExists()

        tap("Delete case")
        waitForText("Delete this case?")
        composeRule.onNode(hasText("Delete case") and hasAnyAncestor(isDialog())).performClick()

        // Back on Home, and the case is gone.
        waitForText("Paranormal World")
        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule.onAllNodes(hasText(caseTitle)).fetchSemanticsNodes().isEmpty()
        }
        composeRule.onNodeWithText("CaseLink").assertExists()
    }

    @Test
    fun leavingAFormWithUnsavedChangesAsksFirst() {
        val hasEmptyState = composeRule.onAllNodes(hasText("Create a case")).fetchSemanticsNodes().isNotEmpty()
        val newCaseButton = if (hasEmptyState) "Create a case" else "New case"

        // Nothing typed: Back leaves straight away, no question.
        tap(newCaseButton, scroll = false)
        waitForText("Save case")
        composeRule.onNodeWithContentDescription("Back").performClick()
        waitForText("CaseLink")
        assertTrue(composeRule.onAllNodes(hasText("Discard changes?")).fetchSemanticsNodes().isEmpty())

        // Something typed: Back asks first.
        tap(newCaseButton, scroll = false)
        waitForText("Save case")
        typeInto("Case title *", "Unsaved draft")
        composeRule.onNodeWithContentDescription("Back").performClick()
        waitForText("Discard changes?")

        // "Keep editing" stays on the form with the text still there.
        composeRule.onNode(hasText("Keep editing") and hasAnyAncestor(isDialog())).performClick()
        composeRule.onNodeWithText("Unsaved draft").assertExists()

        // "Discard" leaves without saving.
        composeRule.onNodeWithContentDescription("Back").performClick()
        waitForText("Discard changes?")
        composeRule.onNode(hasText("Discard") and hasAnyAncestor(isDialog())).performClick()
        waitForText("CaseLink")
        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule.onAllNodes(hasText("Unsaved draft")).fetchSemanticsNodes().isEmpty()
        }
    }
}
