//
// CacheManager.m
// FantasyGMAssistant
//
// React Native bridge implementation for native caching functionality
// Version: 1.0.0
//

#import <React/React.h> // React Native 0.72+
#import <Foundation/Foundation.h> // iOS 14.0+
#import "CacheManagerBridge.h"
#import "FantasyGMAssistant-Swift.h" // Bridge header for Swift

@implementation CacheManagerBridge

// Export module to React Native
RCT_EXPORT_MODULE()

- (instancetype)init {
    self = [super init];
    if (self) {
        // Initialize dedicated serial queue for thread-safe cache operations
        _cacheQueue = dispatch_queue_create("com.fantasygm.cache", DISPATCH_QUEUE_SERIAL);
        
        // Register for memory warning notifications
        [[NSNotificationCenter defaultCenter] addObserver:self
                                               selector:@selector(handleMemoryWarning:)
                                                   name:UIApplicationDidReceiveMemoryWarningNotification
                                                 object:nil];
    }
    return self;
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

// Thread-safe implementation for storing data in cache
RCT_EXPORT_METHOD(setData:(NSString *)key
                  data:(NSData *)data
                  ttl:(NSNumber *)ttl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    
    if (!key || !data || !ttl) {
        NSError *error = [NSError errorWithDomain:kCacheManagerErrorDomain
                                           code:CacheManagerErrorInvalidInput
                                       userInfo:@{NSLocalizedDescriptionKey: @"Invalid input parameters"}];
        reject(@"invalid_input", @"Key, data and TTL are required", error);
        return;
    }
    
    dispatch_async(self->_cacheQueue, ^{
        @try {
            // Convert parameters for Swift interop
            NSTimeInterval timeInterval = [ttl doubleValue];
            
            // Store data using Swift CacheManager
            [[CacheManager shared] setData:data
                                 withKey:key
                                    ttl:timeInterval
                              callback:^(NSError * _Nullable error) {
                if (error) {
                    reject(@"storage_failed",
                          @"Failed to store data in cache",
                          error);
                } else {
                    resolve(@YES);
                }
            }];
            
            dispatch_barrier_async(self->_cacheQueue, ^{
                // Memory barrier to ensure thread safety
            });
            
        } @catch (NSException *exception) {
            NSError *error = [NSError errorWithDomain:kCacheManagerErrorDomain
                                               code:CacheManagerErrorStorageFailed
                                           userInfo:@{NSLocalizedDescriptionKey: exception.reason}];
            reject(@"storage_failed", @"Failed to store data in cache", error);
        }
    });
}

// Thread-safe implementation for retrieving data from cache
RCT_EXPORT_METHOD(getData:(NSString *)key
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    
    if (!key) {
        NSError *error = [NSError errorWithDomain:kCacheManagerErrorDomain
                                           code:CacheManagerErrorInvalidInput
                                       userInfo:@{NSLocalizedDescriptionKey: @"Key is required"}];
        reject(@"invalid_input", @"Key is required", error);
        return;
    }
    
    dispatch_async(self->_cacheQueue, ^{
        @try {
            // Retrieve data using Swift CacheManager
            [[CacheManager shared] getDataForKey:key
                                     callback:^(NSData * _Nullable data, NSError * _Nullable error) {
                if (error) {
                    reject(@"retrieval_failed",
                          @"Failed to retrieve data from cache",
                          error);
                } else {
                    resolve(data ?: [NSNull null]);
                }
            }];
            
            dispatch_barrier_async(self->_cacheQueue, ^{
                // Memory barrier to ensure thread safety
            });
            
        } @catch (NSException *exception) {
            NSError *error = [NSError errorWithDomain:kCacheManagerErrorDomain
                                               code:CacheManagerErrorRetrievalFailed
                                           userInfo:@{NSLocalizedDescriptionKey: exception.reason}];
            reject(@"retrieval_failed", @"Failed to retrieve data from cache", error);
        }
    });
}

// Thread-safe implementation for removing data from cache
RCT_EXPORT_METHOD(removeData:(NSString *)key
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    
    if (!key) {
        NSError *error = [NSError errorWithDomain:kCacheManagerErrorDomain
                                           code:CacheManagerErrorInvalidInput
                                       userInfo:@{NSLocalizedDescriptionKey: @"Key is required"}];
        reject(@"invalid_input", @"Key is required", error);
        return;
    }
    
    dispatch_async(self->_cacheQueue, ^{
        @try {
            // Remove data using Swift CacheManager
            [[CacheManager shared] removeDataForKey:key
                                        callback:^(NSError * _Nullable error) {
                if (error) {
                    reject(@"removal_failed",
                          @"Failed to remove data from cache",
                          error);
                } else {
                    resolve(@YES);
                }
            }];
            
            dispatch_barrier_async(self->_cacheQueue, ^{
                // Memory barrier to ensure thread safety
            });
            
        } @catch (NSException *exception) {
            NSError *error = [NSError errorWithDomain:kCacheManagerErrorDomain
                                               code:CacheManagerErrorClearFailed
                                           userInfo:@{NSLocalizedDescriptionKey: exception.reason}];
            reject(@"removal_failed", @"Failed to remove data from cache", error);
        }
    });
}

// Thread-safe implementation for clearing all cached data
RCT_EXPORT_METHOD(clearCache:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    
    dispatch_async(self->_cacheQueue, ^{
        @try {
            // Clear cache using Swift CacheManager
            [[CacheManager shared] clearCacheWithCallback:^(NSError * _Nullable error) {
                if (error) {
                    reject(@"clear_failed",
                          @"Failed to clear cache",
                          error);
                } else {
                    resolve(@YES);
                }
            }];
            
            dispatch_barrier_async(self->_cacheQueue, ^{
                // Memory barrier to ensure thread safety
            });
            
            // Post notification for low memory cleanup
            [[NSNotificationCenter defaultCenter] postNotificationName:UIApplicationDidReceiveMemoryWarningNotification
                                                            object:nil];
            
        } @catch (NSException *exception) {
            NSError *error = [NSError errorWithDomain:kCacheManagerErrorDomain
                                               code:CacheManagerErrorClearFailed
                                           userInfo:@{NSLocalizedDescriptionKey: exception.reason}];
            reject(@"clear_failed", @"Failed to clear cache", error);
        }
    });
}

// Handle memory warning notifications
- (void)handleMemoryWarning:(NSNotification *)notification {
    dispatch_async(self->_cacheQueue, ^{
        [[CacheManager shared] clearCacheWithCallback:nil];
    });
}

@end