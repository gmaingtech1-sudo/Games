// app/build.gradle.kts — settings and libraries for the app itself.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp) // Generates Room's database code at build time.
}

android {
    namespace = "com.paranormalworld.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.paranormalworld.app"
        minSdk = 26 // Android 8.0 and newer
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        // Runs the tests in app/src/androidTest on a phone or emulator.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // Every release APK is signed with the same key (signing.keystore), so a newer APK installs
    // over an older one and keeps the saved cases. Android refuses updates signed with a different key.
    signingConfigs {
        create("release") {
            storeFile = rootProject.file("signing.keystore")
            storePassword = "paranormalworld"
            keyAlias = "paranormalworld"
            keyPassword = "paranormalworld"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(libs.androidx.navigation.compose)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.core)

    // Unit tests that run on your computer (app/src/test), no phone needed.
    testImplementation(libs.junit)

    // Tests that run on a phone or emulator (app/src/androidTest).
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.ui.test.junit4)
    debugImplementation(libs.androidx.ui.test.manifest)

    // Only used by Android Studio's preview pane, never shipped in the release app.
    debugImplementation(libs.androidx.ui.tooling)
}
