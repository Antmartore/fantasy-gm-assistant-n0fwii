package com.fantasygm.assistant.modules.analytics

import com.facebook.react.bridge.ReactContextBaseJavaModule // version: 0.72.4
import com.facebook.react.bridge.ReactMethod // version: 0.72.4
import com.facebook.react.bridge.ReactApplicationContext // version: 0.72.4
import com.facebook.react.bridge.ReadableMap
import com.datadog.android.Datadog // version: 1.19.0
import com.datadog.android.rum.RumMonitor // version: 1.19.0
import com.datadog.android.rum.RumActionType
import com.datadog.android.rum.RumErrorSource
import com.datadog.android.rum.RumAttributes
import com.fantasygm.assistant.utils.Logger
import java.util.concurrent.TimeUnit

/**
 * React Native native module providing comprehensive analytics tracking capabilities
 * using DataDog for monitoring, performance metrics, and user engagement analytics.
 */
class AnalyticsModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "AnalyticsModule"
        private const val PERFORMANCE_THRESHOLD_MS = 2000L // 2 seconds threshold
        private const val SESSION_TIMEOUT_MS = TimeUnit.MINUTES.toMillis(30)
    }

    private val rumMonitor: RumMonitor = RumMonitor.Builder()
        .setSessionSampleRate(100.0f) // Track all sessions
        .setBackgroundEventTracking(true)
        .setTrackFrustrations(true)
        .setTrackUserActions(true)
        .build()

    override fun getName(): String = "AnalyticsModule"

    /**
     * Track custom analytics event with enhanced performance metrics
     * @param eventName Name of the event to track
     * @param parameters Additional event parameters and metrics
     */
    @ReactMethod
    fun trackEvent(eventName: String, parameters: ReadableMap) {
        try {
            Logger.d(TAG, "Tracking event: $eventName with parameters: $parameters")

            val attributes = mutableMapOf<String, Any>()
            
            // Convert parameters to DataDog attributes
            parameters.toHashMap().forEach { (key, value) ->
                attributes[key] = value
            }

            // Add timestamp and context metadata
            attributes["timestamp"] = System.currentTimeMillis()
            attributes["platform"] = "android"
            
            // Track performance metrics if duration is provided
            parameters.getDouble("duration")?.let { duration ->
                attributes["duration_ms"] = duration
                
                // Log performance alert if above threshold
                if (duration > PERFORMANCE_THRESHOLD_MS) {
                    Logger.w(TAG, "Performance threshold exceeded for $eventName: ${duration}ms")
                    attributes["performance_alert"] = true
                }
            }

            // Send event to RUM monitor
            rumMonitor.addAction(
                RumActionType.CUSTOM,
                eventName,
                attributes
            )

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to track event: $eventName", e)
        }
    }

    /**
     * Track screen view analytics for user engagement monitoring
     * @param screenName Name of the screen being viewed
     */
    @ReactMethod
    fun trackScreen(screenName: String) {
        try {
            Logger.d(TAG, "Tracking screen view: $screenName")

            val attributes = mapOf(
                "platform" to "android",
                "timestamp" to System.currentTimeMillis(),
                "previous_screen" to rumMonitor.getCurrentScreen()?.name
            )

            rumMonitor.startView(
                screenName,
                attributes
            )

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to track screen view: $screenName", e)
        }
    }

    /**
     * Track error events with enhanced context and metadata
     * @param error Error message or description
     * @param errorInfo Additional error context and stack trace
     */
    @ReactMethod
    fun trackError(error: String, errorInfo: ReadableMap) {
        try {
            Logger.e(TAG, "Tracking error: $error")

            val attributes = mutableMapOf<String, Any>()
            
            // Extract error details
            errorInfo.toHashMap().forEach { (key, value) ->
                attributes[key] = value
            }

            // Add error context
            attributes["platform"] = "android"
            attributes["timestamp"] = System.currentTimeMillis()
            attributes["current_screen"] = rumMonitor.getCurrentScreen()?.name
            attributes["app_state"] = if (currentActivity != null) "active" else "background"

            // Track error in RUM monitor
            rumMonitor.addError(
                error,
                RumErrorSource.SOURCE,
                attributes,
                errorInfo.getString("stackTrace")
            )

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to track error", e)
        }
    }

    /**
     * Initialize analytics session with user context
     * @param userId Optional user identifier for session tracking
     */
    @ReactMethod
    fun initializeSession(userId: String?) {
        try {
            Logger.d(TAG, "Initializing analytics session")

            val attributes = mutableMapOf(
                "platform" to "android",
                "session_start" to System.currentTimeMillis()
            )

            userId?.let {
                attributes["user_id"] = it
            }

            rumMonitor.startSession(SESSION_TIMEOUT_MS, attributes)

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to initialize analytics session", e)
        }
    }
}