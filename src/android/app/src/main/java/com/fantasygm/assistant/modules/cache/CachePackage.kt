package com.fantasygm.assistant.modules.cache

import com.facebook.react.ReactPackage // version: 0.72+
import com.facebook.react.bridge.ReactApplicationContext // version: 0.72+
import com.facebook.react.bridge.NativeModule // version: 0.72+
import com.facebook.react.uimanager.ViewManager // version: 0.72+

/**
 * React Native package that registers the CacheModule with the React Native runtime.
 * Provides efficient local caching functionality with TTL-based expiration:
 * - Player stats: 15 minutes
 * - Weather data: 1 hour
 * - Trade analysis: 24 hours
 * - Video content: 7 days
 */
class CachePackage : ReactPackage {

    /**
     * Creates and returns a list containing the CacheModule instance.
     * The CacheModule provides secure, performant caching with configurable TTL values
     * to meet the 95% sub-2-second response requirement.
     *
     * @param reactContext The React Native application context
     * @return List containing the configured CacheModule instance
     */
    override fun createNativeModules(reactContext: ReactApplicationContext): 
            List<NativeModule> {
        return listOf(CacheModule(reactContext))
    }

    /**
     * Creates and returns an empty list of ViewManagers as this package
     * only provides caching functionality without any UI components.
     *
     * @param reactContext The React Native application context
     * @return Empty list since no view managers are needed
     */
    override fun createViewManagers(reactContext: ReactApplicationContext): 
            List<ViewManager<*, *>> {
        return emptyList()
    }
}