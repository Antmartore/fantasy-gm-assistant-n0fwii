package com.fantasygm.assistant.modules.analytics

import com.facebook.react.ReactPackage // version: 0.72.4
import com.facebook.react.bridge.NativeModule // version: 0.72.4
import com.facebook.react.bridge.ReactApplicationContext // version: 0.72.4
import com.facebook.react.uimanager.ViewManager // version: 0.72.4
import com.fantasygm.assistant.utils.Logger

/**
 * React Native package that registers the AnalyticsModule for native analytics functionality.
 * Provides thread-safe module registration and environment-aware configuration for tracking
 * user analytics and performance metrics through DataDog integration.
 */
class AnalyticsPackage : ReactPackage {

    companion object {
        private const val TAG = "AnalyticsPackage"
        private const val MODULE_CAPACITY = 1 // Initial capacity for module list
    }

    init {
        Logger.d(TAG, "Initializing AnalyticsPackage")
    }

    /**
     * Creates and returns a list of native modules to be registered with React Native.
     * Implements thread-safe module instantiation with comprehensive error handling.
     *
     * @param reactContext The React Native application context
     * @return List containing the AnalyticsModule instance configured for the current environment
     */
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        try {
            Logger.d(TAG, "Creating native modules")

            // Validate context
            requireNotNull(reactContext) { "ReactApplicationContext cannot be null" }

            // Create list with initial capacity
            val modules = ArrayList<NativeModule>(MODULE_CAPACITY)

            // Thread-safe module instantiation
            synchronized(this) {
                val analyticsModule = AnalyticsModule(reactContext)
                modules.add(analyticsModule)
            }

            Logger.d(TAG, "Successfully registered AnalyticsModule")
            return modules

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to create native modules", e)
            // Return empty list on error to prevent app crash
            return emptyList()
        }
    }

    /**
     * Creates and returns a list of view managers.
     * Returns empty list as this package doesn't provide any UI components.
     *
     * @param reactContext The React Native application context
     * @return Empty list as no view managers are needed
     */
    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> {
        return emptyList()
    }
}