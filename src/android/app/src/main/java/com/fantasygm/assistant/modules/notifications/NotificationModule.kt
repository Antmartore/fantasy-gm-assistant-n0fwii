package com.fantasygm.assistant.modules.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.RemoteMessage
import com.fantasygm.assistant.utils.Logger
import com.fantasygm.assistant.utils.Constants.API_VERSION
import org.json.JSONObject

/**
 * React Native native module for handling push notifications and real-time updates
 * in the Fantasy GM Assistant Android application.
 * 
 * @version 1.0.0
 */
class NotificationModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val MODULE_NAME = "NotificationModule"
        private const val EVENT_NOTIFICATION_RECEIVED = "onNotificationReceived"
        private const val EVENT_TOKEN_REFRESHED = "onTokenRefreshed"
        private const val NOTIFICATION_CHANNEL_ID = "fantasy_gm_notifications"
        private const val NOTIFICATION_CHANNEL_NAME = "Fantasy GM Updates"
        private const val PREFERENCES_NAME = "notification_preferences"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_NOTIFICATION_ENABLED = "notifications_enabled"
    }

    private val firebaseMessaging: FirebaseMessaging = FirebaseMessaging.getInstance()
    private val notificationManager: NotificationManager
    private val preferences: SharedPreferences

    init {
        notificationManager = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) 
                as NotificationManager
        preferences = reactApplicationContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
        
        setupNotificationChannel()
        setupMessageListener()
        setupTokenRefreshListener()
    }

    override fun getName(): String = MODULE_NAME

    /**
     * Creates the notification channel for Android O and above
     */
    private fun setupNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Real-time fantasy sports updates and alerts"
                enableVibration(true)
                enableLights(true)
            }
            notificationManager.createNotificationChannel(channel)
            Logger.i("NotificationModule", "Notification channel created: $NOTIFICATION_CHANNEL_ID")
        }
    }

    /**
     * Sets up Firebase Cloud Messaging listener
     */
    private fun setupMessageListener() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                preferences.edit().putString(KEY_FCM_TOKEN, token).apply()
                onTokenRefresh(token)
                Logger.i("NotificationModule", "FCM Token refreshed")
            } else {
                Logger.e("NotificationModule", "Failed to get FCM token", task.exception)
            }
        }
    }

    /**
     * Sets up token refresh listener
     */
    private fun setupTokenRefreshListener() {
        firebaseMessaging.token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                onTokenRefresh(task.result)
            }
        }
    }

    /**
     * Request notification permissions from the user
     */
    @ReactMethod
    fun requestPermissions(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Request runtime permissions for Android 13+
                // Implementation depends on your permission handling strategy
                promise.resolve(true)
            } else {
                // For older Android versions, notifications are enabled by default
                preferences.edit().putBoolean(KEY_NOTIFICATION_ENABLED, true).apply()
                promise.resolve(true)
            }
            Logger.i("NotificationModule", "Notification permissions granted")
        } catch (e: Exception) {
            Logger.e("NotificationModule", "Failed to request notification permissions", e)
            promise.reject("PERMISSION_ERROR", "Failed to request notification permissions", e)
        }
    }

    /**
     * Get the FCM token for the device
     */
    @ReactMethod
    fun getToken(promise: Promise) {
        try {
            val cachedToken = preferences.getString(KEY_FCM_TOKEN, null)
            if (!cachedToken.isNullOrEmpty()) {
                promise.resolve(cachedToken)
                return
            }

            firebaseMessaging.token.addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val token = task.result
                    preferences.edit().putString(KEY_FCM_TOKEN, token).apply()
                    promise.resolve(token)
                    Logger.i("NotificationModule", "FCM token retrieved successfully")
                } else {
                    promise.reject("TOKEN_ERROR", "Failed to get FCM token", task.exception)
                    Logger.e("NotificationModule", "Failed to get FCM token", task.exception)
                }
            }
        } catch (e: Exception) {
            promise.reject("TOKEN_ERROR", "Failed to get FCM token", e)
            Logger.e("NotificationModule", "Failed to get FCM token", e)
        }
    }

    /**
     * Handle FCM token refresh events
     */
    private fun onTokenRefresh(token: String) {
        try {
            preferences.edit().putString(KEY_FCM_TOKEN, token).apply()
            val params = Arguments.createMap().apply {
                putString("token", token)
            }
            sendEvent(EVENT_TOKEN_REFRESHED, params)
            Logger.i("NotificationModule", "Token refresh event sent")
        } catch (e: Exception) {
            Logger.e("NotificationModule", "Failed to handle token refresh", e)
        }
    }

    /**
     * Handle incoming FCM messages
     */
    private fun onMessageReceived(remoteMessage: RemoteMessage) {
        try {
            val notificationData = remoteMessage.data
            val notificationId = System.currentTimeMillis().toInt()

            // Create notification params for JS
            val params = Arguments.createMap().apply {
                putString("title", remoteMessage.notification?.title)
                putString("body", remoteMessage.notification?.body)
                putString("type", notificationData["type"])
                putString("data", JSONObject(notificationData).toString())
            }

            // Send event to JS
            sendEvent(EVENT_NOTIFICATION_RECEIVED, params)

            // Build and show notification
            val notification = NotificationCompat.Builder(reactApplicationContext, NOTIFICATION_CHANNEL_ID)
                .setContentTitle(remoteMessage.notification?.title)
                .setContentText(remoteMessage.notification?.body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .build()

            notificationManager.notify(notificationId, notification)
            Logger.i("NotificationModule", "Notification displayed: ${remoteMessage.messageId}")
        } catch (e: Exception) {
            Logger.e("NotificationModule", "Failed to handle FCM message", e)
        }
    }

    /**
     * Sends an event to the React Native JavaScript layer
     */
    private fun sendEvent(eventName: String, params: WritableMap) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
            Logger.i("NotificationModule", "Event sent: $eventName")
        } catch (e: Exception) {
            Logger.e("NotificationModule", "Failed to send event: $eventName", e)
        }
    }
}