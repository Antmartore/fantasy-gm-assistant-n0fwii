package com.fantasygm.assistant

import androidx.test.ext.junit.runners.AndroidJUnit4 // version: 1.1.5
import androidx.test.platform.app.InstrumentationRegistry // version: 1.1.5
import com.facebook.react.bridge.ReactApplicationContext // version: 0.72.4
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.ReadableMap
import com.datadog.android.Datadog // version: 1.19.0
import com.datadog.android.core.configuration.Configuration
import com.datadog.android.core.configuration.Credentials
import com.datadog.android.privacy.TrackingConsent
import com.datadog.android.rum.RumMonitor
import com.fantasygm.assistant.modules.analytics.AnalyticsModule
import org.junit.* // version: 4.13.2
import org.junit.runner.RunWith
import org.mockito.Mockito // version: 5.4.0
import org.mockito.kotlin.whenever
import org.mockito.kotlin.verify
import org.mockito.kotlin.any
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class AnalyticsModuleTest {

    companion object {
        private const val TAG = "AnalyticsModuleTest"
        private const val TEST_TIMEOUT = 2000L
        private const val TEST_EVENT_NAME = "test_event"
        private const val TEST_SCREEN_NAME = "test_screen"
        private const val TEST_USER_ID = "test_user_123"
    }

    private lateinit var analyticsModule: AnalyticsModule
    private lateinit var reactContext: ReactApplicationContext
    private lateinit var rumMonitor: RumMonitor
    private lateinit var datadogConfig: Configuration
    private lateinit var testLatch: CountDownLatch

    @Before
    fun setUp() {
        // Initialize test context
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        reactContext = ReactApplicationContext(appContext)

        // Configure Datadog for testing
        datadogConfig = Configuration.Builder(
            logsEnabled = true,
            tracesEnabled = true,
            crashReportsEnabled = true
        ).build()

        val credentials = Credentials(
            clientToken = "test_client_token",
            envName = "test",
            variant = "debug",
            rumApplicationId = "test_rum_id"
        )

        // Initialize Datadog with test configuration
        Datadog.initialize(datadogConfig, credentials, TrackingConsent.GRANTED)

        // Mock RUM monitor
        rumMonitor = Mockito.mock(RumMonitor::class.java)
        
        // Initialize analytics module
        analyticsModule = AnalyticsModule(reactContext)
        
        // Reset test synchronization
        testLatch = CountDownLatch(1)
    }

    @After
    fun tearDown() {
        // Clear Datadog test session
        Datadog.clear()
        
        // Reset mocks
        Mockito.reset(rumMonitor)
        
        // Clear test data
        reactContext.clearSensitiveData()
    }

    @Test
    fun testModuleNameIsCorrect() {
        Assert.assertEquals("AnalyticsModule", analyticsModule.name)
    }

    @Test
    fun testTrackEventSuccess() {
        // Prepare test event data
        val eventParams = JavaOnlyMap().apply {
            putString("category", "test_category")
            putString("action", "test_action")
            putDouble("duration", 1500.0)
            putBoolean("success", true)
        }

        // Track test event
        analyticsModule.trackEvent(TEST_EVENT_NAME, eventParams)

        // Verify event tracking
        verify(rumMonitor).addAction(
            any(),
            org.mockito.kotlin.eq(TEST_EVENT_NAME),
            org.mockito.kotlin.check { attributes ->
                Assert.assertTrue(attributes.containsKey("category"))
                Assert.assertTrue(attributes.containsKey("duration_ms"))
                Assert.assertTrue(attributes.containsKey("timestamp"))
                Assert.assertTrue(attributes.containsKey("platform"))
            }
        )
    }

    @Test
    fun testPerformanceTracking() {
        // Prepare performance test data
        val performanceParams = JavaOnlyMap().apply {
            putString("operation", "ai_recommendation")
            putDouble("duration", 2500.0) // Above threshold
        }

        // Track performance event
        analyticsModule.trackEvent("performance_test", performanceParams)

        // Verify performance tracking
        verify(rumMonitor).addAction(
            any(),
            org.mockito.kotlin.eq("performance_test"),
            org.mockito.kotlin.check { attributes ->
                Assert.assertTrue(attributes.containsKey("duration_ms"))
                Assert.assertTrue(attributes.containsKey("performance_alert"))
                Assert.assertEquals(true, attributes["performance_alert"])
            }
        )
    }

    @Test
    fun testScreenViewTracking() {
        // Track screen view
        analyticsModule.trackScreen(TEST_SCREEN_NAME)

        // Verify screen tracking
        verify(rumMonitor).startView(
            org.mockito.kotlin.eq(TEST_SCREEN_NAME),
            org.mockito.kotlin.check { attributes ->
                Assert.assertTrue(attributes.containsKey("platform"))
                Assert.assertTrue(attributes.containsKey("timestamp"))
                Assert.assertTrue(attributes.containsKey("previous_screen"))
            }
        )
    }

    @Test
    fun testErrorTracking() {
        // Prepare error data
        val errorInfo = JavaOnlyMap().apply {
            putString("code", "ERROR_1000")
            putString("stackTrace", "Test stack trace")
            putString("context", "test_context")
        }

        // Track error
        analyticsModule.trackError("Test error", errorInfo)

        // Verify error tracking
        verify(rumMonitor).addError(
            org.mockito.kotlin.eq("Test error"),
            any(),
            org.mockito.kotlin.check { attributes ->
                Assert.assertTrue(attributes.containsKey("code"))
                Assert.assertTrue(attributes.containsKey("context"))
                Assert.assertTrue(attributes.containsKey("current_screen"))
                Assert.assertTrue(attributes.containsKey("app_state"))
            },
            any()
        )
    }

    @Test
    fun testSessionManagement() {
        // Initialize session
        analyticsModule.initializeSession(TEST_USER_ID)

        // Verify session initialization
        verify(rumMonitor).startSession(
            any(),
            org.mockito.kotlin.check { attributes ->
                Assert.assertTrue(attributes.containsKey("platform"))
                Assert.assertTrue(attributes.containsKey("session_start"))
                Assert.assertTrue(attributes.containsKey("user_id"))
                Assert.assertEquals(TEST_USER_ID, attributes["user_id"])
            }
        )
    }

    @Test
    fun testPrivacyCompliance() {
        // Prepare PII-containing event
        val sensitiveParams = JavaOnlyMap().apply {
            putString("user_email", "test@example.com")
            putString("device_id", "test_device_123")
        }

        // Track event with sensitive data
        analyticsModule.trackEvent("privacy_test", sensitiveParams)

        // Verify PII handling
        verify(rumMonitor).addAction(
            any(),
            org.mockito.kotlin.eq("privacy_test"),
            org.mockito.kotlin.check { attributes ->
                // Verify PII is not included in tracking
                Assert.assertFalse(attributes.containsKey("user_email"))
                Assert.assertFalse(attributes.containsKey("device_id"))
            }
        )
    }

    @Test
    fun testRateLimiting() {
        // Track multiple events rapidly
        repeat(100) {
            analyticsModule.trackEvent(TEST_EVENT_NAME, JavaOnlyMap())
        }

        // Verify rate limiting behavior
        verify(rumMonitor, Mockito.atMost(50)).addAction(
            any(),
            org.mockito.kotlin.eq(TEST_EVENT_NAME),
            any()
        )
    }
}