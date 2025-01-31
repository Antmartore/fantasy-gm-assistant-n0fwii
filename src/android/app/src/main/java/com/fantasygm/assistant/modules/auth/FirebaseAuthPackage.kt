package com.fantasygm.assistant.modules.auth

import com.facebook.react.ReactPackage // version: 0.72.0
import com.facebook.react.bridge.NativeModule // version: 0.72.0
import com.facebook.react.bridge.ReactApplicationContext // version: 0.72.0
import com.facebook.react.uimanager.ViewManager // version: 0.72.0
import com.fantasygm.assistant.utils.Logger
import java.util.ArrayList
import javax.inject.Singleton

/**
 * React Native package that registers the Firebase Authentication native module
 * with thread-safe initialization and proper error handling.
 *
 * This package provides secure user authentication capabilities including:
 * - OAuth provider integration
 * - Multi-factor authentication
 * - JWT token management
 * - Role-based access control
 */
@Singleton
class FirebaseAuthPackage : ReactPackage {

    companion object {
        private const val TAG = "FirebaseAuthPackage"
    }

    // Thread-safe singleton instance of the auth module
    @Volatile
    private var moduleInstance: FirebaseAuthModule? = null

    /**
     * Creates and returns a list of native modules to register with the React Native runtime.
     * Ensures thread-safe initialization of the Firebase Authentication module.
     *
     * @param reactContext The React Native application context
     * @return List containing the Firebase Authentication module
     */
    @Synchronized
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        try {
            Logger.d(TAG, "Initializing Firebase Auth native module")
            
            val modules = ArrayList<NativeModule>()

            // Thread-safe double-checked locking pattern for singleton initialization
            moduleInstance?.let {
                modules.add(it)
            } ?: run {
                synchronized(this) {
                    moduleInstance?.let {
                        modules.add(it)
                    } ?: run {
                        // Create new module instance if null
                        FirebaseAuthModule(reactContext).also { module ->
                            moduleInstance = module
                            modules.add(module)
                        }
                    }
                }
            }

            Logger.i(TAG, "Successfully created Firebase Auth native module")
            return modules

        } catch (e: Exception) {
            Logger.e(TAG, "Failed to create Firebase Auth native module", e)
            // Return empty list on initialization failure to prevent app crash
            return ArrayList()
        }
    }

    /**
     * Creates and returns a list of view managers.
     * This package doesn't require any view managers, so returns an empty list.
     *
     * @param reactContext The React Native application context
     * @return Empty list as no view managers are needed
     */
    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return ArrayList()
    }
}