//
// FantasyGMAssistant-Bridging-Header.h
// FantasyGMAssistant
//
// Bridging header for secure Swift and Objective-C/C++ interoperability
// Version: 1.0.0
//

#ifndef FantasyGMAssistant_Bridging_Header_h
#define FantasyGMAssistant_Bridging_Header_h

// React Native Core - v0.72.0
#import <React/React.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTConvert.h>

// Firebase Core - v10.0.0
#import <FirebaseCore/FirebaseCore.h>

// Analytics Bridge
#import "NativeModules/Analytics/AnalyticsManagerBridge.h"

// Error Code Constants
extern NSInteger const ERROR_CODE_AUTH;
extern NSInteger const ERROR_CODE_PERMISSION;
extern NSInteger const ERROR_CODE_VALIDATION;
extern NSInteger const ERROR_CODE_RATE_LIMIT;
extern NSInteger const ERROR_CODE_SYSTEM;
extern NSInteger const ERROR_CODE_INTEGRATION;

// Analytics Event Constants
extern NSString * const ANALYTICS_EVENTS_LOGIN;
extern NSString * const ANALYTICS_EVENTS_LOGOUT;
extern NSString * const ANALYTICS_EVENTS_VIEW_TEAM;
extern NSString * const ANALYTICS_EVENTS_UPDATE_LINEUP;
extern NSString * const ANALYTICS_EVENTS_RUN_SIMULATION;
extern NSString * const ANALYTICS_EVENTS_ANALYZE_TRADE;
extern NSString * const ANALYTICS_EVENTS_GENERATE_VIDEO;
extern NSString * const ANALYTICS_EVENTS_VIEW_PLAYER;
extern NSString * const ANALYTICS_EVENTS_OFFLINE_SYNC;
extern NSString * const ANALYTICS_EVENTS_PRIVACY_UPDATE;

// Authentication Bridge
#import "NativeModules/Authentication/FirebaseAuthManagerBridge.h"

// Authentication Error Types
typedef NS_ENUM(NSInteger, AuthError) {
    AuthErrorInvalidCredentials = 1000,
    AuthErrorSessionExpired = 1001,
    AuthErrorMFARequired = 1002,
    AuthErrorNetworkFailure = 1003,
    AuthErrorPermissionDenied = 1004,
    AuthErrorProviderFailure = 1005
};

// Media Processing Bridge
#import "NativeModules/Media/MediaProcessorBridge.h"

// Media Processing Error Types
typedef NS_ENUM(NSInteger, MediaError) {
    MediaErrorInvalidInput = 2000,
    MediaErrorProcessingFailed = 2001,
    MediaErrorAPIFailure = 2002,
    MediaErrorResourceUnavailable = 2003,
    MediaErrorMemoryWarning = 2004,
    MediaErrorCacheFailure = 2005,
    MediaErrorNetworkFailure = 2006,
    MediaErrorOptimizationFailed = 2007
};

// Media Processing Constants
extern NSString * const MediaProcessorErrorDomain;
extern const NSInteger MAX_RETRY_ATTEMPTS;
extern const NSInteger MEDIA_CACHE_SIZE;

// Analytics Property Constants
extern NSString * const ANALYTICS_PROPERTIES_USER_ID;
extern NSString * const ANALYTICS_PROPERTIES_TEAM_ID;
extern NSString * const ANALYTICS_PROPERTIES_SPORT_TYPE;
extern NSString * const ANALYTICS_PROPERTIES_PREMIUM_STATUS;
extern NSString * const ANALYTICS_PROPERTIES_FEATURE_NAME;
extern NSString * const ANALYTICS_PROPERTIES_DURATION_MS;
extern NSString * const ANALYTICS_PROPERTIES_ERROR_TYPE;
extern NSString * const ANALYTICS_PROPERTIES_ERROR_CODE;
extern NSString * const ANALYTICS_PROPERTIES_ERROR_MESSAGE;
extern NSString * const ANALYTICS_PROPERTIES_RETRY_COUNT;
extern NSString * const ANALYTICS_PROPERTIES_NETWORK_STATUS;
extern NSString * const ANALYTICS_PROPERTIES_PRIVACY_LEVEL;
extern NSString * const ANALYTICS_PROPERTIES_PII_MASKED;

// Bridge Protocol Declarations
@protocol AnalyticsManagerDelegate <NSObject>
- (void)trackEvent:(NSString *)eventName parameters:(NSDictionary *)parameters;
- (void)setUserProperties:(NSDictionary *)properties privacyLevel:(NSNumber *)level;
- (void)flushOfflineEvents;
@end

@protocol FirebaseAuthManagerDelegate <NSObject>
- (void)signInWithEmail:(NSString *)email password:(NSString *)password enableMFA:(BOOL)mfa;
- (void)signInWithProvider:(NSString *)provider options:(NSDictionary *)options;
- (void)signOut;
- (void)getCurrentUser;
- (void)handleMFAChallenge:(NSString *)challengeId;
@end

@protocol MediaProcessorDelegate <NSObject>
- (void)generateTradeAnalysisVideo:(NSDictionary *)tradeDetails;
- (void)generateVoiceOver:(NSString *)text;
- (void)processMediaFile:(NSURL *)fileURL options:(NSDictionary *)options;
- (void)getProcessingProgress:(NSString *)taskId;
@end

#endif /* FantasyGMAssistant_Bridging_Header_h */