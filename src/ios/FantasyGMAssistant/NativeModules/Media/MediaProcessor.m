//
// MediaProcessor.m
// FantasyGMAssistant
//
// Enhanced media processing bridge implementation for iOS
// Version: 1.0.0
//

#import <Foundation/Foundation.h> // iOS 14.0+
#import <React/RCTBridgeModule.h> // React Native 0.72+
#import "MediaProcessorBridge.h"
#import <FantasyGMAssistant-Swift.h> // Generated Swift header

// Error domain constant
NSString * const kMediaProcessorErrorDomain = @"com.fantasygm.mediaprocessor";

@interface MediaProcessorBridge ()

@property (nonatomic, strong) MediaProcessor *mediaProcessor;
@property (nonatomic, strong) NSMutableDictionary *activeOperations;
@property (nonatomic) dispatch_queue_t processingQueue;

@end

@implementation MediaProcessorBridge

RCT_EXPORT_MODULE(MediaProcessorBridge)

- (instancetype)init {
    if (self = [super init]) {
        // Initialize Swift MediaProcessor with default configuration
        self.mediaProcessor = [[MediaProcessor alloc] initWithConfig:nil];
        
        // Create serial queue for media processing
        self.processingQueue = dispatch_queue_create("com.fantasygm.mediaprocessor", 
                                                   DISPATCH_QUEUE_SERIAL);
        dispatch_set_target_queue(self.processingQueue, 
                                dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0));
        
        // Initialize active operations tracking
        self.activeOperations = [NSMutableDictionary dictionary];
        
        // Register for memory warnings
        [[NSNotificationCenter defaultCenter] addObserver:self
                                               selector:@selector(handleMemoryWarning)
                                                   name:UIApplicationDidReceiveMemoryWarningNotification
                                                 object:nil];
    }
    return self;
}

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (dispatch_queue_t)methodQueue {
    return self.processingQueue;
}

RCT_EXPORT_METHOD(generateTradeAnalysisVideo:(NSDictionary *)tradeDetails
                  withProgress:(RCTResponseSenderBlock)progressCallback
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    NSString *operationId = [[NSUUID UUID] UUIDString];
    self.activeOperations[operationId] = @YES;
    
    // Validate input parameters
    if (!tradeDetails || ![tradeDetails isKindOfClass:[NSDictionary class]]) {
        reject(@"invalid_input", @"Invalid trade details provided", nil);
        return;
    }
    
    // Create progress handler
    void (^progressHandler)(double) = ^(double progress) {
        if (progressCallback) {
            progressCallback(@[@(progress)]);
        }
    };
    
    // Execute on processing queue
    dispatch_async(self.processingQueue, ^{
        [self.mediaProcessor generateTradeAnalysisVideoWithTradeDetails:tradeDetails 
                                                      progressHandler:progressHandler
                                                       completionHandler:^(NSURL * _Nullable videoURL, NSError * _Nullable error) {
            // Remove operation tracking
            [self.activeOperations removeObjectForKey:operationId];
            
            if (error) {
                reject(@"processing_failed",
                      error.localizedDescription,
                      error);
                return;
            }
            
            if (!videoURL) {
                reject(@"no_output",
                      @"Failed to generate video output",
                      nil);
                return;
            }
            
            resolve(videoURL.absoluteString);
        }];
    });
}

RCT_EXPORT_METHOD(generateVoiceOver:(NSString *)text
                  voiceSettings:(NSDictionary *)settings
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    // Validate input text
    if (!text || [text length] == 0) {
        reject(@"invalid_input", @"Text content is required", nil);
        return;
    }
    
    // Configure voice quality
    VoiceQuality quality = VoiceQualityStandard;
    NSString *qualitySetting = settings[@"quality"];
    if ([qualitySetting isEqualToString:@"premium"]) {
        quality = VoiceQualityPremium;
    } else if ([qualitySetting isEqualToString:@"high"]) {
        quality = VoiceQualityHigh;
    }
    
    // Execute voice generation
    dispatch_async(self.processingQueue, ^{
        [self.mediaProcessor generateVoiceOverWithText:text
                                            quality:quality
                                  completionHandler:^(NSURL * _Nullable audioURL, NSError * _Nullable error) {
            if (error) {
                reject(@"voice_generation_failed",
                      error.localizedDescription,
                      error);
                return;
            }
            
            resolve(audioURL.absoluteString);
        }];
    });
}

RCT_EXPORT_METHOD(processMediaFile:(NSString *)fileURLString
                  options:(NSDictionary *)options
                  withProgress:(RCTResponseSenderBlock)progressCallback
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    NSURL *fileURL = [NSURL URLWithString:fileURLString];
    if (!fileURL) {
        reject(@"invalid_url", @"Invalid file URL provided", nil);
        return;
    }
    
    // Create processing options
    MediaProcessingOptions *processingOptions = [[MediaProcessingOptions alloc] initWithDictionary:options];
    
    // Create progress handler
    void (^progressHandler)(double) = ^(double progress) {
        if (progressCallback) {
            progressCallback(@[@(progress)]);
        }
    };
    
    // Execute processing
    dispatch_async(self.processingQueue, ^{
        [self.mediaProcessor processMediaFileWithFileURL:fileURL
                                              options:processingOptions
                                      progressHandler:progressHandler
                                   completionHandler:^(NSURL * _Nullable outputURL, NSError * _Nullable error) {
            if (error) {
                reject(@"processing_failed",
                      error.localizedDescription,
                      error);
                return;
            }
            
            resolve(outputURL.absoluteString);
        }];
    });
}

RCT_EXPORT_METHOD(cancelOperation:(NSString *)operationId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    
    if ([self.activeOperations objectForKey:operationId]) {
        [self.mediaProcessor cancelCurrentTask];
        [self.activeOperations removeObjectForKey:operationId];
        resolve(@YES);
    } else {
        resolve(@NO);
    }
}

- (void)handleMemoryWarning {
    // Cancel non-critical operations
    [self.mediaProcessor cancelCurrentTask];
    
    // Clear active operations
    [self.activeOperations removeAllObjects];
    
    // Clean up temporary files
    [self.mediaProcessor cleanupTemporaryFiles];
}

- (void)dealloc {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

@end