//
// NotificationTests.swift
// FantasyGMAssistantTests
//
// Unit tests for iOS notification management functionality
// Version: 1.0.0
//

import XCTest // iOS 14.0+
import UserNotifications // iOS 14.0+
@testable import FantasyGMAssistant

final class NotificationTests: XCTestCase {
    // MARK: - Properties
    private var notificationManager: NotificationManager!
    private var mockNotificationCenter: MockUNUserNotificationCenter!
    private var expectations: [String: XCTestExpectation]!
    
    // MARK: - Setup & Teardown
    override func setUp() {
        super.setUp()
        mockNotificationCenter = MockUNUserNotificationCenter()
        notificationManager = NotificationManager.shared
        expectations = [:]
        
        // Replace notification center with mock for testing
        let mirror = Mirror(reflecting: notificationManager)
        if let centerProperty = mirror.children.first(where: { $0.label == "notificationCenter" }) {
            let propertyObject = centerProperty.value as AnyObject
            let propertyAddress = Unmanaged.passUnretained(propertyObject).toOpaque()
            withUnsafeMutableBytes(of: &propertyAddress) { pointer in
                pointer.storeBytes(of: Unmanaged.passUnretained(mockNotificationCenter).toOpaque(), as: UnsafeRawPointer.self)
            }
        }
    }
    
    override func tearDown() {
        notificationManager = nil
        mockNotificationCenter = nil
        expectations = nil
        super.tearDown()
    }
    
    // MARK: - Permission Tests
    @MainActor
    func testRequestNotificationPermissions() async throws {
        // Create expectation
        let permissionExpectation = expectation(description: "Permission request completed")
        
        // Mock authorization response
        mockNotificationCenter.mockAuthorizationStatus = .notDetermined
        mockNotificationCenter.mockAuthorizationResponse = (true, nil)
        
        // Request permissions
        notificationManager.requestNotificationPermissions { granted, error in
            XCTAssertTrue(granted)
            XCTAssertNil(error)
            XCTAssertEqual(self.mockNotificationCenter.requestedAuthorizationOptions, [.alert, .sound, .badge, .provisional])
            permissionExpectation.fulfill()
        }
        
        await waitForExpectations(timeout: 5.0)
        
        // Test denial case
        let denialExpectation = expectation(description: "Permission denial completed")
        mockNotificationCenter.mockAuthorizationResponse = (false, nil)
        
        notificationManager.requestNotificationPermissions { granted, error in
            XCTAssertFalse(granted)
            XCTAssertNil(error)
            denialExpectation.fulfill()
        }
        
        await waitForExpectations(timeout: 5.0)
        
        // Test error case
        let errorExpectation = expectation(description: "Permission error completed")
        let mockError = NSError(domain: "NotificationTests", code: 1001, userInfo: nil)
        mockNotificationCenter.mockAuthorizationResponse = (false, mockError)
        
        notificationManager.requestNotificationPermissions { granted, error in
            XCTAssertFalse(granted)
            XCTAssertNotNil(error)
            XCTAssertEqual(error as NSError?, mockError)
            errorExpectation.fulfill()
        }
        
        await waitForExpectations(timeout: 5.0)
    }
    
    // MARK: - Category Configuration Tests
    @MainActor
    func testConfigureNotificationCategories() async throws {
        let configExpectation = expectation(description: "Category configuration completed")
        
        // Test category configuration
        let testCategories: [[String: Any]] = [
            [
                "identifier": "INJURY_ALERT",
                "actions": [
                    ["id": "view_details", "title": "View Details", "options": [.foreground]],
                    ["id": "adjust_lineup", "title": "Adjust Lineup", "options": [.foreground]]
                ]
            ],
            [
                "identifier": "TRADE_PROPOSAL",
                "actions": [
                    ["id": "accept_trade", "title": "Accept", "options": [.foreground]],
                    ["id": "reject_trade", "title": "Reject", "options": [.destructive]]
                ]
            ]
        ]
        
        notificationManager.configureNotificationCategories(testCategories)
        
        // Verify categories were configured
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            let configuredCategories = self.mockNotificationCenter.notificationCategories
            
            XCTAssertEqual(configuredCategories.count, 2)
            
            if let injuryCategory = configuredCategories.first(where: { $0.identifier == "INJURY_ALERT" }) {
                XCTAssertEqual(injuryCategory.actions.count, 2)
                XCTAssertEqual(injuryCategory.actions[0].identifier, "view_details")
                XCTAssertEqual(injuryCategory.actions[1].identifier, "adjust_lineup")
            } else {
                XCTFail("INJURY_ALERT category not found")
            }
            
            if let tradeCategory = configuredCategories.first(where: { $0.identifier == "TRADE_PROPOSAL" }) {
                XCTAssertEqual(tradeCategory.actions.count, 2)
                XCTAssertEqual(tradeCategory.actions[0].identifier, "accept_trade")
                XCTAssertEqual(tradeCategory.actions[1].identifier, "reject_trade")
            } else {
                XCTFail("TRADE_PROPOSAL category not found")
            }
            
            configExpectation.fulfill()
        }
        
        await waitForExpectations(timeout: 5.0)
    }
    
    // MARK: - Badge Count Tests
    @MainActor
    func testUpdateBadgeCount() async throws {
        let badgeExpectation = expectation(description: "Badge update completed")
        
        // Test initial badge update
        notificationManager.updateBadgeCount(5)
        
        // Allow time for async update
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            XCTAssertEqual(UIApplication.shared.applicationIconBadgeNumber, 5)
            
            // Test badge increment
            self.notificationManager.updateBadgeCount(10)
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                XCTAssertEqual(UIApplication.shared.applicationIconBadgeNumber, 10)
                
                // Test badge reset
                self.notificationManager.updateBadgeCount(0)
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    XCTAssertEqual(UIApplication.shared.applicationIconBadgeNumber, 0)
                    badgeExpectation.fulfill()
                }
            }
        }
        
        await waitForExpectations(timeout: 5.0)
    }
    
    // MARK: - Notification Handling Tests
    @MainActor
    func testHandleNotificationReceived() async throws {
        let handlingExpectation = expectation(description: "Notification handling completed")
        
        // Create test notification content
        let content = UNMutableNotificationContent()
        content.title = "Injury Alert"
        content.body = "Player K.Murray is out for Week 12"
        content.categoryIdentifier = "INJURY_ALERT"
        content.userInfo = [
            "player": "K.Murray",
            "team": "ARI",
            "injury_type": "Knee",
            "week": 12
        ]
        content.badge = 1
        
        // Create test notification request
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        let notification = UNNotification(request: request, date: Date())
        
        // Handle notification
        notificationManager.handleNotificationReceived(notification)
        
        // Verify handling
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            XCTAssertEqual(UIApplication.shared.applicationIconBadgeNumber, 1)
            
            // Verify analytics tracking
            let mirror = Mirror(reflecting: self.notificationManager)
            if let analyticsProperty = mirror.children.first(where: { $0.label == "deliveryAnalytics" }) {
                let analytics = analyticsProperty.value as? [String: Int]
                XCTAssertEqual(analytics?["INJURY_ALERT"], 1)
            }
            
            handlingExpectation.fulfill()
        }
        
        await waitForExpectations(timeout: 5.0)
    }
}

// MARK: - Mock Notification Center
private class MockUNUserNotificationCenter: UNUserNotificationCenter {
    var mockAuthorizationStatus: UNAuthorizationStatus = .notDetermined
    var mockAuthorizationResponse: (Bool, Error?) = (false, nil)
    var requestedAuthorizationOptions: UNAuthorizationOptions?
    var notificationCategories: Set<UNNotificationCategory> = []
    
    override func requestAuthorization(options: UNAuthorizationOptions, completionHandler: @escaping (Bool, Error?) -> Void) {
        requestedAuthorizationOptions = options
        completionHandler(mockAuthorizationResponse.0, mockAuthorizationResponse.1)
    }
    
    override func getNotificationSettings(completionHandler: @escaping (UNNotificationSettings) -> Void) {
        let settings = MockNotificationSettings(authorizationStatus: mockAuthorizationStatus)
        completionHandler(settings)
    }
    
    override func setNotificationCategories(_ categories: Set<UNNotificationCategory>) {
        notificationCategories = categories
    }
}

// MARK: - Mock Notification Settings
private class MockNotificationSettings: UNNotificationSettings {
    private let _authorizationStatus: UNAuthorizationStatus
    
    init(authorizationStatus: UNAuthorizationStatus) {
        self._authorizationStatus = authorizationStatus
        super.init()
    }
    
    override var authorizationStatus: UNAuthorizationStatus {
        return _authorizationStatus
    }
}