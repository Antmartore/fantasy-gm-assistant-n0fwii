package com.fantasygm.assistant.modules.auth

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.MultiFactorResolver
import com.google.firebase.auth.PhoneMultiFactorGenerator
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import org.springframework.security.access.annotation.Secured
import com.fantasygm.assistant.utils.Constants.ApiEndpoints
import com.fantasygm.assistant.utils.Logger
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.tasks.await

/**
 * Enhanced Firebase Authentication module providing secure authentication with MFA support,
 * JWT token management, and RBAC integration for the Fantasy GM Assistant application.
 *
 * @property auth Firebase Authentication instance
 * @property reactContext React Native application context
 */
class FirebaseAuthModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "FirebaseAuthModule"
        private const val TOKEN_EXPIRY_HOURS = 1L
        private const val MFA_CODE_LENGTH = 6
        private const val MAX_RETRY_ATTEMPTS = 3
    }

    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
    private var multiFactorResolver: MultiFactorResolver? = null
    private val algorithm = Algorithm.HMAC256(BuildConfig.JWT_SECRET)

    override fun getName(): String = "FirebaseAuthModule"

    /**
     * Initialize the module and set up auth state listeners
     */
    init {
        auth.addAuthStateListener { firebaseAuth ->
            firebaseAuth.currentUser?.let { user ->
                Logger.d(TAG, "Auth state changed for user: ${user.uid}")
                monitorTokenRefresh(user)
            }
        }
    }

    /**
     * Authenticate user with MFA support
     * Handles the complete authentication flow including MFA challenges
     *
     * @param email User's email address
     * @param password User's password
     * @param mfaCode Optional MFA verification code
     * @param promise Promise to resolve with auth result
     */
    @ReactMethod
    fun signInWithMFA(
        email: String,
        password: String,
        mfaCode: String?,
        promise: Promise
    ) {
        try {
            // Input validation
            if (email.isEmpty() || password.isEmpty()) {
                throw IllegalArgumentException("Email and password are required")
            }

            // Start authentication flow
            auth.signInWithEmailAndPassword(email, password)
                .addOnCompleteListener { task ->
                    when {
                        task.isSuccessful -> {
                            val user = task.result?.user
                            if (user != null) {
                                handleSuccessfulAuth(user, promise)
                            } else {
                                promise.reject("AUTH_ERROR", "Authentication failed")
                            }
                        }
                        task.exception is FirebaseAuthMultiFactorException -> {
                            handleMFAChallenge(task.exception as FirebaseAuthMultiFactorException, mfaCode, promise)
                        }
                        else -> {
                            Logger.e(TAG, "Authentication failed", task.exception)
                            promise.reject("AUTH_ERROR", task.exception)
                        }
                    }
                }
        } catch (e: Exception) {
            Logger.e(TAG, "Sign in error", e)
            promise.reject("AUTH_ERROR", e)
        }
    }

    /**
     * Refresh authentication token with security validation
     *
     * @param promise Promise to resolve with new token
     */
    @ReactMethod
    fun refreshToken(promise: Promise) {
        val user = auth.currentUser
        if (user == null) {
            promise.reject("AUTH_ERROR", "No authenticated user")
            return
        }

        user.getIdToken(true)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val token = task.result?.token
                    if (validateToken(token)) {
                        val response = createAuthResponse(user, token)
                        Logger.logAuthEvent("token_refresh_success", user.uid)
                        promise.resolve(response)
                    } else {
                        promise.reject("TOKEN_ERROR", "Invalid token")
                    }
                } else {
                    Logger.e(TAG, "Token refresh failed", task.exception)
                    promise.reject("TOKEN_ERROR", task.exception)
                }
            }
    }

    /**
     * Handle MFA challenge during authentication
     */
    private fun handleMFAChallenge(
        exception: FirebaseAuthMultiFactorException,
        mfaCode: String?,
        promise: Promise
    ) {
        try {
            multiFactorResolver = exception.resolver

            if (mfaCode == null) {
                // Send MFA challenge to user
                val session = multiFactorResolver?.session
                promise.reject("MFA_REQUIRED", "MFA verification required")
                return
            }

            if (mfaCode.length != MFA_CODE_LENGTH) {
                promise.reject("MFA_ERROR", "Invalid MFA code length")
                return
            }

            // Verify MFA code
            val credential = PhoneMultiFactorGenerator
                .getCredential(mfaCode)

            multiFactorResolver?.resolveSignIn(credential)
                ?.addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        val user = auth.currentUser
                        if (user != null) {
                            handleSuccessfulAuth(user, promise)
                        } else {
                            promise.reject("AUTH_ERROR", "Authentication failed after MFA")
                        }
                    } else {
                        Logger.e(TAG, "MFA verification failed", task.exception)
                        promise.reject("MFA_ERROR", task.exception)
                    }
                }
        } catch (e: Exception) {
            Logger.e(TAG, "MFA handling error", e)
            promise.reject("MFA_ERROR", e)
        }
    }

    /**
     * Handle successful authentication and create secure session
     */
    private fun handleSuccessfulAuth(user: FirebaseUser, promise: Promise) {
        user.getIdToken(true)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val token = task.result?.token
                    if (validateToken(token)) {
                        val response = createAuthResponse(user, token)
                        Logger.logAuthEvent("auth_success", user.uid)
                        promise.resolve(response)
                    } else {
                        promise.reject("TOKEN_ERROR", "Invalid token")
                    }
                } else {
                    Logger.e(TAG, "Token generation failed", task.exception)
                    promise.reject("TOKEN_ERROR", task.exception)
                }
            }
    }

    /**
     * Validate JWT token security requirements
     */
    private fun validateToken(token: String?): Boolean {
        if (token == null) return false
        
        try {
            val decodedJWT = JWT.decode(token)
            
            // Verify token hasn't expired
            if (decodedJWT.expiresAt?.before(java.util.Date()) == true) {
                return false
            }

            // Verify required claims
            if (decodedJWT.getClaim("uid").isNull || 
                decodedJWT.getClaim("email").isNull) {
                return false
            }

            return true
        } catch (e: Exception) {
            Logger.e(TAG, "Token validation failed", e)
            return false
        }
    }

    /**
     * Create secure authentication response with user data and token
     */
    private fun createAuthResponse(user: FirebaseUser, token: String?): WritableMap {
        return Arguments.createMap().apply {
            putString("uid", user.uid)
            putString("email", user.email)
            putString("token", token)
            putBoolean("emailVerified", user.isEmailVerified)
            putString("createdAt", user.metadata?.creationTimestamp?.toString())
            putString("lastLoginAt", user.metadata?.lastSignInTimestamp?.toString())
        }
    }

    /**
     * Monitor token refresh requirements
     */
    private fun monitorTokenRefresh(user: FirebaseUser) {
        user.getIdToken(false)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val token = task.result?.token
                    if (token != null) {
                        val decodedJWT = JWT.decode(token)
                        val expiresAt = decodedJWT.expiresAt
                        
                        if (expiresAt != null) {
                            val timeToExpiry = expiresAt.time - System.currentTimeMillis()
                            if (timeToExpiry < TimeUnit.MINUTES.toMillis(5)) {
                                refreshToken(Promise())
                            }
                        }
                    }
                }
            }
    }
}