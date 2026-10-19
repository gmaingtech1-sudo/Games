package com.paranormalworld.app.ui.addobservation

import android.text.format.DateFormat
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimeInput
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.paranormalworld.app.data.ObservationCategory
import com.paranormalworld.app.ui.components.FormTextField
import com.paranormalworld.app.ui.theme.ParanormalWorldTheme
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Connects the Add/Edit Observation screen to its ViewModel, and closes the screen once saved. */
@Composable
fun AddObservationRoute(
    onBack: () -> Unit,
    onSaved: () -> Unit,
    viewModel: AddObservationViewModel = viewModel(factory = AddObservationViewModel.Factory),
) {
    val isSaved = viewModel.isSaved
    LaunchedEffect(isSaved) {
        if (isSaved) onSaved()
    }
    AddObservationScreen(
        isEditing = viewModel.isEditing,
        isLoading = viewModel.isLoading,
        notFound = viewModel.notFound,
        caseTitle = viewModel.caseTitle,
        form = viewModel.form,
        errors = viewModel.errors,
        onFormChange = viewModel::onFormChange,
        onSaveClick = viewModel::save,
        onBack = onBack,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddObservationScreen(
    isEditing: Boolean,
    isLoading: Boolean,
    notFound: Boolean,
    caseTitle: String,
    form: ObservationForm,
    errors: ObservationFormErrors,
    onFormChange: (ObservationForm) -> Unit,
    onSaveClick: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(if (isEditing) "Edit observation" else "Add observation")
                        if (caseTitle.isNotEmpty()) {
                            Text(
                                caseTitle,
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
    ) { innerPadding ->
        val contentModifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
        when {
            isLoading -> Box(contentModifier, contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            notFound -> Box(contentModifier.padding(16.dp), contentAlignment = Alignment.Center) {
                Text(
                    if (isEditing) "This observation no longer exists." else "This case no longer exists.",
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
            else -> ObservationFormFields(
                form = form,
                errors = errors,
                onFormChange = onFormChange,
                onSaveClick = onSaveClick,
                saveLabel = if (isEditing) "Save changes" else "Save observation",
                modifier = contentModifier,
            )
        }
    }
}

@Composable
private fun ObservationFormFields(
    form: ObservationForm,
    errors: ObservationFormErrors,
    onFormChange: (ObservationForm) -> Unit,
    onSaveClick: () -> Unit,
    saveLabel: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        FactualReminder()
        Text(
            "Fields marked * are required.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FormTextField(
            value = form.title,
            onValueChange = { onFormChange(form.copy(title = it)) },
            label = "Title *",
            error = errors.title,
        )
        ObservedAtField(
            observedAt = form.observedAt,
            error = errors.observedAt,
            onChange = { onFormChange(form.copy(observedAt = it)) },
        )
        CategoryPicker(
            selected = form.category,
            error = errors.category,
            onSelect = { onFormChange(form.copy(category = it)) },
        )
        FormTextField(
            value = form.investigatorName,
            onValueChange = { onFormChange(form.copy(investigatorName = it)) },
            label = "Observed by *",
            error = errors.investigatorName,
            capitalization = KeyboardCapitalization.Words,
        )
        FormTextField(
            value = form.notes,
            onValueChange = { onFormChange(form.copy(notes = it)) },
            label = "What happened *",
            error = errors.notes,
            helper = "Exactly what you saw, heard or measured. Include readings, places and equipment.",
            singleLine = false,
        )
        FormTextField(
            value = form.possibleExplanations,
            onValueChange = { onFormChange(form.copy(possibleExplanations = it)) },
            label = "Possible explanations",
            error = errors.possibleExplanations,
            helper = "Ordinary causes to rule out: draughts, pipes, traffic, phones, other people...",
            singleLine = false,
        )
        Spacer(Modifier.height(4.dp))
        Button(
            onClick = onSaveClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
        ) {
            Text(saveLabel, style = MaterialTheme.typography.titleMedium)
        }
        Spacer(Modifier.height(16.dp))
    }
}

/** Reminds the user to record facts, not conclusions. */
@Composable
private fun FactualReminder() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Info, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.size(12.dp))
            Text(
                "Record what you observed, not what you think caused it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

private val dateFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)
private val timeFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)

/** Only today and earlier days can be picked: an observation can't happen in the future. */
@OptIn(ExperimentalMaterial3Api::class)
private object PastDates : SelectableDates {
    override fun isSelectableDate(utcTimeMillis: Long): Boolean =
        Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate() <= LocalDate.now()

    override fun isSelectableYear(year: Int): Boolean = year <= LocalDate.now().year
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ObservedAtField(observedAt: LocalDateTime, error: String?, onChange: (LocalDateTime) -> Unit) {
    var showDatePicker by rememberSaveable { mutableStateOf(false) }
    var showTimePicker by rememberSaveable { mutableStateOf(false) }
    val errorColor = MaterialTheme.colorScheme.error

    Column {
        Text("When it happened *", style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = { showDatePicker = true },
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
            ) {
                Icon(Icons.Filled.DateRange, contentDescription = null)
                Spacer(Modifier.size(6.dp))
                Text(observedAt.format(dateFormatter), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            OutlinedButton(
                onClick = { showTimePicker = true },
                modifier = Modifier
                    .weight(1f)
                    .height(56.dp),
            ) {
                Text(observedAt.format(timeFormatter), maxLines = 1)
            }
        }
        if (error != null) {
            Text(error, style = MaterialTheme.typography.bodySmall, color = errorColor, modifier = Modifier.padding(start = 16.dp, top = 4.dp))
        }
    }

    if (showDatePicker) {
        // The date picker works in UTC milliseconds, so convert to and from LocalDate in UTC.
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = observedAt.toLocalDate().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = PastDates,
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let {
                        val day = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()
                        onChange(observedAt.with(day))
                    }
                    showDatePicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("Cancel") } },
        ) {
            DatePicker(state = pickerState)
        }
    }

    if (showTimePicker) {
        val timeState = rememberTimePickerState(
            initialHour = observedAt.hour,
            initialMinute = observedAt.minute,
            is24Hour = DateFormat.is24HourFormat(LocalContext.current), // Follows the phone's setting.
        )
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            title = { Text("Time observed") },
            text = { TimeInput(state = timeState) },
            confirmButton = {
                TextButton(onClick = {
                    onChange(observedAt.withHour(timeState.hour).withMinute(timeState.minute))
                    showTimePicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showTimePicker = false }) { Text("Cancel") } },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategoryPicker(selected: ObservationCategory?, error: String?, onSelect: (ObservationCategory) -> Unit) {
    Column {
        Text("Category *", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ObservationCategory.entries.forEach { category ->
                val isSelected = category == selected
                FilterChip(
                    selected = isSelected,
                    onClick = { onSelect(category) },
                    label = { Text(category.label) },
                    leadingIcon = if (isSelected) {
                        { Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(18.dp)) }
                    } else {
                        null
                    },
                )
            }
        }
        if (error != null) {
            Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(start = 16.dp))
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0B1426, widthDp = 360, heightDp = 1000)
@Composable
private fun AddObservationPreview() {
    val form = ObservationForm(
        title = "Knocking sound",
        observedAt = LocalDateTime.of(2026, 10, 19, 21, 40),
        investigatorName = "Demo Investigator",
    )
    ParanormalWorldTheme {
        AddObservationScreen(
            isEditing = false,
            isLoading = false,
            notFound = false,
            caseTitle = "[DEMO] Old Mill Cellar",
            form = form,
            errors = validateObservationForm(form, now = LocalDateTime.of(2026, 10, 19, 22, 0)),
            onFormChange = {},
            onSaveClick = {},
            onBack = {},
        )
    }
}
