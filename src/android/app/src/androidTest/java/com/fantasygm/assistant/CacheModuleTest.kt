package com.fantasygm.assistant

import androidx.test.ext.junit.runners.AndroidJUnit4 // version: 1.1.5
import androidx.test.platform.app.InstrumentationRegistry // version: 1.1.5
import com.fantasygm.assistant.modules.cache.CacheModule
import com.fantasygm.assistant.utils.Constants.CACHE_TTL_PLAYER_STATS
import com.fantasygm.assistant.utils.Constants.CACHE_TTL_WEATHER
import com.fantasygm.assistant.utils.Constants.CACHE_TTL_TRADE_ANALYSIS
import com.fantasygm.assistant.utils.Constants.CACHE_TTL_VIDEO
import com.fantasygm.assistant.utils.Constants.CacheKeys
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestCoroutineDispatcher // version: 1.6.4
import kotlinx.coroutines.test.runBlockingTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.random.Random

private const val TAG = "CacheModuleTest"

@ExperimentalCoroutinesApi
@RunWith(AndroidJUnit4::class)
class CacheModuleTest {

    private lateinit var context: ReactApplicationContext
    private lateinit var cacheModule: CacheModule
    private val testDispatcher = TestCoroutineDispatcher()

    @Before
    fun setup() {
        context = ReactApplicationContext(InstrumentationRegistry.getInstrumentation().targetContext)
        cacheModule = CacheModule(context)
        cacheModule.clear(createPromise { })
    }

    @Test
    fun testPlayerStatsCacheTTL() = runBlockingTest {
        // Test data
        val key = "${CacheKeys.PLAYER_STATS}test_player"
        val value = """{"id": "123", "name": "Test Player", "stats": {"points": 25}}"""
        val latch = CountDownLatch(1)
        var result: String? = null

        // Store data with encryption
        cacheModule.setItem(key, value, CacheKeys.PLAYER_STATS, true, createPromise {
            latch.countDown()
        })
        assertTrue("Cache write timed out", latch.await(5, TimeUnit.SECONDS))

        // Verify immediate retrieval
        val retrievalLatch = CountDownLatch(1)
        cacheModule.getItem(key, true, createPromise { data ->
            result = data as String?
            retrievalLatch.countDown()
        })
        assertTrue("Cache read timed out", retrievalLatch.await(5, TimeUnit.SECONDS))
        assertEquals("Cached data mismatch", value, result)

        // Wait for TTL expiration (15 minutes + buffer)
        testDispatcher.advanceTimeBy(CACHE_TTL_PLAYER_STATS * 1000 + 1000)

        // Verify data expiration
        val expirationLatch = CountDownLatch(1)
        cacheModule.getItem(key, true, createPromise { data ->
            result = data as String?
            expirationLatch.countDown()
        })
        assertTrue("Expiration check timed out", expirationLatch.await(5, TimeUnit.SECONDS))
        assertNull("Data should be expired", result)
    }

    @Test
    fun testConcurrentAccess() = runBlockingTest {
        val threadCount = 10
        val operationsPerThread = 100
        val latch = CountDownLatch(threadCount)
        val errors = mutableListOf<String>()

        // Launch multiple threads performing concurrent operations
        repeat(threadCount) { threadId ->
            Thread {
                try {
                    repeat(operationsPerThread) {
                        val key = "concurrent_test_${threadId}_$it"
                        val value = "value_$threadId_$it"
                        
                        // Random mix of operations
                        when (Random.nextInt(3)) {
                            0 -> cacheModule.setItem(key, value, CacheKeys.PLAYER_STATS, false, 
                                createPromise {})
                            1 -> cacheModule.getItem(key, false, createPromise {})
                            2 -> cacheModule.removeItem(key, false, createPromise {})
                        }
                    }
                } catch (e: Exception) {
                    synchronized(errors) {
                        errors.add("Thread $threadId error: ${e.message}")
                    }
                } finally {
                    latch.countDown()
                }
            }.start()
        }

        assertTrue("Concurrent operations timed out", latch.await(30, TimeUnit.SECONDS))
        assertTrue("Concurrent access errors: ${errors.joinToString()}", errors.isEmpty())
    }

    @Test
    fun testCacheRecovery() = runBlockingTest {
        // Store test data
        val key = "recovery_test"
        val value = "test_value"
        val latch = CountDownLatch(1)

        cacheModule.setItem(key, value, CacheKeys.WEATHER_DATA, false, createPromise {
            latch.countDown()
        })
        assertTrue(latch.await(5, TimeUnit.SECONDS))

        // Simulate corruption by clearing internal state
        cacheModule.clear(createPromise {})

        // Verify recovery behavior
        val recoveryLatch = CountDownLatch(1)
        var recovered: String? = null

        cacheModule.getItem(key, false, createPromise { data ->
            recovered = data as String?
            recoveryLatch.countDown()
        })
        assertTrue(recoveryLatch.await(5, TimeUnit.SECONDS))
        assertNull("Corrupted cache should return null", recovered)

        // Verify new writes work after recovery
        val newLatch = CountDownLatch(1)
        cacheModule.setItem(key, value, CacheKeys.WEATHER_DATA, false, createPromise {
            newLatch.countDown()
        })
        assertTrue("Cache write after recovery failed", newLatch.await(5, TimeUnit.SECONDS))
    }

    @Test
    fun testEncryptedStorage() = runBlockingTest {
        val key = "${CacheKeys.TRADE_ANALYSIS}sensitive_data"
        val value = """{"trade_details": "confidential_info"}"""
        val latch = CountDownLatch(1)

        // Store encrypted data
        cacheModule.setItem(key, value, CacheKeys.TRADE_ANALYSIS, true, createPromise {
            latch.countDown()
        })
        assertTrue(latch.await(5, TimeUnit.SECONDS))

        // Verify encrypted retrieval
        val retrievalLatch = CountDownLatch(1)
        var result: String? = null
        cacheModule.getItem(key, true, createPromise { data ->
            result = data as String?
            retrievalLatch.countDown()
        })
        assertTrue(retrievalLatch.await(5, TimeUnit.SECONDS))
        assertEquals("Encrypted data mismatch", value, result)
    }

    private fun createPromise(callback: (Any?) -> Unit): Promise {
        return object : Promise {
            override fun resolve(value: Any?) {
                callback(value)
            }

            override fun reject(code: String?, message: String?) {
                callback(null)
                fail("Promise rejected: $code - $message")
            }

            override fun reject(code: String?, throwable: Throwable?) {
                callback(null)
                fail("Promise rejected with throwable: $code - ${throwable?.message}")
            }

            override fun reject(throwable: Throwable?) {
                callback(null)
                fail("Promise rejected with throwable: ${throwable?.message}")
            }
        }
    }
}