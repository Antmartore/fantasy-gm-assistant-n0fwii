//
// CacheManager.swift
// FantasyGMAssistant
//
// High-performance hybrid caching system with memory and disk storage
// Version: 1.0.0
//

import Foundation // iOS 14.0+

// MARK: - Global Constants
private let CACHE_VERSION = "1.0"
private let MAX_CACHE_SIZE_MB = 100
private let DISK_CACHE_PATH = "/Library/Caches/FantasyGM/"
private let MAX_MEMORY_COST = 1024 * 1024 * 50 // 50MB

// MARK: - Cacheable Protocol
public protocol Cacheable {
    var cacheKey: String { get }
    var expiryDate: Date { get }
    var dataVersion: String { get }
    
    func toCacheData() throws -> Data
    static func fromCacheData(_ data: Data) throws -> Self?
}

// MARK: - Cache Entry
private class CacheEntry: NSObject {
    let data: Data
    let expiryDate: Date
    let version: String
    let createdAt: Date
    
    init(data: Data, expiryDate: Date, version: String) {
        self.data = data
        self.expiryDate = expiryDate
        self.version = version
        self.createdAt = Date()
        super.init()
    }
}

// MARK: - Cache Metrics
private struct CacheMetrics {
    var hits: Int = 0
    var misses: Int = 0
    var diskWrites: Int = 0
    var evictions: Int = 0
    var size: Int = 0
}

// MARK: - Cache Manager
@objc public class CacheManager: NSObject {
    // MARK: - Properties
    public static let shared = CacheManager()
    
    private let memoryCache: NSCache<NSString, CacheEntry>
    private let fileManager: FileManager
    private let cacheQueue: DispatchQueue
    private var cacheMetrics: CacheMetrics
    
    // MARK: - Initialization
    private override init() {
        // Initialize properties
        memoryCache = NSCache<NSString, CacheEntry>()
        memoryCache.totalCostLimit = MAX_MEMORY_COST
        fileManager = FileManager.default
        cacheQueue = DispatchQueue(label: "com.fantasygm.cache", qos: .utility)
        cacheMetrics = CacheMetrics()
        
        super.init()
        
        // Setup cache directory
        setupCacheDirectory()
        
        // Configure memory warning handling
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
        
        // Start cleanup timer
        startCleanupTimer()
        
        Logger.shared.debug("CacheManager initialized with version \(CACHE_VERSION)")
    }
    
    // MARK: - Public Methods
    public func set<T: Cacheable>(_ object: T, ttl: TimeInterval) {
        cacheQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                let data = try object.toCacheData()
                let expiryDate = Date().addingTimeInterval(ttl)
                let entry = CacheEntry(data: data, expiryDate: expiryDate, version: CACHE_VERSION)
                
                // Store in memory
                self.memoryCache.setObject(entry, forKey: object.cacheKey as NSString)
                
                // Store on disk
                try self.writeToDisk(key: object.cacheKey, entry: entry)
                
                self.cacheMetrics.size += data.count
                Logger.shared.debug("Cached object with key: \(object.cacheKey)")
            } catch {
                Logger.shared.error("Failed to cache object", error: error)
            }
        }
    }
    
    public func get<T: Cacheable>(_ key: String, type: T.Type) -> T? {
        var result: T?
        let semaphore = DispatchSemaphore(value: 0)
        
        cacheQueue.async { [weak self] in
            guard let self = self else {
                semaphore.signal()
                return
            }
            
            // Try memory cache first
            if let entry = self.memoryCache.object(forKey: key as NSString) {
                if entry.expiryDate > Date() && entry.version == CACHE_VERSION {
                    do {
                        result = try T.fromCacheData(entry.data)
                        self.cacheMetrics.hits += 1
                        Logger.shared.debug("Memory cache hit for key: \(key)")
                    } catch {
                        Logger.shared.error("Failed to deserialize cached object", error: error)
                    }
                    semaphore.signal()
                    return
                }
            }
            
            // Try disk cache
            do {
                if let entry = try self.readFromDisk(key: key) {
                    if entry.expiryDate > Date() && entry.version == CACHE_VERSION {
                        result = try T.fromCacheData(entry.data)
                        // Update memory cache
                        self.memoryCache.setObject(entry, forKey: key as NSString)
                        self.cacheMetrics.hits += 1
                        Logger.shared.debug("Disk cache hit for key: \(key)")
                    }
                }
            } catch {
                Logger.shared.error("Failed to read from disk cache", error: error)
            }
            
            if result == nil {
                self.cacheMetrics.misses += 1
                Logger.shared.debug("Cache miss for key: \(key)")
            }
            
            semaphore.signal()
        }
        
        _ = semaphore.wait(timeout: .now() + 2.0)
        return result
    }
    
    public func remove(_ key: String) {
        cacheQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Remove from memory
            self.memoryCache.removeObject(forKey: key as NSString)
            
            // Remove from disk
            let diskPath = self.diskPath(for: key)
            try? self.fileManager.removeItem(atPath: diskPath)
            
            Logger.shared.debug("Removed cached object with key: \(key)")
        }
    }
    
    public func clear() {
        cacheQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Clear memory cache
            self.memoryCache.removeAllObjects()
            
            // Clear disk cache
            let cachePath = NSSearchPathForDirectoriesInDomains(.cachesDirectory, .userDomainMask, true).first!
            let diskCachePath = (cachePath as NSString).appendingPathComponent(DISK_CACHE_PATH)
            try? self.fileManager.removeItem(atPath: diskCachePath)
            try? self.fileManager.createDirectory(atPath: diskCachePath, withIntermediateDirectories: true)
            
            self.cacheMetrics = CacheMetrics()
            Logger.shared.debug("Cache cleared")
        }
    }
    
    // MARK: - Private Methods
    private func setupCacheDirectory() {
        let cachePath = NSSearchPathForDirectoriesInDomains(.cachesDirectory, .userDomainMask, true).first!
        let diskCachePath = (cachePath as NSString).appendingPathComponent(DISK_CACHE_PATH)
        
        if !fileManager.fileExists(atPath: diskCachePath) {
            try? fileManager.createDirectory(atPath: diskCachePath, withIntermediateDirectories: true)
        }
    }
    
    private func diskPath(for key: String) -> String {
        let cachePath = NSSearchPathForDirectoriesInDomains(.cachesDirectory, .userDomainMask, true).first!
        let diskCachePath = (cachePath as NSString).appendingPathComponent(DISK_CACHE_PATH)
        return (diskCachePath as NSString).appendingPathComponent(key.md5)
    }
    
    private func writeToDisk(key: String, entry: CacheEntry) throws {
        let path = diskPath(for: key)
        try entry.data.write(to: URL(fileURLWithPath: path))
        self.cacheMetrics.diskWrites += 1
    }
    
    private func readFromDisk(key: String) throws -> CacheEntry? {
        let path = diskPath(for: key)
        guard fileManager.fileExists(atPath: path) else { return nil }
        
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        return CacheEntry(data: data, expiryDate: Date().addingTimeInterval(3600), version: CACHE_VERSION)
    }
    
    @objc private func handleMemoryWarning() {
        memoryCache.removeAllObjects()
        Logger.shared.debug("Cleared memory cache due to memory warning")
    }
    
    private func startCleanupTimer() {
        Timer.scheduledTimer(withTimeInterval: 300, repeats: true) { [weak self] _ in
            self?.cleanupExpiredItems()
        }
    }
    
    private func cleanupExpiredItems() {
        cacheQueue.async { [weak self] in
            guard let self = self else { return }
            
            let cachePath = NSSearchPathForDirectoriesInDomains(.cachesDirectory, .userDomainMask, true).first!
            let diskCachePath = (cachePath as NSString).appendingPathComponent(DISK_CACHE_PATH)
            
            guard let files = try? self.fileManager.contentsOfDirectory(atPath: diskCachePath) else { return }
            
            for file in files {
                let filePath = (diskCachePath as NSString).appendingPathComponent(file)
                guard let attributes = try? self.fileManager.attributesOfItem(atPath: filePath),
                      let creationDate = attributes[.creationDate] as? Date else { continue }
                
                if Date().timeIntervalSince(creationDate) > CacheConfig.videoContent {
                    try? self.fileManager.removeItem(atPath: filePath)
                    self.cacheMetrics.evictions += 1
                }
            }
            
            Logger.shared.debug("Completed cache cleanup")
        }
    }
}

// MARK: - String Extension
private extension String {
    var md5: String {
        let data = Data(self.utf8)
        let hash = data.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) -> [UInt8] in
            var hash = [UInt8](repeating: 0, count: Int(CC_MD5_DIGEST_LENGTH))
            CC_MD5(bytes.baseAddress, CC_LONG(data.count), &hash)
            return hash
        }
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}