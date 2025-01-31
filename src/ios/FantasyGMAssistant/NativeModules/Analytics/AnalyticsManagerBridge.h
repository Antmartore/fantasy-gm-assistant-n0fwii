//
// AnalyticsManagerBridge.h
// FantasyGMAssistant
//
// Bridge interface between React Native and native iOS analytics functionality
// Version: 1.0.0
//

#import <React/RCTBridgeModule.h> // React Native 0.72.0
#import <Foundation/Foundation.h> // iOS 14.0+

NS_ASSUME_NONNULL_BEGIN

// MARK: - Analytics Event Constants
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

// MARK: - Analytics Property Constants
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

// MARK: - Error Code Constants
extern NSInteger const ERROR_CODE_AUTH;
extern NSInteger const ERROR_CODE_PERMISSION;
extern NSInteger const ERROR_CODE_VALIDATION;
extern NSInteger const ERROR_CODE_RATE_LIMIT;
extern NSInteger const ERROR_CODE_SYSTEM;
extern NSInteger const ERROR_CODE_INTEGRATION;

// MARK: - AnalyticsManagerBridge Interface
@interface AnalyticsManagerBridge : NSObject <RCTBridgeModule>

// MARK: - Properties
@property (nonatomic, strong) NSOperationQueue *eventQueue;
@property (nonatomic, strong) NSUserDefaults *privacySettings;

// MARK: - Event Tracking Methods
/**
 * Tracks a custom analytics event with parameters and offline support
 * @param eventName The name of the event to track
 * @param parameters Optional parameters associated with the event
 * @param forceOnline Whether to force online sending vs queueing
 */
RCT_EXTERN_METHOD(trackEvent:(NSString *)eventName
                  parameters:(nullable NSDictionary *)parameters
                  forceOnline:(BOOL)forceOnline)

/**
 * Updates user properties for analytics tracking with privacy controls
 * @param properties Dictionary of user properties to update
 * @param privacyLevel Privacy level for PII handling
 */
RCT_EXTERN_METHOD(setUserProperties:(NSDictionary *)properties
                  privacyLevel:(NSNumber *)privacyLevel)

/**
 * Tracks error events with enhanced error handling and retry logic
 * @param errorName Name/type of the error
 * @param errorCode Numeric error code
 * @param errorMessage Descriptive error message
 * @param properties Additional error context
 * @param maxRetries Maximum number of retry attempts
 */
RCT_EXTERN_METHOD(trackError:(NSString *)errorName
                  errorCode:(NSNumber *)errorCode
                  errorMessage:(NSString *)errorMessage
                  properties:(nullable NSDictionary *)properties
                  maxRetries:(NSNumber *)maxRetries)

/**
 * Synchronizes queued offline events when online
 */
RCT_EXTERN_METHOD(syncOfflineEvents)

// MARK: - Module Constants
/**
 * Provides constants to React Native layer
 * @return Dictionary of module constants
 */
- (NSDictionary *)moduleConstants;

@end

NS_ASSUME_NONNULL_END