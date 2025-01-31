//
// CacheManagerBridge.h
// FantasyGMAssistant
//
// React Native bridge for native caching functionality
// Version: 1.0.0
//

#import <Foundation/Foundation.h> // iOS 14.0+
#import <React/RCTBridgeModule.h> // React Native 0.72+

NS_ASSUME_NONNULL_BEGIN

// Error domain for cache operations
NSString * const kCacheManagerErrorDomain = @"com.fantasygm.cache";

// Error codes
typedef NS_ENUM(NSInteger, CacheManagerErrorCode) {
    CacheManagerErrorInvalidInput = 1000,
    CacheManagerErrorStorageFailed = 1001,
    CacheManagerErrorRetrievalFailed = 1002,
    CacheManagerErrorExpired = 1003,
    CacheManagerErrorVersionMismatch = 1004,
    CacheManagerErrorClearFailed = 1005
};

@interface CacheManagerBridge : NSObject <RCTBridgeModule>

// Dedicated serial queue for thread-safe cache operations
@property(nonatomic, strong) dispatch_queue_t cacheQueue;

/**
 * Stores data in cache with specified key and TTL
 * @param key Unique identifier for cached data
 * @param data Binary data to cache
 * @param ttl Time-to-live in seconds
 * @param resolve Promise resolution callback
 * @param reject Promise rejection callback
 */
- (void)setData:(NSString * _Nonnull)key
          data:(NSData * _Nonnull)data
           ttl:(NSNumber * _Nonnull)ttl
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject;

/**
 * Retrieves data from cache by key
 * @param key Unique identifier for cached data
 * @param resolve Promise resolution callback
 * @param reject Promise rejection callback
 */
- (void)getData:(NSString * _Nonnull)key
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject;

/**
 * Removes data from cache by key
 * @param key Unique identifier for cached data
 * @param resolve Promise resolution callback
 * @param reject Promise rejection callback
 */
- (void)removeData:(NSString * _Nonnull)key
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject;

/**
 * Clears all cached data
 * @param resolve Promise resolution callback
 * @param reject Promise rejection callback
 */
- (void)clearCache:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject;

@end

NS_ASSUME_NONNULL_END