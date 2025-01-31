package com.fantasygm.assistant

import android.app.Application
import com.facebook.react.ReactApplication // version: 0.72.4
import com.facebook.react.ReactNativeHost // version: 0.72.4
import com.facebook.react.ReactPackage // version: 0.72.4
import com.facebook.react.defaults.DefaultReactNativeHost // version: 0.72.4
import com.facebook.soloader.SoLoader // version: 0.10.5
import com.google.firebase.FirebaseApp // version: 22.0.0
import com.datadog.android.Datadog // version: 1.15.0
import com.datadog.android.core.configuration.Configuration
import com.datadog.android.core.configuration.Credentials
import com.datadog.android.privacy.TrackingConsent
import com.fantasygm.assistant.modules.analytics.AnalyticsPackage
import com.fantasygm.assistant.modules.auth.FirebaseAuthPackage
import com.fantasygm.assistant.modules.cache.CachePackage
import com.fantasygm.assistant.utils.Logger
import java.util.concurrent.TimeUnit

/**
 * Main application class for Fantasy GM Assistant that initializes React Native runtime,
 * native modules, monitoring systems, and security configurations.
 *
 * Implements comprehensive error handling, performance monitoring, and secure module initialization
 * to meet the 95% sub-2-second response requirement.
 */
class MainApplication : Application(), ReactApplication {

    companion object {
        private const val TAG = "MainApplication"
        private const val MONITORING_SAMPLE_RATE = 100.0f // 100% monitoring in production
        private const val PERFORMANCE_THRESHOLD_MS = 2000L // 2 second performance threshold
    }

    /**
     * React Native host configuration with enhanced security and performance settings
     */
    private val mReactNativeHost = object : DefaultReactNativeHost(this) {
        override fun getUseDeveloperSupport(): Boolean {
            return BuildConfig.DEBUG
        }

        /**
         * Configure native module packages with proper initialization order
         * and comprehensive error handling
         */
        override fun getPackages(): List<ReactPackage> {
            try {
                return listOf(
                    FirebaseAuthPackage(), // Authentication must initialize first
                    AnalyticsPackage(),    // Analytics for monitoring
                    CachePackage()         // Performance optimization
                )
            } catch (e: Exception) {
                Logger.e(TAG, "Failed to initialize packages", e)
                // Return minimum required packages on error
                return listOf(FirebaseAuthPackage())
            }
        }

        override fun getJSMainModuleName(): String {
            return "index"
        }

        /**
         * Configure JSEngine with performance optimizations
         */
        override fun isHermesEnabled(): Boolean {
            return true // Enable Hermes for better performance
        }

        override fun isNewArchEnabled(): Boolean {
            return true // Enable new architecture when available
        }
    }

    override fun getReactNativeHost(): ReactNativeHost {
        return mReactNativeHost
    }

    /**
     * Application initialization with comprehensive setup and error handling
     */
    override fun onCreate() {
        super.onCreate()

        try {
            // Initialize logging first for proper error tracking
            Logger.initialize()
            Logger.d(TAG, "Initializing Fantasy GM Assistant")

            // Initialize SoLoader with error handling
            initializeSoLoader()

            // Set up monitoring and analytics
            initializeDatadog()

            // Initialize Firebase with secure configuration
            initializeFirebase()

            // Initialize native modules
            initializeNativeModules()

            // Configure error boundaries
            setupErrorBoundaries()

            Logger.i(TAG, "Application initialization completed successfully")

        } catch (e: Exception) {
            Logger.e(TAG, "Critical error during application initialization", e)
            // Log to crash reporting but allow app to continue
            Logger.logError(Constants.ErrorCodes.SYSTEM_ERROR, "Application initialization failed", e)
        }
    }

    /**
     * Initialize SoLoader with error handling
     */
    private fun initializeSoLoader() {
        try {
            SoLoader.init(this, false)
        } catch (e: Exception) {
            Logger.e(TAG, "Failed to initialize SoLoader", e)
            throw RuntimeException("SoLoader initialization failed", e)
        }
    }

    /**
     * Initialize Datadog monitoring with performance tracking
     */
    private fun initializeDatadog() {
        try {
            val configuration = Configuration.Builder(
                logsEnabled = true,
                tracesEnabled = true,
                crashReportsEnabled = true
            ).trackInteractions()
             .trackLongTasks(PERFORMANCE_THRESHOLD_MS)
             .trackFrameMetrics()
             .build()

            val credentials = Credentials(
                clientToken = BuildConfig.DATADOG_CLIENT_TOKEN,
                envName = BuildConfig.BUILD_TYPE,
                variant = BuildConfig.FLAVOR,
                rumApplicationId = BuildConfig.DATADOG_RUM_APP_ID
            )

            Datadog.initialize(this, credentials, configuration, TrackingConsent.GRANTED)
            Logger.d(TAG, "Datadog monitoring initialized")

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to initialize Datadog", e)
        }
    }

    /**
     * Initialize Firebase with secure configuration
     */
    private fun initializeFirebase() {
        try {
            FirebaseApp.initializeApp(this)
            Logger.d(TAG, "Firebase initialized")
        } catch (e: Exception) {
            Logger.e(TAG, "Failed to initialize Firebase", e)
            throw RuntimeException("Firebase initialization failed", e)
        }
    }

    /**
     * Initialize native modules with proper sequencing
     */
    private fun initializeNativeModules() {
        try {
            // Initialize modules in correct order
            getReactNativeHost().reactInstanceManager.let { manager ->
                manager.addReactInstanceEventListener { context ->
                    // Modules are initialized when React context is ready
                    Logger.d(TAG, "React context ready, initializing native modules")
                }
            }
        } catch (e: Exception) {
            Logger.e(TAG, "Failed to initialize native modules", e)
        }
    }

    /**
     * Configure error boundaries and crash reporting
     */
    private fun setupErrorBoundaries() {
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Logger.e(TAG, "Uncaught exception on thread ${thread.name}", throwable)
            Logger.logError(
                Constants.ErrorCodes.SYSTEM_ERROR,
                "Uncaught exception in ${thread.name}",
                throwable
            )
        }
    }
}