package com.paranormalworld.app.data

import androidx.room.TypeConverter
import java.time.LocalDate

/** Room can't store a LocalDate directly, so we save it as a day number and convert it back. */
class Converters {
    @TypeConverter
    fun localDateToEpochDay(date: LocalDate): Long = date.toEpochDay()

    @TypeConverter
    fun epochDayToLocalDate(epochDay: Long): LocalDate = LocalDate.ofEpochDay(epochDay)
}
