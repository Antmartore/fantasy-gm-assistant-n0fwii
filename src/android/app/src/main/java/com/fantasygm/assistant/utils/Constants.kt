package com.fantasygm.assistant.utils

import com.fantasygm.assistant.BuildConfig // version: latest

/**
 * Core constants for the Fantasy GM Assistant Android application.
 * Contains application-wide configuration values, API endpoints, cache settings,
 * and error codes used throughout the application.
 */

// API Configuration
const val API_VERSION = "v1"
const val API_BASE_URL = BuildConfig.API_URL
const val API_TIMEOUT = 30L // Timeout in seconds
const val API_RETRY_ATTEMPTS = 3

// Supported Sports Leagues
val SUPPORTED_SPORTS = arrayOf("NFL", "NBA", "MLB")

// Cache TTL Values (in seconds)
const val CACHE_TTL_PLAYER_STATS = 900L     // 15 minutes
const val CACHE_TTL_WEATHER = 3600L         // 1 hour
const val CACHE_TTL_TRADE_ANALYSIS = 86400L // 24 hours
const val CACHE_TTL_VIDEO = 604800L         // 7 days

// Application Limits
const val MAX_SIMULATION_SCENARIOS = 1000
const val MAX_TRADE_PLAYERS = 5
const val MAX_LINEUP_CHANGES = 10
const val DEFAULT_PAGINATION_LIMIT = 50
const val MAX_PAGINATION_LIMIT = 100

/**
 * Object containing all API endpoint paths
 */
object ApiEndpoints {
    const val AUTH_LOGIN = "/auth/login"
    const val AUTH_REGISTER = "/auth/register"
    const val TEAMS_LIST = "/teams"
    const val PLAYERS_SEARCH = "/players/search"
    const val TRADES_ANALYZE = "/trades/analyze"
    const val SIMULATIONS_RUN = "/simulations/run"
    const val LINEUPS_OPTIMIZE = "/lineups/optimize"
}

/**
 * Object containing cache key prefixes for different data types
 */
object CacheKeys {
    const val PLAYER_STATS = "player_stats_"
    const val WEATHER_DATA = "weather_"
    const val TRADE_ANALYSIS = "trade_analysis_"
    const val VIDEO_CONTENT = "video_"
}

/**
 * Object containing error codes for different error scenarios
 */
object ErrorCodes {
    const val NETWORK_ERROR = 1000
    const val AUTH_ERROR = 2000
    const val VALIDATION_ERROR = 3000
    const val RATE_LIMIT_ERROR = 4000
    const val SYSTEM_ERROR = 5000
    const val INTEGRATION_ERROR = 6000
}

/**
 * Object containing error messages corresponding to error codes
 */
object ErrorMessages {
    const val NETWORK_ERROR_MSG = "Network connection error occurred"
    const val AUTH_ERROR_MSG = "Authentication failed"
    const val VALIDATION_ERROR_MSG = "Input validation failed"
    const val RATE_LIMIT_ERROR_MSG = "Rate limit exceeded"
    const val SYSTEM_ERROR_MSG = "Internal system error occurred"
    const val INTEGRATION_ERROR_MSG = "Third-party integration failed"
}