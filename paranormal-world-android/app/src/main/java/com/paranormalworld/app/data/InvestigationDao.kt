package com.paranormalworld.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/** The SQL for the `investigations` table. Room writes the actual code at build time. */
@Dao
interface InvestigationDao {
    /** Every case, most recently changed first. The Flow sends a new list whenever the table changes. */
    @Query("SELECT * FROM investigations ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<Investigation>>

    @Query("SELECT * FROM investigations WHERE id = :id")
    fun observeById(id: Long): Flow<Investigation?>

    @Query("SELECT * FROM investigations WHERE id = :id")
    suspend fun getById(id: Long): Investigation?

    /** Saves a new case and returns its id. */
    @Insert
    suspend fun insert(investigation: Investigation): Long

    @Update
    suspend fun update(investigation: Investigation)
}
