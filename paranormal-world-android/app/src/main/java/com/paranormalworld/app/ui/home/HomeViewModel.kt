package com.paranormalworld.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.paranormalworld.app.ParanormalWorldApp
import com.paranormalworld.app.data.CaseRepository
import com.paranormalworld.app.data.Investigation
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** What the Home screen shows: still loading, or the list of saved cases (maybe empty). */
sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Loaded(val cases: List<Investigation>) : HomeUiState
}

/**
 * Holds the Home screen's data. A ViewModel survives screen rotation, so the list
 * isn't reloaded every time the phone turns.
 */
class HomeViewModel(private val repository: CaseRepository) : ViewModel() {

    val uiState: StateFlow<HomeUiState> = repository.observeInvestigations()
        .map { HomeUiState.Loaded(it) }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = HomeUiState.Loading,
        )

    fun addDemoCase() {
        viewModelScope.launch { repository.addDemoCase() }
    }

    companion object {
        /** Tells Compose how to build a HomeViewModel with the app's repository. */
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ParanormalWorldApp
                HomeViewModel(app.repository)
            }
        }
    }
}
