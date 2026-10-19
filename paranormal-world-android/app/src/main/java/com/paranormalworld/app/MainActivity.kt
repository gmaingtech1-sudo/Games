package com.paranormalworld.app

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.paranormalworld.app.ui.navigation.AppNavigation
import com.paranormalworld.app.ui.theme.ParanormalWorldTheme

/** The app's only Activity. Every screen is drawn inside it with Jetpack Compose. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Draw behind the status and navigation bars, with light icons on our dark background.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        setContent {
            ParanormalWorldTheme {
                AppNavigation()
            }
        }
    }
}
