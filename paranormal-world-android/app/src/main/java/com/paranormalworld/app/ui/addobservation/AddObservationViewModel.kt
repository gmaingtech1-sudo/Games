package com.paranormalworld.app.ui.addobservation

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.paranormalworld.app.ParanormalWorldApp
import com.paranormalworld.app.data.CaseRepository
import com.paranormalworld.app.data.Observation
import com.paranormalworld.app.ui.navigation.Routes
import kotlinx.coroutines.launch

/**
 * Runs the Add/Edit Observation form. Give it [caseId] to add a new observation to that case,
 * or [observationId] to edit an existing observation.
 */
class AddObservationViewModel(
    private val repository: CaseRepository,
    private val caseId: Long?,
    private val observationId: Long?,
) : ViewModel() {

    val isEditing: Boolean = observationId != null

    var form by mutableStateOf(ObservationForm())
        private set
    var errors by mutableStateOf(ObservationFormErrors())
        private set
    var isLoading by mutableStateOf(true)
        private set
    var notFound by mutableStateOf(false)
        private set
    var caseTitle by mutableStateOf("")
        private set

    /** Becomes true once saved; the screen then closes. */
    var isSaved by mutableStateOf(false)
        private set

    private var original: Observation? = null

    /** The form as it was when the screen opened, to tell whether anything has changed. */
    private var initialForm = form

    /** True when the user has typed or picked something that isn't saved yet. */
    val hasUnsavedChanges: Boolean
        get() = !isLoading && !isSaved && form != initialForm
    private var isSaving = false
    private var showErrors = false

    init {
        viewModelScope.launch {
            if (observationId != null) {
                val observation = repository.getObservation(observationId)
                if (observation != null) {
                    original = observation
                    form = ObservationForm.from(observation)
                    caseTitle = repository.getInvestigation(observation.investigationId)?.title.orEmpty()
                } else {
                    notFound = true
                }
            } else {
                val investigation = caseId?.let { repository.getInvestigation(it) }
                if (investigation != null) {
                    caseTitle = investigation.title
                    // Most observations are made by the lead, so start with their name filled in.
                    form = form.copy(investigatorName = investigation.leadInvestigator)
                } else {
                    notFound = true
                }
            }
            initialForm = form
            isLoading = false
        }
    }

    fun onFormChange(newForm: ObservationForm) {
        form = newForm
        if (showErrors) errors = validateObservationForm(newForm)
    }

    fun save() {
        if (isSaving || isLoading || notFound) return
        showErrors = true
        errors = validateObservationForm(form)
        if (errors.hasErrors) return

        isSaving = true
        viewModelScope.launch {
            val existing = original
            if (existing == null) {
                repository.addObservation(form.toNewObservation(requireNotNull(caseId)))
            } else {
                repository.updateObservation(form.applyTo(existing))
            }
            isSaved = true
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ParanormalWorldApp
                val savedState = createSavedStateHandle()
                AddObservationViewModel(
                    repository = app.repository,
                    caseId = savedState.get<Long>(Routes.ARG_CASE_ID),
                    observationId = savedState.get<Long>(Routes.ARG_OBSERVATION_ID),
                )
            }
        }
    }
}
