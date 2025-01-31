//
//  FirebaseAuthManager.m
//  FantasyGMAssistant
//
//  Enhanced Firebase Authentication bridge with security features
//  Version: 1.0.0
//

#import "FirebaseAuthManagerBridge.h"
#import <React/RCTBridgeModule.h>
#import <FirebaseAuth/FirebaseAuth.h>
#import <LocalAuthentication/LocalAuthentication.h>
#import <CommonCrypto/CommonDigest.h>

// Constants for rate limiting and security
static const NSInteger kMaxAuthAttempts = 5;
static const NSTimeInterval kRateLimitResetInterval = 300.0; // 5 minutes
static const NSTimeInterval kTokenRefreshThreshold = 300.0; // 5 minutes before expiry

@implementation FirebaseAuthManager {
    NSInteger rateLimitCounter;
    NSDate *lastAuthAttempt;
    NSString *deviceFingerprint;
    dispatch_queue_t securityQueue;
}

RCT_EXPORT_MODULE(FirebaseAuthManager)

- (instancetype)init {
    if (self = [super init]) {
        rateLimitCounter = 0;
        lastAuthAttempt = [NSDate date];
        securityQueue = dispatch_queue_create("com.fantasygm.auth.security", DISPATCH_QUEUE_SERIAL);
        [self generateDeviceFingerprint];
    }
    return self;
}

#pragma mark - Security Methods

- (void)generateDeviceFingerprint {
    NSString *deviceName = [[UIDevice currentDevice] name];
    NSString *systemVersion = [[UIDevice currentDevice] systemVersion];
    NSString *model = [[UIDevice currentDevice] model];
    NSString *identifierForVendor = [[[UIDevice currentDevice] identifierForVendor] UUIDString];
    
    NSString *rawFingerprint = [NSString stringWithFormat:@"%@_%@_%@_%@",
                               deviceName, systemVersion, model, identifierForVendor];
    
    // Generate SHA-256 hash of device info
    NSData *data = [rawFingerprint dataUsingEncoding:NSUTF8StringEncoding];
    uint8_t digest[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
    
    NSMutableString *fingerprint = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
    for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) {
        [fingerprint appendFormat:@"%02x", digest[i]];
    }
    
    deviceFingerprint = fingerprint;
}

- (BOOL)checkRateLimit {
    __block BOOL allowed = NO;
    dispatch_sync(securityQueue, ^{
        NSTimeInterval timeSinceLastAttempt = [[NSDate date] timeIntervalSinceDate:self->lastAuthAttempt];
        
        if (timeSinceLastAttempt >= kRateLimitResetInterval) {
            self->rateLimitCounter = 0;
        }
        
        if (self->rateLimitCounter < kMaxAuthAttempts) {
            self->rateLimitCounter++;
            self->lastAuthAttempt = [NSDate date];
            allowed = YES;
        }
    });
    return allowed;
}

#pragma mark - Authentication Methods

RCT_EXPORT_METHOD(signInWithEmail:(NSString *)email
                  password:(NSString *)password
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    
    if (![self checkRateLimit]) {
        NSString *errorMsg = @"Too many authentication attempts. Please try again later.";
        reject(@"AUTH_RATE_LIMIT", errorMsg, nil);
        return;
    }
    
    [[FIRAuth auth] signInWithEmail:email
                          password:password
                        completion:^(FIRAuthDataResult * _Nullable authResult,
                                   NSError * _Nullable error) {
        if (error) {
            [self logAuthError:error withEmail:email];
            reject(@"AUTH_ERROR", error.localizedDescription, error);
            return;
        }
        
        [self handleSuccessfulAuth:authResult withResolve:resolve reject:reject];
    }];
}

RCT_EXPORT_METHOD(signInWithProvider:(NSString *)provider
                  options:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    
    if (![self checkRateLimit]) {
        reject(@"AUTH_RATE_LIMIT", @"Too many authentication attempts", nil);
        return;
    }
    
    // Configure provider
    id<FIRAuthProvider> authProvider;
    if ([provider isEqualToString:@"google"]) {
        authProvider = [FIRGoogleAuthProvider provider];
    } else if ([provider isEqualToString:@"espn"]) {
        // Custom ESPN OAuth provider configuration
        authProvider = [self configureESPNProvider:options];
    } else {
        reject(@"AUTH_PROVIDER_ERROR", @"Unsupported provider", nil);
        return;
    }
    
    [[FIRAuth auth] signInWithProvider:authProvider
                           UIDelegate:nil
                           completion:^(FIRAuthDataResult * _Nullable authResult,
                                      NSError * _Nullable error) {
        if (error) {
            [self logAuthError:error withProvider:provider];
            reject(@"AUTH_ERROR", error.localizedDescription, error);
            return;
        }
        
        [self handleSuccessfulAuth:authResult withResolve:resolve reject:reject];
    }];
}

RCT_EXPORT_METHOD(signOut:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    
    NSError *error;
    [[FIRAuth auth] signOut:&error];
    
    if (error) {
        [self logAuthError:error withContext:@"signOut"];
        reject(@"SIGNOUT_ERROR", error.localizedDescription, error);
        return;
    }
    
    // Clear security state
    dispatch_sync(securityQueue, ^{
        self->rateLimitCounter = 0;
        self->lastAuthAttempt = [NSDate date];
    });
    
    resolve(@{@"status": @"success"});
}

RCT_EXPORT_METHOD(getCurrentUser:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    
    FIRUser *currentUser = [FIRAuth auth].currentUser;
    if (!currentUser) {
        resolve(nil);
        return;
    }
    
    [currentUser getIDTokenForcingRefresh:NO
                              completion:^(NSString * _Nullable token,
                                         NSError * _Nullable error) {
        if (error) {
            [self logAuthError:error withContext:@"tokenRefresh"];
            reject(@"TOKEN_ERROR", error.localizedDescription, error);
            return;
        }
        
        [self validateAndEnhanceUserData:currentUser
                              withToken:token
                               resolve:resolve
                                reject:reject];
    }];
}

#pragma mark - Helper Methods

- (void)handleSuccessfulAuth:(FIRAuthDataResult *)authResult
                withResolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject {
    
    [authResult.user getIDTokenWithCompletion:^(NSString * _Nullable token,
                                               NSError * _Nullable error) {
        if (error) {
            reject(@"TOKEN_ERROR", error.localizedDescription, error);
            return;
        }
        
        NSMutableDictionary *userData = [@{
            @"uid": authResult.user.uid,
            @"email": authResult.user.email ?: [NSNull null],
            @"displayName": authResult.user.displayName ?: [NSNull null],
            @"token": token,
            @"deviceFingerprint": self->deviceFingerprint,
            @"authTimestamp": @([[NSDate date] timeIntervalSince1970])
        } mutableCopy];
        
        // Add MFA status if available
        if ([authResult.user.multiFactor enrolledFactors].count > 0) {
            userData[@"mfaEnabled"] = @YES;
            userData[@"mfaEnrolledFactors"] = @([authResult.user.multiFactor enrolledFactors].count);
        }
        
        resolve(userData);
    }];
}

- (void)validateAndEnhanceUserData:(FIRUser *)user
                        withToken:(NSString *)token
                         resolve:(RCTPromiseResolveBlock)resolve
                          reject:(RCTPromiseRejectBlock)reject {
    
    // Verify token expiration
    FIRAuthTokenResult *decodedToken = [user getIDTokenResultForcingRefresh:NO
                                                                     error:nil];
    if (decodedToken.expirationDate.timeIntervalSinceNow < kTokenRefreshThreshold) {
        [user getIDTokenForcingRefresh:YES completion:^(NSString * _Nullable newToken,
                                                      NSError * _Nullable error) {
            if (error) {
                reject(@"TOKEN_REFRESH_ERROR", error.localizedDescription, error);
                return;
            }
            token = newToken;
        }];
    }
    
    NSMutableDictionary *enhancedUserData = [@{
        @"uid": user.uid,
        @"email": user.email ?: [NSNull null],
        @"displayName": user.displayName ?: [NSNull null],
        @"token": token,
        @"deviceFingerprint": deviceFingerprint,
        @"lastLoginTimestamp": @([[NSDate date] timeIntervalSince1970]),
        @"isEmailVerified": @(user.emailVerified)
    } mutableCopy];
    
    // Add claims and roles if available
    [user getIDTokenResultForcingRefresh:NO
                             completion:^(FIRAuthTokenResult * _Nullable tokenResult,
                                        NSError * _Nullable error) {
        if (!error && tokenResult.claims) {
            enhancedUserData[@"claims"] = tokenResult.claims;
            enhancedUserData[@"role"] = tokenResult.claims[@"role"] ?: @"user";
        }
        resolve(enhancedUserData);
    }];
}

- (void)logAuthError:(NSError *)error
           withEmail:(NSString *)email {
    NSDictionary *errorData = @{
        @"error_code": @(error.code),
        @"error_domain": error.domain,
        @"device_fingerprint": deviceFingerprint,
        @"masked_email": [self maskEmail:email]
    };
    // Log to analytics
    // Note: Actual logging implementation would use the Logger class
}

- (NSString *)maskEmail:(NSString *)email {
    if (!email.length) return @"";
    NSArray *components = [email componentsSeparatedByString:@"@"];
    if (components.count != 2) return @"";
    
    NSString *name = components[0];
    if (name.length <= 2) return email;
    
    return [NSString stringWithFormat:@"%@***%@@%@",
            [name substringToIndex:1],
            [name substringFromIndex:name.length - 1],
            components[1]];
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

@end