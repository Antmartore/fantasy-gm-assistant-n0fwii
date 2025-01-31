//
// NotificationManager.m
// FantasyGMAssistant
//
// Thread-safe notification manager implementation
// Version: 1.0.0
//

#import "NotificationManagerBridge.h"
#import <React/RCTLog.h> // React Native 0.72+
#import <UserNotifications/UserNotifications.h> // iOS 14.0+

// MARK: - Constants
static dispatch_queue_t _notificationQueue;
static const NSInteger kMaxRetryAttempts = 3;
static const NSTimeInterval kRetryDelay = 1.0;

@interface NotificationManagerBridge ()
@property (nonatomic, strong) NotificationManager *notificationManager;
@end

@implementation NotificationManagerBridge

// MARK: - Module Setup
RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

- (instancetype)init {
    if (self = [super init]) {
        // Initialize serial queue for thread-safe operations
        _notificationQueue = dispatch_queue_create("com.fantasygm.notifications", DISPATCH_QUEUE_SERIAL);
        
        // Initialize notification manager
        self.notificationManager = [NotificationManager shared];
        
        // Register for authorization changes
        [[NSNotificationCenter defaultCenter] addObserver:self
                                               selector:@selector(handleAuthorizationChange:)
                                                   name:@"NotificationAuthorizationChanged"
                                                 object:nil];
    }
    return self;
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

// MARK: - Exported Methods
RCT_EXPORT_METHOD(requestNotificationPermissions:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    if (!resolve || !reject) {
        RCTLogError(@"Invalid promise callbacks provided");
        return;
    }
    
    dispatch_async(_notificationQueue, ^{
        __block NSInteger retryCount = 0;
        __block BOOL completed = NO;
        
        void (^requestPermissions)(void) = ^{
            [self.notificationManager requestNotificationPermissions:^(BOOL granted, NSError *error) {
                if (error) {
                    if (retryCount < kMaxRetryAttempts) {
                        retryCount++;
                        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(kRetryDelay * NSEC_PER_SEC)),
                                     _notificationQueue,
                                     requestPermissions);
                        return;
                    }
                    
                    if (!completed) {
                        completed = YES;
                        reject(@"permission_error",
                              @"Failed to request notification permissions",
                              error);
                    }
                    return;
                }
                
                if (!completed) {
                    completed = YES;
                    resolve(@(granted));
                }
            }];
        };
        
        requestPermissions();
    });
}

RCT_EXPORT_METHOD(configureNotificationCategories:(NSDictionary *)categories
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    if (!categories || ![categories isKindOfClass:[NSDictionary class]]) {
        reject(@"invalid_categories",
               @"Categories must be a valid dictionary",
               nil);
        return;
    }
    
    dispatch_async(_notificationQueue, ^{
        NSMutableArray *categoryConfigs = [NSMutableArray new];
        
        // Convert JS categories to native format
        for (NSString *key in categories) {
            NSDictionary *category = categories[key];
            if (![category isKindOfClass:[NSDictionary class]]) continue;
            
            NSMutableDictionary *config = [NSMutableDictionary new];
            config[@"identifier"] = key;
            config[@"actions"] = category[@"actions"] ?: @[];
            
            [categoryConfigs addObject:config];
        }
        
        // Configure categories through NotificationManager
        [self.notificationManager configureNotificationCategories:categoryConfigs];
        
        resolve(@{@"success": @YES,
                 @"categories": @(categoryConfigs.count)});
    });
}

RCT_EXPORT_METHOD(updateBadgeCount:(NSInteger)count) {
    if (count < 0) {
        RCTLogError(@"Badge count cannot be negative");
        return;
    }
    
    dispatch_async(_notificationQueue, ^{
        [self.notificationManager updateBadgeCount:count];
    });
}

// MARK: - Private Methods
- (void)handleAuthorizationChange:(NSNotification *)notification {
    dispatch_async(_notificationQueue, ^{
        BOOL authorized = [notification.userInfo[@"authorized"] boolValue];
        
        // Notify JS of authorization changes
        [self sendEventWithName:@"onNotificationAuthorizationChanged"
                         body:@{@"authorized": @(authorized)}];
    });
}

// MARK: - Supported Events
- (NSArray<NSString *> *)supportedEvents {
    return @[@"onNotificationAuthorizationChanged",
             @"onNotificationReceived",
             @"onNotificationResponse"];
}

@end