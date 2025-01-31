//
// AppDelegate.swift
// FantasyGMAssistant
//
// Main application delegate handling app lifecycle and service configuration
// Version: 1.0.0
//

import UIKit // iOS 14.0+
import FirebaseCore // 10.0.0+
import FirebaseAuth // 10.0.0+
import DatadogCore // 1.0.0+
import DatadogCrashReporting // 1.0.0+
import ElevenLabs // 1.0.0+
import RunwayML // 1.0.0+

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    // MARK: - Properties
    var window: UIWindow?
    private let serviceConfiguration: ServiceConfiguration
    private let backgroundTaskManager: BackgroundTaskManager
    private var isConfigured = false
    
    // MARK: - Constants
    private enum Constants {
        static let datadogApiKey = ProcessInfo.processInfo.environment["DATADOG_API_KEY"] ?? ""
        static let elevenLabsApiKey = ProcessInfo.processInfo.environment["ELEVEN_LABS_API_KEY"] ?? ""
        static let runwayMLApiKey = ProcessInfo.processInfo.environment["RUNWAY_ML_API_KEY"] ?? ""
        static let environment = ProcessInfo.processInfo.environment["ENV"] ?? "development"
    }
    
    // MARK: - Initialization
    override init() {
        self.serviceConfiguration = ServiceConfiguration(environment: Constants.environment)
        self.backgroundTaskManager = BackgroundTaskManager()
        super.init()
    }
    
    // MARK: - UIApplicationDelegate Methods
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        Logger.shared.debug("Application launching with options: \(String(describing: launchOptions))")
        
        do {
            // Configure core services
            try configureFirebase()
            try configureDatadog()
            try configureMediaServices()
            
            // Configure background task handling
            configureBackgroundTasks()
            
            isConfigured = true
            Logger.shared.info("Application successfully configured and launched")
            return true
        } catch {
            Logger.shared.error("Failed to configure application", error: error)
            return false
        }
    }
    
    // MARK: - Service Configuration Methods
    private func configureFirebase() throws {
        Logger.shared.debug("Configuring Firebase...")
        
        guard let filePath = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let options = FirebaseOptions(contentsOfFile: filePath) else {
            throw ServiceError.configuration("Failed to load Firebase configuration")
        }
        
        FirebaseApp.configure(options: options)
        
        // Configure Firebase Auth settings
        let auth = Auth.auth()
        auth.settings?.isAppVerificationDisabledForTesting = Constants.environment != "production"
        
        Logger.shared.info("Firebase configuration completed")
    }
    
    private func configureDatadog() throws {
        Logger.shared.debug("Configuring Datadog...")
        
        guard !Constants.datadogApiKey.isEmpty else {
            throw ServiceError.configuration("Datadog API key not found")
        }
        
        let config = DatadogConfiguration()
            .set(clientToken: Constants.datadogApiKey)
            .set(env: Constants.environment)
            .set(service: "fantasy-gm-assistant")
            .trackUIKitRUMViews()
            .trackURLSession()
            .enableCrashReporting()
        
        Datadog.initialize(
            appContext: .init(),
            trackingConsent: .granted,
            configuration: config
        )
        
        // Enable crash reporting
        DatadogCrashReporting.enable()
        
        Logger.shared.info("Datadog configuration completed")
    }
    
    private func configureMediaServices() throws {
        Logger.shared.debug("Configuring media services...")
        
        // Configure ElevenLabs
        guard !Constants.elevenLabsApiKey.isEmpty else {
            throw ServiceError.configuration("ElevenLabs API key not found")
        }
        
        ElevenLabs.configure(apiKey: Constants.elevenLabsApiKey) { result in
            switch result {
            case .success:
                Logger.shared.info("ElevenLabs configuration completed")
            case .failure(let error):
                Logger.shared.error("ElevenLabs configuration failed", error: error)
            }
        }
        
        // Configure RunwayML
        guard !Constants.runwayMLApiKey.isEmpty else {
            throw ServiceError.configuration("RunwayML API key not found")
        }
        
        RunwayML.initialize(withApiKey: Constants.runwayMLApiKey) { result in
            switch result {
            case .success:
                Logger.shared.info("RunwayML configuration completed")
            case .failure(let error):
                Logger.shared.error("RunwayML configuration failed", error: error)
            }
        }
    }
    
    private func configureBackgroundTasks() {
        Logger.shared.debug("Configuring background tasks...")
        
        backgroundTaskManager.register(
            tasks: [
                BackgroundTask(identifier: "com.fantasygm.assistant.sync", handler: handleDataSync),
                BackgroundTask(identifier: "com.fantasygm.assistant.mediaProcessing", handler: handleMediaProcessing)
            ]
        )
        
        Logger.shared.info("Background tasks configuration completed")
    }
    
    // MARK: - Background Task Handlers
    private func handleDataSync(task: BGProcessingTask) {
        Logger.shared.debug("Executing background data sync...")
        // Implement data synchronization logic
    }
    
    private func handleMediaProcessing(task: BGProcessingTask) {
        Logger.shared.debug("Executing background media processing...")
        // Implement media processing logic
    }
}

// MARK: - Service Configuration
private struct ServiceConfiguration {
    let environment: String
    
    init(environment: String) {
        self.environment = environment
    }
}

// MARK: - Background Task Manager
private class BackgroundTaskManager {
    func register(tasks: [BackgroundTask]) {
        // Implement background task registration
    }
}

// MARK: - Background Task
private struct BackgroundTask {
    let identifier: String
    let handler: (BGProcessingTask) -> Void
}

// MARK: - Service Error
private enum ServiceError: Error {
    case configuration(String)
}