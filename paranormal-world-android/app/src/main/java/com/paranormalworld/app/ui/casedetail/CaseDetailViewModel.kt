package com.paranormalworld.app.ui.casedetail

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
import com.paranormalworld.app.data.Investigation
import com.paranormalworld.app.ui.navigation.Routes
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface CaseDetailUiState {
    data object Loading : CaseDetailUiState
    data object NotFound : CaseDetailUiState
    data class Loaded(val investigation: Investigation, val observationCount: Int) : CaseDetailUiState
}

/**
 * Watches one case and its observations. Because both are Flows, the screen updates
 * by itself after the case is edited or an observation is added.
 */
class CaseDetailViewModel(private val repository: CaseRepository, val caseId: Long) : ViewModel() {

    /** Becomes true once the case has been deleted; the screen then goes back to Home. */
    var isDeleted by mutableStateOf(false)
        private set

    val uiState: StateFlow<CaseDetailUiState> = combine(
        repository.observeInvestigation(caseId),
        repository.observeObservations(caseId),
    ) { investigation, observations ->
        if (investigation == null) {
            CaseDetailUiState.NotFound
        } else {
            CaseDetailUiState.Loaded(investigation, observations.size)
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CaseDetailUiState.Loading,
    )

    /** Permanently deletes this case and its observations. The screen asks the user to confirm first. */
    fun deleteCase() {
        val state = uiState.value as? CaseDetailUiState.Loaded ?: return
        viewModelScope.launch {
            repository.deleteInvestigation(state.investigation)
            isDeleted = true
        }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ParanormalWorldApp
                val caseId = requireNotNull(createSavedStateHandle().get<Long>(Routes.ARG_CASE_ID)) {
                    "The case detail route must include a case id"
                }
                CaseDetailViewModel(app.repository, caseId)
            }
        }
    }
}
