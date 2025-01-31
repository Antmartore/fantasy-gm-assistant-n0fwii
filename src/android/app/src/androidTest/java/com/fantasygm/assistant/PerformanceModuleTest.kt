package com.fantasygm.assistant

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4 // version: 1.1.5
import androidx.test.platform.app.InstrumentationRegistry // version: 1.1.5
import com.fantasygm.assistant.modules.performance.PerformanceModule
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.ReactApplicationContext
import org.junit.Assert.* // version: 4.13.2
import org.junit.Before // version: 4.13.2
import org.junit.Test // version: 4.13.2
import org.junit.runner.RunWith // version: 4.13.2
import kotlin.math.roundToInt

private const val TAG = "PerformanceModuleTest"
private const val RESPONSE_TIME_THRESHOLD_MS = 2000L
private const val SAMPLE_SIZE = 100
private const val SUCCESS_PERCENTAGE_THRESHOLD = 95.0

@RunWith(AndroidJUnit4::class)
class PerformanceModuleTest {

    private lateinit var performanceModule: PerformanceModule
    private lateinit var context: Context
    private val responseTimeSamples = mutableListOf<Long>()
    private lateinit var baselineMetrics: JavaOnlyMap

    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        performanceModule = PerformanceModule(ReactApplicationContext(context))
        baselineMetrics = Arguments.createMap() as JavaOnlyMap
        responseTimeSamples.clear()

        // Initialize baseline metrics
        baselineMetrics.putDouble("memoryUsage", 0.0)
        baselineMetrics.putDouble("availableMemory", Runtime.getRuntime().freeMemory().toDouble())
        baselineMetrics.putDouble("totalMemory", Runtime.getRuntime().totalMemory().toDouble())
        baselineMetrics.putDouble("maxMemory", Runtime.getRuntime().maxMemory().toDouble())
        baselineMetrics.putDouble("avgFrameTime", 16.67)
    }

    @Test
    fun testStartMonitoring() {
        val options = Arguments.createMap() as JavaOnlyMap
        options.putString("feature", "aiRecommendations")
        
        val promise = TestPromise()
        performanceModule.startPerformanceMonitoring("testFeature", options, promise)

        // Verify promise resolution
        assertTrue("Monitoring should start successfully", promise.isResolved)
        assertNotNull("Session ID should be present", promise.value)
        
        val response = promise.value as JavaOnlyMap
        assertNotNull("Initial metrics should be present", response.getMap("initialMetrics"))
        assertTrue("Session ID should be a valid UUID", 
            response.getString("sessionId")?.matches(Regex("[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}")) ?: false
        )
    }

    @Test
    fun testStopMonitoring() {
        // First start monitoring
        val startOptions = Arguments.createMap() as JavaOnlyMap
        val startPromise = TestPromise()
        performanceModule.startPerformanceMonitoring("testFeature", startOptions, startPromise)
        
        val sessionId = (startPromise.value as JavaOnlyMap).getString("sessionId")
        
        // Simulate some work
        Thread.sleep(1000)
        
        // Stop monitoring
        val stopPromise = TestPromise()
        performanceModule.stopPerformanceMonitoring(sessionId!!, stopPromise)
        
        assertTrue("Monitoring should stop successfully", stopPromise.isResolved)
        val metrics = stopPromise.value as JavaOnlyMap
        
        assertNotNull("Total frames should be present", metrics.getInt("totalFrames"))
        assertNotNull("Frame drops should be present", metrics.getInt("frameDrops"))
        assertNotNull("Memory warnings should be present", metrics.getInt("memoryWarnings"))
        assertTrue("Duration should be at least 1000ms", metrics.getDouble("duration") >= 1000.0)
    }

    @Test
    fun testMemoryOptimization() {
        val options = Arguments.createMap() as JavaOnlyMap
        options.putBoolean("aggressive", true)
        
        // Simulate memory pressure
        val memoryPressureData = ByteArray(50 * 1024 * 1024) // 50MB
        
        val promise = TestPromise()
        performanceModule.optimizeMemoryUsage(options, promise)
        
        assertTrue("Memory optimization should complete", promise.isResolved)
        val metrics = promise.value as JavaOnlyMap
        
        assertTrue("Memory usage percent should be present", metrics.hasKey("memoryUsagePercent"))
        assertTrue("Total memory should be present", metrics.hasKey("totalMemoryMB"))
        assertTrue("Used memory should be present", metrics.hasKey("usedMemoryMB"))
        
        // Cleanup
        @Suppress("UNUSED_VALUE")
        memoryPressureData = ByteArray(0)
        System.gc()
    }

    @Test
    fun testPerformanceMetricsRetrieval() {
        val promise = TestPromise()
        performanceModule.getPerformanceMetrics(promise)
        
        assertTrue("Metrics retrieval should succeed", promise.isResolved)
        val metrics = promise.value as JavaOnlyMap
        
        // Verify all required metrics are present
        val requiredMetrics = listOf(
            "memoryUsage",
            "availableMemory",
            "totalMemory",
            "maxMemory",
            "avgFrameTime"
        )
        
        requiredMetrics.forEach { metric ->
            assertTrue("Metric $metric should be present", metrics.hasKey(metric))
            assertNotNull("Metric $metric should not be null", metrics.getDouble(metric))
        }
        
        // Verify metrics are within reasonable ranges
        assertTrue("Memory usage should be positive", metrics.getDouble("memoryUsage") > 0)
        assertTrue("Available memory should be positive", metrics.getDouble("availableMemory") > 0)
        assertTrue("Total memory should be greater than used memory", 
            metrics.getDouble("totalMemory") >= metrics.getDouble("memoryUsage"))
    }

    @Test
    fun testResponseTimeRequirement() {
        val options = Arguments.createMap() as JavaOnlyMap
        options.putString("feature", "aiRecommendations")
        
        // Start performance monitoring
        val startPromise = TestPromise()
        performanceModule.startPerformanceMonitoring("responseTime", options, startPromise)
        val sessionId = (startPromise.value as JavaOnlyMap).getString("sessionId")
        
        // Collect response time samples
        repeat(SAMPLE_SIZE) {
            val startTime = System.currentTimeMillis()
            
            // Simulate AI recommendation request
            val requestPromise = TestPromise()
            performanceModule.getPerformanceMetrics(requestPromise)
            
            val endTime = System.currentTimeMillis()
            responseTimeSamples.add(endTime - startTime)
        }
        
        // Stop monitoring
        val stopPromise = TestPromise()
        performanceModule.stopPerformanceMonitoring(sessionId!!, stopPromise)
        
        // Calculate success rate
        val successfulRequests = responseTimeSamples.count { it <= RESPONSE_TIME_THRESHOLD_MS }
        val successRate = (successfulRequests.toDouble() / SAMPLE_SIZE.toDouble()) * 100
        
        // Log performance statistics
        val avgResponseTime = responseTimeSamples.average()
        val maxResponseTime = responseTimeSamples.maxOrNull() ?: 0
        val p95ResponseTime = responseTimeSamples.sorted()[((SAMPLE_SIZE * 0.95) - 1).roundToInt()]
        
        println("Performance Test Results:")
        println("Average Response Time: ${avgResponseTime}ms")
        println("95th Percentile Response Time: ${p95ResponseTime}ms")
        println("Max Response Time: ${maxResponseTime}ms")
        println("Success Rate: $successRate%")
        
        assertTrue(
            "95% of requests should complete within ${RESPONSE_TIME_THRESHOLD_MS}ms threshold. " +
            "Actual success rate: $successRate%",
            successRate >= SUCCESS_PERCENTAGE_THRESHOLD
        )
        
        assertTrue(
            "95th percentile response time should be under threshold",
            p95ResponseTime <= RESPONSE_TIME_THRESHOLD_MS
        )
    }

    /**
     * Test utility class to handle React Native promises in tests
     */
    private inner class TestPromise {
        var isResolved = false
        var isRejected = false
        var value: Any? = null
        var error: Throwable? = null
        
        fun resolve(result: Any?) {
            isResolved = true
            value = result
        }
        
        fun reject(code: String, error: Throwable) {
            isRejected = true
            this.error = error
        }
    }
}