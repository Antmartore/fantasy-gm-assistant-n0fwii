/**
 * @fileoverview TypeScript type definitions for trade-related data structures
 * Used throughout the Fantasy GM Assistant application for AI-powered trade analysis
 * and cross-platform trade management with video breakdowns
 * @version 1.0.0
 */

import { Player, PlayerPosition, PlatformSource as PlatformType } from './player';
import { Team } from './team';

/**
 * Enumeration of possible trade statuses
 */
export enum TradeStatus {
    PENDING = 'PENDING',
    ACCEPTED = 'ACCEPTED',
    REJECTED = 'REJECTED',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED',
    COUNTERED = 'COUNTERED'
}

/**
 * Detailed position-specific trade impact analysis
 */
export interface TradeImpact {
    position: PlayerPosition;
    pointsDifferential: number;
    analysis: string;
    confidenceScore: number;
    alternativeOptions: string[];
}

/**
 * Position strength assessment after trade
 */
export type PositionStrength = {
    position: PlayerPosition;
    score: number;
    change: number;
}

/**
 * Projected roster changes after trade completion
 */
export interface RosterProjection {
    strengthChanges: PositionStrength[];
    recommendations: string[];
    depthScore: number;
}

/**
 * Comprehensive AI-powered trade analysis results
 */
export interface TradeAnalysis {
    riskScore: number;
    winProbabilityChange: number;
    aiRecommendation: string;
    videoUrl: string;
    impacts: TradeImpact[];
    keyFactors: string[];
    rosterProjection: RosterProjection;
}

/**
 * Core trade data structure with cross-platform support
 */
export interface Trade {
    id: string;
    proposingTeamId: string;
    receivingTeamId: string;
    playersOffered: string[];
    playersRequested: string[];
    platform: PlatformType;
    status: TradeStatus;
    analysis: TradeAnalysis;
    createdAt: Date;
    expiresAt: Date;
    version: number;
}

/**
 * Type for creating new trade proposals
 */
export type TradeProposal = Omit<Trade, 
    'id' | 
    'status' | 
    'analysis' | 
    'createdAt' | 
    'expiresAt' | 
    'version'
>;

/**
 * Type for responding to trade proposals
 */
export type TradeResponse = 'ACCEPT' | 'REJECT' | 'COUNTER';

/**
 * Type for trade sorting options
 */
export type TradeSortField = 
    | 'createdAt'
    | 'expiresAt'
    | 'riskScore'
    | 'winProbabilityChange'
    | 'confidenceScore';