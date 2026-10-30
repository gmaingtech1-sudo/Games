import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Signing: by default both debug and release builds use the committed
// "sideload" key, so an APK you build installs over the one in dist/.
// For your own private key (recommended before sharing the app), create
// android/keystore.properties - see docs/ANDROID.md.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "app.jarvisai.assistant"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.jarvisai.assistant"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        create("sideload") {
            storeFile = rootProject.file("jarvis-sideload.keystore")
            storePassword = "jarvis-sideload"
            keyAlias = "jarvis"
            keyPassword = "jarvis-sideload"
        }
        if (keystoreProps.isNotEmpty()) {
            create("private") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("sideload")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("private") ?: signingConfigs.getByName("sideload")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
        unitTests.isIncludeAndroidResources = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

// The interface is the shared web UI in ../shared/ui (one copy for Android,
// Windows and the browser). It is copied into the APK's assets at build time.
abstract class CopyWebUi : DefaultTask() {
    @get:InputDirectory
    abstract val source: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val out = outputDir.get().asFile
        out.deleteRecursively()
        source.get().asFile.copyRecursively(File(out, "ui"), overwrite = true)
    }
}

val copyWebUi = tasks.register<CopyWebUi>("copyWebUi") {
    source.set(rootProject.layout.projectDirectory.dir("../shared/ui"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(copyWebUi, CopyWebUi::outputDir)
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16.1")
    testImplementation("org.json:json:20250517")
}
