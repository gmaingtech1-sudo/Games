package com.paranormalworld.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.font.FontWeight

// Start from Material 3's default text styles and make headings a little bolder.
private val defaults = Typography()

val AppTypography = Typography(
    headlineMedium = defaults.headlineMedium.copy(fontWeight = FontWeight.Bold),
    titleLarge = defaults.titleLarge.copy(fontWeight = FontWeight.SemiBold),
    titleMedium = defaults.titleMedium.copy(fontWeight = FontWeight.SemiBold),
)
