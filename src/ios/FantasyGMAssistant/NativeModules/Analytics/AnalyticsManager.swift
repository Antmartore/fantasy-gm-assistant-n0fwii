//
// AnalyticsManager.swift
// FantasyGMAssistant
//
// Core analytics implementation with DataDog integration
// Version: 1.0.0
//

import Foundation // iOS 14.0+
import DatadogCore // 1.5.0+
import DatadogRUM // 1.5.0+

// MARK: - Analytics Event Constants
private struct AnalyticsEvents {
    static let LOGIN = "user_login"
    static let LOGOUT = "user_logout"
    static let VIEW_TEAM = "view_team"
    static let UPDATE_LINEUP = "update_lineup"
    static let RUN_SIMULATION = "run_simulation"
    static let ANALYZE_TRADE = "analyze_trade"
    static let GENERATE_VIDEO = "generate_video"
    static let VIEW_PLAYER = "view_player"
}

// MARK: - Analytics Property Constants
private struct AnalyticsProperties {
    static let USER_ID = "user_id"
    static let TEAM_ID = "team_id"
    static let SPORT_TYPE = "sport_type"
    static let PREMIUM_STATUS = "is_premium"
    static let FEATURE_NAME = "feature_name"
    static let DURATION_MS = "duration_ms"
    static let ERROR_TYPE = "error_type"
    static let ERROR_MESSAGE = "error_message"
    static let DEVICE_INFO = "device_info"
    static let APP_VERSION = "app_version"
    static let NETWORK_STATUS = "network_status"
    static let ERROR_CODE = "error_code"
    static let RETRY_COUNT = "retry_count"
    static let BATCH_ID = "batch_id"
}

// MARK: - AnalyticsManager
public final class AnalyticsManager {
    // MARK: - Properties
    public static let shared = AnalyticsManager()
    
    private let datadogConfig: DatadogConfiguration
    private let rumConfig: RUMConfiguration
    private var userProperties: [String: Any]
    private var eventQueue: [(name: String, parameters: [String: Any])]
    private let maxQueueSize: Int = 1000
    private let maxRetryAttempts: Int = 3
    private var networkMonitor: NWPathMonitor?
    private let privacyManager: PrivacyManager
    
    // MARK: - Initialization
    private init() {
        // Initialize DataDog configuration
        datadogConfig = DatadogConfiguration()
            .set(trackingConsent: .pending)
            .set(batchSize: .medium)
            .set(uploadFrequency: .frequent)
            .trackUIKitRUMViews()
            .trackURLSession()
        
        // Initialize RUM configuration
        rumConfig = RUMConfiguration()
            .trackLongTasks()
            .trackNetworkRequests()
            .trackUserActions()
            .trackErrors()
        
        // Initialize properties
        userProperties = [:]
        eventQueue = []
        privacyManager = PrivacyManager()
        
        // Setup device info
        setupDeviceInfo()
        
        // Initialize network monitoring
        setupNetworkMonitoring()
        
        Logger.shared.debug("AnalyticsManager initialized")
    }
    
    // MARK: - Configuration
    public func configure(
        apiKey: String,
        environment: String,
        privacyConfig: PrivacyConfig,
        networkConfig: NetworkConfig
    ) {
        datadogConfig
            .set(apiKey: apiKey)
            .set(environment: environment)
        
        Datadog.initialize(
            appContext: .init(),
            trackingConsent: .granted,
            configuration: datadogConfig
        )
        
        RUM.enable(with: rumConfig)
        
        privacyManager.configure(with: privacyConfig)
        configureNetworking(with: networkConfig)
        
        Logger.shared.debug("AnalyticsManager configured with environment: \(environment)")
    }
    
    // MARK: - Event Tracking
    public func trackEvent(
        _ eventName: String,
        parameters: [String: Any]? = nil,
        requiresPrivacy: Bool = false
    ) {
        let enrichedParams = enrichEventParameters(parameters)
        
        guard validateEvent(eventName, parameters: enrichedParams) else {
            Logger.shared.error("Invalid event tracking attempt: \(eventName)")
            return
        }
        
        let finalParams = requiresPrivacy ? 
            privacyManager.filterSensitiveData(from: enrichedParams) : 
            enrichedParams
        
        if isNetworkAvailable() {
            sendEvent(eventName, parameters: finalParams)
        } else {
            queueEvent(eventName, parameters: finalParams)
        }
        
        Logger.shared.debug("Tracked event: \(eventName)")
    }
    
    // MARK: - Error Tracking
    public func trackError(
        _ errorName: String,
        errorMessage: String,
        errorCode: Int,
        properties: [String: Any]? = nil
    ) {
        var errorProps = properties ?? [:]
        errorProps[AnalyticsProperties.ERROR_TYPE] = errorName
        errorProps[AnalyticsProperties.ERROR_MESSAGE] = errorMessage
        errorProps[AnalyticsProperties.ERROR_CODE] = errorCode
        
        let enrichedProps = enrichEventParameters(errorProps)
        
        if isNetworkAvailable() {
            sendError(errorName, parameters: enrichedProps)
        } else {
            queueEvent("error_\(errorName)", parameters: enrichedProps)
        }
        
        Logger.shared.error("\(errorName): \(errorMessage)", error: nil)
    }
    
    // MARK: - Private Methods
    private func setupDeviceInfo() {
        userProperties[AnalyticsProperties.DEVICE_INFO] = [
            "model": UIDevice.current.model,
            "systemVersion": UIDevice.current.systemVersion,
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
        ]
    }
    
    private func setupNetworkMonitoring() {
        networkMonitor = NWPathMonitor()
        networkMonitor?.pathUpdateHandler = { [weak self] path in
            if path.status == .satisfied {
                self?.processEventQueue()
            }
        }
        networkMonitor?.start(queue: DispatchQueue.global())
    }
    
    private func enrichEventParameters(_ parameters: [String: Any]?) -> [String: Any] {
        var enrichedParams = parameters ?? [:]
        enrichedParams.merge(userProperties) { current, _ in current }
        enrichedParams[AnalyticsProperties.APP_VERSION] = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        enrichedParams[AnalyticsProperties.NETWORK_STATUS] = isNetworkAvailable() ? "connected" : "offline"
        return enrichedParams
    }
    
    private func validateEvent(_ eventName: String, parameters: [String: Any]) -> Bool {
        guard !eventName.isEmpty else { return false }
        return true
    }
    
    private func isNetworkAvailable() -> Bool {
        return networkMonitor?.currentPath.status == .satisfied
    }
    
    private func queueEvent(_ eventName: String, parameters: [String: Any]) {
        guard eventQueue.count < maxQueueSize else {
            Logger.shared.error("Event queue full, dropping event: \(eventName)")
            return
        }
        
        eventQueue.append((eventName, parameters))
        Logger.shared.debug("Event queued: \(eventName)")
    }
    
    private func processEventQueue() {
        guard !eventQueue.isEmpty else { return }
        
        let events = eventQueue
        eventQueue.removeAll()
        
        for (eventName, parameters) in events {
            sendEvent(eventName, parameters: parameters)
        }
        
        Logger.shared.debug("Processed \(events.count) queued events")
    }
    
    private func sendEvent(_ eventName: String, parameters: [String: Any], retryCount: Int = 0) {
        var finalParams = parameters
        finalParams[AnalyticsProperties.RETRY_COUNT] = retryCount
        
        RUM.addAttribute(forKey: eventName, value: finalParams)
        
        if eventName.starts(with: "error_") {
            Global.rum.addError(
                message: parameters[AnalyticsProperties.ERROR_MESSAGE] as? String ?? "Unknown error",
                source: .custom,
                attributes: finalParams
            )
        } else {
            Global.rum.addAction(
                type: .custom,
                name: eventName,
                attributes: finalParams
            )
        }
    }
    
    private func sendError(_ errorName: String, parameters: [String: Any]) {
        Global.rum.addError(
            message: parameters[AnalyticsProperties.ERROR_MESSAGE] as? String ?? errorName,
            source: .custom,
            attributes: parameters
        )
    }
}