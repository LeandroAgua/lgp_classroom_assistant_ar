plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "pt.isec.contexto"
    compileSdk = 34

    defaultConfig {
        applicationId = "pt.isec.contexto"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        // Vazio => carrega os ficheiros embutidos em app/src/main/assets/web.
        // Preenchido => carrega o site publicado (GitHub Pages, por exemplo).
        buildConfigField("String", "REMOTE_URL", "\"\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug { isMinifyEnabled = false }
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.1")
    implementation("androidx.webkit:webkit:1.11.0")
}

/*
 * Copia web/ para os assets antes de compilar, para não haver duas cópias no
 * repositório a divergirem uma da outra.
 */
val copiarWeb by tasks.registering(Copy::class) {
    from(rootProject.file("../web"))
    into(layout.projectDirectory.dir("src/main/assets/web"))
}
tasks.named("preBuild") { dependsOn(copiarWeb) }
