//
// MediaProcessorBridge.h
// FantasyGMAssistant
//
// Bridge header exposing native iOS media processing functionality to React Native
// Version: 1.0.0
//

#import <Foundation/Foundation.h> // iOS 14.0+
#import <React/RCTBridgeModule.h> // React Native 0.72+
#import <React/RCTConvert.h> // React Native 0.72+

NS_ASSUME_NONNULL_BEGIN

/**
 * Bridge module that exposes native media processing functionality to React Native
 * with enhanced performance and memory management capabilities.
 */
@interface MediaProcessorBridge : NSObject <RCTBridgeModule>

/**
 * Generates a trade analysis video with AI-powered content and voice narration.
 * @param tradeDetails Dictionary containing trade information and player details
 * @param resolve Promise resolution callback with video URL
 * @param reject Promise rejection callback with error details
 */
RCT_EXTERN_METHOD(generateTradeAnalysisVideo:(nonnull NSDictionary *)tradeDetails
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

/**
 * Generates AI voice narration using Eleven Labs integration.
 * @param text Text content to convert to speech
 * @param resolve Promise resolution callback with audio URL
 * @param reject Promise rejection callback with error details
 */
RCT_EXTERN_METHOD(generateVoiceOver:(nonnull NSString *)text
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

/**
 * Processes media files with configurable options for optimization.
 * @param fileURL URL of the media file to process
 * @param options Dictionary of processing options (nullable)
 * @param resolve Promise resolution callback with processed file URL
 * @param reject Promise rejection callback with error details
 */
RCT_EXTERN_METHOD(processMediaFile:(nonnull NSURL *)fileURL
                  options:(nullable NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end

/**
 * Error domain constant for media processing errors
 */
extern NSString *const MediaProcessorErrorDomain;

/**
 * Error codes for media processing operations
 */
typedef NS_ENUM(NSInteger, MediaProcessorErrorCode) {
    MediaProcessorErrorInvalidInput = 1000,
    MediaProcessorErrorProcessingFailed = 1001,
    MediaProcessorErrorAPIError = 1002,
    MediaProcessorErrorResourceUnavailable = 1003,
    MediaProcessorErrorMemoryWarning = 1004,
    MediaProcessorErrorCacheError = 1005,
    MediaProcessorErrorNetworkError = 1006,
    MediaProcessorErrorOptimizationFailed = 1007
};

NS_ASSUME_NONNULL_END