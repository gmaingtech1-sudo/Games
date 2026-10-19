package com.paranormalworld.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.lifecycle.Lifecycle
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavController
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.paranormalworld.app.ui.createcase.CreateCaseRoute
import com.paranormalworld.app.ui.home.HomeRoute

/** Every screen's address. A route with {caseId} carries the case's id along with it. */
object Routes {
    const val ARG_CASE_ID = "caseId"

    const val HOME = "home"
    const val NEW_CASE = "cases/new"
    const val EDIT_CASE = "cases/{$ARG_CASE_ID}/edit"

    fun editCase(caseId: Long) = "cases/$caseId/edit"
}

/** Decides which screen is showing, and moves between them. */
@Composable
fun AppNavigation(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeRoute(
                onCreateCaseClick = { navController.navigate(Routes.NEW_CASE) { launchSingleTop = true } },
                // Stage 3: tapping a case opens it for editing. Stage 4 opens its details instead.
                onCaseClick = { navController.navigate(Routes.editCase(it.id)) { launchSingleTop = true } },
            )
        }
        composable(Routes.NEW_CASE) { entry ->
            CreateCaseRoute(
                onBack = { navController.popIfCurrent(entry) },
                onSaved = { navController.popIfCurrent(entry) },
            )
        }
        composable(
            Routes.EDIT_CASE,
            arguments = listOf(navArgument(Routes.ARG_CASE_ID) { type = NavType.LongType }),
        ) { entry ->
            CreateCaseRoute(
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
