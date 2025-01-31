// Import error codes from API types
import { ErrorCode } from '../api/types';

// Global constants for API configuration
const API_VERSION = 'v1';
const API_TIMEOUT = 10000;
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const RETRY_DELAY_MS = 1000;

/**
 * API Configuration settings for the Fantasy GM Assistant
 * Includes base URL, version, timeout and retry settings
 */
export const API_CONFIG = {
  BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:8000',
  VERSION: API_VERSION,
  TIMEOUT: API_TIMEOUT,
  RETRY_ATTEMPTS: MAX_RETRY_ATTEMPTS,
  RETRY_DELAY: RETRY_DELAY_MS,
} as const;

/**
 * Rate limits per endpoint (requests per minute)
 * Based on token bucket algorithm implementation
 */
export const RATE_LIMITS = {
  TEAMS: 100,      // Team management operations
  PLAYERS: 200,    // Player search and stats
  TRADES: 50,      // Trade analysis
  SIMULATIONS: 20, // Monte Carlo simulations
  LINEUPS: 100,    // Lineup optimization
} as const;

/**
 * Local storage keys for client-side data persistence
 */
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  USER_SETTINGS: 'user_settings',
  THEME_MODE: 'theme_mode',
  LAST_SYNC: 'last_sync',
} as const;

/**
 * Standardized error messages for application-wide error handling
 */
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error occurred. Please try again.',
  AUTH_REQUIRED: 'Authentication required. Please login.',
  RATE_LIMIT: 'Too many requests. Please try again later.',
  INVALID_INPUT: 'Invalid input. Please check your data.',
} as const;

/**
 * Supported sports platforms
 */
export enum SUPPORTED_SPORTS {
  NFL = 'nfl',
  NBA = 'nba',
  MLB = 'mlb',
}

/**
 * Theme modes for application appearance
 */
export enum THEME_MODES {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

/**
 * Error code mapping to HTTP status codes
 */
export const ERROR_CODE_MAP = {
  [ErrorCode.AUTH_ERROR]: 401,
  [ErrorCode.PERMISSION_ERROR]: 403,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.RATE_LIMIT_ERROR]: 429,
  [ErrorCode.SERVER_ERROR]: 500,
  [ErrorCode.INTEGRATION_ERROR]: 502,
} as const;

/**
 * API endpoint paths
 */
export const API_ENDPOINTS = {
  AUTH: '/auth',
  TEAMS: '/teams',
  PLAYERS: '/players',
  TRADES: '/trades',
  SIMULATIONS: '/simulations',
  LINEUPS: '/lineups',
} as const;

/**
 * Feature flags for different sports capabilities
 */
export const FEATURE_FLAGS = {
  NFL_ENABLED: true,
  NBA_ENABLED: true,
  MLB_ENABLED: true,
  TRADE_ANALYSIS: true,
  VIDEO_GENERATION: true,
  MONTE_CARLO: true,
} as const;

/**
 * Cache duration settings (in milliseconds)
 */
export const CACHE_DURATION = {
  PLAYER_STATS: 15 * 60 * 1000,    // 15 minutes
  TEAM_DATA: 5 * 60 * 1000,        // 5 minutes
  USER_SETTINGS: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// Export all constants as readonly to prevent modifications
Object.freeze(API_CONFIG);
Object.freeze(RATE_LIMITS);
Object.freeze(STORAGE_KEYS);
Object.freeze(ERROR_MESSAGES);
Object.freeze(ERROR_CODE_MAP);
Object.freeze(API_ENDPOINTS);
Object.freeze(FEATURE_FLAGS);
Object.freeze(CACHE_DURATION);