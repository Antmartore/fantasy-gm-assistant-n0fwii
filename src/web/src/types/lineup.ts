/**
 * @fileoverview TypeScript type definitions for lineup-related data structures
 * Used throughout the Fantasy GM Assistant application for lineup optimization
 * and real-time management with Monte Carlo simulation support
 * @version 1.0.0
 */

import { Player, PlayerPosition, PlayerStatus, WeatherImpact } from './player';
import { Team } from './team';

/**
 * Lineup slot representing a position in the lineup
 */
export interface LineupSlot {
    position: PlayerPosition;
    playerId: string;
    locked: boolean;
    projectedPoints: number;
    weatherImpact: WeatherImpact | null;
}

/**
 * Validation status for lineup configurations
 */
export enum LineupValidationStatus {
    VALID = 'VALID',
    INVALID = 'INVALID',
    WARNINGS = 'WARNINGS'
}

/**
 * Comprehensive validation error types for lineup management
 */
export type LineupValidationError = 
    | 'INVALID_POSITION'
    | 'DUPLICATE_PLAYER'
    | 'INJURED_STARTER'
    | 'ROSTER_SIZE_EXCEEDED'
    | 'INVALID_FORMATION'
    | 'POSITION_LIMIT_EXCEEDED'
    | 'INVALID_PLAYER_ELIGIBILITY';

/**
 * Strategy options for lineup optimization
 */
export enum OptimizationStrategy {
    CONSERVATIVE = 'CONSERVATIVE',
    BALANCED = 'BALANCED',
    AGGRESSIVE = 'AGGRESSIVE',
    CUSTOM = 'CUSTOM'
}

/**
 * Core lineup data structure with validation status
 */
export interface Lineup {
    id: string;
    teamId: string;
    week: number;
    starters: LineupSlot[];
    bench: LineupSlot[];
    optimizationScore: number;
    lastUpdated: Date;
    validationStatus: LineupValidationStatus;
}

/**
 * Enhanced parameters for lineup optimization requests
 */
export type LineupOptimizationParams = {
    teamId: string;
    week: number;
    considerInjuries: boolean;
    considerWeather: boolean;
    riskTolerance: number;
    optimizationStrategy: OptimizationStrategy;
    simulationCount: number;
    customScoring: ScoringRules;
}

/**
 * Custom scoring rules for lineup optimization
 */
export interface ScoringRules {
    pointsPerReception: number;
    passingYardsPerPoint: number;
    rushingYardsPerPoint: number;
    receivingYardsPerPoint: number;
    touchdownPoints: number;
    customMultipliers: Record<string, number>;
}

/**
 * Results from Monte Carlo simulation
 */
export interface SimulationResult {
    lineupVariation: LineupSlot[];
    projectedPoints: number;
    confidenceInterval: [number, number];
    winProbability: number;
    riskAssessment: string;
}

/**
 * Enhanced lineup change recommendations with AI reasoning
 */
export interface LineupRecommendation {
    playerToAdd: string;
    playerToRemove: string;
    reason: string;
    projectedImprovement: number;
    confidenceLevel: number;
    weatherConsideration: WeatherImpact;
}

/**
 * Comprehensive optimization results with Monte Carlo data
 */
export interface LineupOptimizationResult {
    optimizedLineup: Lineup;
    projectedPoints: number;
    confidenceScore: number;
    recommendations: LineupRecommendation[];
    monteCarloSimulations: SimulationResult[];
}

/**
 * Detailed performance analytics for historical tracking
 */
export interface LineupAnalytics {
    actualVsProjected: number;
    optimalDecisionRate: number;
    missedOpportunities: LineupRecommendation[];
    weatherImpact: Record<string, WeatherImpact>;
    injuryImpact: number;
}

/**
 * History of optimization attempts
 */
export interface OptimizationHistory {
    timestamp: Date;
    strategy: OptimizationStrategy;
    success: boolean;
    improvements: LineupRecommendation[];
    simulationResults: SimulationResult[];
}

/**
 * Comprehensive historical lineup performance tracking
 */
export interface LineupHistory {
    week: number;
    lineup: Lineup;
    actualPoints: number;
    projectedPoints: number;
    analytics: LineupAnalytics;
    optimizationHistory: OptimizationHistory;
}

/**
 * Available fields for sorting lineup history
 */
export type LineupSortField = 
    | 'week'
    | 'actualPoints'
    | 'projectedPoints'
    | 'optimizationScore'
    | 'lastUpdated';

/**
 * Sort order direction
 */
export type LineupSortOrder = 'asc' | 'desc';