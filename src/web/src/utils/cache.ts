// @ts-check
import AsyncStorage from '@react-native-async-storage/async-storage'; // ^1.19.0
import winston from 'winston'; // ^3.10.0

// Constants
const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes
const CACHE_PREFIX = 'fantasy_gm_';
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const PERSISTENCE_DELAY = 1000; // 1 second
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
const CACHE_VERSION = 1;

// Interfaces
export interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number;
    version: number;
    lastAccessed: number;
    accessCount: number;
}

export interface CacheConfig {
    prefix?: string;
    defaultTTL?: number;
    maxSize?: number;
    cleanupInterval?: number;
    persistenceDelay?: number;
    enableTelemetry?: boolean;
    encryption?: boolean;
}

export class CacheError extends Error {
    constructor(
        public code: string,
        public message: string,
        public details?: any
    ) {
        super(message);
        this.name = 'CacheError';
    }
}

export class CacheManager {
    private memoryCache: Map<string, CacheItem<any>>;
    private config: Required<CacheConfig>;
    private logger: winston.Logger;
    private cleanupTimer: NodeJS.Timeout;
    private persistenceTimers: Map<string, NodeJS.Timeout>;

    constructor(config: CacheConfig = {}, logger?: winston.Logger) {
        this.memoryCache = new Map();
        this.persistenceTimers = new Map();

        // Initialize configuration with defaults
        this.config = {
            prefix: config.prefix ?? CACHE_PREFIX,
            defaultTTL: config.defaultTTL ?? DEFAULT_TTL,
            maxSize: config.maxSize ?? MAX_CACHE_SIZE,
            cleanupInterval: config.cleanupInterval ?? CLEANUP_INTERVAL,
            persistenceDelay: config.persistenceDelay ?? PERSISTENCE_DELAY,
            enableTelemetry: config.enableTelemetry ?? true,
            encryption: config.encryption ?? false
        };

        // Initialize logger
        this.logger = logger ?? winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [new winston.transports.Console()]
        });

        // Start cleanup interval
        this.cleanupTimer = setInterval(() => {
            this.cleanExpired().catch(err => {
                this.logger.error('Cache cleanup failed', { error: err });
            });
        }, this.config.cleanupInterval);

        // Load persisted cache on initialization
        this.loadPersistedCache().catch(err => {
            this.logger.error('Failed to load persisted cache', { error: err });
        });
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        try {
            const prefixedKey = `${this.config.prefix}${key}`;
            const timestamp = Date.now();

            const cacheItem: CacheItem<T> = {
                data: value,
                timestamp,
                ttl: ttl ?? this.config.defaultTTL,
                version: CACHE_VERSION,
                lastAccessed: timestamp,
                accessCount: 0
            };

            // Check cache size before adding
            const itemSize = this.getItemSize(cacheItem);
            if (this.getCurrentCacheSize() + itemSize > this.config.maxSize) {
                throw new CacheError(
                    'CACHE_FULL',
                    'Cache size limit exceeded',
                    { maxSize: this.config.maxSize }
                );
            }

            // Set in memory cache
            this.memoryCache.set(prefixedKey, cacheItem);

            // Schedule persistent storage
            if (this.persistenceTimers.has(prefixedKey)) {
                clearTimeout(this.persistenceTimers.get(prefixedKey));
            }

            const persistenceTimer = setTimeout(async () => {
                try {
                    const serializedItem = JSON.stringify(cacheItem);
                    await AsyncStorage.setItem(prefixedKey, serializedItem);
                    
                    if (this.config.enableTelemetry) {
                        this.logger.info('Cache item persisted', {
                            key: prefixedKey,
                            size: itemSize
                        });
                    }
                } catch (error) {
                    this.logger.error('Failed to persist cache item', {
                        key: prefixedKey,
                        error
                    });
                }
            }, this.config.persistenceDelay);

            this.persistenceTimers.set(prefixedKey, persistenceTimer);

        } catch (error) {
            this.logger.error('Cache set operation failed', {
                key,
                error
            });
            throw new CacheError(
                'SET_FAILED',
                'Failed to set cache item',
                error
            );
        }
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const prefixedKey = `${this.config.prefix}${key}`;
            const now = Date.now();

            // Check memory cache first
            let cacheItem = this.memoryCache.get(prefixedKey) as CacheItem<T>;

            // If not in memory, try AsyncStorage
            if (!cacheItem) {
                const persistedItem = await AsyncStorage.getItem(prefixedKey);
                if (persistedItem) {
                    cacheItem = JSON.parse(persistedItem);
                    this.memoryCache.set(prefixedKey, cacheItem);
                }
            }

            // Return null if item not found
            if (!cacheItem) {
                return null;
            }

            // Check if expired
            if (now - cacheItem.timestamp > cacheItem.ttl) {
                await this.remove(key);
                return null;
            }

            // Update access metadata
            cacheItem.lastAccessed = now;
            cacheItem.accessCount++;

            if (this.config.enableTelemetry) {
                this.logger.info('Cache hit', {
                    key: prefixedKey,
                    accessCount: cacheItem.accessCount
                });
            }

            return cacheItem.data;

        } catch (error) {
            this.logger.error('Cache get operation failed', {
                key,
                error
            });
            throw new CacheError(
                'GET_FAILED',
                'Failed to get cache item',
                error
            );
        }
    }

    async remove(key: string): Promise<void> {
        try {
            const prefixedKey = `${this.config.prefix}${key}`;

            // Clear from memory cache
            this.memoryCache.delete(prefixedKey);

            // Clear persistence timer if exists
            if (this.persistenceTimers.has(prefixedKey)) {
                clearTimeout(this.persistenceTimers.get(prefixedKey));
                this.persistenceTimers.delete(prefixedKey);
            }

            // Remove from AsyncStorage
            await AsyncStorage.removeItem(prefixedKey);

            if (this.config.enableTelemetry) {
                this.logger.info('Cache item removed', { key: prefixedKey });
            }

        } catch (error) {
            this.logger.error('Cache remove operation failed', {
                key,
                error
            });
            throw new CacheError(
                'REMOVE_FAILED',
                'Failed to remove cache item',
                error
            );
        }
    }

    async clear(): Promise<void> {
        try {
            // Clear memory cache
            this.memoryCache.clear();

            // Clear all persistence timers
            for (const timer of this.persistenceTimers.values()) {
                clearTimeout(timer);
            }
            this.persistenceTimers.clear();

            // Clear AsyncStorage (only cache items with our prefix)
            const keys = await AsyncStorage.getAllKeys();
            const cacheKeys = keys.filter(key => key.startsWith(this.config.prefix));
            await AsyncStorage.multiRemove(cacheKeys);

            if (this.config.enableTelemetry) {
                this.logger.info('Cache cleared', {
                    itemsCleared: cacheKeys.length
                });
            }

        } catch (error) {
            this.logger.error('Cache clear operation failed', { error });
            throw new CacheError(
                'CLEAR_FAILED',
                'Failed to clear cache',
                error
            );
        }
    }

    private async cleanExpired(): Promise<void> {
        try {
            const now = Date.now();
            const expiredKeys: string[] = [];

            // Check all items in memory cache
            for (const [key, item] of this.memoryCache.entries()) {
                if (now - item.timestamp > item.ttl) {
                    expiredKeys.push(key);
                }
            }

            // Remove expired items
            for (const key of expiredKeys) {
                await this.remove(key.replace(this.config.prefix, ''));
            }

            if (this.config.enableTelemetry && expiredKeys.length > 0) {
                this.logger.info('Expired cache items cleaned', {
                    itemsRemoved: expiredKeys.length
                });
            }

        } catch (error) {
            this.logger.error('Cache cleanup operation failed', { error });
            throw new CacheError(
                'CLEANUP_FAILED',
                'Failed to clean expired items',
                error
            );
        }
    }

    private async loadPersistedCache(): Promise<void> {
        try {
            const keys = await AsyncStorage.getAllKeys();
            const cacheKeys = keys.filter(key => key.startsWith(this.config.prefix));
            
            const items = await AsyncStorage.multiGet(cacheKeys);
            for (const [key, value] of items) {
                if (value) {
                    const cacheItem = JSON.parse(value);
                    this.memoryCache.set(key, cacheItem);
                }
            }

            if (this.config.enableTelemetry) {
                this.logger.info('Persisted cache loaded', {
                    itemsLoaded: items.length
                });
            }

        } catch (error) {
            this.logger.error('Failed to load persisted cache', { error });
            throw new CacheError(
                'LOAD_FAILED',
                'Failed to load persisted cache',
                error
            );
        }
    }

    private getItemSize(item: CacheItem<any>): number {
        return new TextEncoder().encode(JSON.stringify(item)).length;
    }

    private getCurrentCacheSize(): number {
        let size = 0;
        for (const item of this.memoryCache.values()) {
            size += this.getItemSize(item);
        }
        return size;
    }

    // Cleanup on object destruction
    destroy(): void {
        clearInterval(this.cleanupTimer);
        for (const timer of this.persistenceTimers.values()) {
            clearTimeout(timer);
        }
        this.persistenceTimers.clear();
        this.memoryCache.clear();
    }
}