//
// Constants.swift
// FantasyGMAssistant
//
// Core constants and configuration values for the Fantasy GM Assistant iOS app
// Version: 1.0.0
//

import Foundation // iOS 14.0+

// MARK: - Global API Configuration
let API_VERSION = "v1"
let API_BASE_URL = "https://api.fantasygm.com/api/v1"
let API_TIMEOUT: TimeInterval = 30.0
let API_RETRY_ATTEMPTS = 3

// MARK: - Sport Type Enumeration
public enum SportType: String {
    case nfl = "NFL"
    case nba = "NBA"
    case mlb = "MLB"
}

// MARK: - Platform Enumeration
public enum Platform: String {
    case espn = "ESPN"
    case sleeper = "SLEEPER"
}

// MARK: - API Endpoints
public struct APIEndpoints {
    public struct auth {
        public static let login = "auth/login"
        public static let register = "auth/register"
        public static let logout = "auth/logout"
        public static let refresh = "auth/refresh"
        public static let verify = "auth/verify"
    }
    
    public struct teams {
        public static let list = "teams"
        public static let create = "teams/create"
        public static let update = "teams/update"
        public static let delete = "teams/delete"
        public static let sync = "teams/sync"
        public static let `import` = "teams/import"
    }
    
    public struct players {
        public static let search = "players/search"
        public static let details = "players/details"
        public static let stats = "players/stats"
        public static let projections = "players/projections"
        public static let history = "players/history"
    }
    
    public struct trades {
        public static let analyze = "trades/analyze"
        public static let propose = "trades/propose"
        public static let history = "trades/history"
        public static let accept = "trades/accept"
        public static let reject = "trades/reject"
        public static let cancel = "trades/cancel"
    }
    
    public struct simulations {
        public static let run = "simulations/run"
        public static let status = "simulations/status"
        public static let results = "simulations/results"
        public static let cancel = "simulations/cancel"
        public static let export = "simulations/export"
    }
}

// MARK: - Cache Configuration
public struct CacheConfig {
    public static let playerStats: TimeInterval = 900      // 15 minutes
    public static let weatherData: TimeInterval = 3600     // 1 hour
    public static let tradeAnalysis: TimeInterval = 86400  // 24 hours
    public static let videoContent: TimeInterval = 604800  // 7 days
    public static let teamData: TimeInterval = 1800        // 30 minutes
    public static let userProfile: TimeInterval = 3600     // 1 hour
}

// MARK: - Analytics Events
public struct AnalyticsEvents {
    public static let login = "user_login"
    public static let tradeAnalysis = "trade_analysis"
    public static let simulationRun = "simulation_run"
    public static let lineupOptimization = "lineup_optimization"
    public static let videoGeneration = "video_generation"
    public static let teamSync = "team_sync"
}