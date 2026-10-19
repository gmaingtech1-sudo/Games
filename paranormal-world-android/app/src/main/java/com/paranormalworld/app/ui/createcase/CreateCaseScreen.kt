package com.paranormalworld.app.ui.createcase

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.paranormalworld.app.data.CaseStatus
import com.paranormalworld.app.ui.components.FormTextField
import com.paranormalworld.app.ui.theme.ParanormalWorldTheme
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Connects the Create/Edit Case screen to its ViewModel, and closes the screen once saved. */
@Composable
fun CreateCaseRoute(
    onBack: () -> Unit,
    onSaved: (caseId: Long) -> Unit,
    viewModel: CreateCaseViewModel = viewModel(factory = CreateCaseViewModel.Factory),
) {
    val savedCaseId = viewModel.savedCaseId
    LaunchedEffect(savedCaseId) {
        if (savedCaseId != null) onSaved(savedCaseId)
    }
    CreateCaseScreen(
        isEditing = viewModel.isEditing,
        isLoading = viewModel.isLoading,
        caseNotFound = viewModel.caseNotFound,
        form = viewModel.form,
        errors = viewModel.errors,
        onFormChange = viewModel::onFormChange,
        onSaveClick = viewModel::save,
        onBack = onBack,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateCaseScreen(
    isEditing: Boolean,
    isLoading: Boolean,
    caseNotFound: Boolean,
    form: CaseForm,
    errors: CaseFormErrors,
    onFormChange: (CaseForm) -> Unit,
    onSaveClick: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(if (isEditing) "Edit case" else "New case") },
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
            caseNotFound -> Box(contentModifier.padding(16.dp), contentAlignment = Alignment.Center) {
                Text("This case no longer exists.", style = MaterialTheme.typography.bodyLarge)
            }
            else -> CaseFormFields(
                form = form,
                errors = errors,
                onFormChange = onFormChange,
                onSaveClick = onSaveClick,
                saveLabel = if (isEditing) "Save changes" else "Save case",
                modifier = contentModifier,
            )
        }
    }
}

@Composable
private fun CaseFormFields(
    form: CaseForm,
    errors: CaseFormErrors,
    onFormChange: (CaseForm) -> Unit,
    onSaveClick: () -> Unit,
    saveLabel: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .imePadding() // Keeps the focused field above the keyboard.
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "Fields marked * are required.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        FormTextField(
            value = form.title,
            onValueChange = { onFormChange(form.copy(title = it)) },
            label = "Case title *",
            error = errors.title,
        )
        FormTextField(
            value = form.locationName,
            onValueChange = { onFormChange(form.copy(locationName = it)) },
            label = "Location *",
            error = errors.locationName,
            capitalization = KeyboardCapitalization.Words,
        )
        DateField(date = form.date, onDateChange = { onFormChange(form.copy(date = it)) })
        FormTextField(
            value = form.leadInvestigator,
            onValueChange = { onFormChange(form.copy(leadInvestigator = it)) },
            label = "Lead investigator *",
            error = errors.leadInvestigator,
            capitalization = KeyboardCapitalization.Words,
        )
        FormTextField(
            value = form.description,
            onValueChange = { onFormChange(form.copy(description = it)) },
            label = "Description",
            error = errors.description,
            helper = "Background, reported activity, who is involved.",
            singleLine = false,
        )
        StatusPicker(selected = form.status, onSelect = { onFormChange(form.copy(status = it)) })
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

private val dateFormatter: DateTimeFormatter = DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateField(date: LocalDate, onDateChange: (LocalDate) -> Unit) {
    var showPicker by rememberSaveable { mutableStateOf(false) }
    Column {
        Text("Date of investigation *", style = MaterialTheme.typography.labelLarge)
        Spacer(Modifier.height(4.dp))
        OutlinedButton(
            onClick = { showPicker = true },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
        ) {
            Icon(Icons.Filled.DateRange, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text(date.format(dateFormatter), modifier = Modifier.weight(1f))
        }
    }
    if (showPicker) {
        // The date picker works in UTC milliseconds, so convert to and from LocalDate in UTC.
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let {
                        onDateChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate())
                    }
                    showPicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showPicker = false }) { Text("Cancel") } },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

@Composable
private fun StatusPicker(selected: CaseStatus, onSelect: (CaseStatus) -> Unit) {
    Column(Modifier.selectableGroup()) {
        Text("Status", style = MaterialTheme.typography.labelLarge)
        CaseStatus.entries.forEach { status ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp) // The whole row is the tap target, not just the small circle.
                    .selectable(
                        selected = status == selected,
                        onClick = { onSelect(status) },
                        role = Role.RadioButton,
                    ),
            ) {
                RadioButton(selected = status == selected, onClick = null)
                Spacer(Modifier.size(8.dp))
                Text(status.label, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0B1426, widthDp = 360, heightDp = 900)
@Composable
private fun CreateCaseErrorsPreview() {
    val form = CaseForm(locationName = "Old Mill, Riverside Lane", date = LocalDate.of(2026, 10, 19))
    ParanormalWorldTheme {
        CreateCaseScreen(
            isEditing = false,
            isLoading = false,
            caseNotFound = false,
            form = form,
            errors = validateCaseForm(form),
            onFormChange = {},
            onSaveClick = {},
            onBack = {},
        )
    }
}
