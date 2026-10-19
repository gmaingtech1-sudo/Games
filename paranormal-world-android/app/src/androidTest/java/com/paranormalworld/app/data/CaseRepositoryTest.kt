package com.paranormalworld.app.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.time.LocalDate

/**
 * Checks the real Room database code. Each test uses a fresh in-memory database,
 * so it never touches the app's saved cases.
 */
@RunWith(AndroidJUnit4::class)
class CaseRepositoryTest {

    private lateinit var database: AppDatabase
    private lateinit var repository: CaseRepository
    private var now = 1_000L // A fake clock the tests can move forward.

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            AppDatabase::class.java,
        ).build()
        repository = CaseRepository(database.investigationDao(), database.observationDao(), clock = { now })
    }

    @After
    fun tearDown() {
        database.close()
    }

    private fun newCase(title: String = "Old Mill cellar") = Investigation(
        title = title,
        locationName = "Riverside Lane",
        date = LocalDate.of(2026, 10, 19),
        description = "",
        leadInvestigator = "Sam Carter",
        createdAt = 0,
        updatedAt = 0,
    )

    private fun newObservation(caseId: Long, title: String, observedAt: Long) = Observation(
        investigationId = caseId,
        title = title,
        observedAt = observedAt,
        category = ObservationCategory.AUDIO,
        investigatorName = "Sam Carter",
        notes = "Notes",
        possibleExplanations = "",
        createdAt = 0,
    )

    @Test
    fun createdCaseIsSavedWithTimestamps() = runBlocking {
        val id = repository.createInvestigation(newCase())
        val saved = repository.getInvestigation(id)!!
        assertEquals("Old Mill cellar", saved.title)
        assertEquals(LocalDate.of(2026, 10, 19), saved.date) // Checks the LocalDate converter.
        assertEquals(1_000L, saved.createdAt)
        assertEquals(1_000L, saved.updatedAt)
    }

    @Test
    fun editingCaseKeepsCreatedAtAndUpdatesUpdatedAt() = runBlocking {
        val id = repository.createInvestigation(newCase())
        now = 2_000L
        repository.updateInvestigation(repository.getInvestigation(id)!!.copy(status = CaseStatus.CLOSED))
        val saved = repository.getInvestigation(id)!!
        assertEquals(CaseStatus.CLOSED, saved.status)
        assertEquals(1_000L, saved.createdAt)
        assertEquals(2_000L, saved.updatedAt)
    }

    @Test
    fun homeListShowsMostRecentlyUpdatedFirst() = runBlocking {
        repository.createInvestigation(newCase("First"))
        now = 2_000L
        repository.createInvestigation(newCase("Second"))
        assertEquals(listOf("Second", "First"), repository.observeInvestigations().first().map { it.title })
    }

    @Test
    fun observationsComeBackInChronologicalOrder() = runBlocking {
        val caseId = repository.createInvestigation(newCase())
        // Added out of order on purpose.
        repository.addObservation(newObservation(caseId, "Late", observedAt = 30_000))
        repository.addObservation(newObservation(caseId, "Early", observedAt = 10_000))
        repository.addObservation(newObservation(caseId, "Middle", observedAt = 20_000))
        val titles = repository.observeObservations(caseId).first().map { it.title }
        assertEquals(listOf("Early", "Middle", "Late"), titles)
    }

    @Test
    fun addingAnObservationMarksTheCaseUpdated() = runBlocking {
        val caseId = repository.createInvestigation(newCase())
        now = 5_000L
        repository.addObservation(newObservation(caseId, "Knock", observedAt = 1))
        assertEquals(5_000L, repository.getInvestigation(caseId)!!.updatedAt)
    }

    @Test
    fun deletingAnObservationRemovesOnlyThatOne() = runBlocking {
        val caseId = repository.createInvestigation(newCase())
        val keepId = repository.addObservation(newObservation(caseId, "Keep", observedAt = 1))
        val deleteId = repository.addObservation(newObservation(caseId, "Delete", observedAt = 2))
        repository.deleteObservation(repository.getObservation(deleteId)!!)
        assertNull(repository.getObservation(deleteId))
        assertEquals(listOf(keepId), repository.observeObservations(caseId).first().map { it.id })
    }

    @Test
    fun observationsBelongToTheirOwnCase() = runBlocking {
        val caseA = repository.createInvestigation(newCase("A"))
        val caseB = repository.createInvestigation(newCase("B"))
        repository.addObservation(newObservation(caseA, "In A", observedAt = 1))
        assertTrue(repository.observeObservations(caseB).first().isEmpty())
    }

    @Test
    fun deletingACaseDeletesItsObservations() = runBlocking {
        val caseId = repository.createInvestigation(newCase())
        val observationId = repository.addObservation(newObservation(caseId, "Knock", observedAt = 1))
        // The app has no "delete case" button yet, so delete the row directly to check the CASCADE rule.
        database.openHelper.writableDatabase.execSQL("DELETE FROM investigations WHERE id = ?", arrayOf<Any>(caseId))
        assertNull(repository.getObservation(observationId))
    }

    @Test
    fun demoDataIsClearlyMarked() = runBlocking {
        val caseId = repository.addDemoCase()
        val case = repository.getInvestigation(caseId)!!
        assertTrue(case.title.startsWith(CaseRepository.DEMO_PREFIX))
        val observations = repository.observeObservations(caseId).first()
        assertEquals(2, observations.size)
        assertTrue(observations.all { it.title.startsWith(CaseRepository.DEMO_PREFIX) })
    }
}
