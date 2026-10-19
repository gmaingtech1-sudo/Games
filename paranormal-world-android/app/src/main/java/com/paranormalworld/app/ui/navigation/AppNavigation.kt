package com.paranormalworld.app.ui.navigation

import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavController
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.paranormalworld.app.ui.addobservation.AddObservationRoute
import com.paranormalworld.app.ui.casedetail.CaseDetailRoute
import com.paranormalworld.app.ui.createcase.CreateCaseRoute
import com.paranormalworld.app.ui.home.HomeRoute

/** Every screen's address. A route with {caseId} carries the case's id along with it. */
object Routes {
    const val ARG_CASE_ID = "caseId"
    const val ARG_OBSERVATION_ID = "observationId"

    const val HOME = "home"
    const val NEW_CASE = "cases/new"
    const val CASE_DETAIL = "cases/{$ARG_CASE_ID}"
    const val EDIT_CASE = "cases/{$ARG_CASE_ID}/edit"
    const val ADD_OBSERVATION = "cases/{$ARG_CASE_ID}/observations/new"
    const val EDIT_OBSERVATION = "observations/{$ARG_OBSERVATION_ID}/edit"

    fun caseDetail(caseId: Long) = "cases/$caseId"
    fun editCase(caseId: Long) = "cases/$caseId/edit"
    fun addObservation(caseId: Long) = "cases/$caseId/observations/new"
    fun editObservation(observationId: Long) = "observations/$observationId/edit"
}

private val caseIdArgument = listOf(navArgument(Routes.ARG_CASE_ID) { type = NavType.LongType })

/** Decides which screen is showing, and moves between them. */
@Composable
fun AppNavigation(navController: NavHostController = rememberNavController()) {
    val context = LocalContext.current
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeRoute(
                onCreateCaseClick = { navController.navigate(Routes.NEW_CASE) { launchSingleTop = true } },
                onCaseClick = { navController.navigate(Routes.caseDetail(it.id)) { launchSingleTop = true } },
            )
        }
        composable(Routes.NEW_CASE) { entry ->
            CreateCaseRoute(
                onBack = { navController.popIfCurrent(entry) },
                // Open the new case, and take "New case" off the back stack so Back goes Home.
                onSaved = { caseId ->
                    navController.navigate(Routes.caseDetail(caseId)) {
                        popUpTo(Routes.NEW_CASE) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.CASE_DETAIL, arguments = caseIdArgument) { entry ->
            CaseDetailRoute(
                onBack = { navController.popIfCurrent(entry) },
                onEditClick = { navController.navigate(Routes.editCase(it)) { launchSingleTop = true } },
                onAddObservationClick = {
                    navController.navigate(Routes.addObservation(it)) { launchSingleTop = true }
                },
                // Placeholder until Stage 6 adds the timeline.
                onTimelineClick = {
                    Toast.makeText(context, "The timeline arrives in Stage 6", Toast.LENGTH_SHORT).show()
                },
            )
        }
        composable(Routes.EDIT_CASE, arguments = caseIdArgument) { entry ->
            CreateCaseRoute(
                onBack = { navController.popIfCurrent(entry) },
                onSaved = { navController.popIfCurrent(entry) },
            )
        }
        composable(Routes.ADD_OBSERVATION, arguments = caseIdArgument) { entry ->
            AddObservationRoute(
                onBack = { navController.popIfCurrent(entry) },
                onSaved = { navController.popIfCurrent(entry) },
            )
        }
        // Reached from the timeline in Stage 6.
        composable(
            Routes.EDIT_OBSERVATION,
            arguments = listOf(navArgument(Routes.ARG_OBSERVATION_ID) { type = NavType.LongType }),
        ) { entry ->
            AddObservationRoute(
                onBack = { navController.popIfCurrent(entry) },
                onSaved = { navController.popIfCurrent(entry) },
            )
        }
    }
}

/**
 * Goes back one screen, but only if [entry] is still the screen on top. This stops a quick
 * double tap on "back" from closing two screens and leaving a blank page.
 */
private fun NavController.popIfCurrent(entry: NavBackStackEntry) {
    if (entry.lifecycle.currentState == Lifecycle.State.RESUMED) popBackStack()
}
