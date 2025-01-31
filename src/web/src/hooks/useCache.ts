import { useState, useCallback, useEffect } from 'react'; // ^18.2.0
import { CacheManager, CacheError } from '../utils/cache';

// Constants
const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
const RETRY_ATTEMPTS = 3;
const DEBOUNCE_DELAY = 300;

// Types
interface CacheOptions {
  initialTTL?: number;
  retryAttempts?: number;
  onError?: (error: CacheError) => void;
  enableAutoRefresh?: boolean;
  validateData?: (data: any) => boolean;
}

export interface UseCacheResult<T> {
  data: T | null;
  loading: boolean;
  error: CacheError | null;
  setCache: (value: T, ttl?: number) => Promise<void>;
  removeCache: () => Promise<void>;
  clearCache: () => Promise<void>;
  isStale: boolean;
  lastUpdated: Date | null;
}

// Cache Manager singleton instance
const cacheManager = new CacheManager({
  maxSize: MAX_CACHE_SIZE,
  enableTelemetry: true
});

export function useCache<T>(
  key: string,
  defaultTTL: number = DEFAULT_TTL,
  options: CacheOptions = {}
): UseCacheResult<T> {
  // State management
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<CacheError | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);

  // Initialize with provided options
  const {
    initialTTL = defaultTTL,
    retryAttempts = RETRY_ATTEMPTS,
    onError,
    enableAutoRefresh = false,
    validateData
  } = options;

  // Load cache data with retry logic
  const loadCacheData = useCallback(async (attempts: number = 0): Promise<void> => {
    try {
      setLoading(true);
      const cachedData = await cacheManager.get<T>(key);

      if (cachedData) {
        if (validateData && !validateData(cachedData)) {
          throw new CacheError('VALIDATION_FAILED', 'Cached data failed validation');
        }
        setData(cachedData);
        setLastUpdated(new Date());
        setIsStale(false);
      }
    } catch (err) {
      if (attempts < retryAttempts) {
        // Exponential backoff retry
        const backoffDelay = Math.pow(2, attempts) * DEBOUNCE_DELAY;
        setTimeout(() => loadCacheData(attempts + 1), backoffDelay);
      } else {
        const cacheError = err instanceof CacheError ? err : 
          new CacheError('LOAD_FAILED', 'Failed to load cache data', err);
        setError(cacheError);
        onError?.(cacheError);
      }
    } finally {
      setLoading(false);
    }
  }, [key, retryAttempts, validateData, onError]);

  // Set cache data with error handling
  const setCache = useCallback(async (value: T, ttl: number = initialTTL): Promise<void> => {
    try {
      if (validateData && !validateData(value)) {
        throw new CacheError('VALIDATION_FAILED', 'Data validation failed');
      }
      await cacheManager.set(key, value, ttl);
      setData(value);
      setLastUpdated(new Date());
      setIsStale(false);
      setError(null);
    } catch (err) {
      const cacheError = err instanceof CacheError ? err :
        new CacheError('SET_FAILED', 'Failed to set cache data', err);
      setError(cacheError);
      onError?.(cacheError);
      throw cacheError;
    }
  }, [key, initialTTL, validateData, onError]);

  // Remove cache entry
  const removeCache = useCallback(async (): Promise<void> => {
    try {
      await cacheManager.remove(key);
      setData(null);
      setLastUpdated(null);
      setIsStale(false);
      setError(null);
    } catch (err) {
      const cacheError = err instanceof CacheError ? err :
        new CacheError('REMOVE_FAILED', 'Failed to remove cache data', err);
      setError(cacheError);
      onError?.(cacheError);
      throw cacheError;
    }
  }, [key, onError]);

  // Clear all cache data
  const clearCache = useCallback(async (): Promise<void> => {
    try {
      await cacheManager.clear();
      setData(null);
      setLastUpdated(null);
      setIsStale(false);
      setError(null);
    } catch (err) {
      const cacheError = err instanceof CacheError ? err :
        new CacheError('CLEAR_FAILED', 'Failed to clear cache', err);
      setError(cacheError);
      onError?.(cacheError);
      throw cacheError;
    }
  }, [onError]);

  // Initial load and auto-refresh setup
  useEffect(() => {
    loadCacheData();

    // Set up auto-refresh if enabled
    let refreshInterval: NodeJS.Timeout | undefined;
    if (enableAutoRefresh && initialTTL) {
      refreshInterval = setInterval(() => {
        setIsStale(true);
        loadCacheData();
      }, initialTTL);
    }

    // Cleanup
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [loadCacheData, enableAutoRefresh, initialTTL]);

  return {
    data,
    loading,
    error,
    setCache,
    removeCache,
    clearCache,
    isStale,
    lastUpdated
  };
}