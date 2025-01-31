/**
 * @fileoverview TypeScript type definitions for simulation-related data structures
 * Used in the Fantasy GM Assistant application for Monte Carlo simulations and predictive analytics
 * @version 1.0.0
 */

import { Player } from './player';
import { Team } from './team';

/**
 * Types of available simulations
 */
export enum SimulationType {
    SEASON = 'SEASON',
    LINEUP = 'LINEUP',
    TRADE = 'TRADE'
}

/**
 * Status tracking for simulations
 */
export enum SimulationStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

/**
 * Configuration parameters for running simulations
 */
export interface SimulationParameters {
    weeksToSimulate: number;
    iterations: number;
    includeInjuries: boolean;
    includeWeather: boolean;
    includeMatchups: boolean;
    includeTradeImpact: boolean;
    confidenceLevel: number;
    customWeights: {
        injuryWeight: number;
        weatherWeight: number;
        matchupWeight: number;
    };
}

/**
 * Individual scenario outcome from simulation
 */
export interface SimulationScenario {
    scenarioId: number;
    probability: number;
    playerPerformance: Record<string, PlayerPerformance>;
    events: SimulationEvent[];
    impactFactors: {
        injuryImpact: number;
        weatherImpact: number;
        matchupImpact: number;
    };
}

/**
 * Results from completed simulation runs
 */
export interface SimulationResults {
    playoffOdds: number;
    projectedRecord: string;
    averagePointsPerWeek: number;
    scenarios: SimulationScenario[];
    confidenceIntervals: Record<string, ConfidenceInterval>;
    performanceMetrics: {
        standardDeviation: number;
        variance: number;
        skewness: number;
    };
    riskMetrics: {
        valueAtRisk: number;
        downsideRisk: number;
    };
}

/**
 * Core simulation data structure
 */
export interface Simulation {
    id: string;
    teamId: string;
    type: SimulationType;
    parameters: SimulationParameters;
    status: SimulationStatus;
    results: SimulationResults;
    createdAt: Date;
    completedAt: Date | null;
}

/**
 * Type for simulation sorting options
 */
export type SimulationSortField = 
    | 'createdAt'
    | 'completedAt'
    | 'type'
    | 'status'
    | 'playoffOdds'
    | 'averagePoints';

/**
 * Type for simulation filtering parameters
 */
export type SimulationFilterParams = {
    type?: SimulationType[];
    status?: SimulationStatus[];
    dateRange?: [Date, Date];
    confidenceLevel?: number;
    performanceThreshold?: number;
};

/**
 * Type for statistical confidence intervals
 */
export type ConfidenceInterval = {
    lower: number;
    upper: number;
    mean: number;
    confidence: number;
};

/**
 * Type for tracking player performance in scenarios
 */
export type PlayerPerformance = {
    projectedPoints: number;
    variance: number;
    impactFactors: Record<string, number>;
    confidence: number;
};

/**
 * Type for significant events in simulation
 */
export type SimulationEvent = {
    type: 'INJURY' | 'WEATHER' | 'MATCHUP' | 'TRADE';
    description: string;
    probability: number;
    impact: number;
};