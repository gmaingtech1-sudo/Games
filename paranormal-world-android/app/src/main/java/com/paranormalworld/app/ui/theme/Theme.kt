package com.paranormalworld.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

// Paranormal World is always dark, whatever the phone's light/dark setting is.
private val ParanormalColors = darkColorScheme(
    primary = TealHighlight,
    onPrimary = OnTeal,
    primaryContainer = TealDark,
    onPrimaryContainer = TextWhite,
    secondary = TealHighlight,
    onSecondary = OnTeal,
    background = NavyBackground,
    onBackground = TextWhite,
    surface = CharcoalSurface,
    onSurface = TextWhite,
    surfaceVariant = BlackCard,
    onSurfaceVariant = TextMuted,
    surfaceContainer = BlackCard,
    outline = CharcoalOutline,
    error = ErrorRed,
    onError = OnErrorRed,
)

@Composable
fun ParanormalWorldTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ParanormalColors,
        typography = AppTypography,
        content = content,
    )
}
