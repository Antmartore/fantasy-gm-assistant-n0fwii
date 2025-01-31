package com.fantasygm.assistant.modules.performance

import com.facebook.react.bridge.ReactContextBaseJavaModule // version: 0.72.0
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import android.os.Process
import android.view.Choreographer
import com.datadog.android.Datadog // version: 1.15.0
import com.datadog.android.rum.GlobalRum
import com.datadog.android.rum.RumMonitor
import com.fantasygm.assistant.utils.Logger
import com.fantasygm.assistant.utils.Constants
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.collections.CircularArray

private const val TAG = "PerformanceModule"
private const val FRAME_RATE_SAMPLE_SIZE = 60
private const val MEMORY_CHECK_INTERVAL = 30000L // 30 seconds
private const val TARGET_FRAME_TIME = 16.67 // Target 60 FPS in milliseconds

/**
 * Enhanced React Native module for performance monitoring and optimization
 * with DataDog integration and proactive memory management
 */
class PerformanceModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    private val frameTimeHistory = CircularArray<Long>(FRAME_RATE_SAMPLE_SIZE)
    private val activeSessions = mutableMapOf<String, PerformanceSession>()
    private val datadogMonitor = RumMonitor.Builder().build()
    private var lastMemoryCheck = 0L
    private var isMonitoringActive = false

    data class PerformanceSession(
        val id: String,
        val startTime: Long,
        var frameDrops: Int = 0,
        var totalFrames: Int = 0,
        var memoryWarnings: Int = 0
    )

    init {
        GlobalRum.registerIfAbsent(datadogMonitor)
        Logger.i(TAG, "Performance module initialized")
    }

    override fun getName(): String = "PerformanceModule"

    /**
     * Starts comprehensive performance monitoring including frame rate and memory tracking
     */
    @ReactMethod
    fun startPerformanceMonitoring(featureId: String, options: ReadableMap, promise: Promise) {
        try {
            val sessionId = UUID.randomUUID().toString()
            val session = PerformanceSession(
                id = sessionId,
                startTime = System.currentTimeMillis()
            )
            activeSessions[sessionId] = session

            // Initialize frame rate monitoring
            Choreographer.getInstance().postFrameCallback(object : Choreographer.FrameCallback {
                override fun doFrame(frameTimeNanos: Long) {
                    if (isMonitoringActive) {
                        trackFrameTime(frameTimeNanos)
                        Choreographer.getInstance().postFrameCallback(this)
                    }
                }
            })

            // Initialize memory monitoring
            startMemoryMonitoring()

            // Configure DataDog RUM monitoring
            datadogMonitor.startView(
                key = sessionId,
                name = "PerformanceMonitoring",
                attributes = mapOf(
                    "featureId" to featureId,
                    "deviceMemory" to Runtime.getRuntime().maxMemory()
                )
            )

            isMonitoringActive = true
            Logger.i(TAG, "Performance monitoring started: $sessionId")

            val response = Arguments.createMap().apply {
                putString("sessionId", sessionId)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
                putMap("initialMetrics", getCurrentMetrics())
            }
            promise.resolve(response)

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to start performance monitoring", e)
            promise.reject("PERF_START_ERROR", e)
        }
    }

    /**
     * Stops performance monitoring for a given session
     */
    @ReactMethod
    fun stopPerformanceMonitoring(sessionId: String, promise: Promise) {
        try {
            activeSessions[sessionId]?.let { session ->
                isMonitoringActive = false
                datadogMonitor.stopView(sessionId)
                
                val metrics = Arguments.createMap().apply {
                    putInt("totalFrames", session.totalFrames)
                    putInt("frameDrops", session.frameDrops)
                    putInt("memoryWarnings", session.memoryWarnings)
                    putDouble("duration", (System.currentTimeMillis() - session.startTime).toDouble())
                }
                
                activeSessions.remove(sessionId)
                promise.resolve(metrics)
                
                Logger.i(TAG, "Performance monitoring stopped: $sessionId")
            } ?: throw IllegalArgumentException("Invalid session ID: $sessionId")
            
        } catch (e: Exception) {
            Logger.e(TAG, "Failed to stop performance monitoring", e)
            promise.reject("PERF_STOP_ERROR", e)
        }
    }

    /**
     * Proactive memory optimization with adaptive thresholds
     */
    @ReactMethod
    fun optimizeMemoryUsage(options: ReadableMap, promise: Promise) {
        try {
            val runtime = Runtime.getRuntime()
            val usedMemory = runtime.totalMemory() - runtime.freeMemory()
            val maxMemory = runtime.maxMemory()
            val memoryUsagePercent = (usedMemory.toDouble() / maxMemory.toDouble()) * 100

            val metrics = Arguments.createMap()
            metrics.putDouble("memoryUsagePercent", memoryUsagePercent)
            metrics.putDouble("totalMemoryMB", maxMemory.toDouble() / (1024 * 1024))
            metrics.putDouble("usedMemoryMB", usedMemory.toDouble() / (1024 * 1024))

            if (memoryUsagePercent > Constants.MEMORY_THRESHOLD) {
                System.gc()
                Logger.i(TAG, "Memory optimization triggered: $memoryUsagePercent%")
                
                datadogMonitor.addAttribute(
                    "memory_optimization",
                    mapOf(
                        "trigger_percent" to memoryUsagePercent,
                        "timestamp" to System.currentTimeMillis()
                    )
                )
            }

            promise.resolve(metrics)

        } catch (e: Exception) {
            Logger.e(TAG, "Memory optimization failed", e)
            promise.reject("MEMORY_OPTIMIZATION_ERROR", e)
        }
    }

    /**
     * Retrieves current performance metrics
     */
    @ReactMethod
    fun getPerformanceMetrics(promise: Promise) {
        promise.resolve(getCurrentMetrics())
    }

    private fun getCurrentMetrics(): WritableMap {
        val metrics = Arguments.createMap()
        val runtime = Runtime.getRuntime()

        metrics.putDouble("memoryUsage", (runtime.totalMemory() - runtime.freeMemory()).toDouble())
        metrics.putDouble("availableMemory", runtime.freeMemory().toDouble())
        metrics.putDouble("totalMemory", runtime.totalMemory().toDouble())
        metrics.putDouble("maxMemory", runtime.maxMemory().toDouble())
        
        val avgFrameTime = if (frameTimeHistory.isNotEmpty()) {
            frameTimeHistory.average()
        } else 0.0
        metrics.putDouble("avgFrameTime", avgFrameTime)

        return metrics
    }

    private fun trackFrameTime(frameTimeNanos: Long) {
        val frameTimeMs = TimeUnit.NANOSECONDS.toMillis(frameTimeNanos)
        frameTimeHistory.add(frameTimeMs)

        activeSessions.values.forEach { session ->
            session.totalFrames++
            if (frameTimeMs > TARGET_FRAME_TIME) {
                session.frameDrops++
                
                if (session.frameDrops % 60 == 0) {
                    Logger.w(TAG, "High frame drop rate detected: ${session.frameDrops} drops")
                    datadogMonitor.addError(
                        "Frame drops detected",
                        mapOf(
                            "drops" to session.frameDrops,
                            "avgFrameTime" to frameTimeHistory.average()
                        )
                    )
                }
            }
        }
    }

    private fun startMemoryMonitoring() {
        Thread {
            while (isMonitoringActive) {
                val currentTime = System.currentTimeMillis()
                if (currentTime - lastMemoryCheck >= MEMORY_CHECK_INTERVAL) {
                    checkMemoryUsage()
                    lastMemoryCheck = currentTime
                }
                Thread.sleep(1000) // Check every second
            }
        }.start()
    }

    private fun checkMemoryUsage() {
        val runtime = Runtime.getRuntime()
        val usedMemory = runtime.totalMemory() - runtime.freeMemory()
        val maxMemory = runtime.maxMemory()
        val memoryUsagePercent = (usedMemory.toDouble() / maxMemory.toDouble()) * 100

        if (memoryUsagePercent > Constants.MEMORY_THRESHOLD) {
            activeSessions.values.forEach { it.memoryWarnings++ }
            
            Logger.w(TAG, "High memory usage detected: $memoryUsagePercent%")
            datadogMonitor.addError(
                "High memory usage",
                mapOf(
                    "usagePercent" to memoryUsagePercent,
                    "usedMemoryMB" to (usedMemory / (1024 * 1024)),
                    "maxMemoryMB" to (maxMemory / (1024 * 1024))
                )
            )
        }
    }
}