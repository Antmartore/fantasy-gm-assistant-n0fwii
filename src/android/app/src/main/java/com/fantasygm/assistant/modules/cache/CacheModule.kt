package com.fantasygm.assistant.modules.cache

import com.facebook.react.bridge.ReactContextBaseJavaModule // version: 0.72+
import com.facebook.react.bridge.ReactMethod // version: 0.72+
import com.facebook.react.bridge.ReactApplicationContext // version: 0.72+
import com.facebook.react.bridge.Promise // version: 0.72+
import com.facebook.react.bridge.ReadableMap // version: 0.72+
import androidx.security.crypto.EncryptedSharedPreferences // version: 1.1.0
import androidx.security.crypto.MasterKeys
import android.content.SharedPreferences
import android.util.Log
import com.fantasygm.assistant.utils.Constants.CACHE_TTL_PLAYER_STATS
import com.fantasygm.assistant.utils.Constants.CACHE_TTL_WEATHER
import com.fantasygm.assistant.utils.Constants.CACHE_TTL_TRADE_ANALYSIS
import com.fantasygm.assistant.utils.Constants.CACHE_TTL_VIDEO
import com.fantasygm.assistant.utils.Constants.CacheKeys
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Native Android module that provides secure, performant caching functionality
 * with TTL-based expiration and encryption support for sensitive data.
 */
class CacheModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "CacheModule"
        private const val ENCRYPTED_PREFS_FILE = "secure_cache"
        private const val STANDARD_PREFS_FILE = "standard_cache"
        private const val MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB
        private const val CLEANUP_INTERVAL_HOURS = 6L
    }

    private val standardPreferences: SharedPreferences
    private val securePreferences: SharedPreferences
    private var currentCacheSize: Long = 0

    init {
        // Initialize standard preferences
        standardPreferences = reactContext.getSharedPreferences(
            STANDARD_PREFS_FILE, 
            ReactApplicationContext.MODE_PRIVATE
        )

        // Initialize encrypted preferences
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        securePreferences = EncryptedSharedPreferences.create(
            ENCRYPTED_PREFS_FILE,
            masterKeyAlias,
            reactContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        // Calculate initial cache size
        calculateCurrentCacheSize()

        // Schedule periodic cleanup
        scheduleCleanup()
    }

    override fun getName(): String = "CacheModule"

    /**
     * Stores data in cache with TTL and optional encryption
     */
    @ReactMethod
    fun setItem(key: String, value: String, type: String, secure: Boolean, promise: Promise) {
        try {
            val ttl = when (type) {
                CacheKeys.PLAYER_STATS -> CACHE_TTL_PLAYER_STATS
                CacheKeys.WEATHER_DATA -> CACHE_TTL_WEATHER
                CacheKeys.TRADE_ANALYSIS -> CACHE_TTL_TRADE_ANALYSIS
                CacheKeys.VIDEO_CONTENT -> CACHE_TTL_VIDEO
                else -> CACHE_TTL_PLAYER_STATS // default to shortest TTL
            }

            val cacheEntry = JSONObject().apply {
                put("value", value)
                put("timestamp", System.currentTimeMillis())
                put("ttl", ttl)
            }.toString()

            val entrySize = cacheEntry.toByteArray().size
            if (currentCacheSize + entrySize > MAX_CACHE_SIZE_BYTES) {
                cleanupExpiredItems()
                if (currentCacheSize + entrySize > MAX_CACHE_SIZE_BYTES) {
                    promise.reject("CACHE_FULL", "Cache size limit exceeded")
                    return
                }
            }

            val preferences = if (secure) securePreferences else standardPreferences
            preferences.edit().apply {
                putString(key, cacheEntry)
                apply()
            }

            currentCacheSize += entrySize
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error setting cache item", e)
            promise.reject("CACHE_ERROR", e.message)
        }
    }

    /**
     * Retrieves cached data if not expired
     */
    @ReactMethod
    fun getItem(key: String, secure: Boolean, promise: Promise) {
        try {
            val preferences = if (secure) securePreferences else standardPreferences
            val cacheEntryStr = preferences.getString(key, null)

            if (cacheEntryStr == null) {
                promise.resolve(null)
                return
            }

            val cacheEntry = JSONObject(cacheEntryStr)
            val timestamp = cacheEntry.getLong("timestamp")
            val ttl = cacheEntry.getLong("ttl")
            val value = cacheEntry.getString("value")

            if (System.currentTimeMillis() - timestamp > ttl * 1000) {
                removeItem(key, secure, Promise { })
                promise.resolve(null)
                return
            }

            promise.resolve(value)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting cache item", e)
            promise.reject("CACHE_ERROR", e.message)
        }
    }

    /**
     * Removes item from cache with secure deletion for encrypted data
     */
    @ReactMethod
    fun removeItem(key: String, secure: Boolean, promise: Promise) {
        try {
            val preferences = if (secure) securePreferences else standardPreferences
            val cacheEntryStr = preferences.getString(key, null)

            if (cacheEntryStr != null) {
                currentCacheSize -= cacheEntryStr.toByteArray().size
                preferences.edit().remove(key).apply()

                if (secure) {
                    // Secure overwrite for encrypted data
                    preferences.edit().putString(key, "").apply()
                    preferences.edit().remove(key).apply()
                }
            }

            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error removing cache item", e)
            promise.reject("CACHE_ERROR", e.message)
        }
    }

    /**
     * Clears all cached data with secure wiping
     */
    @ReactMethod
    fun clear(promise: Promise) {
        try {
            // Clear standard cache
            standardPreferences.edit().clear().apply()

            // Secure clear encrypted cache
            val secureKeys = securePreferences.all.keys
            secureKeys.forEach { key ->
                securePreferences.edit().putString(key, "").apply()
            }
            securePreferences.edit().clear().apply()

            currentCacheSize = 0
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing cache", e)
            promise.reject("CACHE_ERROR", e.message)
        }
    }

    /**
     * Removes expired cache entries and updates size tracking
     */
    private fun cleanupExpiredItems() {
        try {
            val currentTime = System.currentTimeMillis()

            // Cleanup standard preferences
            cleanupPreferences(standardPreferences, currentTime, false)

            // Cleanup encrypted preferences
            cleanupPreferences(securePreferences, currentTime, true)

            // Recalculate cache size
            calculateCurrentCacheSize()
        } catch (e: Exception) {
            Log.e(TAG, "Error during cache cleanup", e)
        }
    }

    private fun cleanupPreferences(preferences: SharedPreferences, currentTime: Long, secure: Boolean) {
        val editor = preferences.edit()
        val expiredKeys = mutableListOf<String>()

        preferences.all.forEach { (key, value) ->
            if (value is String) {
                try {
                    val cacheEntry = JSONObject(value)
                    val timestamp = cacheEntry.getLong("timestamp")
                    val ttl = cacheEntry.getLong("ttl")

                    if (currentTime - timestamp > ttl * 1000) {
                        expiredKeys.add(key)
                    }
                } catch (e: Exception) {
                    expiredKeys.add(key)
                }
            }
        }

        expiredKeys.forEach { key ->
            if (secure) {
                editor.putString(key, "")
                editor.apply()
            }
            editor.remove(key)
        }
        editor.apply()
    }

    private fun calculateCurrentCacheSize() {
        currentCacheSize = 0
        standardPreferences.all.values.forEach { value ->
            if (value is String) {
                currentCacheSize += value.toByteArray().size
            }
        }
        securePreferences.all.values.forEach { value ->
            if (value is String) {
                currentCacheSize += value.toByteArray().size
            }
        }
    }

    private fun scheduleCleanup() {
        Executors.newSingleThreadScheduledExecutor().scheduleAtFixedRate(
            { cleanupExpiredItems() },
            CLEANUP_INTERVAL_HOURS,
            CLEANUP_INTERVAL_HOURS,
            TimeUnit.HOURS
        )
    }
}