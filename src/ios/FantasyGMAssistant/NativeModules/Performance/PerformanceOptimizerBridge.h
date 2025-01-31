//
// PerformanceOptimizerBridge.h
// FantasyGMAssistant
//
// Thread-safe bridge for native iOS performance optimization with DataDog integration
// Version: 1.0.0
//

#import <React/RCTBridgeModule.h> // React Native 0.72+
#import <Foundation/Foundation.h> // iOS 14.0+

NS_ASSUME_NONNULL_BEGIN

/**
 * Bridge module that exposes native performance optimization functionality to React Native
 * with enhanced error handling and telemetry support.
 */
@interface PerformanceOptimizerBridge : NSObject <RCTBridgeModule>

/**
 * Starts performance monitoring with device-specific optimizations.
 * Thread-safe implementation with enhanced error handling.
 */
RCT_EXTERN_METHOD(startPerformanceMonitoring:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

/**
 * Stops performance monitoring and performs cleanup.
 * Thread-safe implementation with resource management.
 */
RCT_EXTERN_METHOD(stopPerformanceMonitoring:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

/**
 * Retrieves current performance metrics with enhanced error handling.
 * Returns metrics through promise resolution.
 */
RCT_EXTERN_METHOD(getPerformanceMetrics:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

/**
 * Optimizes memory usage with enhanced monitoring.
 * Thread-safe implementation with telemetry support.
 */
RCT_EXTERN_METHOD(optimizeMemoryUsage)

@end

NS_ASSUME_NONNULL_END