//
// AuthenticationTests.swift
// FantasyGMAssistantTests
//
// Comprehensive test suite for Firebase Authentication functionality
// Version: 1.0.0
//

import XCTest // iOS 14.0+
import FirebaseAuth // 10.0.0+
@testable import FantasyGMAssistant

class AuthenticationTests: XCTestCase {
    
    // MARK: - Properties
    private var authManager: FirebaseAuthManager!
    private var mockFirebaseAuth: Auth!
    private var expectation: XCTestExpectation!
    private var testUser: User?
    
    // MARK: - Test Constants
    private let TEST_EMAIL = "test@example.com"
    private let TEST_PASSWORD = "TestPassword123!"
    private let TEST_TIMEOUT: TimeInterval = 5.0
    private let TEST_MFA_CODE = "123456"
    private let MAX_RETRY_ATTEMPTS = 3
    
    // MARK: - Setup & Teardown
    override func setUp() {
        super.setUp()
        
        // Configure mock Firebase Auth
        mockFirebaseAuth = Auth.auth()
        authManager = FirebaseAuthManager()
        expectation = nil
        testUser = nil
        
        // Reset rate limiter and token cache
        authManager.perform(Selector(("clearTokenCache")))
        authManager.perform(Selector(("resetRateLimiter")))
    }
    
    override func tearDown() {
        // Sign out and clean up
        try? mockFirebaseAuth.signOut()
        authManager = nil
        mockFirebaseAuth = nil
        expectation = nil
        testUser = nil
        super.tearDown()
    }
    
    // MARK: - Email Authentication Tests
    func testEmailSignIn() {
        expectation = expectation(description: "Email sign in")
        
        authManager.signInWithEmail(TEST_EMAIL, password: TEST_PASSWORD) { result in
            XCTAssertNotNil(result)
            XCTAssertNotNil(result["uid"])
            XCTAssertEqual(result["email"] as? String, self.TEST_EMAIL)
            XCTAssertNotNil(result["token"])
            XCTAssertTrue(result["emailVerified"] as? Bool ?? false)
            
            // Validate token format
            let token = result["token"] as? String
            XCTAssertTrue(token?.components(separatedBy: ".").count == 3)
            
            self.expectation.fulfill()
        } reject: { code, message, error in
            XCTFail("Sign in failed: \(message)")
            self.expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    func testInvalidCredentials() {
        expectation = expectation(description: "Invalid credentials")
        
        authManager.signInWithEmail(TEST_EMAIL, password: "wrong_password") { result in
            XCTFail("Sign in should fail with invalid credentials")
            self.expectation.fulfill()
        } reject: { code, message, error in
            XCTAssertEqual(code, "1001")
            XCTAssertEqual(message, "Invalid email or password")
            self.expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    // MARK: - MFA Tests
    func testMFAFlow() {
        expectation = expectation(description: "MFA flow")
        
        // First attempt sign in to trigger MFA
        authManager.signInWithEmail(TEST_EMAIL, password: TEST_PASSWORD) { _ in
            XCTFail("Sign in should require MFA")
            self.expectation.fulfill()
        } reject: { code, message, error in
            XCTAssertEqual(code, "1006")
            XCTAssertEqual(message, "Multi-factor authentication required")
            
            // Verify MFA code
            self.authManager.verifyMFACode(self.TEST_MFA_CODE) { result in
                XCTAssertNotNil(result)
                XCTAssertNotNil(result["token"])
                self.expectation.fulfill()
            } reject: { code, message, error in
                XCTFail("MFA verification failed: \(message)")
                self.expectation.fulfill()
            }
        }
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    // MARK: - Rate Limiting Tests
    func testRateLimiting() {
        expectation = expectation(description: "Rate limiting")
        var attempts = 0
        
        // Attempt multiple rapid sign-ins
        func attemptSignIn() {
            authManager.signInWithEmail(TEST_EMAIL, password: "wrong_password") { _ in
                XCTFail("Sign in should fail")
                attempts += 1
                if attempts >= self.MAX_RETRY_ATTEMPTS {
                    self.expectation.fulfill()
                } else {
                    attemptSignIn()
                }
            } reject: { code, message, error in
                attempts += 1
                if attempts >= self.MAX_RETRY_ATTEMPTS {
                    XCTAssertEqual(code, "1009")
                    XCTAssertEqual(message, "Too many login attempts, please try again later")
                    self.expectation.fulfill()
                } else {
                    attemptSignIn()
                }
            }
        }
        
        attemptSignIn()
        wait(for: [expectation], timeout: TEST_TIMEOUT * Double(MAX_RETRY_ATTEMPTS))
    }
    
    // MARK: - Token Management Tests
    func testTokenRefresh() {
        expectation = expectation(description: "Token refresh")
        
        // First sign in to get initial token
        authManager.signInWithEmail(TEST_EMAIL, password: TEST_PASSWORD) { result in
            let initialToken = result["token"] as? String
            XCTAssertNotNil(initialToken)
            
            // Attempt token refresh
            self.authManager.refreshToken { refreshResult in
                XCTAssertNotNil(refreshResult)
                let newToken = refreshResult["token"] as? String
                XCTAssertNotNil(newToken)
                XCTAssertNotEqual(initialToken, newToken)
                
                // Verify token expiration
                let expiresIn = refreshResult["expiresIn"] as? TimeInterval
                XCTAssertNotNil(expiresIn)
                XCTAssertGreaterThan(expiresIn ?? 0, 0)
                
                self.expectation.fulfill()
            } reject: { code, message, error in
                XCTFail("Token refresh failed: \(message)")
                self.expectation.fulfill()
            }
        } reject: { code, message, error in
            XCTFail("Initial sign in failed: \(message)")
            self.expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    // MARK: - User Role Tests
    func testUserRoles() {
        expectation = expectation(description: "User roles")
        
        authManager.signInWithEmail(TEST_EMAIL, password: TEST_PASSWORD) { result in
            // Get ID token to check claims
            self.mockFirebaseAuth.currentUser?.getIDTokenResult(forcingRefresh: true) { tokenResult, error in
                XCTAssertNil(error)
                XCTAssertNotNil(tokenResult)
                
                // Verify role claim exists
                let role = tokenResult?.claims["role"] as? String
                XCTAssertNotNil(role)
                XCTAssertTrue(["free", "premium", "admin"].contains(role ?? ""))
                
                self.expectation.fulfill()
            }
        } reject: { code, message, error in
            XCTFail("Sign in failed: \(message)")
            self.expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    // MARK: - Security Tests
    func testDeviceTrust() {
        expectation = expectation(description: "Device trust")
        
        // Clear device trust token to simulate untrusted device
        KeychainWrapper.standard.removeObject(forKey: "device_trust_token")
        
        authManager.signInWithEmail(TEST_EMAIL, password: TEST_PASSWORD) { _ in
            XCTFail("Sign in should fail on untrusted device")
            self.expectation.fulfill()
        } reject: { code, message, error in
            XCTAssertEqual(code, "1011")
            XCTAssertEqual(message, "Device not trusted")
            self.expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    func testSessionValidation() {
        expectation = expectation(description: "Session validation")
        
        authManager.signInWithEmail(TEST_EMAIL, password: TEST_PASSWORD) { result in
            // Simulate token expiration
            self.mockFirebaseAuth.currentUser?.getIDTokenResult(forcingRefresh: true) { tokenResult, error in
                XCTAssertNil(error)
                XCTAssertNotNil(tokenResult)
                
                // Verify session is validated
                let validateSelector = Selector(("validateSession:"))
                if self.authManager.responds(to: validateSelector) {
                    self.authManager.perform(validateSelector, with: self.mockFirebaseAuth.currentUser)
                    
                    // Session should remain valid
                    XCTAssertNotNil(self.mockFirebaseAuth.currentUser)
                    self.expectation.fulfill()
                } else {
                    XCTFail("Session validation method not found")
                    self.expectation.fulfill()
                }
            }
        } reject: { code, message, error in
            XCTFail("Sign in failed: \(message)")
            self.expectation.fulfill()
        }
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
}