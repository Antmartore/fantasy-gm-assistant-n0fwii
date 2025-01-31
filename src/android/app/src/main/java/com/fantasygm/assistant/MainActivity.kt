package com.fantasygm.assistant

import android.os.Bundle
import android.content.Intent
import android.app.Application.ActivityLifecycleCallbacks
import com.facebook.react.ReactActivity // version: 0.72.4
import com.facebook.react.ReactActivityDelegate // version: 0.72.4
import com.facebook.react.defaults.DefaultReactActivityDelegate // version: 0.72.4
import com.facebook.react.modules.core.PermissionListener // version: 0.72.4
import com.datadog.android.Datadog // version: 1.19.0
import com.datadog.android.rum.RumMonitor
import com.datadog.android.rum.RumActionType
import com.fantasygm.assistant.utils.Logger
import com.fantasygm.assistant.utils.Constants.ErrorCodes
import java.util.concurrent.TimeUnit

/**
 * Main activity for the Fantasy GM Assistant React Native application.
 * Implements comprehensive performance monitoring, secure deep linking,
 * and enhanced error handling to meet the 95% sub-2-second response requirement.
 */
class MainActivity : ReactActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val COMPONENT_NAME = "FantasyGMAssistant"
        private const val PERFORMANCE_THRESHOLD_MS = 2000L // 2 second threshold
    }

    private var permissionListener: PermissionListener? = null
    private lateinit var rumMonitor: RumMonitor
    private var activityStartTime: Long = 0

    /**
     * Initialize activity with monitoring and security configurations
     */
    init {
        try {
            rumMonitor = RumMonitor.Builder()
                .setSessionSampleRate(100.0f)
                .setTrackFrustrations(true)
                .setTrackUserActions(true)
                .build()
        } catch (e: Exception) {
            Logger.e(TAG, "Failed to initialize RUM monitor", e)
        }
    }

    /**
     * Returns the name of the main component registered from JavaScript
     */
    override fun getMainComponentName(): String = COMPONENT_NAME

    /**
     * Creates and configures the ReactActivityDelegate with performance optimizations
     */
    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return object : DefaultReactActivityDelegate(
            this,
            mainComponentName,
            (application as MainApplication).reactNativeHost
        ) {
            override fun getLaunchOptions(): Bundle? {
                return Bundle().apply {
                    // Configure launch options for optimal performance
                    putBoolean("enableHermes", true)
                    putBoolean("enableFabric", true)
                    putBoolean("enableNewArchitecture", true)
                }
            }

            override fun onPermissionResult(
                requestCode: Int,
                permissions: Array<String>,
                grantResults: IntArray
            ) {
                super.onPermissionResult(requestCode, permissions, grantResults)
                permissionListener?.onRequestPermissionsResult(
                    requestCode, permissions, grantResults
                )
            }
        }
    }

    /**
     * Activity lifecycle method for initialization with enhanced monitoring
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        try {
            activityStartTime = System.currentTimeMillis()
            
            // Initialize performance monitoring
            initializePerformanceMonitoring()

            super.onCreate(savedInstanceState)

            // Track activity creation performance
            val startupTime = System.currentTimeMillis() - activityStartTime
            Logger.logMetric("activity_startup_time", startupTime.toDouble())

            if (startupTime > PERFORMANCE_THRESHOLD_MS) {
                Logger.w(TAG, "Slow activity startup: ${startupTime}ms")
            }

            // Handle deep linking
            handleDeepLink(intent)

            // Configure activity lifecycle monitoring
            setupLifecycleCallbacks()

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to create activity", e)
            Logger.logError(ErrorCodes.SYSTEM_ERROR, "Activity creation failed", e)
        }
    }

    /**
     * Handle new intents for deep linking
     */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    /**
     * Initialize performance monitoring systems
     */
    private fun initializePerformanceMonitoring() {
        try {
            // Configure RUM monitoring
            rumMonitor.startView(
                "MainActivity",
                mapOf(
                    "startup_timestamp" to activityStartTime,
                    "device_info" to getDeviceInfo()
                )
            )

            // Track view loading performance
            rumMonitor.addAction(
                RumActionType.CUSTOM,
                "activity_load",
                mapOf("timestamp" to System.currentTimeMillis())
            )

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to initialize performance monitoring", e)
        }
    }

    /**
     * Setup activity lifecycle monitoring
     */
    private fun setupLifecycleCallbacks() {
        application.registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: android.app.Activity, bundle: Bundle?) {
                if (activity is MainActivity) {
                    Logger.d(TAG, "Activity created")
                }
            }

            override fun onActivityStarted(activity: android.app.Activity) {
                if (activity is MainActivity) {
                    rumMonitor.startView(
                        "MainActivity",
                        mapOf("state" to "started")
                    )
                }
            }

            override fun onActivityResumed(activity: android.app.Activity) {
                if (activity is MainActivity) {
                    rumMonitor.addAction(
                        RumActionType.CUSTOM,
                        "activity_resumed",
                        mapOf("timestamp" to System.currentTimeMillis())
                    )
                }
            }

            override fun onActivityPaused(activity: android.app.Activity) {
                if (activity is MainActivity) {
                    rumMonitor.stopView("MainActivity")
                }
            }

            override fun onActivityStopped(activity: android.app.Activity) {}
            override fun onActivitySaveInstanceState(activity: android.app.Activity, bundle: Bundle) {}
            override fun onActivityDestroyed(activity: android.app.Activity) {}
        })
    }

    /**
     * Handle deep linking with security validation
     */
    private fun handleDeepLink(intent: Intent?) {
        try {
            intent?.data?.let { uri ->
                // Validate deep link
                if (isValidDeepLink(uri.toString())) {
                    Logger.d(TAG, "Processing deep link: ${uri}")
                    rumMonitor.addAction(
                        RumActionType.CUSTOM,
                        "deep_link_received",
                        mapOf(
                            "url" to uri.toString(),
                            "timestamp" to System.currentTimeMillis()
                        )
                    )
                } else {
                    Logger.w(TAG, "Invalid deep link received: ${uri}")
                }
            }
        } catch (e: Exception) {
            Logger.e(TAG, "Deep link handling failed", e)
        }
    }

    /**
     * Validate deep link security
     */
    private fun isValidDeepLink(url: String): Boolean {
        // Implement deep link validation logic
        return url.startsWith("fantasygm://") &&
               !url.contains("../") && // Prevent path traversal
               !url.contains("javascript:") // Prevent XSS
    }

    /**
     * Get device information for monitoring
     */
    private fun getDeviceInfo(): Map<String, String> {
        return mapOf(
            "os_version" to android.os.Build.VERSION.RELEASE,
            "device_model" to android.os.Build.MODEL,
            "manufacturer" to android.os.Build.MANUFACTURER
        )
    }
}