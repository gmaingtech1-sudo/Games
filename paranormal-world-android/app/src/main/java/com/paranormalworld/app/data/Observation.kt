package com.paranormalworld.app.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/** What kind of thing was observed. These describe the observation, never a conclusion. */
enum class ObservationCategory(val label: String) {
    VISUAL("Visual"),
    AUDIO("Audio"),
    TEMPERATURE("Temperature"),
    EMF_READING("EMF reading"),
    PHYSICAL("Physical / touch"),
    SMELL("Smell"),
    OTHER("Other"),
}

/**
 * One observation recorded during an investigation. Each belongs to exactly one
 * [Investigation]; deleting the investigation deletes its observations too (CASCADE).
 */
@Entity(
    tableName = "observations",
    foreignKeys = [
        ForeignKey(
            entity = Investigation::class,
            parentColumns = ["id"],
            childColumns = ["investigationId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("investigationId")],
)
data class Observation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val investigationId: Long,
    val title: String,
    val observedAt: Long, // When it happened, in milliseconds since 1970. Used for the timeline order.
    val category: ObservationCategory,
    val investigatorName: String,
    val notes: String,
    val possibleExplanations: String, // Ordinary causes worth ruling out (draughts, pipes, phones...).
    val createdAt: Long,
)
