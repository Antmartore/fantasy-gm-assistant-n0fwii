//
// FantasyGMAssistantUITests.swift
// FantasyGMAssistant
//
// UI test suite for Fantasy GM Assistant iOS app
// Version: 1.0.0
//

import XCTest // iOS 14.0+
@testable import FantasyGMAssistant

class FantasyGMAssistantUITests: XCTestCase {
    
    // MARK: - Properties
    private var app: XCUIApplication!
    private var isAuthenticated: Bool = false
    private let defaultTimeout: TimeInterval = 30.0
    private let retryAttempts: Int = 3
    private var metrics: XCTMetrics!
    
    // MARK: - Test Lifecycle
    override func setUp() {
        super.setUp()
        
        // Initialize application
        app = XCUIApplication()
        app.launchArguments.append("--uitesting")
        
        // Configure test environment
        app.launchEnvironment["TESTING_MODE"] = "1"
        app.launchEnvironment["API_BASE_URL"] = "https://api-test.fantasygm.com/api/v1"
        
        // Initialize metrics collection
        metrics = XCTCPUMetric()
        
        // Reset app state
        UserDefaults.standard.removePersistentDomain(forName: Bundle.main.bundleIdentifier!)
        
        continueAfterFailure = false
        app.launch()
    }
    
    override func tearDown() {
        // Cleanup and metrics reporting
        let report = XCTOSSignpostMetric.osSignpostMetric(for: app)
        measure(metrics: [metrics, report]) {
            app.terminate()
        }
        
        super.tearDown()
    }
    
    // MARK: - Authentication Tests
    func testLoginFlow() throws {
        // Test email login flow
        measure(metrics: [XCTMemoryMetric()]) {
            let emailField = app.textFields["EmailTextField"]
            XCTAssertTrue(emailField.waitForExistence(timeout: defaultTimeout))
            emailField.tap()
            emailField.typeText("test@example.com")
            
            let passwordField = app.secureTextFields["PasswordTextField"]
            XCTAssertTrue(passwordField.waitForExistence(timeout: defaultTimeout))
            passwordField.tap()
            passwordField.typeText("TestPassword123!")
            
            let loginButton = app.buttons["LoginButton"]
            XCTAssertTrue(loginButton.waitForExistence(timeout: defaultTimeout))
            loginButton.tap()
            
            // Verify successful login
            let dashboardTitle = app.staticTexts["DashboardTitle"]
            XCTAssertTrue(dashboardTitle.waitForExistence(timeout: defaultTimeout))
        }
    }
    
    // MARK: - Navigation Tests
    func testMainNavigation() throws {
        try loginIfNeeded()
        
        // Test bottom navigation
        let tabBar = app.tabBars["MainTabBar"]
        XCTAssertTrue(tabBar.waitForExistence(timeout: defaultTimeout))
        
        // Test each tab
        for tab in ["Home", "Teams", "Analysis", "Profile"] {
            let tabButton = tabBar.buttons[tab]
            XCTAssertTrue(tabButton.exists)
            tabButton.tap()
            
            // Verify tab content loaded
            let tabTitle = app.staticTexts["\(tab)Title"]
            XCTAssertTrue(tabTitle.waitForExistence(timeout: defaultTimeout))
        }
    }
    
    // MARK: - Team Management Tests
    func testTeamManagement() throws {
        try loginIfNeeded()
        
        measure(metrics: [XCTCPUMetric(), XCTMemoryMetric()]) {
            // Navigate to Teams
            app.tabBars["MainTabBar"].buttons["Teams"].tap()
            
            // Test team creation
            let addTeamButton = app.buttons["AddTeamButton"]
            XCTAssertTrue(addTeamButton.waitForExistence(timeout: defaultTimeout))
            addTeamButton.tap()
            
            // Fill team details
            let teamNameField = app.textFields["TeamNameTextField"]
            teamNameField.tap()
            teamNameField.typeText("Test Team")
            
            // Select sport type
            let sportPicker = app.pickers["SportTypePicker"]
            sportPicker.tap()
            app.pickerWheels.element.adjust(toPickerWheelValue: SportType.nfl.rawValue)
            
            // Select platform
            let platformPicker = app.pickers["PlatformPicker"]
            platformPicker.tap()
            app.pickerWheels.element.adjust(toPickerWheelValue: Platform.espn.rawValue)
            
            // Save team
            app.buttons["SaveTeamButton"].tap()
            
            // Verify team creation
            let teamCell = app.cells["TeamCell_TestTeam"]
            XCTAssertTrue(teamCell.waitForExistence(timeout: defaultTimeout))
        }
    }
    
    // MARK: - Accessibility Tests
    func testAccessibility() throws {
        // Enable VoiceOver for testing
        let voiceOverElement = XCUIApplication(bundleIdentifier: "com.apple.VoiceOverUtility")
        
        measure(metrics: [XCTCPUMetric()]) {
            // Test login screen accessibility
            let emailField = app.textFields["EmailTextField"]
            XCTAssertTrue(emailField.isAccessibilityElement)
            XCTAssertNotNil(emailField.accessibilityLabel)
            
            let passwordField = app.secureTextFields["PasswordTextField"]
            XCTAssertTrue(passwordField.isAccessibilityElement)
            XCTAssertNotNil(passwordField.accessibilityLabel)
            
            // Test navigation accessibility
            let tabBar = app.tabBars["MainTabBar"]
            XCTAssertTrue(tabBar.isAccessibilityElement)
            
            // Test dynamic type
            let contentSize = UIApplication.shared.preferredContentSizeCategory
            XCTAssertNotNil(contentSize)
            
            // Verify accessibility identifiers
            app.buttons.allElementsBoundByIndex.forEach { button in
                XCTAssertNotNil(button.accessibilityIdentifier)
            }
        }
    }
    
    // MARK: - Performance Tests
    func testPerformance() throws {
        measure(metrics: [XCTCPUMetric(), XCTMemoryMetric(), XCTStorageMetric()]) {
            // Test app launch performance
            app.terminate()
            app.launch()
            
            // Test navigation performance
            let tabBar = app.tabBars["MainTabBar"]
            XCTAssertTrue(tabBar.waitForExistence(timeout: defaultTimeout))
            
            // Test screen transitions
            for tab in ["Home", "Teams", "Analysis", "Profile"] {
                let startTime = Date()
                tabBar.buttons[tab].tap()
                let transitionTime = Date().timeIntervalSince(startTime)
                XCTAssertLessThan(transitionTime, 1.0) // Transition should be under 1 second
            }
        }
    }
    
    // MARK: - Helper Methods
    private func loginIfNeeded() throws {
        if !isAuthenticated {
            try testLoginFlow()
            isAuthenticated = true
        }
    }
    
    private func waitForElement(_ element: XCUIElement, timeout: TimeInterval? = nil) -> Bool {
        return element.waitForExistence(timeout: timeout ?? defaultTimeout)
    }
    
    private func takeScreenshot(name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}