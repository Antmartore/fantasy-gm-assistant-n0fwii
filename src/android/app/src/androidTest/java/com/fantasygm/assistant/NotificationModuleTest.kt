package com.fantasygm.assistant

import android.app.NotificationManager
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.test.rule.ActivityTestRule
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.RemoteMessage
import com.fantasygm.assistant.modules.notifications.NotificationModule
import com.fantasygm.assistant.modules.notifications.NotificationPackage
import com.fantasygm.assistant.utils.Logger
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.MockitoAnnotations

/**
 * Comprehensive test suite for NotificationModule native module implementation.
 * Tests real-time notifications, push notifications, permission handling, and FCM token management.
 *
 * @version 1.0.0
 */
class NotificationModuleTest {

    companion object {
        private const val MOCK_FCM_TOKEN = "mock_fcm_token_123"
        private const val NOTIFICATION_CHANNEL_ID = "fantasy_gm_notifications"
        private const val EVENT_TOKEN_REFRESH = "onTokenRefreshed"
        private const val EVENT_NOTIFICATION_RECEIVED = "onNotificationReceived"
        private val MOCK_NOTIFICATION_DATA = mapOf(
            "type" to "PLAYER_UPDATE",
            "message" to "Test notification",
            "data" to """{"playerId": "123", "status": "INJURED"}"""
        )
    }

    @get:Rule
    val activityRule = ActivityTestRule(MainActivity::class.java)

    @Mock
    private lateinit var mockReactContext: ReactApplicationContext

    @Mock
    private lateinit var mockFirebaseMessaging: FirebaseMessaging

    @Mock
    private lateinit var mockEventEmitter: DeviceEventManagerModule.RCTDeviceEventEmitter

    @Mock
    private lateinit var mockNotificationManager: NotificationManager

    @Mock
    private lateinit var mockSharedPreferences: SharedPreferences

    @Mock
    private lateinit var mockSharedPreferencesEditor: SharedPreferences.Editor

    private lateinit var notificationModule: NotificationModule

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)

        // Setup mock context
        `when`(mockReactContext.getSystemService(Context.NOTIFICATION_SERVICE))
            .thenReturn(mockNotificationManager)
        `when`(mockReactContext.getSharedPreferences(anyString(), anyInt()))
            .thenReturn(mockSharedPreferences)
        `when`(mockSharedPreferences.edit()).thenReturn(mockSharedPreferencesEditor)
        `when`(mockSharedPreferencesEditor.putString(anyString(), anyString()))
            .thenReturn(mockSharedPreferencesEditor)
        `when`(mockSharedPreferencesEditor.putBoolean(anyString(), anyBoolean()))
            .thenReturn(mockSharedPreferencesEditor)

        // Setup event emitter
        `when`(mockReactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java))
            .thenReturn(mockEventEmitter)

        notificationModule = NotificationModule(mockReactContext)
    }

    @Test
    fun testRequestPermissions() {
        val mockPromise = mock(Promise::class.java)

        // Test permission request on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationModule.requestPermissions(mockPromise)
            verify(mockPromise).resolve(true)
            verify(mockSharedPreferencesEditor).putBoolean("notifications_enabled", true)
        }

        // Test permission request on older Android versions
        else {
            notificationModule.requestPermissions(mockPromise)
            verify(mockPromise).resolve(true)
            verify(mockSharedPreferencesEditor).putBoolean("notifications_enabled", true)
        }

        // Test error handling
        val errorPromise = mock(Promise::class.java)
        `when`(mockSharedPreferencesEditor.putBoolean(anyString(), anyBoolean()))
            .thenThrow(RuntimeException("Test error"))
        
        notificationModule.requestPermissions(errorPromise)
        verify(errorPromise).reject(
            eq("PERMISSION_ERROR"),
            eq("Failed to request notification permissions"),
            any(RuntimeException::class.java)
        )
    }

    @Test
    fun testGetToken() {
        val mockPromise = mock(Promise::class.java)
        val mockTask = mock(com.google.android.gms.tasks.Task::class.java)

        // Test cached token retrieval
        `when`(mockSharedPreferences.getString("fcm_token", null))
            .thenReturn(MOCK_FCM_TOKEN)
        
        notificationModule.getToken(mockPromise)
        verify(mockPromise).resolve(MOCK_FCM_TOKEN)

        // Test new token retrieval
        `when`(mockSharedPreferences.getString("fcm_token", null))
            .thenReturn(null)
        `when`(mockFirebaseMessaging.token).thenReturn(mockTask)
        `when`(mockTask.isSuccessful).thenReturn(true)
        `when`(mockTask.result).thenReturn(MOCK_FCM_TOKEN)

        notificationModule.getToken(mockPromise)
        verify(mockSharedPreferencesEditor).putString("fcm_token", MOCK_FCM_TOKEN)
        verify(mockPromise).resolve(MOCK_FCM_TOKEN)

        // Test error handling
        val errorPromise = mock(Promise::class.java)
        `when`(mockTask.isSuccessful).thenReturn(false)
        `when`(mockTask.exception).thenReturn(RuntimeException("Token error"))

        notificationModule.getToken(errorPromise)
        verify(errorPromise).reject(
            eq("TOKEN_ERROR"),
            eq("Failed to get FCM token"),
            any(RuntimeException::class.java)
        )
    }

    @Test
    fun testNotificationReceived() {
        val mockRemoteMessage = mock(RemoteMessage::class.java)
        val mockNotification = mock(RemoteMessage.Notification::class.java)

        // Setup mock notification data
        `when`(mockRemoteMessage.data).thenReturn(MOCK_NOTIFICATION_DATA)
        `when`(mockRemoteMessage.notification).thenReturn(mockNotification)
        `when`(mockNotification.title).thenReturn("Test Title")
        `when`(mockNotification.body).thenReturn("Test Body")

        // Trigger notification received
        notificationModule.onMessageReceived(mockRemoteMessage)

        // Verify event emission
        verify(mockEventEmitter).emit(eq(EVENT_NOTIFICATION_RECEIVED), any(WritableMap::class.java))

        // Verify notification display
        verify(mockNotificationManager).notify(anyInt(), any())

        // Test error handling
        `when`(mockRemoteMessage.data).thenThrow(RuntimeException("Test error"))
        notificationModule.onMessageReceived(mockRemoteMessage)
        verify(mockEventEmitter, never()).emit(eq(EVENT_NOTIFICATION_RECEIVED), any())
    }

    @Test
    fun testTokenRefresh() {
        val mockWritableMap = Arguments.createMap().apply {
            putString("token", MOCK_FCM_TOKEN)
        }

        // Test successful token refresh
        notificationModule.onNewToken(MOCK_FCM_TOKEN)
        verify(mockSharedPreferencesEditor).putString("fcm_token", MOCK_FCM_TOKEN)
        verify(mockEventEmitter).emit(EVENT_TOKEN_REFRESH, mockWritableMap)

        // Test error handling
        `when`(mockEventEmitter.emit(anyString(), any()))
            .thenThrow(RuntimeException("Event error"))
        
        notificationModule.onNewToken(MOCK_FCM_TOKEN)
        verify(mockSharedPreferencesEditor, times(2)).putString("fcm_token", MOCK_FCM_TOKEN)
    }
}