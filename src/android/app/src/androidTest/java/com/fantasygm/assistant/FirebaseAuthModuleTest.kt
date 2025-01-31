package com.fantasygm.assistant

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fantasygm.assistant.modules.auth.FirebaseAuthModule
import com.fantasygm.assistant.utils.SecurityUtils
import com.fantasygm.assistant.utils.Logger
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.MultiFactorResolver
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.Mockito
import org.mockito.junit.MockitoJUnit
import org.mockito.junit.MockitoRule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.auth0.jwt.JWT
import java.util.Date
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class FirebaseAuthModuleTest {

    @get:Rule
    val mockitoRule: MockitoRule = MockitoJUnit.rule()

    @Mock
    private lateinit var firebaseAuth: FirebaseAuth

    @Mock
    private lateinit var firebaseUser: FirebaseUser

    @Mock
    private lateinit var multiFactorResolver: MultiFactorResolver

    private lateinit var context: ReactApplicationContext
    private lateinit var authModule: FirebaseAuthModule
    private lateinit var securityUtils: SecurityUtils
    private lateinit var testPromise: Promise

    companion object {
        private const val TEST_EMAIL = "test@example.com"
        private const val TEST_PASSWORD = "TestPassword123!"
        private const val TEST_MFA_CODE = "123456"
        private const val TEST_UID = "test_uid_123"
        private val TEST_ROLES = arrayOf("USER", "PREMIUM")
    }

    @Before
    fun setup() {
        // Initialize test context
        context = ReactApplicationContext(InstrumentationRegistry.getInstrumentation().targetContext)
        
        // Initialize auth module with mocked Firebase Auth
        Mockito.`when`(firebaseAuth.currentUser).thenReturn(firebaseUser)
        authModule = FirebaseAuthModule(context)
        
        // Setup test promise
        testPromise = object : Promise {
            override fun resolve(value: Any?) {}
            override fun reject(code: String, message: String) {}
            override fun reject(code: String, throwable: Throwable) {}
            override fun reject(code: String, message: String, throwable: Throwable) {}
        }

        // Clear any existing auth state
        SecurityUtils.clearSecureStorage()
        
        // Setup basic user mock responses
        Mockito.`when`(firebaseUser.uid).thenReturn(TEST_UID)
        Mockito.`when`(firebaseUser.email).thenReturn(TEST_EMAIL)
        Mockito.`when`(firebaseUser.isEmailVerified).thenReturn(true)
    }

    @Test
    fun testEmailPasswordSignIn() {
        // Setup test JWT token
        val testToken = createTestJWT()
        Mockito.`when`(firebaseUser.getIdToken(true))
            .thenReturn(Tasks.forResult(GetTokenResult(testToken)))

        // Test sign in
        var authResult: WritableMap? = null
        val promise = object : Promise {
            override fun resolve(value: Any?) {
                authResult = value as WritableMap
            }
            override fun reject(code: String, message: String) {
                fail("Sign in should not fail")
            }
            override fun reject(code: String, throwable: Throwable) {
                fail("Sign in should not fail")
            }
            override fun reject(code: String, message: String, throwable: Throwable) {
                fail("Sign in should not fail")
            }
        }

        authModule.signInWithMFA(TEST_EMAIL, TEST_PASSWORD, null, promise)

        // Verify auth result
        assertNotNull(authResult)
        assertEquals(TEST_UID, authResult?.getString("uid"))
        assertEquals(TEST_EMAIL, authResult?.getString("email"))
        assertTrue(authResult?.getBoolean("emailVerified") == true)
        
        // Verify token storage
        val storedToken = SecurityUtils.getStoredToken()
        assertNotNull(storedToken)
        assertEquals(testToken, storedToken)
    }

    @Test
    fun testMFAAuthentication() {
        // Setup MFA challenge
        val mfaException = Mockito.mock(FirebaseAuthMultiFactorException::class.java)
        Mockito.`when`(mfaException.resolver).thenReturn(multiFactorResolver)

        // Test initial sign in triggering MFA
        var mfaRequired = false
        val initialPromise = object : Promise {
            override fun reject(code: String, message: String) {
                if (code == "MFA_REQUIRED") mfaRequired = true
            }
            override fun resolve(value: Any?) {
                fail("Should require MFA")
            }
            override fun reject(code: String, throwable: Throwable) {}
            override fun reject(code: String, message: String, throwable: Throwable) {}
        }

        authModule.signInWithMFA(TEST_EMAIL, TEST_PASSWORD, null, initialPromise)
        assertTrue(mfaRequired)

        // Test MFA completion
        val testToken = createTestJWT()
        Mockito.`when`(firebaseUser.getIdToken(true))
            .thenReturn(Tasks.forResult(GetTokenResult(testToken)))

        var authResult: WritableMap? = null
        val mfaPromise = object : Promise {
            override fun resolve(value: Any?) {
                authResult = value as WritableMap
            }
            override fun reject(code: String, message: String) {
                fail("MFA completion should not fail")
            }
            override fun reject(code: String, throwable: Throwable) {
                fail("MFA completion should not fail")
            }
            override fun reject(code: String, message: String, throwable: Throwable) {
                fail("MFA completion should not fail")
            }
        }

        authModule.signInWithMFA(TEST_EMAIL, TEST_PASSWORD, TEST_MFA_CODE, mfaPromise)

        // Verify MFA auth result
        assertNotNull(authResult)
        assertEquals(TEST_UID, authResult?.getString("uid"))
        assertTrue(authResult?.getBoolean("emailVerified") == true)
    }

    @Test
    fun testTokenRefreshAndValidation() {
        // Setup initial token
        val initialToken = createTestJWT()
        Mockito.`when`(firebaseUser.getIdToken(true))
            .thenReturn(Tasks.forResult(GetTokenResult(initialToken)))

        // Store initial token
        SecurityUtils.storeToken(initialToken)

        // Setup expired token scenario
        val expiredToken = createTestJWT(expired = true)
        Mockito.`when`(firebaseUser.getIdToken(false))
            .thenReturn(Tasks.forResult(GetTokenResult(expiredToken)))

        // Test token refresh
        val newToken = createTestJWT()
        Mockito.`when`(firebaseUser.getIdToken(true))
            .thenReturn(Tasks.forResult(GetTokenResult(newToken)))

        var refreshedToken: String? = null
        val promise = object : Promise {
            override fun resolve(value: Any?) {
                val result = value as WritableMap
                refreshedToken = result.getString("token")
            }
            override fun reject(code: String, message: String) {
                fail("Token refresh should not fail")
            }
            override fun reject(code: String, throwable: Throwable) {
                fail("Token refresh should not fail")
            }
            override fun reject(code: String, message: String, throwable: Throwable) {
                fail("Token refresh should not fail")
            }
        }

        authModule.refreshToken(promise)

        // Verify token refresh
        assertNotNull(refreshedToken)
        assertEquals(newToken, refreshedToken)
        
        // Verify stored token was updated
        val storedToken = SecurityUtils.getStoredToken()
        assertEquals(newToken, storedToken)
    }

    @Test
    fun testRBACValidation() {
        // Setup test JWT with roles
        val testToken = createTestJWT(roles = TEST_ROLES)
        Mockito.`when`(firebaseUser.getIdToken(true))
            .thenReturn(Tasks.forResult(GetTokenResult(testToken)))

        var authResult: WritableMap? = null
        val promise = object : Promise {
            override fun resolve(value: Any?) {
                authResult = value as WritableMap
            }
            override fun reject(code: String, message: String) {
                fail("RBAC validation should not fail")
            }
            override fun reject(code: String, throwable: Throwable) {
                fail("RBAC validation should not fail")
            }
            override fun reject(code: String, message: String, throwable: Throwable) {
                fail("RBAC validation should not fail")
            }
        }

        authModule.signInWithMFA(TEST_EMAIL, TEST_PASSWORD, null, promise)

        // Verify role claims
        assertNotNull(authResult)
        val decodedJWT = JWT.decode(authResult?.getString("token"))
        val roles = decodedJWT.getClaim("roles").asList(String::class.java)
        assertArrayEquals(TEST_ROLES, roles.toTypedArray())
    }

    private fun createTestJWT(
        expired: Boolean = false,
        roles: Array<String> = emptyArray()
    ): String {
        val now = System.currentTimeMillis()
        return JWT.create()
            .withSubject(TEST_UID)
            .withClaim("uid", TEST_UID)
            .withClaim("email", TEST_EMAIL)
            .withClaim("roles", roles.toList())
            .withIssuedAt(Date(now))
            .withExpiresAt(
                Date(now + if (expired) -TimeUnit.HOURS.toMillis(2)
                else TimeUnit.HOURS.toMillis(1))
            )
            .sign(Algorithm.HMAC256("test_secret"))
    }
}