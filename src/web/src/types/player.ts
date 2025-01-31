/**
 * @fileoverview TypeScript type definitions for player-related data structures
 * Used throughout the Fantasy GM Assistant application for cross-platform integration
 * and comprehensive player statistics tracking
 * @version 1.0.0
 */

/**
 * Enumeration of supported player positions in fantasy sports
 */
export enum PlayerPosition {
    QB = 'QB',
    RB = 'RB',
    WR = 'WR',
    TE = 'TE',
    K = 'K',
    DEF = 'DEF'
}

/**
 * Player status in the fantasy league
 */
export enum PlayerStatus {
    ACTIVE = 'ACTIVE',
    BENCH = 'BENCH',
    INJURED_RESERVE = 'IR',
    SUSPENDED = 'SUSPENDED',
    INACTIVE = 'INACTIVE'
}

/**
 * Player injury status tracking
 */
export enum InjuryStatus {
    OUT = 'OUT',
    DOUBTFUL = 'DOUBTFUL',
    QUESTIONABLE = 'QUESTIONABLE',
    PROBABLE = 'PROBABLE'
}

/**
 * Supported fantasy sports platforms
 */
export type PlatformSource = 'ESPN' | 'SLEEPER' | 'CUSTOM';

/**
 * Weather impact severity levels
 */
export type WeatherImpact = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/**
 * Trend data structure for tracking player performance trends
 */
export interface TrendData {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
    lastGames: number[];
    description: string;
}

/**
 * Comprehensive interface for player statistics tracking
 */
export interface PlayerStats {
    gamesPlayed: number;
    points: number;
    averagePoints: number;
    weeklyPoints: Record<string, number>;
    positionStats: Record<string, number>;
    consistency: number;
    ceiling: number;
    floor: number;
    trends: TrendData;
}

/**
 * Core player data structure with comprehensive tracking and cross-platform support
 */
export interface Player {
    id: string;
    name: string;
    position: PlayerPosition;
    team: string;
    stats: PlayerStats;
    status: PlayerStatus;
    injuryStatus: InjuryStatus | null;
    projectedPoints: number;
    lastUpdated: Date;
    platform: PlatformSource;
    weather: WeatherImpact | null;
}

/**
 * Advanced search parameters for player filtering
 */
export interface PlayerSearchParams {
    query: string;
    positions: PlayerPosition[];
    statuses: PlayerStatus[];
    injuryStatuses: InjuryStatus[];
    teams: string[];
    minPoints: number;
    maxPoints: number;
    platforms: PlatformSource[];
    weatherImpacted: boolean;
}

/**
 * Available fields for sorting player lists
 */
export type PlayerSortField = 
    | 'name'
    | 'position'
    | 'team'
    | 'points'
    | 'projectedPoints'
    | 'consistency'
    | 'ceiling'
    | 'floor'
    | 'trend';

/**
 * Sort order direction
 */
export type PlayerSortOrder = 'asc' | 'desc';

/**
 * Player comparison result for trade analysis
 */
export interface PlayerComparison {
    player1: Player;
    player2: Player;
    pointsDiff: number;
    riskScore: number;
    recommendation: string;
}

/**
 * Player performance thresholds for analytics
 */
export interface PlayerThresholds {
    boom: number;
    bust: number;
    baseline: number;
    ceiling: number;
    floor: number;
}

/**
 * Historical player data for trend analysis
 */
export interface PlayerHistory {
    weeklyPerformance: Record<string, PlayerStats>;
    seasonAverages: PlayerStats;
    matchupHistory: Record<string, PlayerStats>;
    weatherImpacts: Record<string, WeatherImpact>;
}

/**
 * Player metadata for additional context
 */
export interface PlayerMetadata {
    age: number;
    experience: number;
    college: string;
    draftPosition?: number;
    height: string;
    weight: number;
    jerseyNumber: number;
}