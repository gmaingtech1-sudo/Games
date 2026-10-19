package com.paranormalworld.app.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.paranormalworld.app.ui.theme.ParanormalWorldTheme

/**
 * The first screen the user sees.
 *
 * Stage 1: there is no database yet, so it always shows the empty state.
 * Stage 2 will pass in the saved cases and show them as a list.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(onCreateCaseClick: () -> Unit) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Paranormal World", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "CaseLink",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
    ) { innerPadding ->
        EmptyCasesState(
            onCreateCaseClick = onCreateCaseClick,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
        )
    }
}

/** Shown when no investigations have been saved yet. */
@Composable
private fun EmptyCasesState(onCreateCaseClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    imageVector = Icons.Filled.Search,
                    contentDescription = null, // Decorative; the text below says it all.
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(56.dp),
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    "No cases yet",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    "Start your first investigation to begin logging what you see, hear and measure.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(24.dp))
                Button(
                    onClick = onCreateCaseClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp), // Large, easy-to-tap button.
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("Create a case", style = MaterialTheme.typography.titleMedium)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "CaseLink records observations, not conclusions.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

// Lets you see the screen in Android Studio's Split/Design view without running the app.
@Preview(showBackground = true, backgroundColor = 0xFF0B1426, widthDp = 360, heightDp = 720)
@Composable
private fun HomeScreenPreview() {
    ParanormalWorldTheme {
        HomeScreen(onCreateCaseClick = {})
    }
}
