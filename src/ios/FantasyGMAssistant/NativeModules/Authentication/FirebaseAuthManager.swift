//
// FirebaseAuthManager.swift
// FantasyGMAssistant
//
// Enhanced Firebase Authentication manager with comprehensive security features
// Version: 1.0.0
//

import Foundation // iOS 14.0+
import FirebaseAuth // 10.0.0+
import GoogleSignIn // 7.0.0+
import React // 0.72+
import CryptoKit // iOS 14.0+

// MARK: - Constants
private let AUTH_ERROR_DOMAIN = "com.fantasygm.assistant.auth"
private let AUTH_QUEUE = DispatchQueue(label: "com.fantasygm.assistant.auth", qos: .userInitiated)
private let TOKEN_REFRESH_THRESHOLD: TimeInterval = 300 // 5 minutes before expiry
private let MAX_LOGIN_ATTEMPTS = 5
private let RATE_LIMIT_RESET: TimeInterval = 300 // 5 minutes

// MARK: - AuthError Enumeration
@objc enum AuthError: Int, Error {
    case invalidCredentials = 1001
    case networkError = 1002
    case userNotFound = 1003
    case emailInUse = 1004
    case weakPassword = 1005
    case mfaRequired = 1006
    case providerError = 1007
    case tokenExpired = 1008
    case rateLimitExceeded = 1009
    case suspiciousActivity = 1010
    case deviceNotTrusted = 1011
    
    var localizedDescription: String {
        switch self {
        case .invalidCredentials: return "Invalid email or password"
        case .networkError: return "Network connection error"
        case .userNotFound: return "User not found"
        case .emailInUse: return "Email already in use"
        case .weakPassword: return "Password does not meet security requirements"
        case .mfaRequired: return "Multi-factor authentication required"
        case .providerError: return "Authentication provider error"
        case .tokenExpired: return "Session expired, please login again"
        case .rateLimitExceeded: return "Too many login attempts, please try again later"
        case .suspiciousActivity: return "Suspicious activity detected"
        case .deviceNotTrusted: return "Device not trusted"
        }
    }
}

// MARK: - FirebaseAuthManager Class
@objc(FirebaseAuthManager)
class FirebaseAuthManager: NSObject {
    
    // MARK: - Properties
    private let auth: Auth
    private var currentUser: User?
    private let authQueue: DispatchQueue
    private var deviceFingerprint: String
    private var rateLimiter: [String: (attempts: Int, lastAttempt: Date)]
    private var tokenCache: [String: (token: String, expiry: Date)]
    
    // MARK: - Initialization
    override init() {
        self.auth = Auth.auth()
        self.authQueue = AUTH_QUEUE
        self.rateLimiter = [:]
        self.tokenCache = [:]
        
        // Generate device fingerprint
        let deviceData = "\(UIDevice.current.identifierForVendor?.uuidString ?? "")\(Bundle.main.bundleIdentifier ?? "")"
        self.deviceFingerprint = SHA256.hash(data: deviceData.data(using: .utf8)!).compactMap { String(format: "%02x", $0) }.joined()
        
        super.init()
        
        // Configure Firebase persistence
        do {
            try auth.useUserAccessGroup("group.com.fantasygm.assistant")
            auth.setPersistenceEnabled(true)
        } catch {
            Logger.shared.error("Failed to configure Firebase persistence", error: error)
        }
        
        // Setup auth state listener
        auth.addStateDidChangeListener { [weak self] (_, user) in
            guard let self = self else { return }
            self.currentUser = user
            if let user = user {
                Logger.shared.info("User authenticated: \(user.uid)")
                self.validateSession(user)
            } else {
                Logger.shared.info("User signed out")
                self.clearTokenCache()
            }
        }
    }
    
    // MARK: - Private Methods
    private func validateSession(_ user: User) {
        user.getIDTokenResult(forcingRefresh: false) { [weak self] (result, error) in
            guard let self = self else { return }
            
            if let error = error {
                Logger.shared.error("Token validation failed", error: error)
                self.signOut(nil, nil)
                return
            }
            
            guard let result = result else { return }
            
            // Validate claims and permissions
            guard let userRole = result.claims["role"] as? String,
                  ["free", "premium", "admin"].contains(userRole) else {
                Logger.shared.error("Invalid user role detected")
                self.signOut(nil, nil)
                return
            }
            
            // Check token expiration
            if result.expirationDate.timeIntervalSinceNow < TOKEN_REFRESH_THRESHOLD {
                self.refreshToken(nil, nil)
            }
        }
    }
    
    private func checkRateLimit(for identifier: String) -> Bool {
        return authQueue.sync {
            let now = Date()
            if let limitData = rateLimiter[identifier] {
                if limitData.attempts >= MAX_LOGIN_ATTEMPTS {
                    if now.timeIntervalSince(limitData.lastAttempt) < RATE_LIMIT_RESET {
                        return false
                    }
                    rateLimiter[identifier] = (0, now)
                }
                rateLimiter[identifier] = (limitData.attempts + 1, now)
            } else {
                rateLimiter[identifier] = (1, now)
            }
            return true
        }
    }
    
    private func clearTokenCache() {
        authQueue.async {
            self.tokenCache.removeAll()
        }
    }
    
    // MARK: - Public Methods
    @objc func signInWithEmail(_ email: String,
                              password: String,
                              resolve: @escaping RCTPromiseResolveBlock,
                              reject: @escaping RCTPromiseRejectBlock) {
        
        authQueue.async {
            // Rate limiting check
            guard self.checkRateLimit(for: email) else {
                Logger.shared.warning("Rate limit exceeded for email: [EMAIL]")
                reject("\(AuthError.rateLimitExceeded.rawValue)",
                      AuthError.rateLimitExceeded.localizedDescription,
                      AuthError.rateLimitExceeded)
                return
            }
            
            // Device trust check
            guard KeychainWrapper.standard.string(forKey: "device_trust_token") != nil else {
                Logger.shared.error("Untrusted device detected")
                reject("\(AuthError.deviceNotTrusted.rawValue)",
                      AuthError.deviceNotTrusted.localizedDescription,
                      AuthError.deviceNotTrusted)
                return
            }
            
            self.auth.signIn(withEmail: email, password: password) { (result, error) in
                if let error = error {
                    Logger.shared.error("Sign in failed", error: error)
                    let authError = self.handleAuthError(error)
                    reject("\(authError.rawValue)", authError.localizedDescription, authError)
                    return
                }
                
                guard let user = result?.user else {
                    reject("\(AuthError.userNotFound.rawValue)",
                          AuthError.userNotFound.localizedDescription,
                          AuthError.userNotFound)
                    return
                }
                
                // Get fresh token
                user.getIDTokenResult(forcingRefresh: true) { (result, error) in
                    if let error = error {
                        Logger.shared.error("Token retrieval failed", error: error)
                        reject("\(AuthError.tokenExpired.rawValue)",
                              AuthError.tokenExpired.localizedDescription,
                              AuthError.tokenExpired)
                        return
                    }
                    
                    guard let token = result?.token else { return }
                    
                    // Cache token
                    self.tokenCache[user.uid] = (token, result?.expirationDate ?? Date())
                    
                    // Return user data
                    let userData: [String: Any] = [
                        "uid": user.uid,
                        "email": user.email ?? "",
                        "emailVerified": user.isEmailVerified,
                        "token": token,
                        "expiresIn": result?.expirationDate.timeIntervalSinceNow ?? 0
                    ]
                    
                    Logger.shared.info("User signed in successfully: \(user.uid)")
                    resolve(userData)
                }
            }
        }
    }
    
    @objc func refreshToken(_ resolve: RCTPromiseResolveBlock?,
                           _ reject: RCTPromiseRejectBlock?) {
        authQueue.async {
            guard let user = self.auth.currentUser else {
                reject?("\(AuthError.userNotFound.rawValue)",
                       AuthError.userNotFound.localizedDescription,
                       AuthError.userNotFound)
                return
            }
            
            user.getIDTokenResult(forcingRefresh: true) { (result, error) in
                if let error = error {
                    Logger.shared.error("Token refresh failed", error: error)
                    reject?("\(AuthError.tokenExpired.rawValue)",
                           AuthError.tokenExpired.localizedDescription,
                           AuthError.tokenExpired)
                    return
                }
                
                guard let token = result?.token else { return }
                
                // Update token cache
                self.tokenCache[user.uid] = (token, result?.expirationDate ?? Date())
                
                let tokenData: [String: Any] = [
                    "token": token,
                    "expiresIn": result?.expirationDate.timeIntervalSinceNow ?? 0
                ]
                
                Logger.shared.info("Token refreshed successfully for user: \(user.uid)")
                resolve?(tokenData)
            }
        }
    }
    
    private func handleAuthError(_ error: Error) -> AuthError {
        let code = (error as NSError).code
        switch code {
        case AuthErrorCode.wrongPassword.rawValue:
            return .invalidCredentials
        case AuthErrorCode.userNotFound.rawValue:
            return .userNotFound
        case AuthErrorCode.emailAlreadyInUse.rawValue:
            return .emailInUse
        case AuthErrorCode.weakPassword.rawValue:
            return .weakPassword
        case AuthErrorCode.secondFactorRequired.rawValue:
            return .mfaRequired
        default:
            return .networkError
        }
    }
}