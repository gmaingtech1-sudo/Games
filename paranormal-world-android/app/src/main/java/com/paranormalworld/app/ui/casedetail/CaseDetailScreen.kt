package com.paranormalworld.app.ui.casedetail

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.paranormalworld.app.data.CaseStatus
import com.paranormalworld.app.data.Investigation
import com.paranormalworld.app.ui.components.IconLine
import com.paranormalworld.app.ui.components.StatusChip
import com.paranormalworld.app.ui.theme.ParanormalWorldTheme
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Connects the Case Detail screen to its ViewModel. */
@Composable
fun CaseDetailRoute(
    onBack: () -> Unit,
    onEditClick: (caseId: Long) -> Unit,
    onAddObservationClick: (caseId: Long) -> Unit,
    onTimelineClick: (caseId: Long) -> Unit,
    onDeleted: () -> Unit,
    viewModel: CaseDetailViewModel = viewModel(factory = CaseDetailViewModel.Factory),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val isDeleted = viewModel.isDeleted
    LaunchedEffect(isDeleted) {
        if (isDeleted) onDeleted()
    }
    CaseDetailScreen(
        uiState = uiState,
        onBack = onBack,
        onEditClick = { onEditClick(viewModel.caseId) },
        onAddObservationClick = { onAddObservationClick(viewModel.caseId) },
        onTimelineClick = { onTimelineClick(viewModel.caseId) },
        onDeleteCaseConfirmed = viewModel::deleteCase,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CaseDetailScreen(
    uiState: CaseDetailUiState,
    onBack: () -> Unit,
    onEditClick: () -> Unit,
    onAddObservationClick: () -> Unit,
    onTimelineClick: () -> Unit,
    onDeleteCaseConfirmed: () -> Unit,
) {
    // Saved so the "are you sure?" dialog survives turning the phone.
    var showDeleteDialog by rememberSaveable { mutableStateOf(false) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Case details") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (uiState is CaseDetailUiState.Loaded) {
                        IconButton(onClick = onEditClick) {
                            Icon(Icons.Filled.Edit, contentDescription = "Edit case")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { innerPadding ->
        val contentModifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
        when (uiState) {
            CaseDetailUiState.Loading -> Box(contentModifier, contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            CaseDetailUiState.NotFound -> Box(contentModifier.padding(16.dp), contentAlignment = Alignment.Center) {
                Text("This case no longer exists.", style = MaterialTheme.typography.bodyLarge)
            }
            is CaseDetailUiState.Loaded -> CaseDetailContent(
                investigation = uiState.investigation,
                observationCount = uiState.observationCount,
                onAddObservationClick = onAddObservationClick,
                onTimelineClick = onTimelineClick,
                onDeleteClick = { showDeleteDialog = true },
                modifier = contentModifier,
            )
        }
    }

    if (showDeleteDialog && uiState is CaseDetailUiState.Loaded) {
        DeleteCaseDialog(
            caseTitle = uiState.investigation.title,
            observationCount = uiState.observationCount,
            onConfirm = {
                showDeleteDialog = false
                onDeleteCaseConfirmed()
            },
            onDismiss = { showDeleteDialog = false },
        )
    }
}

@Composable
private fun DeleteCaseDialog(caseTitle: String, observationCount: Int, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val observationsText = when (observationCount) {
        0 -> ""
        1 -> " Its 1 observation will be deleted too."
        else -> " All $observationCount of its observations will be deleted too."
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Filled.Delete, contentDescription = null) },
        title = { Text("Delete this case?") },
        text = { Text("\"$caseTitle\" will be permanently removed.$observationsText This can't be undone.") },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
            ) { Text("Delete case") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private val dateFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG)
private val timestampFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)

private fun formatTimestamp(millis: Long): String =
    Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).format(timestampFormatter)

@Composable
private fun CaseDetailContent(
    investigation: Investigation,
    observationCount: Int,
    onAddObservationClick: () -> Unit,
    onTimelineClick: () -> Unit,
    onDeleteClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    investigation.title,
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                StatusChip(investigation.status)
                IconLine(Icons.Filled.LocationOn, investigation.locationName, maxLines = 3)
                IconLine(Icons.Filled.DateRange, investigation.date.format(dateFormatter))
                IconLine(Icons.Filled.Person, "Lead: ${investigation.leadInvestigator}", maxLines = 2)

                HorizontalDivider(Modifier.padding(vertical = 4.dp), color = MaterialTheme.colorScheme.outline)
                Text("Description", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    investigation.description.ifBlank { "No description yet. Tap the pencil icon to add one." },
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Observations: a count and the two actions that lead to the next screens.
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Observations", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    when (observationCount) {
                        0 -> "None recorded yet. Log what you see, hear or measure, as it happens."
                        1 -> "1 observation recorded."
                        else -> "$observationCount observations recorded."
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = onAddObservationClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("Add observation", style = MaterialTheme.typography.titleMedium)
                }
                OutlinedButton(
                    onClick = onTimelineClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                ) {
                    Icon(Icons.AutoMirrored.Filled.List, contentDescription = null)
                    Spacer(Modifier.size(8.dp))
                    Text("View timeline", style = MaterialTheme.typography.titleMedium)
                }
            }
        }

        Text(
            "Created ${formatTimestamp(investigation.createdAt)}\nLast updated ${formatTimestamp(investigation.updatedAt)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        // Kept at the bottom, away from the everyday buttons, and red so it isn't tapped by mistake.
        OutlinedButton(
            onClick = onDeleteClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error),
        ) {
            Icon(Icons.Filled.Delete, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text("Delete case", style = MaterialTheme.typography.titleMedium)
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0B1426, widthDp = 360, heightDp = 800)
@Composable
private fun CaseDetailPreview() {
    val investigation = Investigation(
        id = 1,
        title = "[DEMO] Old Mill Cellar",
        locationName = "Example Old Mill (fictional)",
        date = LocalDate.of(2026, 10, 19),
        description = "Demo data, not a real case.",
        leadInvestigator = "Demo Investigator",
        status = CaseStatus.OPEN,
        createdAt = 1_760_900_000_000,
        updatedAt = 1_760_903_600_000,
    )
    ParanormalWorldTheme {
        CaseDetailScreen(
            uiState = CaseDetailUiState.Loaded(investigation, observationCount = 2),
            onBack = {},
            onEditClick = {},
            onAddObservationClick = {},
            onTimelineClick = {},
            onDeleteCaseConfirmed = {},
        )
    }
}
