package com.fantasygm.assistant.modules.media

import com.facebook.react.ReactPackage // version: 0.72+
import com.facebook.react.bridge.NativeModule // version: 0.72+
import com.facebook.react.bridge.ReactApplicationContext // version: 0.72+
import com.facebook.react.uimanager.ViewManager // version: 0.72+

/**
 * React Native package that registers the MediaProcessorModule for native media processing capabilities.
 * Provides functionality for:
 * - High-quality video generation for trade analysis
 * - Voice synthesis using Eleven Labs integration
 * - Optimized media caching and processing
 */
class MediaProcessorPackage : ReactPackage {

    /**
     * Creates and returns a list of native modules to register with React Native.
     * Instantiates the MediaProcessorModule with the provided React context.
     *
     * @param reactContext The React Native application context
     * @return List containing the MediaProcessorModule instance
     */
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        return listOf(
            MediaProcessorModule(reactContext)
        )
    }

    /**
     * Creates and returns a list of view managers.
     * Returns an empty list as this package only provides native module functionality
     * and does not include any UI components.
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