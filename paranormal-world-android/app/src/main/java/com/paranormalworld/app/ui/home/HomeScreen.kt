package com.paranormalworld.app.ui.home

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.paranormalworld.app.data.CaseStatus
import com.paranormalworld.app.data.Investigation
import com.paranormalworld.app.ui.theme.ParanormalWorldTheme
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * Connects the Home screen to its ViewModel. MainActivity calls this one;
 * [HomeScreen] below only draws what it is given, which keeps it easy to preview.
 */
@Composable
fun HomeRoute(
    onCreateCaseClick: () -> Unit,
    onCaseClick: (Investigation) -> Unit,
    viewModel: HomeViewModel = viewModel(factory = HomeViewModel.Factory),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    HomeScreen(
        uiState = uiState,
        onCreateCaseClick = onCreateCaseClick,
        onCaseClick = onCaseClick,
        onAddDemoCaseClick = viewModel::addDemoCase,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    uiState: HomeUiState,
    onCreateCaseClick: () -> Unit,
    onCaseClick: (Investigation) -> Unit,
    onAddDemoCaseClick: () -> Unit,
) {
    val hasCases = uiState is HomeUiState.Loaded && uiState.cases.isNotEmpty()
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
        floatingActionButton = {
            // The empty state has its own big button, so the FAB only appears once there are cases.
            if (hasCases) {
                ExtendedFloatingActionButton(
                    onClick = onCreateCaseClick,
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text("New case") },
                )
            }
        },
    ) { innerPadding ->
        val contentModifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
        when (uiState) {
            HomeUiState.Loading -> Box(contentModifier, contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            is HomeUiState.Loaded ->
                if (uiState.cases.isEmpty()) {
                    EmptyCasesState(
                        onCreateCaseClick = onCreateCaseClick,
                        onAddDemoCaseClick = onAddDemoCaseClick,
                        modifier = contentModifier.padding(horizontal = 16.dp),
                    )
                } else {
                    CaseList(cases = uiState.cases, onCaseClick = onCaseClick, modifier = contentModifier)
                }
        }
    }
}

@Composable
private fun CaseList(
    cases: List<Investigation>,
    onCaseClick: (Investigation) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        // Extra space at the bottom so the last card isn't hidden behind the "New case" button.
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(cases, key = { it.id }) { case ->
            CaseCard(case = case, onClick = { onCaseClick(case) })
        }
    }
}

private val dateFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)

@Composable
private fun CaseCard(case: Investigation, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    case.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.size(8.dp))
                StatusChip(case.status)
            }
            Spacer(Modifier.height(8.dp))
            IconLine(Icons.Filled.LocationOn, case.locationName)
            Spacer(Modifier.height(4.dp))
            IconLine(Icons.Filled.DateRange, case.date.format(dateFormatter))
        }
    }
}

@Composable
private fun IconLine(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(6.dp))
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun StatusChip(status: CaseStatus) {
    val open = status == CaseStatus.OPEN
    Surface(
        shape = MaterialTheme.shapes.small,
        color = if (open) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = if (open) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Text(
            status.label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

/** Shown when no investigations have been saved yet. */
@Composable
private fun EmptyCasesState(
    onCreateCaseClick: () -> Unit,
    onAddDemoCaseClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
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
                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = onAddDemoCaseClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                ) {
                    Text("Add a demo case (sample data)")
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

// Previews let you see the screen in Android Studio's Split/Design view without running the app.
@Preview(showBackground = true, backgroundColor = 0xFF0B1426, widthDp = 360, heightDp = 720)
@Composable
private fun HomeEmptyPreview() {
    ParanormalWorldTheme {
        HomeScreen(HomeUiState.Loaded(emptyList()), onCreateCaseClick = {}, onCaseClick = {}, onAddDemoCaseClick = {})
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0B1426, widthDp = 360, heightDp = 720)
@Composable
private fun HomeListPreview() {
    val sample = Investigation(
        id = 1,
        title = "[DEMO] Old Mill Cellar",
        locationName = "Example Old Mill (fictional)",
        date = LocalDate.of(2026, 10, 19),
        description = "",
        leadInvestigator = "Demo Investigator",
        createdAt = 0,
        updatedAt = 0,
    )
    ParanormalWorldTheme {
        HomeScreen(
            HomeUiState.Loaded(listOf(sample, sample.copy(id = 2, title = "Lighthouse keeper's cottage", status = CaseStatus.CLOSED))),
            onCreateCaseClick = {},
            onCaseClick = {},
            onAddDemoCaseClick = {},
        )
    }
}
