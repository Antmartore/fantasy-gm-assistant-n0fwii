//
// PerformanceOptimizer.m
// FantasyGMAssistant
//
// Thread-safe implementation of performance optimization with DataDog integration
// Version: 1.0.0
//

#import "PerformanceOptimizerBridge.h"
#import <React/RCTBridgeModule.h> // React Native 0.72+
#import <React/RCTLog.h> // React Native 0.72+
#import <DatadogObjc/DatadogObjc.h> // DataDog 1.0+
#import <Foundation/Foundation.h> // iOS 14.0+

@interface PerformanceOptimizer () <RCTBridgeModule>

@property (nonatomic, strong) NSLock *lock;
@property (nonatomic, strong) DDMetricsLogger *metricsLogger;
@property (nonatomic, strong) NSMutableDictionary *performanceData;

@end

@implementation PerformanceOptimizer

// MARK: - RCT Module Setup
RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

// MARK: - Initialization
- (instancetype)init {
    if (self = [super init]) {
        _lock = [[NSLock alloc] init];
        _performanceData = [NSMutableDictionary dictionary];
        
        // Initialize DataDog metrics logger
        _metricsLogger = [[DDMetricsLogger alloc] init];
        
        // Register for memory warnings
        [[NSNotificationCenter defaultCenter] addObserver:self
                                               selector:@selector(handleMemoryWarning)
                                                   name:UIApplicationDidReceiveMemoryWarningNotification
                                                 object:nil];
    }
    return self;
}

// MARK: - Memory Warning Handler
- (void)handleMemoryWarning {
    [self.lock lock];
    @try {
        [self optimizeMemoryUsage];
        [self.metricsLogger logMetric:@"memory_warning"
                              value:@1
                              tags:@{@"type": @"system"}];
    } @finally {
        [self.lock unlock];
    }
}

// MARK: - Performance Monitoring Methods
RCT_EXPORT_METHOD(startPerformanceMonitoring:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [self.lock lock];
    @try {
        // Initialize DataDog monitoring session
        [self.metricsLogger startMonitoringSession];
        
        // Configure initial metrics
        [self.performanceData setObject:@{
            @"start_time": @([[NSDate date] timeIntervalSince1970]),
            @"device_model": [[UIDevice currentDevice] model],
            @"system_version": [[UIDevice currentDevice] systemVersion],
            @"memory_threshold": @0.8
        } forKey:@"session_info"];
        
        // Log monitoring start event
        [self.metricsLogger logMetric:@"monitoring_started"
                              value:@1
                              tags:@{@"version": @"1.0.0"}];
        
        resolve(nil);
    } @catch (NSException *exception) {
        reject(@"monitoring_error", exception.reason, nil);
    } @finally {
        [self.lock unlock];
    }
}

RCT_EXPORT_METHOD(stopPerformanceMonitoring:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [self.lock lock];
    @try {
        // Stop DataDog monitoring session
        [self.metricsLogger stopMonitoringSession];
        
        // Clear performance data
        [self.performanceData removeAllObjects];
        
        // Log monitoring stop event
        [self.metricsLogger logMetric:@"monitoring_stopped"
                              value:@1
                              tags:@{@"version": @"1.0.0"}];
        
        resolve(nil);
    } @catch (NSException *exception) {
        reject(@"monitoring_error", exception.reason, nil);
    } @finally {
        [self.lock unlock];
    }
}

RCT_EXPORT_METHOD(getPerformanceMetrics:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    [self.lock lock];
    @try {
        NSMutableDictionary *metrics = [NSMutableDictionary dictionary];
        
        // Collect memory metrics
        float memoryUsage = [self getMemoryUsage];
        [metrics setObject:@(memoryUsage) forKey:@"memory_usage"];
        
        // Collect CPU metrics
        float cpuUsage = [self getCPUUsage];
        [metrics setObject:@(cpuUsage) forKey:@"cpu_usage"];
        
        // Add device info
        [metrics addEntriesFromDictionary:[self getDeviceMetrics]];
        
        // Log metrics collection
        [self.metricsLogger logMetric:@"metrics_collected"
                              value:@1
                              tags:@{@"type": @"performance"}];
        
        resolve(metrics);
    } @catch (NSException *exception) {
        reject(@"metrics_error", exception.reason, nil);
    } @finally {
        [self.lock unlock];
    }
}

RCT_EXPORT_METHOD(optimizeMemoryUsage) {
    [self.lock lock];
    @try {
        float currentMemoryUsage = [self getMemoryUsage];
        
        if (currentMemoryUsage > 0.8) { // 80% threshold
            // Clear image caches
            [[NSURLCache sharedURLCache] removeAllCachedResponses];
            
            // Clear temporary files
            NSString *tempDir = NSTemporaryDirectory();
            NSFileManager *fileManager = [NSFileManager defaultManager];
            NSArray *tempFiles = [fileManager contentsOfDirectoryAtPath:tempDir error:nil];
            
            for (NSString *file in tempFiles) {
                NSString *filePath = [tempDir stringByAppendingPathComponent:file];
                [fileManager removeItemAtPath:filePath error:nil];
            }
            
            // Log optimization event
            [self.metricsLogger logMetric:@"memory_optimized"
                                  value:@1
                                  tags:@{@"trigger": @"threshold"}];
        }
    } @finally {
        [self.lock unlock];
    }
}

// MARK: - Helper Methods
- (float)getMemoryUsage {
    struct mach_task_basic_info info;
    mach_msg_type_number_t size = MACH_TASK_BASIC_INFO_COUNT;
    
    if (task_info(mach_task_self(), MACH_TASK_BASIC_INFO, (task_info_t)&info, &size) == KERN_SUCCESS) {
        return (float)info.resident_size / [NSProcessInfo processInfo].physicalMemory;
    }
    return 0.0;
}

- (float)getCPUUsage {
    kern_return_t kr;
    task_info_data_t tinfo;
    mach_msg_type_number_t task_info_count;
    
    task_info_count = TASK_INFO_MAX;
    kr = task_info(mach_task_self(), TASK_BASIC_INFO, (task_info_t)tinfo, &task_info_count);
    if (kr != KERN_SUCCESS) {
        return -1;
    }
    
    thread_array_t thread_list;
    mach_msg_type_number_t thread_count;
    kr = task_threads(mach_task_self(), &thread_list, &thread_count);
    if (kr != KERN_SUCCESS) {
        return -1;
    }
    
    float cpu_usage = 0;
    for (int i = 0; i < thread_count; i++) {
        thread_info_data_t thinfo;
        mach_msg_type_number_t thread_info_count = THREAD_INFO_MAX;
        kr = thread_info(thread_list[i], THREAD_BASIC_INFO, (thread_info_t)thinfo, &thread_info_count);
        if (kr == KERN_SUCCESS) {
            thread_basic_info_t basic_info_th = (thread_basic_info_t)thinfo;
            cpu_usage += basic_info_th->cpu_usage / (float)TH_USAGE_SCALE;
        }
    }
    
    vm_deallocate(mach_task_self(), (vm_offset_t)thread_list, thread_count * sizeof(thread_t));
    return cpu_usage * 100.0;
}

- (NSDictionary *)getDeviceMetrics {
    return @{
        @"device_model": [[UIDevice currentDevice] model],
        @"system_version": [[UIDevice currentDevice] systemVersion],
        @"low_power_mode": @([NSProcessInfo processInfo].lowPowerModeEnabled),
        @"thermal_state": @([NSProcessInfo processInfo].thermalState)
    };
}

// MARK: - Cleanup
- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    [self.metricsLogger stopMonitoringSession];
}

@end