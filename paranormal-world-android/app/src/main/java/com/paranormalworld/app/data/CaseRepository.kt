package com.paranormalworld.app.data

import kotlinx.coroutines.flow.Flow
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

/**
 * The one place screens go to read and save data. It fills in the timestamps,
 * so the screens never have to remember to.
 */
class CaseRepository(
    private val investigationDao: InvestigationDao,
    private val observationDao: ObservationDao,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun observeInvestigations(): Flow<List<Investigation>> = investigationDao.observeAll()

    fun observeInvestigation(id: Long): Flow<Investigation?> = investigationDao.observeById(id)

    suspend fun getInvestigation(id: Long): Investigation? = investigationDao.getById(id)

    /** Saves a new case. Returns the id Room gave it. */
    suspend fun createInvestigation(investigation: Investigation): Long {
        val now = clock()
        return investigationDao.insert(investigation.copy(id = 0, createdAt = now, updatedAt = now))
    }

    suspend fun updateInvestigation(investigation: Investigation) {
        investigationDao.update(investigation.copy(updatedAt = clock()))
    }

    /** Permanently deletes a case and all of its observations. */
    suspend fun deleteInvestigation(investigation: Investigation) {
        investigationDao.delete(investigation)
    }

    fun observeObservations(investigationId: Long): Flow<List<Observation>> =
        observationDao.observeForInvestigation(investigationId)

    suspend fun getObservation(id: Long): Observation? = observationDao.getById(id)

    /** Saves a new observation, and marks its case as just updated. */
    suspend fun addObservation(observation: Observation): Long {
        val id = observationDao.insert(observation.copy(id = 0, createdAt = clock()))
        touchInvestigation(observation.investigationId)
        return id
    }

    suspend fun updateObservation(observation: Observation) {
        observationDao.update(observation)
        touchInvestigation(observation.investigationId)
    }

    suspend fun deleteObservation(observation: Observation) {
        observationDao.delete(observation)
        touchInvestigation(observation.investigationId)
    }

    /**
     * Adds one sample case with two observations, all clearly labelled as demo data,
     * so you can see how the app looks without typing a real case.
     */
    suspend fun addDemoCase(): Long {
        val today = LocalDate.now()
        val caseId = createInvestigation(
            Investigation(
                title = "$DEMO_PREFIX Old Mill Cellar",
                locationName = "Example Old Mill (fictional)",
                date = today,
                description = "Demo data, not a real case. Shows how a case and its observations look. " +
                    "You can edit it like any other case.",
                leadInvestigator = "Demo Investigator",
                status = CaseStatus.OPEN,
                createdAt = 0,
                updatedAt = 0,
            ),
        )
        val zone = ZoneId.systemDefault()
        fun at(hour: Int, minute: Int) =
            LocalDateTime.of(today, LocalTime.of(hour, minute)).atZone(zone).toInstant().toEpochMilli()
        addObservation(
            Observation(
                investigationId = caseId,
                title = "$DEMO_PREFIX Temperature drop near stairs",
                observedAt = at(21, 15),
                category = ObservationCategory.TEMPERATURE,
                investigatorName = "Demo Investigator",
                notes = "Thermometer read 17.5 °C, then 14.0 °C about one minute later, at the foot of the cellar stairs.",
                possibleExplanations = "Draught from the outside door; cold stone floor; thermometer settling after being moved.",
                createdAt = 0,
            ),
        )
        addObservation(
            Observation(
                investigationId = caseId,
                title = "$DEMO_PREFIX Knocking sound",
                observedAt = at(21, 40),
                category = ObservationCategory.AUDIO,
                investigatorName = "Demo Investigator",
                notes = "Three knocks heard from the north wall. Audio recorder running; clip saved as file 0042.",
                possibleExplanations = "Water pipes cooling; building settling; someone outside.",
                createdAt = 0,
            ),
        )
        return caseId
    }

    private suspend fun touchInvestigation(id: Long) {
        investigationDao.getById(id)?.let { updateInvestigation(it) }
    }

    companion object {
        const val DEMO_PREFIX = "[DEMO]"
    }
}
