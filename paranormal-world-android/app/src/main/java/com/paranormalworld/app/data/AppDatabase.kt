package com.paranormalworld.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

/**
 * The app's database file ("paranormal_world.db"), stored privately on the phone.
 * If you ever change an entity's fields, increase [version] and add a migration,
 * or existing installs will crash on start.
 */
@Database(
    entities = [Investigation::class, Observation::class],
    version = 1,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun investigationDao(): InvestigationDao
    abstract fun observationDao(): ObservationDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "paranormal_world.db").build()
    }
}
