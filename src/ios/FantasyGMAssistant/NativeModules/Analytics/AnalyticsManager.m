//
// AnalyticsManager.m
// FantasyGMAssistant
//
// Objective-C implementation of React Native bridge for analytics functionality
// Version: 1.0.0
//

#import "AnalyticsManagerBridge.h"
#import <React/RCTLog.h> // React Native 0.72.0

@interface AnalyticsManagerBridge ()

@property (nonatomic, assign) NSUInteger maxRetryAttempts;
@property (nonatomic, assign) NSTimeInterval retryBaseInterval;
@property (nonatomic, assign) NSUInteger maxQueueSize;
@property (nonatomic, assign) BOOL circuitBreakerOpen;
@property (nonatomic, strong) NSMutableArray *offlineEventQueue;
@property (nonatomic, strong) NSDate *lastCircuitBreakerTrip;
@property (nonatomic, strong) dispatch_queue_t analyticsQueue;

@end

@implementation AnalyticsManagerBridge

RCT_EXPORT_MODULE()

- (instancetype)init {
    if (self = [super init]) {
        _maxRetryAttempts = 3;
        _retryBaseInterval = 1.0;
        _maxQueueSize = 1000;
        _circuitBreakerOpen = NO;
        _offlineEventQueue = [NSMutableArray array];
        _analyticsQueue = dispatch_queue_create("com.fantasygm.analytics", DISPATCH_QUEUE_SERIAL);
        _lastCircuitBreakerTrip = nil;
        _eventQueue = [[NSOperationQueue alloc] init];
        _eventQueue.maxConcurrentOperationCount = 1;
        _privacySettings = [NSUserDefaults standardUserDefaults];
        
        [self setupNetworkMonitoring];
    }
    return self;
}

RCT_EXPORT_METHOD(trackEvent:(NSString *)eventName
                  parameters:(NSDictionary *)parameters
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    if (!eventName || [eventName length] == 0) {
        reject(@"invalid_event", @"Event name cannot be empty", nil);
        return;
    }
    
    dispatch_async(self.analyticsQueue, ^{
        if (self.circuitBreakerOpen) {
            if ([self shouldResetCircuitBreaker]) {
                self.circuitBreakerOpen = NO;
            } else {
                reject(@"circuit_breaker_open", @"Analytics circuit breaker is open", nil);
                return;
            }
        }
        
        NSMutableDictionary *sanitizedParams = [self sanitizeParameters:parameters];
        
        if ([self isNetworkAvailable]) {
            [self sendEvent:eventName parameters:sanitizedParams retryCount:0 completion:^(NSError *error) {
                if (error) {
                    [self handleEventError:error eventName:eventName parameters:sanitizedParams];
                    reject(@"send_failed", error.localizedDescription, error);
                } else {
                    resolve(@{@"success": @YES});
                }
            }];
        } else {
            [self queueOfflineEvent:eventName parameters:sanitizedParams];
            resolve(@{@"queued": @YES});
        }
    });
}

RCT_EXPORT_METHOD(setUserProperties:(NSDictionary *)properties
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(self.analyticsQueue, ^{
        NSMutableDictionary *sanitizedProps = [self sanitizeParameters:properties];
        [self.privacySettings setObject:sanitizedProps forKey:@"user_properties"];
        [self.privacySettings synchronize];
        
        [[AnalyticsManager shared] setUserProperties:sanitizedProps];
        resolve(@{@"success": @YES});
    });
}

RCT_EXPORT_METHOD(syncOfflineEvents:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    dispatch_async(self.analyticsQueue, ^{
        if (![self isNetworkAvailable]) {
            reject(@"network_unavailable", @"Network is not available", nil);
            return;
        }
        
        NSArray *queuedEvents = [self.offlineEventQueue copy];
        NSMutableArray *syncResults = [NSMutableArray array];
        
        dispatch_group_t group = dispatch_group_create();
        
        for (NSDictionary *event in queuedEvents) {
            dispatch_group_enter(group);
            
            [self sendEvent:event[@"name"]
                parameters:event[@"parameters"]
                retryCount:0
                completion:^(NSError *error) {
                    if (!error) {
                        [syncResults addObject:event[@"name"]];
                        [self.offlineEventQueue removeObject:event];
                    }
                    dispatch_group_leave(group);
                }];
        }
        
        dispatch_group_notify(group, self.analyticsQueue, ^{
            resolve(@{
                @"synced_count": @(syncResults.count),
                @"remaining_count": @(self.offlineEventQueue.count)
            });
        });
    });
}

- (NSDictionary *)moduleConstants {
    return @{
        @"maxRetryAttempts": @(self.maxRetryAttempts),
        @"maxQueueSize": @(self.maxQueueSize),
        @"retryBaseInterval": @(self.retryBaseInterval),
        @"errorCodes": @{
            @"auth": @(ERROR_CODE_AUTH),
            @"permission": @(ERROR_CODE_PERMISSION),
            @"validation": @(ERROR_CODE_VALIDATION),
            @"rateLimit": @(ERROR_CODE_RATE_LIMIT),
            @"system": @(ERROR_CODE_SYSTEM),
            @"integration": @(ERROR_CODE_INTEGRATION)
        }
    };
}

#pragma mark - Private Methods

- (void)setupNetworkMonitoring {
    // Network monitoring setup would go here
    // Using iOS Reachability or NWPathMonitor
}

- (BOOL)isNetworkAvailable {
    // Network availability check implementation
    return YES; // Placeholder
}

- (NSMutableDictionary *)sanitizeParameters:(NSDictionary *)parameters {
    NSMutableDictionary *sanitized = [NSMutableDictionary dictionaryWithDictionary:parameters ?: @{}];
    
    // Remove any PII data based on privacy settings
    NSArray *piiKeys = @[@"email", @"phone", @"address"];
    [sanitized removeObjectsForKeys:piiKeys];
    
    return sanitized;
}

- (void)sendEvent:(NSString *)eventName
       parameters:(NSDictionary *)parameters
       retryCount:(NSUInteger)retryCount
       completion:(void (^)(NSError *))completion {
    [[AnalyticsManager shared] trackEvent:eventName parameters:parameters completion:^(NSError *error) {
        if (error && retryCount < self.maxRetryAttempts) {
            dispatch_time_t delay = dispatch_time(DISPATCH_TIME_NOW, (int64_t)(pow(2, retryCount) * self.retryBaseInterval * NSEC_PER_SEC));
            dispatch_after(delay, self.analyticsQueue, ^{
                [self sendEvent:eventName
                   parameters:parameters
                   retryCount:retryCount + 1
                   completion:completion];
            });
        } else {
            completion(error);
        }
    }];
}

- (void)queueOfflineEvent:(NSString *)eventName parameters:(NSDictionary *)parameters {
    if (self.offlineEventQueue.count >= self.maxQueueSize) {
        return;
    }
    
    [self.offlineEventQueue addObject:@{
        @"name": eventName,
        @"parameters": parameters,
        @"timestamp": [NSDate date]
    }];
}

- (void)handleEventError:(NSError *)error eventName:(NSString *)eventName parameters:(NSDictionary *)parameters {
    NSUInteger consecutiveFailures = [self.privacySettings integerForKey:@"consecutive_failures"];
    consecutiveFailures++;
    
    if (consecutiveFailures >= 5) {
        self.circuitBreakerOpen = YES;
        self.lastCircuitBreakerTrip = [NSDate date];
    }
    
    [self.privacySettings setInteger:consecutiveFailures forKey:@"consecutive_failures"];
    [self.privacySettings synchronize];
}

- (BOOL)shouldResetCircuitBreaker {
    if (!self.lastCircuitBreakerTrip) {
        return YES;
    }
    
    NSTimeInterval timeSinceTrip = [[NSDate date] timeIntervalSinceDate:self.lastCircuitBreakerTrip];
    return timeSinceTrip >= 300; // Reset after 5 minutes
}

@end