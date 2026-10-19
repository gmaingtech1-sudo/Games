package com.paranormalworld.app.ui.timeline

import com.paranormalworld.app.data.Observation
import com.paranormalworld.app.data.ObservationCategory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset

class GroupByDayTest {

    private fun observation(id: Long, at: LocalDateTime) = Observation(
        id = id,
        investigationId = 1,
        title = "Observation $id",
        observedAt = at.toInstant(ZoneOffset.UTC).toEpochMilli(),
        category = ObservationCategory.OTHER,
        investigatorName = "Sam",
        notes = "Notes",
        possibleExplanations = "",
        createdAt = 0,
    )

    @Test
    fun emptyListGivesNoDays() {
        assertTrue(groupByDay(emptyList(), ZoneOffset.UTC).isEmpty())
    }

    @Test
    fun observationsAreSplitByDayKeepingOrder() {
        val observations = listOf(
            observation(1, LocalDateTime.of(2026, 10, 18, 23, 50)),
            observation(2, LocalDateTime.of(2026, 10, 19, 0, 10)),
            observation(3, LocalDateTime.of(2026, 10, 19, 2, 30)),
        )
        val days = groupByDay(observations, ZoneOffset.UTC)

        assertEquals(listOf(LocalDate.of(2026, 10, 18), LocalDate.of(2026, 10, 19)), days.map { it.date })
        assertEquals(listOf(1L), days[0].observations.map { it.id })
        assertEquals(listOf(2L, 3L), days[1].observations.map { it.id })
    }
}
