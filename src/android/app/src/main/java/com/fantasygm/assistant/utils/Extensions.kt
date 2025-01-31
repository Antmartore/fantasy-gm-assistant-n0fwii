package com.fantasygm.assistant.utils

import android.text.TextUtils // version: latest
import android.util.Patterns // version: latest
import com.google.gson.Gson // version: 2.10.1
import retrofit2.Response // version: 2.9.0
import kotlinx.coroutines.* // version: 1.7.1
import java.io.IOException
import java.util.concurrent.TimeoutException
import com.fantasygm.assistant.utils.Logger
import com.fantasygm.assistant.utils.Constants.ErrorCodes.NETWORK_ERROR
import com.fantasygm.assistant.utils.Constants.ErrorCodes.VALIDATION_ERROR
import com.fantasygm.assistant.utils.Constants.ErrorCodes.TIMEOUT_ERROR
import com.fantasygm.assistant.utils.Constants.ErrorCodes.PARSE_ERROR

private const val TAG = "Extensions"
private const val MAX_RETRY_ATTEMPTS = 3
private const val RETRY_DELAY_MS = 1000L
private const val CACHE_DURATION_MS = 300000L // 5 minutes

/**
 * Cache to store API responses with timestamps
 */
private val responseCache = mutableMapOf<String, Pair<Long, Any>>()

/**
 * Extension function to handle API responses with performance monitoring,
 * caching, and retry logic for improved reliability
 *
 * @param cacheKey Unique key for caching the response
 * @param useCache Whether to use cached response if available
 * @return Result containing either success data or failure with error details
 */
@Throws(IOException::class)
@WorkerThread
suspend fun <T> Response<T>.handleApiResponse(
    cacheKey: String = "",
    useCache: Boolean = false
): Result<T> = withContext(Dispatchers.IO) {
    val startTime = System.nanoTime()
    var attempts = 0
    var lastError: Throwable? = null

    try {
        // Check cache first if enabled
        if (useCache && cacheKey.isNotEmpty()) {
            responseCache[cacheKey]?.let { (timestamp, data) ->
                if (System.currentTimeMillis() - timestamp < CACHE_DURATION_MS) {
                    @Suppress("UNCHECKED_CAST")
                    return@withContext Result.success(data as T)
                }
            }
        }

        while (attempts < MAX_RETRY_ATTEMPTS) {
            try {
                if (isSuccessful) {
                    body()?.let { response ->
                        // Cache successful response if caching is enabled
                        if (useCache && cacheKey.isNotEmpty()) {
                            responseCache[cacheKey] = System.currentTimeMillis() to response
                        }

                        // Log performance metric
                        val duration = (System.nanoTime() - startTime) / 1_000_000.0 // Convert to ms
                        Logger.logMetric(
                            "api_response_time",
                            duration,
                            mapOf(
                                "endpoint" to cacheKey,
                                "status" to "success",
                                "attempt" to attempts.toString()
                            )
                        )

                        return@withContext Result.success(response)
                    } ?: run {
                        Logger.logError(
                            PARSE_ERROR,
                            "Empty response body for request: $cacheKey"
                        )
                        return@withContext Result.failure(IOException("Empty response body"))
                    }
                } else {
                    // Handle HTTP error responses
                    val errorBody = errorBody()?.string()
                    val errorMessage = try {
                        Gson().fromJson(errorBody, Map::class.java)["message"] as? String
                    } catch (e: Exception) {
                        errorBody ?: "Unknown error occurred"
                    }

                    when (code()) {
                        in 400..499 -> {
                            Logger.logError(
                                VALIDATION_ERROR,
                                "Client error: $errorMessage",
                                IOException(errorMessage)
                            )
                            return@withContext Result.failure(IOException(errorMessage))
                        }
                        in 500..599 -> {
                            // Server errors are retryable
                            lastError = IOException("Server error: $errorMessage")
                            delay(RETRY_DELAY_MS * (attempts + 1))
                            attempts++
                            continue
                        }
                        else -> {
                            Logger.logError(
                                NETWORK_ERROR,
                                "Unknown error: $errorMessage",
                                IOException(errorMessage)
                            )
                            return@withContext Result.failure(IOException(errorMessage))
                        }
                    }
                }
            } catch (e: TimeoutException) {
                Logger.logError(TIMEOUT_ERROR, "Request timeout: $cacheKey", e)
                lastError = e
                delay(RETRY_DELAY_MS * (attempts + 1))
                attempts++
            } catch (e: IOException) {
                Logger.logError(NETWORK_ERROR, "Network error: $cacheKey", e)
                lastError = e
                delay(RETRY_DELAY_MS * (attempts + 1))
                attempts++
            }
        }

        // Log failed attempt metrics
        val duration = (System.nanoTime() - startTime) / 1_000_000.0
        Logger.logMetric(
            "api_response_time",
            duration,
            mapOf(
                "endpoint" to cacheKey,
                "status" to "failure",
                "attempts" to attempts.toString()
            )
        )

        return@withContext Result.failure(lastError ?: IOException("Maximum retry attempts exceeded"))
    } catch (e: Exception) {
        Logger.logError(
            NETWORK_ERROR,
            "Unexpected error handling response: $cacheKey",
            e
        )
        return@withContext Result.failure(e)
    }
}

/**
 * Extension function to validate email format
 */
fun String.isValidEmail(): Boolean {
    return !TextUtils.isEmpty(this) && Patterns.EMAIL_ADDRESS.matcher(this).matches()
}

/**
 * Extension function to safely parse JSON to specified type
 */
inline fun <reified T> String.parseJson(): Result<T> {
    return try {
        Result.success(Gson().fromJson(this, T::class.java))
    } catch (e: Exception) {
        Logger.logError(PARSE_ERROR, "JSON parse error", e)
        Result.failure(e)
    }
}

/**
 * Extension function to convert object to JSON string
 */
fun Any.toJson(): String {
    return Gson().toJson(this)
}

/**
 * Extension function to clear cache entries older than cache duration
 */
fun clearExpiredCache() {
    val currentTime = System.currentTimeMillis()
    responseCache.entries.removeAll { (_, value) ->
        currentTime - value.first > CACHE_DURATION_MS
    }
}