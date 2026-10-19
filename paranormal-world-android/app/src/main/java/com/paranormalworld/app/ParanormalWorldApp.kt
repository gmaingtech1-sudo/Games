package com.paranormalworld.app

import android.app.Application
import com.paranormalworld.app.data.AppDatabase
import com.paranormalworld.app.data.CaseRepository

/**
 * Created once when the app starts, before any screen. It owns the single
 * database and repository that every screen shares.
 */
class ParanormalWorldApp : Application() {
    val repository: CaseRepository by lazy {
        val database = AppDatabase.create(this)
        CaseRepository(database.investigationDao(), database.observationDao())
    }
}
