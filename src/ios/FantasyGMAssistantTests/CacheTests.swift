//
// CacheTests.swift
// FantasyGMAssistantTests
//
// Comprehensive test suite for CacheManager validating caching functionality,
// performance, and TTL enforcement
// Version: 1.0.0
//

import XCTest
import Foundation
@testable import FantasyGMAssistant

// MARK: - Test Constants
private let TEST_PLAYER_STATS_KEY = "test_player_stats"
private let TEST_WEATHER_DATA_KEY = "test_weather_data"
private let TEST_TRADE_ANALYSIS_KEY = "test_trade_analysis"
private let TEST_VIDEO_CONTENT_KEY = "test_video_content"
private let PERFORMANCE_THRESHOLD_SECONDS = 2.0

// MARK: - Mock Cacheable Implementation
private class MockCacheable: Cacheable {
    var cacheKey: String
    var expiryDate: Date
    var data: String
    var version: Int
    var estimatedSize: Int
    
    init(data: String, version: Int = 1, size: Int = 100) {
        self.cacheKey = UUID().uuidString
        self.expiryDate = Date().addingTimeInterval(CacheConfig.playerStats)
        self.data = data
        self.version = version
        self.estimatedSize = size
    }
    
    func toCacheData() throws -> Data {
        let versionData = withUnsafeBytes(of: version) { Data($0) }
        let contentData = data.data(using: .utf8)!
        return versionData + contentData
    }
    
    static func fromCacheData(_ data: Data) throws -> Self? {
        guard data.count >= MemoryLayout<Int>.size else { return nil }
        
        let versionData = data.prefix(MemoryLayout<Int>.size)
        let version = versionData.withUnsafeBytes { $0.load(as: Int.self) }
        
        let contentData = data.dropFirst(MemoryLayout<Int>.size)
        guard let content = String(data: contentData, encoding: .utf8) else { return nil }
        
        return MockCacheable(data: content, version: version) as? Self
    }
    
    func simulateCorruption() {
        data = String(repeating: "0", count: 1000)
    }
}

// MARK: - Cache Tests
class CacheTests: XCTestCase {
    private var cacheManager: CacheManager!
    private var mockPlayerStats: MockCacheable!
    private var mockWeatherData: MockCacheable!
    private var mockTradeAnalysis: MockCacheable!
    private var mockVideoContent: MockCacheable!
    
    override func setUp() {
        super.setUp()
        cacheManager = CacheManager.shared
        mockPlayerStats = MockCacheable(data: "Player Stats Data")
        mockWeatherData = MockCacheable(data: "Weather Data")
        mockTradeAnalysis = MockCacheable(data: "Trade Analysis Data")
        mockVideoContent = MockCacheable(data: "Video Content Data")
    }
    
    override func tearDown() {
        cacheManager.clear()
        super.tearDown()
    }
    
    // MARK: - TTL Tests
    func testPlayerStatsTTL() {
        // Store player stats with 15-minute TTL
        cacheManager.set(mockPlayerStats, ttl: CacheConfig.playerStats)
        
        // Verify immediate access
        var cachedStats = cacheManager.get(mockPlayerStats.cacheKey, type: MockCacheable.self)
        XCTAssertNotNil(cachedStats, "Player stats should be immediately accessible")
        
        // Wait 14 minutes
        let expectation14min = XCTestExpectation(description: "14 minute wait")
        DispatchQueue.global().asyncAfter(deadline: .now() + 840) {
            expectation14min.fulfill()
        }
        wait(for: [expectation14min], timeout: 850)
        
        // Verify still accessible
        cachedStats = cacheManager.get(mockPlayerStats.cacheKey, type: MockCacheable.self)
        XCTAssertNotNil(cachedStats, "Player stats should still be accessible after 14 minutes")
        
        // Wait additional 2 minutes
        let expectation2min = XCTestExpectation(description: "2 minute wait")
        DispatchQueue.global().asyncAfter(deadline: .now() + 120) {
            expectation2min.fulfill()
        }
        wait(for: [expectation2min], timeout: 130)
        
        // Verify expired
        cachedStats = cacheManager.get(mockPlayerStats.cacheKey, type: MockCacheable.self)
        XCTAssertNil(cachedStats, "Player stats should expire after 15 minutes")
    }
    
    // MARK: - Performance Tests
    func testCachePerformance() {
        measure {
            // Test write performance
            let writeStart = Date()
            for i in 0..<100 {
                let mock = MockCacheable(data: "Performance Test Data \(i)")
                cacheManager.set(mock, ttl: CacheConfig.playerStats)
            }
            let writeTime = Date().timeIntervalSince(writeStart)
            XCTAssertLessThan(writeTime, PERFORMANCE_THRESHOLD_SECONDS, "Write operations should complete within threshold")
            
            // Test read performance
            let readStart = Date()
            for i in 0..<100 {
                _ = cacheManager.get(mockPlayerStats.cacheKey, type: MockCacheable.self)
            }
            let readTime = Date().timeIntervalSince(readStart)
            XCTAssertLessThan(readTime, PERFORMANCE_THRESHOLD_SECONDS, "Read operations should complete within threshold")
        }
    }
    
    // MARK: - Concurrent Access Tests
    func testConcurrentAccess() {
        let concurrentQueue = DispatchQueue(label: "concurrent.cache.test", attributes: .concurrent)
        let expectation = XCTestExpectation(description: "Concurrent operations")
        expectation.expectedFulfillmentCount = 100
        
        for i in 0..<100 {
            concurrentQueue.async {
                // Write operation
                let mock = MockCacheable(data: "Concurrent Test Data \(i)")
                self.cacheManager.set(mock, ttl: CacheConfig.playerStats)
                
                // Read operation
                let cached = self.cacheManager.get(mock.cacheKey, type: MockCacheable.self)
                XCTAssertNotNil(cached, "Concurrent cache operations should maintain data integrity")
                
                expectation.fulfill()
            }
        }
        
        wait(for: [expectation], timeout: 10.0)
    }
    
    // MARK: - Memory Warning Tests
    func testMemoryWarningHandling() {
        // Store test data
        cacheManager.set(mockPlayerStats, ttl: CacheConfig.playerStats)
        
        // Simulate memory warning
        NotificationCenter.default.post(name: UIApplication.didReceiveMemoryWarningNotification, object: nil)
        
        // Verify data is still accessible from disk
        let cached = cacheManager.get(mockPlayerStats.cacheKey, type: MockCacheable.self)
        XCTAssertNotNil(cached, "Data should be recoverable from disk after memory warning")
    }
    
    // MARK: - Cache Size Tests
    func testCacheSizeManagement() {
        // Store large objects
        for i in 0..<1000 {
            let largeData = String(repeating: "X", count: 1000)
            let mock = MockCacheable(data: largeData, size: 1000)
            cacheManager.set(mock, ttl: CacheConfig.playerStats)
        }
        
        // Verify cache can handle large data sets
        let cached = cacheManager.get(mockPlayerStats.cacheKey, type: MockCacheable.self)
        XCTAssertNotNil(cached, "Cache should handle large data sets efficiently")
    }
    
    // MARK: - Data Corruption Tests
    func testDataCorruptionHandling() {
        // Store valid data
        cacheManager.set(mockPlayerStats, ttl: CacheConfig.playerStats)
        
        // Simulate data corruption
        mockPlayerStats.simulateCorruption()
        cacheManager.set(mockPlayerStats, ttl: CacheConfig.playerStats)
        
        // Attempt to retrieve corrupted data
        let cached = cacheManager.get(mockPlayerStats.cacheKey, type: MockCacheable.self)
        XCTAssertNil(cached, "Cache should handle corrupted data gracefully")
    }
}