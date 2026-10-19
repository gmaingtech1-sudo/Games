package com.paranormalworld.app.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue

/**
 * Protects a form from being left by accident. Returns the function to call when the user
 * asks to go back (the top bar arrow). The phone's own Back gesture is caught too.
 *
 * With no unsaved changes it just calls [onBack]. Otherwise it asks "Discard changes?" first.
 */
@Composable
fun rememberGuardedBack(hasUnsavedChanges: Boolean, onBack: () -> Unit): () -> Unit {
    // Saved so the question survives turning the phone.
    var showDialog by rememberSaveable { mutableStateOf(false) }

    // Catches the phone's Back button or gesture, but only while there is something to lose.
    BackHandler(enabled = hasUnsavedChanges) { showDialog = true }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text("Discard changes?") },
            text = { Text("You have unsaved changes. If you leave now, they'll be lost.") },
            confirmButton = {
                Button(
                    onClick = {
                        showDialog = false
                        onBack()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError,
                    ),
                ) { Text("Discard") }
            },
            dismissButton = { TextButton(onClick = { showDialog = false }) { Text("Keep editing") } },
        )
    }

    return { if (hasUnsavedChanges) showDialog = true else onBack() }
}
