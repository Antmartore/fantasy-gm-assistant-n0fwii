//
// NotificationManagerBridge.h
// FantasyGMAssistant
//
// Bridge interface for React Native to iOS notification functionality
// Version: 1.0.0
//

#import <React/RCTBridgeModule.h> // React Native 0.72+
#import <Foundation/Foundation.h> // iOS 14.0+
#import <UserNotifications/UserNotifications.h> // iOS 14.0+

NS_ASSUME_NONNULL_BEGIN

/**
 * Bridge module that exposes native iOS notification functionality to React Native
 * with comprehensive error handling and thread safety.
 */
@interface NotificationManagerBridge : NSObject <RCTBridgeModule>

/**
 * Requests permission for push notifications with comprehensive error handling.
 * Resolves with permission status or rejects with specific error codes.
 *
 * @param resolve Promise resolution callback with permission status
 * @param reject Promise rejection callback with error details
 */
RCT_EXTERN_METHOD(requestNotificationPermissions:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

/**
 * Configures notification categories and actions with validation.
 * Categories define the interactive actions available for different notification types.
 *
 * @param categories Dictionary containing category configurations
 * @param resolve Promise resolution callback
 * @param reject Promise rejection callback
 */
RCT_EXTERN_METHOD(configureNotificationCategories:(NSDictionary *)categories
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

/**
 * Updates application badge count with thread safety.
 * Ensures badge updates occur on the main thread.
 *
 * @param count New badge count to display
 */
RCT_EXTERN_METHOD(updateBadgeCount:(NSInteger)count)

/**
 * Declares this as a module that should be initialized early in the app lifecycle
 */
+ (BOOL)requiresMainQueueSetup;

@end

NS_ASSUME_NONNULL_END