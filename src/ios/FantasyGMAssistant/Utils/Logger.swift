//
// Logger.swift
// FantasyGMAssistant
//
// Thread-safe centralized logging utility with DataDog integration
// Version: 1.0.0
//

import Foundation // iOS 14.0+
import os.log // iOS 14.0+
import DatadogCore // 1.5.0+
import DatadogCrashReporting // 1.5.0+
import Constants

// MARK: - Global Constants
private let LOG_SUBSYSTEM = "com.fantasygm.assistant"
private let LOG_CATEGORY = "default"
private let MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
private let LOG_RETENTION_DAYS = 7

// MARK: - LogLevel Enumeration
public enum LogLevel: String {
    case debug = "DEBUG"
    case info = "INFO"
    case warning = "WARNING"
    case error = "ERROR"
    case critical = "CRITICAL"
    
    var osLogType: OSLogType {
        switch self {
        case .debug: return .debug
        case .info: return .info
        case .warning: return .default
        case .error: return .error
        case .critical: return .fault
        }
    }
    
    var errorCodeRange: ClosedRange<Int> {
        switch self {
        case .debug: return 1000...1999
        case .info: return 2000...2999
        case .warning: return 3000...3999
        case .error: return 4000...4999
        case .critical: return 5000...5999
        }
    }
}

// MARK: - Logger Class
public final class Logger {
    // MARK: - Properties
    public static let shared = Logger()
    
    private let osLog: OSLog
    private let datadogLogger: DDLogger
    private let crashReporter: DDCrashReporting
    private let dateFormatter: ISO8601DateFormatter
    private let logQueue: DispatchQueue
    private var offlineCache: [String] = []
    
    // MARK: - Initialization
    private init() {
        // Initialize serial queue for thread-safe logging
        logQueue = DispatchQueue(label: "\(LOG_SUBSYSTEM).logger", qos: .utility)
        
        // Setup OS logger
        osLog = OSLog(subsystem: LOG_SUBSYSTEM, category: LOG_CATEGORY)
        
        // Setup date formatter
        dateFormatter = ISO8601DateFormatter()
        dateFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        
        // Configure DataDog
        let config = DatadogConfiguration()
            .set(appVersion: Constants.APP_VERSION)
            .set(environment: ProcessInfo.processInfo.environment["ENV"] ?? "development")
            .trackUIKitRUMViews()
            .trackURLSession()
            .enableCrashReporting()
        
        Datadog.initialize(
            appContext: .init(),
            trackingConsent: .granted,
            configuration: config
        )
        
        // Initialize DataDog logger and crash reporter
        datadogLogger = DatadogLogger.builder
            .set(serviceName: LOG_SUBSYSTEM)
            .set(loggerName: LOG_CATEGORY)
            .build()
        
        crashReporter = DatadogCrashReporting.enable()
        
        // Setup log rotation
        setupLogRotation()
    }
    
    // MARK: - Private Methods
    private func setupLogRotation() {
        logQueue.async {
            // Implement log rotation based on size and retention
            let fileManager = FileManager.default
            guard let logDirectory = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first else { return }
            
            do {
                let logFiles = try fileManager.contentsOfDirectory(at: logDirectory, includingPropertiesForKeys: [.creationDateKey])
                let oldLogs = logFiles.filter { file in
                    guard let creationDate = try? file.resourceValues(forKeys: [.creationDateKey]).creationDate else { return false }
                    return Date().timeIntervalSince(creationDate) > TimeInterval(LOG_RETENTION_DAYS * 24 * 60 * 60)
                }
                
                try oldLogs.forEach { try fileManager.removeItem(at: $0) }
            } catch {
                self.error("Failed to rotate logs", error: error)
            }
        }
    }
    
    private func maskPII(_ message: String) -> String {
        // Mask common PII patterns
        var maskedMessage = message
        let patterns: [(pattern: String, replacement: String)] = [
            ("\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", "[EMAIL]"),
            ("\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b", "[PHONE]"),
            ("\\b\\d{3}-\\d{2}-\\d{4}\\b", "[SSN]")
        ]
        
        patterns.forEach { pattern, replacement in
            if let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) {
                maskedMessage = regex.stringByReplacingMatches(
                    in: maskedMessage,
                    options: [],
                    range: NSRange(location: 0, length: maskedMessage.utf16.count),
                    withTemplate: replacement
                )
            }
        }
        
        return maskedMessage
    }
    
    private func formatMessage(_ message: String, level: LogLevel, file: String, line: Int, function: String) -> String {
        let timestamp = dateFormatter.string(from: Date())
        let fileName = (file as NSString).lastPathComponent
        return "[\(timestamp)] [\(level.rawValue)] [\(fileName):\(line)] \(function): \(message)"
    }
    
    // MARK: - Public Methods
    public func debug(_ message: String, file: String = #file, line: Int = #line, function: String = #function) {
        logQueue.async {
            let formattedMessage = self.formatMessage(message, level: .debug, file: file, line: line, function: function)
            let maskedMessage = self.maskPII(formattedMessage)
            
            os_log(.debug, log: self.osLog, "%{public}@", maskedMessage)
            
            // Sample debug logs to reduce volume
            if arc4random_uniform(100) < 10 { // 10% sampling
                self.datadogLogger.debug(maskedMessage, attributes: [
                    "file": file,
                    "line": String(line),
                    "function": function,
                    "api_version": Constants.API_VERSION
                ])
            }
        }
    }
    
    public func error(_ message: String, error: Error? = nil, file: String = #file, line: Int = #line, function: String = #function) {
        logQueue.async {
            var errorContext: [String: Any] = [
                "file": file,
                "line": String(line),
                "function": function,
                "api_version": Constants.API_VERSION
            ]
            
            if let error = error {
                errorContext["error_type"] = String(describing: type(of: error))
                errorContext["error_code"] = LogLevel.error.errorCodeRange.lowerBound
                errorContext["error_description"] = error.localizedDescription
            }
            
            let formattedMessage = self.formatMessage(message, level: .error, file: file, line: line, function: function)
            let maskedMessage = self.maskPII(formattedMessage)
            
            os_log(.error, log: self.osLog, "%{public}@", maskedMessage)
            
            self.datadogLogger.error(maskedMessage, attributes: errorContext)
            
            // Cache log if offline
            if !Datadog.isConnected {
                self.offlineCache.append(maskedMessage)
                
                // Implement exponential backoff for retries
                DispatchQueue.global().asyncAfter(deadline: .now() + 5) {
                    self.retryFailedLogs()
                }
            }
        }
    }
    
    private func retryFailedLogs() {
        logQueue.async {
            guard !self.offlineCache.isEmpty, Datadog.isConnected else { return }
            
            let logs = self.offlineCache
            self.offlineCache.removeAll()
            
            logs.forEach { log in
                self.datadogLogger.error(log, attributes: [
                    "retry": true,
                    "api_version": Constants.API_VERSION
                ])
            }
        }
    }
}