package com.paranormalworld.app.ui.timeline

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
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** All the observations made on one day, oldest first. */
data class TimelineDay(val date: LocalDate, val observations: List<Observation>)

/**
 * Splits observations into days, keeping their order. They must already be sorted
 * oldest first, which the database query does.
 */
fun groupByDay(observations: List<Observation>, zone: ZoneId = ZoneId.systemDefault()): List<TimelineDay> =
    observations
        .groupBy { Instant.ofEpochMilli(it.observedAt).atZone(zone).toLocalDate() } // groupBy keeps first-seen order.
        .map { (date, dayObservations) -> TimelineDay(date, dayObservations) }

sealed interface TimelineUiState {
    data object Loading : TimelineUiState
    data object NotFound : TimelineUiState
    data class Loaded(val caseTitle: String, val days: List<TimelineDay>) : TimelineUiState {
        val isEmpty: Boolean get() = days.isEmpty()
    }
}

class CaseTimelineViewModel(private val repository: CaseRepository, val caseId: Long) : ViewModel() {

    val uiState: StateFlow<TimelineUiState> = combine(
        repository.observeInvestigation(caseId),
        repository.observeObservations(caseId),
    ) { investigation, observations ->
        if (investigation == null) {
            TimelineUiState.NotFound
        } else {
            TimelineUiState.Loaded(investigation.title, groupByDay(observations))
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = TimelineUiState.Loading,
    )

    /** Permanently deletes [observation]. The screen asks the user to confirm before calling this. */
    fun deleteObservation(observation: Observation) {
        viewModelScope.launch { repository.deleteObservation(observation) }
    }

    companion object {
        val Factory: ViewModelProvider.Factory = viewModelFactory {
            initializer {
                val app = this[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as ParanormalWorldApp
                val caseId = requireNotNull(createSavedStateHandle().get<Long>(Routes.ARG_CASE_ID)) {
                    "The timeline route must include a case id"
                }
                CaseTimelineViewModel(app.repository, caseId)
            }
        }
    }
}
