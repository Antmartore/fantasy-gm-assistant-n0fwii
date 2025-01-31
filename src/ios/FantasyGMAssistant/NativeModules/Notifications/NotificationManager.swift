//
// NotificationManager.swift
// FantasyGMAssistant
//
// Thread-safe notification manager for handling push notifications
// Version: 1.0.0
//

import Foundation // iOS 14.0+
import UserNotifications // iOS 14.0+
import UIKit // iOS 14.0+
import Constants

@objc public final class NotificationManager: NSObject {
    // MARK: - Properties
    private let notificationCenter: UNUserNotificationCenter
    private let serialQueue: DispatchQueue
    private var currentBadgeCount: Int
    private var notificationCategories: [String: UNNotificationCategory]
    private var deliveryAnalytics: [String: Int]
    
    // Singleton instance
    @objc public static let shared = NotificationManager()
    
    // MARK: - Initialization
    private override init() {
        self.notificationCenter = UNUserNotificationCenter.current()
        self.serialQueue = DispatchQueue(label: "com.fantasygm.assistant.notifications", qos: .userInitiated)
        self.currentBadgeCount = 0
        self.notificationCategories = [:]
        self.deliveryAnalytics = [:]
        
        super.init()
        
        Logger.shared.debug("NotificationManager initialized")
        setupDefaultCategories()
    }
    
    // MARK: - Private Methods
    private func setupDefaultCategories() {
        // Fantasy sports specific notification categories
        let categories: [[String: Any]] = [
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
                    ["id": "reject_trade", "title": "Reject", "options": [.destructive]],
                    ["id": "analyze_trade", "title": "Analyze", "options": [.foreground]]
                ]
            ],
            [
                "identifier": "GAME_START",
                "actions": [
                    ["id": "view_lineup", "title": "View Lineup", "options": [.foreground]],
                    ["id": "view_matchup", "title": "View Matchup", "options": [.foreground]]
                ]
            ]
        ]
        
        configureNotificationCategories(categories)
    }
    
    private func createNotificationActions(from actions: [[String: Any]]) -> [UNNotificationAction] {
        return actions.compactMap { actionDict in
            guard let id = actionDict["id"] as? String,
                  let title = actionDict["title"] as? String,
                  let options = actionDict["options"] as? [UNNotificationActionOptions] else {
                Logger.shared.error("Invalid notification action configuration")
                return nil
            }
            
            return UNNotificationAction(
                identifier: id,
                title: title,
                options: UNNotificationActionOptions(options)
            )
        }
    }
    
    // MARK: - Public Methods
    @objc public func requestNotificationPermissions(completion: @escaping (Bool, Error?) -> Void) {
        let options: UNAuthorizationOptions = [.alert, .sound, .badge, .provisional]
        
        Logger.shared.debug("Requesting notification permissions")
        
        notificationCenter.getNotificationSettings { settings in
            if settings.authorizationStatus == .notDetermined {
                self.notificationCenter.requestAuthorization(options: options) { granted, error in
                    self.serialQueue.async {
                        if let error = error {
                            Logger.shared.error("Failed to request notification permissions", error: error)
                        } else {
                            Logger.shared.info("Notification permissions granted: \(granted)")
                        }
                        completion(granted, error)
                    }
                }
            } else {
                self.serialQueue.async {
                    let granted = settings.authorizationStatus == .authorized
                    Logger.shared.info("Notification permission status: \(granted)")
                    completion(granted, nil)
                }
            }
        }
    }
    
    @objc public func configureNotificationCategories(_ categories: [[String: Any]]) {
        serialQueue.async {
            var configuredCategories: Set<UNNotificationCategory> = []
            
            for category in categories {
                guard let identifier = category["identifier"] as? String,
                      let actions = category["actions"] as? [[String: Any]] else {
                    Logger.shared.error("Invalid category configuration")
                    continue
                }
                
                let notificationActions = self.createNotificationActions(from: actions)
                
                let category = UNNotificationCategory(
                    identifier: identifier,
                    actions: notificationActions,
                    intentIdentifiers: [],
                    hiddenPreviewsBodyPlaceholder: "New Fantasy Alert",
                    categorySummaryFormat: "%@ fantasy updates",
                    options: .customDismissAction
                )
                
                configuredCategories.insert(category)
                self.notificationCategories[identifier] = category
            }
            
            self.notificationCenter.setNotificationCategories(configuredCategories)
            Logger.shared.debug("Configured \(configuredCategories.count) notification categories")
        }
    }
    
    @objc public func updateBadgeCount(_ count: Int) {
        serialQueue.async {
            self.currentBadgeCount = count
            
            DispatchQueue.main.async {
                UIApplication.shared.applicationIconBadgeNumber = count
                Logger.shared.debug("Updated application badge count to \(count)")
            }
        }
    }
    
    @objc public func handleNotificationReceived(_ notification: UNNotification) {
        serialQueue.async {
            let content = notification.request.content
            let categoryId = content.categoryIdentifier
            
            // Track notification delivery
            self.deliveryAnalytics[categoryId, default: 0] += 1
            
            Logger.shared.info("Received notification: \(categoryId)")
            
            // Handle rich media attachments
            if let attachments = content.attachments {
                for attachment in attachments {
                    Logger.shared.debug("Processing attachment: \(attachment.identifier)")
                }
            }
            
            // Update badge count if specified
            if let badgeCount = content.badge as? Int {
                self.updateBadgeCount(badgeCount)
            }
            
            // Process category-specific handling
            switch categoryId {
            case "INJURY_ALERT":
                self.handleInjuryAlert(content)
            case "TRADE_PROPOSAL":
                self.handleTradeProposal(content)
            case "GAME_START":
                self.handleGameStart(content)
            default:
                Logger.shared.debug("Received notification with unknown category: \(categoryId)")
            }
        }
    }
    
    // MARK: - Category-Specific Handlers
    private func handleInjuryAlert(_ content: UNNotificationContent) {
        guard let userInfo = content.userInfo as? [String: Any] else {
            Logger.shared.error("Invalid injury alert payload")
            return
        }
        
        Logger.shared.info("Processing injury alert", attributes: [
            "player": userInfo["player"] as? String ?? "Unknown",
            "team": userInfo["team"] as? String ?? "Unknown",
            "injury_type": userInfo["injury_type"] as? String ?? "Unknown"
        ])
    }
    
    private func handleTradeProposal(_ content: UNNotificationContent) {
        guard let userInfo = content.userInfo as? [String: Any] else {
            Logger.shared.error("Invalid trade proposal payload")
            return
        }
        
        Logger.shared.info("Processing trade proposal", attributes: [
            "trade_id": userInfo["trade_id"] as? String ?? "Unknown",
            "proposer": userInfo["proposer"] as? String ?? "Unknown",
            "expires_at": userInfo["expires_at"] as? String ?? "Unknown"
        ])
    }
    
    private func handleGameStart(_ content: UNNotificationContent) {
        guard let userInfo = content.userInfo as? [String: Any] else {
            Logger.shared.error("Invalid game start payload")
            return
        }
        
        Logger.shared.info("Processing game start notification", attributes: [
            "game_id": userInfo["game_id"] as? String ?? "Unknown",
            "sport": userInfo["sport"] as? String ?? "Unknown",
            "start_time": userInfo["start_time"] as? String ?? "Unknown"
        ])
    }
}