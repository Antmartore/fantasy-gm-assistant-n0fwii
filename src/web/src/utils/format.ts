/**
 * @fileoverview Comprehensive utility module for type-safe, platform-agnostic formatting
 * Provides formatting functions for player statistics, team data, and simulation results
 * with support for localization, accessibility, and performance optimization
 * @version 1.0.0
 */

import { format as dateFormat } from 'date-fns';
import numeral from 'numeral';
import { memoize } from 'lodash';

import { Player, PlayerStats, PlayerPosition } from '../types/player';
import { Team, TeamStats } from '../types/team';
import { SimulationResults, ConfidenceInterval } from '../types/simulation';

// Constants for formatting configuration
const DEFAULT_DECIMAL_PLACES = 1;
const PERCENTAGE_DECIMAL_PLACES = 1;
const CONFIDENCE_INTERVAL_DECIMAL_PLACES = 2;
const STAT_FORMAT_CACHE_TTL = 300000; // 5 minutes in milliseconds

// Platform-specific formatting rules
const PLATFORM_SPECIFIC_FORMATS = {
    ESPN: {
        pointsFormat: '0.0',
        percentageFormat: '0.0%',
        recordFormat: '0-0'
    },
    SLEEPER: {
        pointsFormat: '0.00',
        percentageFormat: '0.00%',
        recordFormat: '0-0'
    }
} as const;

/**
 * Options for formatting configuration
 */
interface FormatOptions {
    platform?: 'ESPN' | 'SLEEPER';
    locale?: string;
    decimalPlaces?: number;
    includeLabels?: boolean;
    accessibilityMode?: boolean;
}

/**
 * Formats player statistics with platform-agnostic output and accessibility support
 * @param stats Player statistics to format
 * @param position Player position for position-specific formatting
 * @param options Formatting options
 * @returns Formatted player statistics
 */
export const formatPlayerStats = memoize((
    stats: PlayerStats,
    position: PlayerPosition,
    options: FormatOptions = {}
): Record<string, string> => {
    const {
        platform = 'ESPN',
        decimalPlaces = DEFAULT_DECIMAL_PLACES,
        includeLabels = true,
        accessibilityMode = false
    } = options;

    const format = PLATFORM_SPECIFIC_FORMATS[platform];

    const formatted: Record<string, string> = {
        points: numeral(stats.points).format(format.pointsFormat),
        average: numeral(stats.averagePoints).format(format.pointsFormat),
        consistency: numeral(stats.consistency).format('0.0%'),
        ceiling: numeral(stats.ceiling).format(format.pointsFormat),
        floor: numeral(stats.floor).format(format.pointsFormat)
    };

    // Add position-specific stat formatting
    if (position in stats.positionStats) {
        Object.entries(stats.positionStats).forEach(([key, value]) => {
            formatted[key] = numeral(value).format('0,0.0');
        });
    }

    // Add trend indicators
    const trendSymbol = stats.trends.direction === 'up' ? '↑' : 
                       stats.trends.direction === 'down' ? '↓' : '→';
    formatted.trend = `${trendSymbol} ${numeral(stats.trends.percentage).format('0.0%')}`;

    // Add accessibility labels if needed
    if (accessibilityMode) {
        Object.keys(formatted).forEach(key => {
            formatted[key] = `${includeLabels ? `${key}: ` : ''}${formatted[key]}`;
        });
    }

    return formatted;
}, (stats, position, options) => {
    // Cache key generation for memoization
    return JSON.stringify({ stats, position, options });
}, { maxAge: STAT_FORMAT_CACHE_TTL });

/**
 * Formats team statistics with enhanced visualization support
 * @param stats Team statistics to format
 * @param options Formatting options
 * @returns Formatted team statistics
 */
export const formatTeamStats = memoize((
    stats: TeamStats,
    options: FormatOptions = {}
): Record<string, string> => {
    const {
        platform = 'ESPN',
        decimalPlaces = DEFAULT_DECIMAL_PLACES,
        includeLabels = true
    } = options;

    const format = PLATFORM_SPECIFIC_FORMATS[platform];

    const formatted: Record<string, string> = {
        record: `${stats.wins}-${stats.losses}`,
        winPercentage: numeral(stats.wins / (stats.wins + stats.losses)).format(format.percentageFormat),
        totalPoints: numeral(stats.totalPoints).format(format.pointsFormat),
        playoffProbability: numeral(stats.playoffProbability).format(format.percentageFormat)
    };

    // Format weekly points
    Object.entries(stats.weeklyPoints).forEach(([week, points]) => {
        formatted[`week${week}`] = numeral(points).format(format.pointsFormat);
    });

    // Add trend data
    formatted.trend = `${stats.trendData.direction === 'up' ? '↑' : 
                       stats.trendData.direction === 'down' ? '↓' : '→'} ${
                       numeral(stats.trendData.percentage).format('0.0%')}`;

    return formatted;
}, (stats, options) => {
    return JSON.stringify({ stats, options });
}, { maxAge: STAT_FORMAT_CACHE_TTL });

/**
 * Formats Monte Carlo simulation results with statistical accuracy
 * @param results Simulation results to format
 * @param options Formatting options
 * @returns Formatted simulation results
 */
export const formatSimulationResults = memoize((
    results: SimulationResults,
    options: FormatOptions = {}
): Record<string, string> => {
    const {
        decimalPlaces = CONFIDENCE_INTERVAL_DECIMAL_PLACES,
        includeLabels = true
    } = options;

    const formatted: Record<string, string> = {
        playoffOdds: numeral(results.playoffOdds).format('0.0%'),
        projectedRecord: results.projectedRecord,
        averagePoints: numeral(results.averagePointsPerWeek).format('0.0')
    };

    // Format confidence intervals
    Object.entries(results.confidenceIntervals).forEach(([metric, interval]) => {
        formatted[`${metric}Range`] = formatConfidenceInterval(interval, decimalPlaces);
    });

    // Format performance metrics
    formatted.standardDeviation = numeral(results.performanceMetrics.standardDeviation)
        .format(`0.${decimalPlaces}`);
    formatted.variance = numeral(results.performanceMetrics.variance)
        .format(`0.${decimalPlaces}`);
    formatted.skewness = numeral(results.performanceMetrics.skewness)
        .format(`0.${decimalPlaces}`);

    // Format risk metrics
    formatted.valueAtRisk = numeral(results.riskMetrics.valueAtRisk)
        .format('0.0%');
    formatted.downsideRisk = numeral(results.riskMetrics.downsideRisk)
        .format('0.0%');

    return formatted;
}, (results, options) => {
    return JSON.stringify({ results, options });
}, { maxAge: STAT_FORMAT_CACHE_TTL });

/**
 * Helper function to format confidence intervals
 * @param interval Confidence interval to format
 * @param decimalPlaces Number of decimal places
 * @returns Formatted confidence interval string
 */
const formatConfidenceInterval = (
    interval: ConfidenceInterval,
    decimalPlaces: number
): string => {
    const format = `0.${decimalPlaces}`;
    return `${numeral(interval.lower).format(format)} - ${
           numeral(interval.upper).format(format)} (${
           numeral(interval.confidence).format('0%')} CI)`;
};