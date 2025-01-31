/**
 * @fileoverview TypeScript type definitions for team-related data structures
 * Used throughout the Fantasy GM Assistant application for comprehensive team management
 * and cross-platform integration with advanced analytics support
 * @version 1.0.0
 */

import { Player, PlayerPosition } from './player';

/**
 * Supported fantasy sports platforms
 */
export enum FantasyPlatform {
    ESPN = 'ESPN',
    SLEEPER = 'SLEEPER'
}

/**
 * Supported sports types
 */
export enum SportType {
    NFL = 'NFL',
    NBA = 'NBA',
    MLB = 'MLB'
}

/**
 * Premium feature access control flags
 */
export interface PremiumFeatureFlags {
    monteCarloSimulation: boolean;
    advancedAnalytics: boolean;
    videoGeneration: boolean;
}

/**
 * League scoring configuration
 */
interface ScoringSettings {
    pointsPerReception: number;
    passingYardsPerPoint: number;
    rushingYardsPerPoint: number;
    receivingYardsPerPoint: number;
    touchdownPoints: number;
    customRules: Record<string, number>;
}

/**
 * Position-specific roster constraints
 */
interface PositionLimits {
    starters: Record<PlayerPosition, number>;
    maximum: Record<PlayerPosition, number>;
    flex: number;
}

/**
 * Roster validation rules
 */
interface RosterValidationRules {
    minPlayers: number;
    maxPlayers: number;
    requiredPositions: PlayerPosition[];
    allowedPositions: Record<string, PlayerPosition[]>;
}

/**
 * Performance trend analysis data
 */
interface PerformanceTrend {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
    weeklyTrend: number[];
    analysis: string;
}

/**
 * Monte Carlo simulation results
 */
interface SimulationResult {
    winProbability: number;
    projectedPoints: number;
    confidenceInterval: [number, number];
    riskAssessment: string;
    optimalLineup: string[];
}

/**
 * Enhanced team configuration and settings
 */
export interface TeamSettings {
    rosterSize: number;
    positionLimits: Record<PlayerPosition, number>;
    scoringRules: ScoringSettings;
    premiumFeatures: PremiumFeatureFlags;
    crossPlatformSync: boolean;
    customScoring: Record<string, number>;
}

/**
 * Enhanced team roster composition
 */
export interface TeamRoster {
    playerIds: string[];
    byPosition: Record<PlayerPosition, string[]>;
    injured: string[];
    validation: RosterValidationRules;
    constraints: PositionLimits;
    injurySlots: number;
}

/**
 * Enhanced team performance statistics
 */
export interface TeamStats {
    wins: number;
    losses: number;
    totalPoints: number;
    weeklyPoints: Record<string, number>;
    playoffProbability: number;
    monteCarloResults: SimulationResult[];
    trendData: PerformanceTrend;
}

/**
 * Core team data structure with comprehensive management capabilities
 */
export interface Team {
    id: string;
    name: string;
    platform: FantasyPlatform;
    sport: SportType;
    userId: string;
    settings: TeamSettings;
    roster: TeamRoster;
    stats: TeamStats;
    lastUpdated: Date;
}

/**
 * Team sorting options
 */
export type TeamSortField = 
    | 'name'
    | 'platform'
    | 'wins'
    | 'totalPoints'
    | 'playoffProbability'
    | 'trend'
    | 'monteCarloRank';

/**
 * Parameters for team update operations
 */
export type TeamUpdateParams = Partial<Omit<Team, 'id' | 'userId'>> & {
    validateRoster?: boolean;
    syncPlatform?: boolean;
};