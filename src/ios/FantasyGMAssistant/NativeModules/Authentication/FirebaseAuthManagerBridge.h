//
//  FirebaseAuthManagerBridge.h
//  FantasyGMAssistant
//
//  Firebase Authentication bridge for React Native v0.72+
//  Implements secure authentication flows with MFA and OAuth support
//

#import <React/React.h>
#import <React/RCTBridgeModule.h>

NS_ASSUME_NONNULL_BEGIN

@interface FirebaseAuthManager : NSObject <RCTBridgeModule>

// Current user's JWT token stored securely
@property (nonatomic, strong, nullable) NSString *currentUserToken;

// Flag indicating if MFA is enabled for current session
@property (nonatomic, assign) BOOL isMFAEnabled;

/**
 * Signs in user with email and password
 * @param email User's email address
 * @param password User's password
 * @param enableMFA Boolean flag to enable Multi-Factor Authentication
 * @param resolve Promise resolve block
 * @param reject Promise reject block
 */
RCT_EXTERN_METHOD(signInWithEmail:(NSString *)email
                  password:(NSString *)password
                  enableMFA:(BOOL)enableMFA
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

/**
 * Signs in user with OAuth provider (Google, ESPN, Sleeper)
 * @param provider OAuth provider identifier
 * @param options Provider-specific options dictionary
 * @param resolve Promise resolve block
 * @param reject Promise reject block
 */
RCT_EXTERN_METHOD(signInWithProvider:(NSString *)provider
                  options:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

/**
 * Signs out current user and cleans up session data
 * @param resolve Promise resolve block
 * @param reject Promise reject block
 */
RCT_EXTERN_METHOD(signOut:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

/**
 * Retrieves current authenticated user information
 * Returns user profile with role and session details
 * @param resolve Promise resolve block
 * @param reject Promise reject block
 */
RCT_EXTERN_METHOD(getCurrentUser:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

// Required for RCTBridgeModule
+ (BOOL)requiresMainQueueSetup;

@end

NS_ASSUME_NONNULL_END