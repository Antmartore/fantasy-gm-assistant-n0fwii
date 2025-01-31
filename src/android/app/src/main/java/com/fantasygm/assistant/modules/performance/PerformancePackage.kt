package com.fantasygm.assistant.modules.performance

import com.facebook.react.ReactPackage // version: 0.72.0
import com.facebook.react.bridge.NativeModule // version: 0.72.0
import com.facebook.react.bridge.ReactApplicationContext // version: 0.72.0
import com.facebook.react.uimanager.ViewManager // version: 0.72.0
import com.fantasygm.assistant.modules.performance.PerformanceModule
import com.fantasygm.assistant.utils.Logger

/**
 * React Native package implementation for registering performance monitoring
 * and optimization native modules. Integrates with DataDog monitoring to ensure
 * sub-2-second AI recommendation delivery and overall app performance tracking.
 */
class PerformancePackage : ReactPackage {

    private val TAG = "PerformancePackage"

    init {
        Logger.i(TAG, "Initializing PerformancePackage")
    }

    /**
     * Creates and returns a list of native modules to register with React Native.
     * Specifically registers the PerformanceModule for monitoring and optimization.
     *
     * @param reactContext The React Native application context
     * @return List containing the PerformanceModule instance
     */
    override fun createNativeModules(reactContext: ReactApplicationContext): 
            List<NativeModule> {
        Logger.d(TAG, "Creating native modules for performance monitoring")
        
        return listOf(
            PerformanceModule(reactContext)
        ).also {
            Logger.i(TAG, "Performance monitoring modules created successfully")
        }
    }

    /**
     * Creates an empty list of view managers as this package focuses on
     * performance monitoring without UI components.
     *
     * @param reactContext The React Native application context
     * @return Empty list since no view managers are needed
     */
    override fun createViewManagers(reactContext: ReactApplicationContext):
            List<ViewManager<*, *>> {
        // No view managers needed for performance monitoring
        return emptyList()
    }
}