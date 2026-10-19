package com.paranormalworld.app.ui.createcase

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.paranormalworld.app.ParanormalWorldApp
import com.paranormalworld.app.data.CaseRepository
import com.paranormalworld.app.data.Investigation
import com.paranormalworld.app.ui.navigation.Routes
import kotlinx.coroutines.launch

/**
 * Runs the Create/Edit Case form. With no [caseId] it creates a new case;
 * with one, it loads that case and saves changes to it.
 */
class CreateCaseViewModel(
    private val repository: CaseRepository,
    private val caseId: Long?,
) : ViewModel() {

    val isEditing: Boolean = caseId != null

    var form by mutableStateOf(CaseForm())
        private set
    var errors by mutableStateOf(CaseFormErrors())
        private set
    var isLoading by mutableStateOf(isEditing)
        private set
    var caseNotFound by mutableStateOf(false)
        private set

    /** Set once the case is saved; the screen then closes. */
    var savedCaseId by mutableStateOf<Long?>(null)
        private set

    private var original: Investigation? = null

    /** The form as it was when the screen opened, to tell whether anything has changed. */
    private var initialForm = form

    /** True when the user has typed or picked something that isn't saved yet. */
    val hasUnsavedChanges: Boolean
        get() = !isLoading && savedCaseId == null && form != initialForm
    private var isSaving = false
    private var showErrors = false // Only nag about empty fields after the first Save tap.

    init {
        if (caseId != null) {
            viewModelScope.launch {
                val investigation = repository.getInvestigation(caseId)
                if (investigation == null) {
                    caseNotFound = true
                } else {
                    original = investigation
                    form = CaseForm.from(investigation)
                    initialForm = form
                }
                isLoading = false
            }
        }
    }

    fun onFormChange(newForm: CaseForm) {
        form = newForm
        if (showErrors) errors = validateCaseForm(newForm)
    }

    fun save() {
        if (isSaving || isLoading) return
        showErrors = true
        errors = validateCaseForm(form)
        if (errors.hasErrors) return

        isSaving = true
        viewModelScope.launch {
            val existing = original
            savedCaseId = if (existing == null) {
                repository.createInvestigation(form.toNewInvestigation())
            } else {
                repository.updateInvestigation(form.applyTo(existing))
                existing.id
            }
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ParanormalWorldApp
                // The navigation route puts the case id here when editing.
                val savedState: SavedStateHandle = createSavedStateHandle()
                CreateCaseViewModel(app.repository, savedState.get<Long>(Routes.ARG_CASE_ID))
            }
        }
    }
}
