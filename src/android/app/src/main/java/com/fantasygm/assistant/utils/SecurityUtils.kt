package com.fantasygm.assistant.utils

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.fantasygm.assistant.utils.Constants.API_VERSION
import com.fantasygm.assistant.utils.Constants.ErrorCodes
import java.nio.ByteBuffer
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import java.util.concurrent.TimeUnit

/**
 * Utility object providing security-related functions for the Fantasy GM Assistant.
 * Implements AES-256-GCM encryption, secure token management, and KeyStore operations.
 */
object SecurityUtils {
    private const val KEYSTORE_ALIAS = "fantasy_gm_keystore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val KEY_SIZE = 256
    private const val IV_SIZE = 12
    private const val GCM_TAG_LENGTH = 128
    private const val KEY_ROTATION_INTERVAL = 2592000000L // 30 days in milliseconds

    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply {
        load(null)
    }
    private val secureRandom = SecureRandom.getInstanceStrong()

    /**
     * Object managing Android KeyStore operations with enhanced security
     */
    private object KeyStoreManager {
        private var lastKeyRotation: Long = 0

        fun rotateKey() {
            val currentTime = System.currentTimeMillis()
            if (currentTime - lastKeyRotation >= KEY_ROTATION_INTERVAL) {
                try {
                    // Generate new key with updated parameters
                    val keyGenerator = KeyGenerator.getInstance(
                        KeyProperties.KEY_ALGORITHM_AES,
                        "AndroidKeyStore"
                    )
                    val keySpec = KeyGenParameterSpec.Builder(
                        KEYSTORE_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                    )
                        .setKeySize(KEY_SIZE)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setRandomizedEncryptionRequired(true)
                        .setUserAuthenticationRequired(false)
                        .build()

                    keyGenerator.init(keySpec)
                    keyGenerator.generateKey()
                    lastKeyRotation = currentTime
                } catch (e: Exception) {
                    throw SecurityException("Failed to rotate encryption key: ${e.message}")
                }
            }
        }

        fun getKey(): SecretKey {
            return keyStore.getKey(KEYSTORE_ALIAS, null) as? SecretKey
                ?: generateKey()
        }

        private fun generateKey(): SecretKey {
            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
            )
            val keySpec = KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setKeySize(KEY_SIZE)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(false)
                .build()

            keyGenerator.init(keySpec)
            return keyGenerator.generateKey()
        }
    }

    /**
     * Encrypts sensitive data using AES-256-GCM encryption with integrity verification
     * @param plainText The text to encrypt
     * @return Base64 encoded encrypted data with IV and authentication tag
     */
    @Throws(SecurityException::class)
    fun encryptData(plainText: String): String {
        try {
            val iv = ByteArray(IV_SIZE).apply {
                secureRandom.nextBytes(this)
            }

            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.ENCRYPT_MODE,
                KeyStoreManager.getKey(),
                GCMParameterSpec(GCM_TAG_LENGTH, iv)
            )

            val ciphertext = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
            val combined = ByteBuffer.allocate(iv.size + ciphertext.size)
                .put(iv)
                .put(ciphertext)
                .array()

            return Base64.encodeToString(combined, Base64.NO_WRAP)
        } catch (e: Exception) {
            throw SecurityException("Encryption failed: ${e.message}")
        }
    }

    /**
     * Decrypts AES-256-GCM encrypted data with integrity verification
     * @param encryptedText Base64 encoded encrypted data
     * @return Decrypted plain text
     */
    @Throws(SecurityException::class)
    fun decryptData(encryptedText: String): String {
        try {
            val combined = Base64.decode(encryptedText, Base64.NO_WRAP)
            val iv = combined.copyOfRange(0, IV_SIZE)
            val ciphertext = combined.copyOfRange(IV_SIZE, combined.size)

            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                KeyStoreManager.getKey(),
                GCMParameterSpec(GCM_TAG_LENGTH, iv)
            )

            return String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        } catch (e: Exception) {
            throw SecurityException("Decryption failed: ${e.message}")
        }
    }

    /**
     * Securely stores authentication token with expiry
     * @param token JWT token to store
     */
    @Throws(SecurityException::class)
    fun storeToken(token: String) {
        try {
            if (!token.contains(".") || token.count { it == '.' } != 2) {
                throw SecurityException("Invalid JWT token format")
            }

            val encryptedToken = encryptData(token)
            getSharedPreferences().edit().apply {
                putString("auth_token", encryptedToken)
                putLong("token_timestamp", System.currentTimeMillis())
                apply()
            }

            // Check for key rotation
            KeyStoreManager.rotateKey()
        } catch (e: Exception) {
            throw SecurityException("Failed to store token: ${e.message}")
        }
    }

    /**
     * Retrieves and validates stored authentication token
     * @return Decrypted token or null if not found/expired
     */
    fun getStoredToken(): String? {
        try {
            val prefs = getSharedPreferences()
            val encryptedToken = prefs.getString("auth_token", null) ?: return null
            val timestamp = prefs.getLong("token_timestamp", 0)

            // Check token age
            if (System.currentTimeMillis() - timestamp > TimeUnit.HOURS.toMillis(1)) {
                clearSecureStorage()
                return null
            }

            return decryptData(encryptedToken)
        } catch (e: Exception) {
            clearSecureStorage()
            return null
        }
    }

    /**
     * Securely clears all stored data and keys
     */
    fun clearSecureStorage() {
        try {
            // Securely clear SharedPreferences
            getSharedPreferences().edit().apply {
                clear()
                apply()
            }

            // Remove KeyStore entries
            keyStore.deleteEntry(KEYSTORE_ALIAS)
        } catch (e: Exception) {
            throw SecurityException("Failed to clear secure storage: ${e.message}")
        }
    }

    /**
     * Gets the application's SharedPreferences instance
     */
    private fun getSharedPreferences() = android.preference.PreferenceManager
        .getDefaultSharedPreferences(android.app.Application.getAppContext())
}