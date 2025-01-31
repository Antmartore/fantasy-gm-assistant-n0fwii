// @react-native-async-storage/async-storage: ^1.19.0 - Cross-platform storage solution
import AsyncStorage from '@react-native-async-storage/async-storage';
// crypto-js: ^4.1.1 - Data encryption for sensitive storage
import CryptoJS from 'crypto-js';
// pako: ^2.1.0 - Data compression for large objects
import pako from 'pako';

import { STORAGE_KEYS } from '../config/constants';

// Storage configuration constants
const STORAGE_PREFIX = 'fantasy_gm_';
const ENCRYPTION_KEY = process.env.REACT_APP_STORAGE_ENCRYPTION_KEY || 'default_key';
const DEFAULT_COMPRESSION_THRESHOLD = 50000; // 50KB
const MAX_STORAGE_SIZE = 10485760; // 10MB
const CLEANUP_INTERVAL = 300000; // 5 minutes

// Cache TTL constants (in milliseconds)
export const CACHE_TTL = {
  PLAYER_STATS: 900000,    // 15 minutes
  WEATHER_DATA: 3600000,   // 1 hour
  TRADE_ANALYSIS: 86400000 // 24 hours
} as const;

// Type definitions
export interface StorageItem<T> {
  data: T;
  encrypted: boolean;
  timestamp: number;
  expiresAt: number | null;
  compressed: boolean;
  version: number;
}

export interface StorageConfig {
  encryptionKey?: string;
  prefix?: string;
  defaultTTL?: number | null;
  compressionThreshold?: number;
  maxStorageSize?: number;
}

export class StorageError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageManager {
  private config: Required<StorageConfig>;
  private decryptionCache: Map<string, { data: any; timestamp: number }>;
  private currentStorageSize: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: StorageConfig = {}) {
    this.config = {
      encryptionKey: config.encryptionKey || ENCRYPTION_KEY,
      prefix: config.prefix || STORAGE_PREFIX,
      defaultTTL: config.defaultTTL || null,
      compressionThreshold: config.compressionThreshold || DEFAULT_COMPRESSION_THRESHOLD,
      maxStorageSize: config.maxStorageSize || MAX_STORAGE_SIZE
    };
    this.decryptionCache = new Map();
    this.currentStorageSize = 0;
    this.initializeStorageSize();
    this.cleanupInterval = setInterval(() => this.cleanupExpiredItems(), CLEANUP_INTERVAL);
  }

  private async initializeStorageSize(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixedKeys = keys.filter(key => key.startsWith(this.config.prefix));
      let totalSize = 0;
      
      for (const key of prefixedKeys) {
        const item = await AsyncStorage.getItem(key);
        if (item) {
          totalSize += new Blob([item]).size;
        }
      }
      
      this.currentStorageSize = totalSize;
    } catch (error) {
      console.error('Failed to initialize storage size:', error);
      this.currentStorageSize = 0;
    }
  }

  private getFullKey(key: string): string {
    return `${this.config.prefix}${key}`;
  }

  private encrypt(data: any): string {
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(data),
      this.config.encryptionKey,
      { iv: iv }
    );
    return iv.concat(encrypted.ciphertext).toString(CryptoJS.enc.Base64);
  }

  private decrypt(encryptedData: string): any {
    const rawData = CryptoJS.enc.Base64.parse(encryptedData);
    const iv = CryptoJS.lib.WordArray.create(rawData.words.slice(0, 4));
    const ciphertext = CryptoJS.lib.WordArray.create(rawData.words.slice(4));
    
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: ciphertext },
      this.config.encryptionKey,
      { iv: iv }
    );
    
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  }

  private compress(data: string): Uint8Array {
    return pako.deflate(data);
  }

  private decompress(data: Uint8Array): string {
    return pako.inflate(data, { to: 'string' });
  }

  public async setItem<T>(
    key: string,
    value: T,
    options: {
      encrypted?: boolean;
      ttl?: number;
      compressed?: boolean;
    } = {}
  ): Promise<void> {
    const fullKey = this.getFullKey(key);
    const timestamp = Date.now();
    const expiresAt = options.ttl ? timestamp + options.ttl : this.config.defaultTTL ? timestamp + this.config.defaultTTL : null;

    let storageItem: StorageItem<T> = {
      data: value,
      encrypted: options.encrypted ?? false,
      timestamp,
      expiresAt,
      compressed: options.compressed ?? false,
      version: 1
    };

    let serializedData = JSON.stringify(storageItem);
    
    if (options.compressed || new Blob([serializedData]).size > this.config.compressionThreshold) {
      storageItem.compressed = true;
      serializedData = JSON.stringify(storageItem);
      const compressed = this.compress(serializedData);
      serializedData = JSON.stringify(compressed);
    }

    if (options.encrypted) {
      serializedData = this.encrypt(serializedData);
    }

    const dataSize = new Blob([serializedData]).size;
    if (this.currentStorageSize + dataSize > this.config.maxStorageSize) {
      throw new StorageError(
        'STORAGE_QUOTA_EXCEEDED',
        'Storage quota exceeded',
        { currentSize: this.currentStorageSize, maxSize: this.config.maxStorageSize }
      );
    }

    try {
      await AsyncStorage.setItem(fullKey, serializedData);
      this.currentStorageSize += dataSize;
      this.decryptionCache.set(fullKey, { data: value, timestamp });
    } catch (error) {
      throw new StorageError(
        'STORAGE_SET_ERROR',
        'Failed to store data',
        error
      );
    }
  }

  public async getItem<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    
    // Check cache first
    const cached = this.decryptionCache.get(fullKey);
    if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
      return cached.data as T;
    }

    try {
      const rawData = await AsyncStorage.getItem(fullKey);
      if (!rawData) return null;

      let parsedData: StorageItem<T>;
      try {
        parsedData = JSON.parse(rawData);
      } catch {
        // Data might be encrypted
        const decrypted = this.decrypt(rawData);
        parsedData = JSON.parse(decrypted);
      }

      if (parsedData.compressed) {
        const decompressed = this.decompress(parsedData.data as unknown as Uint8Array);
        parsedData = JSON.parse(decompressed);
      }

      if (parsedData.expiresAt && Date.now() > parsedData.expiresAt) {
        await this.removeItem(key);
        return null;
      }

      this.decryptionCache.set(fullKey, { data: parsedData.data, timestamp: Date.now() });
      return parsedData.data;
    } catch (error) {
      throw new StorageError(
        'STORAGE_GET_ERROR',
        'Failed to retrieve data',
        error
      );
    }
  }

  public async removeItem(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    try {
      const item = await AsyncStorage.getItem(fullKey);
      if (item) {
        this.currentStorageSize -= new Blob([item]).size;
      }
      await AsyncStorage.removeItem(fullKey);
      this.decryptionCache.delete(fullKey);
    } catch (error) {
      throw new StorageError(
        'STORAGE_REMOVE_ERROR',
        'Failed to remove data',
        error
      );
    }
  }

  public async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixedKeys = keys.filter(key => key.startsWith(this.config.prefix));
      await AsyncStorage.multiRemove(prefixedKeys);
      this.decryptionCache.clear();
      this.currentStorageSize = 0;
    } catch (error) {
      throw new StorageError(
        'STORAGE_CLEAR_ERROR',
        'Failed to clear storage',
        error
      );
    }
  }

  private async cleanupExpiredItems(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixedKeys = keys.filter(key => key.startsWith(this.config.prefix));
      
      for (const key of prefixedKeys) {
        const item = await AsyncStorage.getItem(key);
        if (!item) continue;

        try {
          const parsedItem = JSON.parse(item);
          if (parsedItem.expiresAt && Date.now() > parsedItem.expiresAt) {
            await this.removeItem(key.replace(this.config.prefix, ''));
          }
        } catch {
          // Skip invalid items
          continue;
        }
      }
    } catch (error) {
      console.error('Failed to cleanup expired items:', error);
    }
  }

  public getStorageSize(): number {
    return this.currentStorageSize;
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.decryptionCache.clear();
  }
}

export default new StorageManager();