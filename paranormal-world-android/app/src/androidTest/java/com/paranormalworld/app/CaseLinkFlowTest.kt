package com.paranormalworld.app

import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Taps through the main CaseLink journey in the real app, like a person would:
 * create a case, add an observation, see it on the timeline, then delete it.
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
    fun createCaseAddObservationThenDeleteIt() {
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
    }
}
