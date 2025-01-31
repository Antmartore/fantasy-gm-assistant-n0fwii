//
// AnalyticsTests.swift
// FantasyGMAssistantTests
//
// Comprehensive test suite for AnalyticsManager functionality
// Version: 1.0.0
//

import XCTest // iOS 14.0+
import DatadogCore // 1.5.0+
import DatadogRUM // 1.5.0+
@testable import FantasyGMAssistant

final class AnalyticsTests: XCTestCase {
    // MARK: - Properties
    private var analyticsManager: AnalyticsManager!
    private var mockDatadogCore: MockDatadogCore!
    private var mockRUMMonitor: MockRUMMonitor!
    private var mockOfflineStorage: MockOfflineStorage!
    private var testExpectation: XCTestExpectation!
    
    // MARK: - Test Lifecycle
    override func setUp() {
        super.setUp()
        
        // Initialize mocks
        mockDatadogCore = MockDatadogCore()
        mockRUMMonitor = MockRUMMonitor()
        mockOfflineStorage = MockOfflineStorage()
        
        // Get analytics manager instance
        analyticsManager = AnalyticsManager.shared
        
        // Configure test environment
        analyticsManager.configure(
            apiKey: TEST_API_KEY,
            environment: TEST_ENVIRONMENT,
            privacyConfig: PrivacyConfig(gdprEnabled: true),
            networkConfig: NetworkConfig(retryAttempts: 3)
        )
    }
    
    override func tearDown() {
        // Reset mocks and clear data
        mockDatadogCore.reset()
        mockRUMMonitor.reset()
        mockOfflineStorage.clear()
        
        // Clear user data
        analyticsManager.clearUserData()
        
        super.tearDown()
    }
    
    // MARK: - Configuration Tests
    func testConfiguration() {
        // Test basic configuration
        XCTAssertNotNil(analyticsManager, "Analytics manager should be initialized")
        
        // Verify DataDog initialization
        XCTAssertTrue(mockDatadogCore.isInitialized, "DataDog should be initialized")
        XCTAssertEqual(mockDatadogCore.environment, TEST_ENVIRONMENT)
        XCTAssertEqual(mockDatadogCore.apiKey, TEST_API_KEY)
        
        // Test GDPR compliance
        XCTAssertTrue(mockDatadogCore.gdprEnabled, "GDPR should be enabled")
        XCTAssertEqual(mockDatadogCore.trackingConsent, .pending)
        
        // Test RUM configuration
        XCTAssertTrue(mockRUMMonitor.isEnabled, "RUM monitoring should be enabled")
        XCTAssertTrue(mockRUMMonitor.isTrackingErrors)
        XCTAssertTrue(mockRUMMonitor.isTrackingNetworkRequests)
    }
    
    // MARK: - Event Tracking Tests
    func testEventTracking() {
        // Setup test event
        let eventName = AnalyticsEvents.tradeAnalysis
        let eventParams: [String: Any] = [
            "team_id": "test_team_123",
            "trade_value": 85.5,
            "players_involved": 2
        ]
        
        // Track test event
        testExpectation = expectation(description: "Event tracking")
        analyticsManager.trackEvent(eventName, parameters: eventParams)
        
        // Verify event tracking
        waitForExpectations(timeout: TEST_TIMEOUT) { error in
            XCTAssertNil(error, "Event tracking should complete")
            
            // Verify event was sent to DataDog
            XCTAssertTrue(self.mockRUMMonitor.hasEvent(named: eventName))
            
            // Verify parameters
            let trackedParams = self.mockRUMMonitor.lastEventParameters
            XCTAssertEqual(trackedParams["team_id"] as? String, "test_team_123")
            XCTAssertEqual(trackedParams["trade_value"] as? Double, 85.5)
            XCTAssertEqual(trackedParams["players_involved"] as? Int, 2)
            
            // Verify automatic parameters
            XCTAssertNotNil(trackedParams["app_version"])
            XCTAssertNotNil(trackedParams["network_status"])
        }
    }
    
    // MARK: - User Properties Tests
    func testUserProperties() {
        // Setup test properties
        let userProps: [String: Any] = [
            "user_id": TEST_USER_ID,
            "email": "test@example.com", // Should be masked
            "premium_status": true
        ]
        
        // Set user properties
        testExpectation = expectation(description: "User properties")
        analyticsManager.setUserProperties(userProps)
        
        // Verify properties
        waitForExpectations(timeout: TEST_TIMEOUT) { error in
            XCTAssertNil(error, "Setting user properties should complete")
            
            // Verify PII handling
            let storedProps = self.mockDatadogCore.userProperties
            XCTAssertEqual(storedProps["user_id"] as? String, TEST_USER_ID)
            XCTAssertEqual(storedProps["email"] as? String, "[EMAIL]")
            XCTAssertEqual(storedProps["premium_status"] as? Bool, true)
        }
    }
    
    // MARK: - Screen View Tests
    func testScreenViews() {
        // Track screen view
        let screenName = "TradeAnalyzer"
        let screenProps: [String: Any] = [
            "view_mode": "detailed",
            "team_context": "active"
        ]
        
        testExpectation = expectation(description: "Screen view tracking")
        analyticsManager.trackScreenView(screenName, properties: screenProps)
        
        // Verify tracking
        waitForExpectations(timeout: TEST_TIMEOUT) { error in
            XCTAssertNil(error, "Screen view tracking should complete")
            
            // Verify RUM view event
            XCTAssertTrue(self.mockRUMMonitor.hasView(named: screenName))
            
            // Verify view properties
            let viewProps = self.mockRUMMonitor.lastViewProperties
            XCTAssertEqual(viewProps["view_mode"] as? String, "detailed")
            XCTAssertEqual(viewProps["team_context"] as? String, "active")
            
            // Verify timing data
            XCTAssertNotNil(viewProps["view_loading_time"])
        }
    }
    
    // MARK: - Error Tracking Tests
    func testErrorTracking() {
        // Setup test error
        let errorName = "API_ERROR"
        let errorMessage = "Failed to fetch trade data"
        let errorCode = 4001
        
        // Track error
        testExpectation = expectation(description: "Error tracking")
        analyticsManager.trackError(
            errorName,
            errorMessage: errorMessage,
            errorCode: errorCode,
            properties: ["retry_count": 1]
        )
        
        // Verify error tracking
        waitForExpectations(timeout: TEST_TIMEOUT) { error in
            XCTAssertNil(error, "Error tracking should complete")
            
            // Verify error was logged
            XCTAssertTrue(self.mockRUMMonitor.hasError(named: errorName))
            
            // Verify error properties
            let errorProps = self.mockRUMMonitor.lastErrorProperties
            XCTAssertEqual(errorProps["error_message"] as? String, errorMessage)
            XCTAssertEqual(errorProps["error_code"] as? Int, errorCode)
            XCTAssertEqual(errorProps["retry_count"] as? Int, 1)
        }
    }
    
    // MARK: - Offline Handling Tests
    func testOfflineHandling() {
        // Simulate offline state
        mockDatadogCore.setNetworkAvailable(false)
        
        // Track events while offline
        let offlineEvent = AnalyticsEvents.simulationRun
        let offlineParams: [String: Any] = ["simulation_type": "season"]
        
        analyticsManager.trackEvent(offlineEvent, parameters: offlineParams)
        
        // Verify event queuing
        XCTAssertEqual(mockOfflineStorage.queuedEvents.count, 1)
        XCTAssertEqual(mockOfflineStorage.queuedEvents.first?.name, offlineEvent)
        
        // Simulate coming back online
        mockDatadogCore.setNetworkAvailable(true)
        
        // Verify queue processing
        testExpectation = expectation(description: "Queue processing")
        analyticsManager.handleOfflineEvents()
        
        waitForExpectations(timeout: TEST_TIMEOUT) { error in
            XCTAssertNil(error, "Queue processing should complete")
            XCTAssertEqual(self.mockOfflineStorage.queuedEvents.count, 0)
            XCTAssertTrue(self.mockRUMMonitor.hasEvent(named: offlineEvent))
        }
    }
}

// MARK: - Mock Classes
private class MockDatadogCore {
    var isInitialized = false
    var environment: String?
    var apiKey: String?
    var gdprEnabled = false
    var trackingConsent: TrackingConsent = .pending
    var userProperties: [String: Any] = [:]
    private var networkAvailable = true
    
    func reset() {
        isInitialized = false
        environment = nil
        apiKey = nil
        gdprEnabled = false
        trackingConsent = .pending
        userProperties.removeAll()
        networkAvailable = true
    }
    
    func setNetworkAvailable(_ available: Bool) {
        networkAvailable = available
    }
}

private class MockRUMMonitor {
    var isEnabled = false
    var isTrackingErrors = false
    var isTrackingNetworkRequests = false
    private var events: [(name: String, parameters: [String: Any])] = []
    private var views: [(name: String, properties: [String: Any])] = []
    private var errors: [(name: String, properties: [String: Any])] = []
    
    var lastEventParameters: [String: Any] { events.last?.parameters ?? [:] }
    var lastViewProperties: [String: Any] { views.last?.properties ?? [:] }
    var lastErrorProperties: [String: Any] { errors.last?.properties ?? [:] }
    
    func hasEvent(named name: String) -> Bool {
        return events.contains { $0.name == name }
    }
    
    func hasView(named name: String) -> Bool {
        return views.contains { $0.name == name }
    }
    
    func hasError(named name: String) -> Bool {
        return errors.contains { $0.name == name }
    }
    
    func reset() {
        isEnabled = false
        isTrackingErrors = false
        isTrackingNetworkRequests = false
        events.removeAll()
        views.removeAll()
        errors.removeAll()
    }
}

private class MockOfflineStorage {
    var queuedEvents: [(name: String, parameters: [String: Any])] = []
    
    func clear() {
        queuedEvents.removeAll()
    }
}