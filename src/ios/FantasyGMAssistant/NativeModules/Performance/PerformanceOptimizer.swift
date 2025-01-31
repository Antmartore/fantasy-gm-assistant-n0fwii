//
// PerformanceOptimizer.swift
// FantasyGMAssistant
//
// Enhanced performance optimization with DataDog integration
// Version: 1.0.0
//

import Foundation // iOS 14.0+
import MetricKit // iOS 14.0+
import React // 0.72+
import os.log // iOS 14.0+

// MARK: - Constants
private let MEMORY_WARNING_THRESHOLD: Float = 0.8
private let METRICS_COLLECTION_INTERVAL: TimeInterval = 30.0
private let AI_RECOMMENDATION_TIMEOUT: TimeInterval = 2.0
private let MAX_METRIC_ENTRIES: Int = 1000

// MARK: - MetricType Enumeration
private enum MetricType: String {
    case memory = "memory_usage"
    case cpu = "cpu_usage"
    case network = "network_latency"
    case aiRecommendation = "ai_recommendation_time"
    case frameRate = "frame_rate"
}

// MARK: - PerformanceOptimizer Implementation
@objc(PerformanceOptimizer)
final class PerformanceOptimizer: NSObject, MXMetricManagerSubscriber {
    
    // MARK: - Properties
    private var isMonitoring: Bool = false
    private let metricsCollector: MXMetricManager
    private var lastMemoryWarning: Date?
    private var deviceCapabilities: [String: Any] = [:]
    private var metricStorage: [[String: Any]] = []
    private var aiRecommendationTimings: [TimeInterval] = []
    private let metricQueue = DispatchQueue(label: "com.fantasygm.metrics", qos: .utility)
    private let memoryWarningThreshold: Float
    
    // MARK: - Initialization
    override init() {
        metricsCollector = MXMetricManager.shared
        
        // Adjust memory threshold based on device capacity
        let totalMemory = ProcessInfo.processInfo.physicalMemory
        memoryWarningThreshold = totalMemory > 4_000_000_000 ? 0.85 : MEMORY_WARNING_THRESHOLD
        
        super.init()
        
        // Configure device capabilities
        configureDeviceCapabilities()
        
        // Setup memory warning observer
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    // MARK: - Private Methods
    private func configureDeviceCapabilities() {
        deviceCapabilities = [
            "processorCount": ProcessInfo.processInfo.processorCount,
            "physicalMemory": ProcessInfo.processInfo.physicalMemory,
            "thermalState": ProcessInfo.processInfo.thermalState.rawValue,
            "isLowPowerModeEnabled": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "systemVersion": UIDevice.current.systemVersion
        ]
    }
    
    @objc private func handleMemoryWarning() {
        metricQueue.async {
            self.lastMemoryWarning = Date()
            self.optimizeMemoryUsage()
            
            Logger.shared.error(
                "Memory warning received",
                error: nil,
                file: #file,
                line: #line,
                function: #function
            )
        }
    }
    
    private func collectMetrics() -> [String: Any] {
        var metrics: [String: Any] = [:]
        
        let memoryUsage = getMemoryUsage()
        let cpuUsage = getCPUUsage()
        
        metrics = [
            "timestamp": Date().timeIntervalSince1970,
            MetricType.memory.rawValue: memoryUsage,
            MetricType.cpu.rawValue: cpuUsage,
            MetricType.frameRate.rawValue: getFrameRate(),
            "device_capabilities": deviceCapabilities,
            "low_power_mode": ProcessInfo.processInfo.isLowPowerModeEnabled,
            "thermal_state": ProcessInfo.processInfo.thermalState.rawValue
        ]
        
        if !aiRecommendationTimings.isEmpty {
            metrics[MetricType.aiRecommendation.rawValue] = calculateAIMetrics()
        }
        
        return metrics
    }
    
    private func getMemoryUsage() -> Float {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size)/4
        
        let kerr: kern_return_t = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(mach_task_self_,
                         task_flavor_t(MACH_TASK_BASIC_INFO),
                         $0,
                         &count)
            }
        }
        
        if kerr == KERN_SUCCESS {
            return Float(info.resident_size) / Float(ProcessInfo.processInfo.physicalMemory)
        }
        
        return 0.0
    }
    
    private func getCPUUsage() -> Float {
        var totalUsagePercent: Float = 0.0
        var threadList: thread_act_array_t?
        var threadCount: mach_msg_type_number_t = 0
        
        let threadResult = task_threads(mach_task_self_, &threadList, &threadCount)
        
        if threadResult == KERN_SUCCESS, let threadList = threadList {
            for i in 0..<Int(threadCount) {
                var threadInfo = thread_basic_info()
                var count = mach_msg_type_number_t(THREAD_BASIC_INFO_COUNT)
                
                let infoResult = withUnsafeMutablePointer(to: &threadInfo) {
                    $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                        thread_info(threadList[i],
                                  thread_flavor_t(THREAD_BASIC_INFO),
                                  $0,
                                  &count)
                    }
                }
                
                if infoResult == KERN_SUCCESS {
                    totalUsagePercent += Float(threadInfo.cpu_usage) / Float(TH_USAGE_SCALE)
                }
            }
            
            vm_deallocate(mach_task_self_,
                         vm_address_t(UInt(bitPattern: threadList)),
                         vm_size_t(Int(threadCount) * MemoryLayout<thread_t>.stride))
        }
        
        return min(totalUsagePercent * 100, 100.0)
    }
    
    private func getFrameRate() -> Float {
        return Float(UIScreen.main.maximumFramesPerSecond)
    }
    
    private func calculateAIMetrics() -> [String: Any] {
        let sortedTimings = aiRecommendationTimings.sorted()
        let count = sortedTimings.count
        
        return [
            "average": sortedTimings.reduce(0, +) / Double(count),
            "median": count % 2 == 0 ? (sortedTimings[count/2] + sortedTimings[count/2-1])/2 : sortedTimings[count/2],
            "p95": sortedTimings[Int(Double(count) * 0.95)],
            "max": sortedTimings.last ?? 0,
            "count": count
        ]
    }
    
    // MARK: - Public Methods
    @objc(startPerformanceMonitoring:withRejecter:)
    func startPerformanceMonitoring(_ resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard !isMonitoring else {
            resolve(nil)
            return
        }
        
        metricQueue.async {
            self.isMonitoring = true
            self.metricsCollector.add(self)
            
            // Start periodic collection
            Timer.scheduledTimer(withTimeInterval: METRICS_COLLECTION_INTERVAL, repeats: true) { [weak self] _ in
                self?.metricQueue.async {
                    guard let metrics = self?.collectMetrics() else { return }
                    self?.metricStorage.append(metrics)
                    
                    // Rotate storage if needed
                    if self?.metricStorage.count ?? 0 > MAX_METRIC_ENTRIES {
                        self?.metricStorage.removeFirst()
                    }
                }
            }
            
            Logger.shared.debug("Performance monitoring started")
            resolve(nil)
        }
    }
    
    @objc(getPerformanceMetrics:withRejecter:)
    func getPerformanceMetrics(_ resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        metricQueue.async {
            let metrics = self.collectMetrics()
            resolve(metrics)
        }
    }
    
    @objc(optimizeMemoryUsage)
    func optimizeMemoryUsage() {
        let currentMemoryUsage = getMemoryUsage()
        
        if currentMemoryUsage > memoryWarningThreshold {
            // Clear image caches
            URLCache.shared.removeAllCachedResponses()
            
            // Clear temporary files
            let tmpDirectory = NSTemporaryDirectory()
            let fileManager = FileManager.default
            
            do {
                let tmpFiles = try fileManager.contentsOfDirectory(atPath: tmpDirectory)
                try tmpFiles.forEach { file in
                    let path = (tmpDirectory as NSString).appendingPathComponent(file)
                    try fileManager.removeItem(atPath: path)
                }
            } catch {
                Logger.shared.error("Failed to clear temporary files", error: error)
            }
            
            // Force garbage collection
            autoreleasepool { }
            
            Logger.shared.debug("Memory optimization completed")
        }
    }
    
    // MARK: - MXMetricManagerSubscriber
    func didReceive(_ payloads: [MXMetricPayload]) {
        metricQueue.async {
            payloads.forEach { payload in
                Logger.shared.debug("Received metric payload: \(payload.dictionaryRepresentation())")
            }
        }
    }
    
    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        metricQueue.async {
            payloads.forEach { payload in
                Logger.shared.error("Received diagnostic payload: \(payload.dictionaryRepresentation())")
            }
        }
    }
}