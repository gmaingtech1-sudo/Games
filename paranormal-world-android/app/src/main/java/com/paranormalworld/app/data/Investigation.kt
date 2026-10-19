package com.paranormalworld.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.time.LocalDate

/** Where a case stands. Room stores the name, e.g. "OPEN". */
enum class CaseStatus(val label: String) {
    OPEN("Open"),
    UNDER_REVIEW("Under review"),
    CLOSED("Closed"),
}

/** One investigation (a "case"). Each instance is one row in the `investigations` table. */
@Entity(tableName = "investigations")
data class Investigation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0, // 0 means "not saved yet"; Room picks the real id.
    val title: String,
    val locationName: String,
    val date: LocalDate, // The day the investigation took place.
    val description: String,
    val leadInvestigator: String,
    val status: CaseStatus = CaseStatus.OPEN,
    val createdAt: Long, // Milliseconds since 1970 (System.currentTimeMillis()).
    val updatedAt: Long,
)
