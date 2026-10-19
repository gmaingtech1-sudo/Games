package com.paranormalworld.app.ui.timeline

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.paranormalworld.app.data.Observation
import com.paranormalworld.app.data.ObservationCategory
import com.paranormalworld.app.ui.theme.ParanormalWorldTheme
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Connects the Case Timeline screen to its ViewModel. */
@Composable
fun CaseTimelineRoute(
    onBack: () -> Unit,
    onAddObservationClick: (caseId: Long) -> Unit,
    onEditObservationClick: (observationId: Long) -> Unit,
    viewModel: CaseTimelineViewModel = viewModel(factory = CaseTimelineViewModel.Factory),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    CaseTimelineScreen(
        uiState = uiState,
        onBack = onBack,
        onAddObservationClick = { onAddObservationClick(viewModel.caseId) },
        onEditObservationClick = { onEditObservationClick(it.id) },
        onDeleteObservationConfirmed = viewModel::deleteObservation,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CaseTimelineScreen(
    uiState: TimelineUiState,
    onBack: () -> Unit,
    onAddObservationClick: () -> Unit,
    onEditObservationClick: (Observation) -> Unit,
    onDeleteObservationConfirmed: (Observation) -> Unit,
) {
    // The id of the observation waiting for "are you sure?". Saved so it survives rotation.
    var pendingDeleteId by rememberSaveable { mutableStateOf<Long?>(null) }
    val loaded = uiState as? TimelineUiState.Loaded

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Timeline")
                        if (loaded != null) {
                            Text(
                                loaded.caseTitle,
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.primary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        floatingActionButton = {
            if (loaded != null && !loaded.isEmpty) {
                ExtendedFloatingActionButton(
                    onClick = onAddObservationClick,
                    icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                    text = { Text("Add observation") },
                )
            }
        },
    ) { innerPadding ->
        val contentModifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
        when (uiState) {
            TimelineUiState.Loading -> Box(contentModifier, contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            TimelineUiState.NotFound -> Box(contentModifier.padding(16.dp), contentAlignment = Alignment.Center) {
                Text("This case no longer exists.", style = MaterialTheme.typography.bodyLarge)
            }
            is TimelineUiState.Loaded ->
                if (uiState.isEmpty) {
                    EmptyTimeline(onAddObservationClick, contentModifier.padding(horizontal = 16.dp))
                } else {
                    TimelineList(
                        days = uiState.days,
                        onEditClick = onEditObservationClick,
                        onDeleteClick = { pendingDeleteId = it.id },
                        modifier = contentModifier,
                    )
                }
        }
    }

    // Find the observation to delete in the current list. If it has gone (e.g. already deleted), skip the dialog.
    val pendingDelete = loaded?.days?.flatMap { it.observations }?.find { it.id == pendingDeleteId }
    if (pendingDelete != null) {
        DeleteObservationDialog(
            observation = pendingDelete,
            onConfirm = {
                onDeleteObservationConfirmed(pendingDelete)
                pendingDeleteId = null
            },
            onDismiss = { pendingDeleteId = null },
        )
    }
}

@Composable
private fun DeleteObservationDialog(observation: Observation, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Filled.Delete, contentDescription = null) },
        title = { Text("Delete this observation?") },
        text = { Text("\"${observation.title}\" will be permanently removed from this case. This can't be undone.") },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
            ) { Text("Delete") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun EmptyTimeline(onAddObservationClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("No observations yet", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(8.dp))
        Text(
            "Observations appear here in the order they happened.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
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
    }
}

private val dayFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL)
private val timeFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)

@Composable
private fun TimelineList(
    days: List<TimelineDay>,
    onEditClick: (Observation) -> Unit,
    onDeleteClick: (Observation) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        // Extra bottom space so the last card isn't hidden behind the "Add observation" button.
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
    ) {
        days.forEach { day ->
            item(key = "day-${day.date}") {
                Text(
                    day.date.format(dayFormatter),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 8.dp, bottom = 8.dp),
                )
            }
            items(day.observations, key = { it.id }) { observation ->
                TimelineEntry(
                    observation = observation,
                    onEditClick = { onEditClick(observation) },
                    onDeleteClick = { onDeleteClick(observation) },
                )
            }
        }
    }
}

/** One observation: a teal dot on a line down the left, and a card with the details. */
@Composable
private fun TimelineEntry(observation: Observation, onEditClick: () -> Unit, onDeleteClick: () -> Unit) {
    Row(Modifier.height(IntrinsicSize.Min)) {
        Column(
            modifier = Modifier
                .width(24.dp)
                .fillMaxHeight(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(18.dp))
            Box(
                Modifier
                    .size(12.dp)
                    .background(MaterialTheme.colorScheme.primary, CircleShape),
            )
            Box(
                Modifier
                    .width(2.dp)
                    .weight(1f)
                    .background(MaterialTheme.colorScheme.outline),
            )
        }
        Spacer(Modifier.size(8.dp))
        Card(
            modifier = Modifier
                .weight(1f)
                .padding(bottom = 12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        Instant.ofEpochMilli(observation.observedAt).atZone(ZoneId.systemDefault()).format(timeFormatter),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(Modifier.size(8.dp))
                    CategoryBadge(observation.category)
                }
                Spacer(Modifier.height(6.dp))
                Text(observation.title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    "Observed by ${observation.investigatorName}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
                Text(observation.notes, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface)
                if (observation.possibleExplanations.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text("Possible explanations", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
                    Text(
                        observation.possibleExplanations,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onEditClick) {
                        Icon(Icons.Filled.Edit, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(6.dp))
                        Text("Edit")
                    }
                    TextButton(
                        onClick = onDeleteClick,
                        colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    ) {
                        Icon(Icons.Filled.Delete, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(6.dp))
                        Text("Delete")
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryBadge(category: ObservationCategory) {
    Surface(
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Text(
            category.label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0B1426, widthDp = 360, heightDp = 800)
@Composable
private fun CaseTimelinePreview() {
    val zone = ZoneId.systemDefault()
    fun at(hour: Int, minute: Int) =
        LocalDateTime.of(LocalDate.of(2026, 10, 19), LocalTime.of(hour, minute)).atZone(zone).toInstant().toEpochMilli()
    val observations = listOf(
        Observation(1, 1, "[DEMO] Temperature drop near stairs", at(21, 15), ObservationCategory.TEMPERATURE, "Demo Investigator", "17.5 °C to 14.0 °C in about a minute.", "Draught from the outside door.", 0),
        Observation(2, 1, "[DEMO] Knocking sound", at(21, 40), ObservationCategory.AUDIO, "Demo Investigator", "Three knocks from the north wall.", "", 0),
    )
    ParanormalWorldTheme {
        CaseTimelineScreen(
            uiState = TimelineUiState.Loaded("[DEMO] Old Mill Cellar", groupByDay(observations, zone)),
            onBack = {},
            onAddObservationClick = {},
            onEditObservationClick = {},
            onDeleteObservationConfirmed = {},
        )
    }
}
