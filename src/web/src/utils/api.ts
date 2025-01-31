// External imports
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'; // axios: ^1.4.0
import axiosRetry from 'axios-retry'; // axios-retry: ^3.5.0
import rateLimit from 'axios-rate-limit'; // axios-rate-limit: ^1.3.0
import CryptoJS from 'crypto-js'; // crypto-js: ^4.1.1
import CircuitBreaker from 'circuit-breaker-js'; // circuit-breaker-js: ^0.0.1

// Internal imports
import { ApiResponse, ApiError, ErrorCode, isAxiosError } from '../api/types';
import { API_CONFIG } from '../config/constants';
import storageManager from './storage';

// Constants
const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const CIRCUIT_THRESHOLD = 0.5;
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 100;

// Types
interface RequestMetrics {
  totalRequests: number;
  failedRequests: number;
  averageResponseTime: number;
}

interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: number;
}

class ApiService {
  private client: AxiosInstance;
  private circuitBreaker: any;
  private metrics: RequestMetrics;
  private requestStartTimes: Map<string, number>;

  constructor() {
    this.initializeClient();
    this.initializeCircuitBreaker();
    this.initializeMetrics();
    this.requestStartTimes = new Map();
  }

  private initializeClient(): void {
    // Create base axios instance
    this.client = axios.create({
      baseURL: `${API_CONFIG.BASE_URL}/api/${API_CONFIG.VERSION}`,
      timeout: DEFAULT_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    });

    // Apply rate limiting
    this.client = rateLimit(this.client, {
      maxRequests: RATE_LIMIT_MAX,
      perMilliseconds: RATE_LIMIT_WINDOW
    });

    // Configure retry logic
    axiosRetry(this.client, {
      retries: MAX_RETRIES,
      retryDelay: (retryCount) => retryCount * RETRY_DELAY,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429;
      }
    });

    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        const requestId = CryptoJS.lib.WordArray.random(16).toString();
        this.requestStartTimes.set(requestId, Date.now());

        // Add auth token if available
        const token = await storageManager.getSecure('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Sign request
        config.headers['x-request-id'] = requestId;
        config.headers['x-client-version'] = process.env.REACT_APP_VERSION || '1.0.0';
        config.headers['x-request-signature'] = this.signRequest(config);

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        this.updateMetrics(response);
        return response;
      },
      (error) => {
        this.handleResponseError(error);
        return Promise.reject(this.enhanceError(error));
      }
    );
  }

  private initializeCircuitBreaker(): void {
    this.circuitBreaker = new CircuitBreaker({
      windowDuration: 60000,
      numBuckets: 10,
      errorThreshold: CIRCUIT_THRESHOLD,
      timeout: 30000
    });
  }

  private initializeMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0
    };
  }

  private signRequest(config: AxiosRequestConfig): string {
    const timestamp = Date.now().toString();
    const payload = `${config.method}${config.url}${timestamp}`;
    return CryptoJS.HmacSHA256(payload, process.env.REACT_APP_API_SECRET || '').toString();
  }

  private updateMetrics(response: AxiosResponse): void {
    const requestId = response.config.headers['x-request-id'];
    const startTime = this.requestStartTimes.get(requestId);
    
    if (startTime) {
      const duration = Date.now() - startTime;
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * this.metrics.totalRequests + duration) /
        (this.metrics.totalRequests + 1);
      this.metrics.totalRequests++;
      this.requestStartTimes.delete(requestId);
    }
  }

  private handleResponseError(error: AxiosError): void {
    this.metrics.failedRequests++;
    if (error.response?.status === 401) {
      storageManager.removeSecure('authToken');
    }
  }

  private enhanceError(error: AxiosError): ApiError {
    const baseError: ApiError = {
      code: ErrorCode.SERVER_ERROR,
      message: 'An unexpected error occurred',
      details: {},
      timestamp: Date.now(),
      path: error.config?.url || '',
      requestId: error.config?.headers['x-request-id'] as string
    };

    if (isAxiosError(error)) {
      if (error.response) {
        return {
          ...baseError,
          code: error.response.status === 401 ? ErrorCode.AUTH_ERROR :
                error.response.status === 403 ? ErrorCode.PERMISSION_ERROR :
                error.response.status === 429 ? ErrorCode.RATE_LIMIT_ERROR :
                error.response.status >= 500 ? ErrorCode.SERVER_ERROR :
                ErrorCode.VALIDATION_ERROR,
          message: error.response.data?.message || error.message,
          details: error.response.data
        };
      } else if (error.request) {
        return {
          ...baseError,
          code: ErrorCode.INTEGRATION_ERROR,
          message: 'Network error occurred',
          details: { networkError: true }
        };
      }
    }

    return baseError;
  }

  public async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      this.circuitBreaker.run(
        async () => {
          try {
            const response = await this.client.request<ApiResponse<T>>(config);
            return resolve(response.data);
          } catch (error) {
            reject(error);
          }
        },
        (error: Error) => reject(this.enhanceError(error as AxiosError))
      );
    });
  }

  public getCircuitBreakerState(): CircuitBreakerState {
    return {
      isOpen: this.circuitBreaker.isOpen(),
      failureCount: this.circuitBreaker.getFailureCount(),
      lastFailureTime: this.circuitBreaker.getLastFailureTime()
    };
  }

  public getMetrics(): RequestMetrics {
    return { ...this.metrics };
  }

  public async setAuthToken(token: string): Promise<void> {
    await storageManager.setSecure('authToken', token);
  }

  public clearAuthToken(): Promise<void> {
    return storageManager.removeSecure('authToken');
  }
}

// Export singleton instance
export const apiService = new ApiService();

// Named exports for specific utilities
export const setAuthToken = apiService.setAuthToken.bind(apiService);
export const clearAuthToken = apiService.clearAuthToken.bind(apiService);
export const getCircuitBreakerState = apiService.getCircuitBreakerState.bind(apiService);
export const getMetrics = apiService.getMetrics.bind(apiService);