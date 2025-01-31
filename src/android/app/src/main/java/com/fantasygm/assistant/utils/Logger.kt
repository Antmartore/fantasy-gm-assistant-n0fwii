package com.fantasygm.assistant.utils

import android.util.Log // version: latest
import com.fantasygm.assistant.BuildConfig // version: latest
import com.google.firebase.crashlytics.FirebaseCrashlytics // version: 18.4.3
import com.datadog.android.Datadog // version: 1.15.0
import com.datadog.android.core.configuration.Configuration
import com.datadog.android.core.configuration.Credentials
import com.datadog.android.log.Logger as DatadogLogger
import com.datadog.android.privacy.TrackingConsent
import com.fantasygm.assistant.utils.Constants.ErrorCodes.NETWORK_ERROR
import com.fantasygm.assistant.utils.Constants.ErrorCodes.AUTH_ERROR
import org.json.JSONObject

/**
 * Log levels supported by the application logger
 * Maps to both DataDog and Android log priorities
 */
enum class LogLevel(val androidPriority: Int, val datadogPriority: Int) {
    VERBOSE(Log.VERBOSE, DatadogLogger.VERBOSE),
    DEBUG(Log.DEBUG, DatadogLogger.DEBUG),
    INFO(Log.INFO, DatadogLogger.INFO),
    WARN(Log.WARN, DatadogLogger.WARN),
    ERROR(Log.ERROR, DatadogLogger.ERROR)
}

/**
 * Singleton logger object providing structured logging functionality with
 * comprehensive crash reporting and performance monitoring integration
 */
object Logger {
    private const val TAG = "FantasyGMAssistant"
    private const val LOG_SAMPLE_RATE = 0.1 // 10% sampling in production

    private var isDebugEnabled = BuildConfig.DEBUG
    private lateinit var datadogLogger: DatadogLogger
    private lateinit var crashlytics: FirebaseCrashlytics

    /**
     * Initialize logging and monitoring systems
     */
    fun initialize() {
        initializeCrashlytics()
        initializeDatadog()
    }

    private fun initializeCrashlytics() {
        crashlytics = FirebaseCrashlytics.getInstance()
        crashlytics.setCrashlyticsCollectionEnabled(true)
    }

    private fun initializeDatadog() {
        val configuration = Configuration.Builder(
            logsEnabled = true,
            tracesEnabled = true,
            crashReportsEnabled = true
        ).build()

        val credentials = Credentials(
            clientToken = BuildConfig.DATADOG_CLIENT_TOKEN,
            envName = BuildConfig.BUILD_TYPE,
            variant = BuildConfig.FLAVOR,
            rumApplicationId = BuildConfig.DATADOG_RUM_APP_ID
        )

        Datadog.initialize(configuration, credentials, TrackingConsent.GRANTED)
        
        datadogLogger = DatadogLogger.Builder()
            .setNetworkInfoEnabled(true)
            .setServiceName("fantasy-gm-assistant")
            .setLogcatLogsEnabled(isDebugEnabled)
            .build()
    }

    /**
     * Log verbose message with performance tracking
     */
    @JvmStatic
    fun v(tag: String = TAG, message: String) {
        if (shouldLog(LogLevel.VERBOSE)) {
            Log.v(tag, message)
            logToMonitoringSystems(LogLevel.VERBOSE, tag, message)
        }
    }

    /**
     * Log debug message
     */
    @JvmStatic
    fun d(tag: String = TAG, message: String) {
        if (shouldLog(LogLevel.DEBUG)) {
            Log.d(tag, message)
            logToMonitoringSystems(LogLevel.DEBUG, tag, message)
        }
    }

    /**
     * Log info message
     */
    @JvmStatic
    fun i(tag: String = TAG, message: String) {
        if (shouldLog(LogLevel.INFO)) {
            Log.i(tag, message)
            logToMonitoringSystems(LogLevel.INFO, tag, message)
        }
    }

    /**
     * Log warning message
     */
    @JvmStatic
    fun w(tag: String = TAG, message: String, throwable: Throwable? = null) {
        if (shouldLog(LogLevel.WARN)) {
            Log.w(tag, message, throwable)
            logToMonitoringSystems(LogLevel.WARN, tag, message, throwable)
        }
    }

    /**
     * Log error message
     */
    @JvmStatic
    fun e(tag: String = TAG, message: String, throwable: Throwable? = null) {
        if (shouldLog(LogLevel.ERROR)) {
            Log.e(tag, message, throwable)
            logToMonitoringSystems(LogLevel.ERROR, tag, message, throwable)
        }
    }

    /**
     * Log structured data with metadata
     */
    @JvmStatic
    fun logStructured(
        level: LogLevel,
        tag: String = TAG,
        message: String,
        metadata: Map<String, Any>
    ) {
        if (shouldLog(level)) {
            val structuredData = JSONObject().apply {
                put("message", message)
                put("metadata", JSONObject(metadata))
                put("timestamp", System.currentTimeMillis())
                put("tag", tag)
            }.toString()

            Log.println(level.androidPriority, tag, structuredData)
            
            datadogLogger.log(
                level.datadogPriority,
                message,
                metadata.mapValues { it.value.toString() }
            )
        }
    }

    /**
     * Log performance metric to monitoring system
     */
    @JvmStatic
    fun logMetric(metricName: String, value: Double, tags: Map<String, String> = emptyMap()) {
        try {
            datadogLogger.log(
                LogLevel.INFO.datadogPriority,
                "METRIC: $metricName",
                mapOf(
                    "metric_name" to metricName,
                    "value" to value.toString()
                ) + tags
            )
        } catch (e: Exception) {
            e(TAG, "Failed to log metric: $metricName", e)
        }
    }

    /**
     * Log error with error code
     */
    @JvmStatic
    fun logError(errorCode: Int, message: String, throwable: Throwable? = null) {
        val metadata = mutableMapOf(
            "error_code" to errorCode.toString(),
            "build_type" to BuildConfig.BUILD_TYPE,
            "app_version" to BuildConfig.VERSION_NAME
        )

        logStructured(LogLevel.ERROR, TAG, message, metadata)
        
        crashlytics.apply {
            setCustomKey("error_code", errorCode)
            recordException(throwable ?: Exception(message))
        }
    }

    private fun shouldLog(level: LogLevel): Boolean {
        return when {
            isDebugEnabled -> true
            level == LogLevel.ERROR -> true
            Math.random() < LOG_SAMPLE_RATE -> true
            else -> false
        }
    }

    private fun logToMonitoringSystems(
        level: LogLevel,
        tag: String,
        message: String,
        throwable: Throwable? = null
    ) {
        try {
            datadogLogger.log(
                level.datadogPriority,
                message,
                mapOf(
                    "tag" to tag,
                    "build_type" to BuildConfig.BUILD_TYPE,
                    "app_version" to BuildConfig.VERSION_NAME
                )
            )

            if (level == LogLevel.ERROR) {
                crashlytics.log("$tag: $message")
                throwable?.let { crashlytics.recordException(it) }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to log to monitoring systems", e)
        }
    }
}