package com.fantasygm.assistant.modules.notifications

import com.facebook.react.ReactPackage // version: 0.72.0
import com.facebook.react.bridge.NativeModule // version: 0.72.0
import com.facebook.react.bridge.ReactApplicationContext // version: 0.72.0
import com.facebook.react.uimanager.ViewManager // version: 0.72.0
import com.fantasygm.assistant.utils.Logger

/**
 * React Native package implementation for registering the notification native module.
 * Enables real-time notifications, push alerts, and WebSocket event handling for
 * fantasy sports updates including player updates, trade proposals, and simulation progress.
 *
 * @version 1.0.0
 */
class NotificationPackage : ReactPackage {

    /**
     * Creates and returns a list containing the NotificationModule instance
     * which handles all notification and real-time update functionality.
     *
     * @param reactContext The React Native application context
     * @return List containing the configured NotificationModule
     */
    override fun createNativeModules(reactContext: ReactApplicationContext): 
            List<NativeModule> {
        Logger.d("NotificationPackage", "Creating NotificationModule")
        
        return mutableListOf<NativeModule>().apply {
            add(NotificationModule(reactContext))
        }.also {
            Logger.i("NotificationPackage", "NotificationModule registered successfully")
        }
    }

    /**
     * Creates an empty list of view managers as this package only handles
     * background notification functionality without UI components.
     *
     * @param reactContext The React Native application context
     * @return Empty list since no view managers are needed
     */
    override fun createViewManagers(reactContext: ReactApplicationContext): 
            List<ViewManager<*, *>> {
        return emptyList()
    }
}