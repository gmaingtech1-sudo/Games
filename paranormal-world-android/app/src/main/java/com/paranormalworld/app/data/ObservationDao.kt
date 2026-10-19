package com.paranormalworld.app.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/** The SQL for the `observations` table. */
@Dao
interface ObservationDao {
    /** One case's observations in chronological order (oldest first). */
    @Query("SELECT * FROM observations WHERE investigationId = :investigationId ORDER BY observedAt ASC, id ASC")
    fun observeForInvestigation(investigationId: Long): Flow<List<Observation>>

    @Query("SELECT * FROM observations WHERE id = :id")
    suspend fun getById(id: Long): Observation?

    @Insert
    suspend fun insert(observation: Observation): Long

    @Update
    suspend fun update(observation: Observation)

    @Delete
    suspend fun delete(observation: Observation)
}
