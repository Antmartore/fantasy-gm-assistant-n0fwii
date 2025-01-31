//
// PerformanceTests.swift
// FantasyGMAssistantTests
//
// Comprehensive test suite for performance optimization validation
// Version: 1.0.0
//

import XCTest // iOS 14.0+
import Foundation // iOS 14.0+
import MetricKit // iOS 14.0+
@testable import FantasyGMAssistant

final class PerformanceTests: XCTestCase {
    
    // MARK: - Properties
    private var performanceOptimizer: PerformanceOptimizer!
    private var mockMetricsCollector: MXMetricManager!
    private var mockAIRecommendationData: [[String: Any]]!
    private var performanceBaselines: [String: Any]!
    
    // MARK: - Test Lifecycle
    override func setUp() {
        super.setUp()
        
        // Initialize performance optimizer
        performanceOptimizer = PerformanceOptimizer()
        
        // Setup mock AI recommendation data
        mockAIRecommendationData = (0..<100).map { _ in
            return [
                "player": UUID().uuidString,
                "position": ["QB", "RB", "WR", "TE"].randomElement()!,
                "score": Double.random(in: 0...100),
                "confidence": Double.random(in: 0...1)
            ]
        }
        
        // Define performance baselines based on device capability
        let isHighEndDevice = ProcessInfo.processInfo.processorCount >= 6
        performanceBaselines = [
            "maxMemoryUsage": isHighEndDevice ? 0.75 : 0.85,
            "maxCPUUsage": isHighEndDevice ? 80.0 : 90.0,
            "targetFrameRate": isHighEndDevice ? 60.0 : 30.0,
            "aiRecommendationThreshold": 2.0 // 2 seconds per technical spec
        ]
        
        // Start performance monitoring
        let expectation = XCTestExpectation(description: "Performance monitoring started")
        performanceOptimizer.startPerformanceMonitoring({ _ in
            expectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("Failed to start performance monitoring")
        })
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    override func tearDown() {
        // Clean up test artifacts
        performanceOptimizer = nil
        mockAIRecommendationData = nil
        performanceBaselines = nil
        
        // Clear any cached metrics
        URLCache.shared.removeAllCachedResponses()
        
        super.tearDown()
    }
    
    // MARK: - Test Cases
    func testAIRecommendationTiming() {
        let timingExpectation = XCTestExpectation(description: "AI recommendation timing validation")
        var timings: [TimeInterval] = []
        
        // Process 100 recommendations and measure timing
        for (index, recommendation) in mockAIRecommendationData.enumerated() {
            let startTime = Date()
            
            // Simulate AI recommendation processing
            autoreleasepool {
                // Process recommendation data
                _ = recommendation["score"] as? Double
                _ = recommendation["confidence"] as? Double
                
                // Add artificial processing time
                Thread.sleep(forTimeInterval: Double.random(in: 0.1...2.5))
            }
            
            let processingTime = Date().timeIntervalSince(startTime)
            timings.append(processingTime)
            
            if index == mockAIRecommendationData.count - 1 {
                timingExpectation.fulfill()
            }
        }
        
        wait(for: [timingExpectation], timeout: 300.0)
        
        // Calculate timing statistics
        let totalWithinThreshold = timings.filter { $0 <= performanceBaselines["aiRecommendationThreshold"] as! Double }.count
        let percentageWithinThreshold = Double(totalWithinThreshold) / Double(timings.count) * 100
        
        // Verify 95% of recommendations are within 2-second threshold
        XCTAssertGreaterThanOrEqual(percentageWithinThreshold, 95.0, "Failed to meet 95% timing requirement")
        
        // Log timing distribution
        let sortedTimings = timings.sorted()
        XCTContext.runActivity(named: "AI Recommendation Timing Distribution") { _ in
            print("Timing Statistics:")
            print("- Minimum: \(String(format: "%.3f", sortedTimings.first!))s")
            print("- Maximum: \(String(format: "%.3f", sortedTimings.last!))s")
            print("- Median: \(String(format: "%.3f", sortedTimings[sortedTimings.count/2]))s")
            print("- 95th Percentile: \(String(format: "%.3f", sortedTimings[Int(Double(sortedTimings.count) * 0.95)]))s")
            print("- Percentage within threshold: \(String(format: "%.1f", percentageWithinThreshold))%")
        }
    }
    
    func testMemoryOptimizationEffectiveness() {
        // Create controlled memory pressure
        var memoryHogs: [Data] = []
        let memoryWarningExpectation = XCTestExpectation(description: "Memory warning handled")
        
        // Measure baseline memory
        let initialMemory = performanceOptimizer.getPerformanceMetrics({ metrics in
            guard let memoryUsage = metrics["memory_usage"] as? Float else {
                XCTFail("Failed to get initial memory usage")
                return
            }
            
            // Allocate memory until we trigger optimization
            while memoryUsage < performanceBaselines["maxMemoryUsage"] as! Float {
                autoreleasepool {
                    memoryHogs.append(Data(count: 1024 * 1024)) // 1MB chunks
                }
            }
            
            // Trigger memory optimization
            self.performanceOptimizer.optimizeMemoryUsage()
            
            // Verify memory reduction
            self.performanceOptimizer.getPerformanceMetrics({ optimizedMetrics in
                guard let optimizedMemory = optimizedMetrics["memory_usage"] as? Float else {
                    XCTFail("Failed to get optimized memory usage")
                    return
                }
                
                XCTAssertLessThan(optimizedMemory, memoryUsage, "Memory optimization failed to reduce usage")
                memoryWarningExpectation.fulfill()
            }, rejecter: { _, _, _ in
                XCTFail("Failed to get optimized metrics")
            })
            
        }, rejecter: { _, _, _ in
            XCTFail("Failed to get initial metrics")
        })
        
        wait(for: [memoryWarningExpectation], timeout: 30.0)
        
        // Clean up
        memoryHogs.removeAll()
    }
    
    func testMetricsAccuracy() {
        let metricsExpectation = XCTestExpectation(description: "Metrics accuracy validation")
        
        // Generate known load
        var computeArray: [Double] = []
        for _ in 0..<1000000 {
            computeArray.append(Double.random(in: 0...1000))
        }
        
        // Collect metrics during load
        performanceOptimizer.getPerformanceMetrics({ metrics in
            // Validate CPU usage
            XCTAssertNotNil(metrics["cpu_usage"])
            XCTAssertLessThanOrEqual(metrics["cpu_usage"] as! Float, performanceBaselines["maxCPUUsage"] as! Float)
            
            // Validate memory metrics
            XCTAssertNotNil(metrics["memory_usage"])
            XCTAssertLessThanOrEqual(metrics["memory_usage"] as! Float, performanceBaselines["maxMemoryUsage"] as! Float)
            
            // Validate frame rate
            XCTAssertNotNil(metrics["frame_rate"])
            XCTAssertGreaterThanOrEqual(metrics["frame_rate"] as! Float, performanceBaselines["targetFrameRate"] as! Float)
            
            // Validate device capabilities
            XCTAssertNotNil(metrics["device_capabilities"])
            
            metricsExpectation.fulfill()
        }, rejecter: { _, _, _ in
            XCTFail("Failed to collect metrics")
        })
        
        wait(for: [metricsExpectation], timeout: 30.0)
        
        // Clean up
        computeArray.removeAll()
    }
}