/**
 * @fileoverview Redux action creators and thunks for simulation management
 * Implements Monte Carlo simulations with performance monitoring and caching
 * @version 1.0.0
 */

import { createAction } from '@reduxjs/toolkit';
import { monitor } from '@datadog/browser-rum';
import { LRUCache } from 'lru-cache';
import { retry } from 'retry-ts';

import { AppThunk } from '../types';
import { 
  Simulation,
  SimulationType,
  SimulationStatus,
  SimulationParameters,
  SimulationResults
} from '../../types/simulation';

// Action type constants
export const SIMULATION_ACTIONS = {
  START: 'simulation/start',
  CREATED: 'simulation/created',
  ERROR: 'simulation/error',
  PROGRESS: 'simulation/progress',
  CACHED: 'simulation/cached',
  PERFORMANCE: 'simulation/performance'
} as const;

// Performance and caching configuration
const PERFORMANCE_CONFIG = {
  SLA_THRESHOLD_MS: 2000,
  CACHE_TTL_SECONDS: 3600,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000
} as const;

// LRU Cache for simulation results
const simulationCache = new LRUCache<string, SimulationResults>({
  max: 100,
  ttl: PERFORMANCE_CONFIG.CACHE_TTL_SECONDS * 1000
});

// Action creators
export const startSimulation = createAction<SimulationParameters>(
  SIMULATION_ACTIONS.START
);

export const simulationCreated = createAction<Simulation>(
  SIMULATION_ACTIONS.CREATED
);

export const simulationError = createAction<string>(
  SIMULATION_ACTIONS.ERROR
);

export const simulationProgress = createAction<number>(
  SIMULATION_ACTIONS.PROGRESS
);

export const simulationCached = createAction<SimulationResults>(
  SIMULATION_ACTIONS.CACHED
);

export const simulationPerformance = createAction<{
  duration: number;
  success: boolean;
}>(SIMULATION_ACTIONS.PERFORMANCE);

/**
 * Creates and starts a new Monte Carlo simulation
 * @param parameters Simulation configuration parameters
 * @param teamId Team identifier
 */
export const runSimulation = (
  parameters: SimulationParameters,
  teamId: string
): AppThunk => async (dispatch) => {
  const monitoringSpan = monitor.startSpan('simulation.run');
  const startTime = Date.now();

  try {
    // Check cache first
    const cacheKey = `${teamId}-${JSON.stringify(parameters)}`;
    const cachedResults = simulationCache.get(cacheKey);

    if (cachedResults) {
      dispatch(simulationCached(cachedResults));
      monitoringSpan?.finish();
      return;
    }

    dispatch(startSimulation(parameters));

    // Implement retry logic for API calls
    const simulation = await retry(
      async () => {
        const response = await fetch('/api/v1/simulations', {
          method: 'POST',
          body: JSON.stringify({ teamId, parameters }),
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          throw new Error('Simulation API call failed');
        }

        return response.json();
      },
      {
        retries: PERFORMANCE_CONFIG.MAX_RETRIES,
        delay: PERFORMANCE_CONFIG.RETRY_DELAY_MS,
        timeout: PERFORMANCE_CONFIG.SLA_THRESHOLD_MS
      }
    );

    // Cache successful results
    simulationCache.set(cacheKey, simulation.results);

    dispatch(simulationCreated({
      id: simulation.id,
      teamId,
      type: SimulationType.SEASON,
      parameters,
      status: SimulationStatus.COMPLETED,
      results: simulation.results,
      createdAt: new Date(),
      completedAt: new Date()
    }));

    // Track performance
    const duration = Date.now() - startTime;
    dispatch(simulationPerformance({ duration, success: true }));

    monitor.addAction('simulation.completed', {
      duration,
      teamId,
      parametersHash: cacheKey
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    dispatch(simulationError(errorMessage));
    
    const duration = Date.now() - startTime;
    dispatch(simulationPerformance({ duration, success: false }));

    monitor.addError('simulation.failed', {
      error: errorMessage,
      teamId,
      duration
    });
  } finally {
    monitoringSpan?.finish();
  }
};

/**
 * Fetches an existing simulation by ID with caching
 * @param simulationId Simulation identifier
 */
export const fetchSimulation = (simulationId: string): AppThunk => async (dispatch) => {
  const monitoringSpan = monitor.startSpan('simulation.fetch');
  const startTime = Date.now();

  try {
    // Check cache
    const cachedSimulation = simulationCache.get(simulationId);
    if (cachedSimulation) {
      dispatch(simulationCached(cachedSimulation));
      monitoringSpan?.finish();
      return;
    }

    // Implement retry logic for fetching
    const simulation = await retry(
      async () => {
        const response = await fetch(`/api/v1/simulations/${simulationId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch simulation');
        }
        return response.json();
      },
      {
        retries: PERFORMANCE_CONFIG.MAX_RETRIES,
        delay: PERFORMANCE_CONFIG.RETRY_DELAY_MS,
        timeout: PERFORMANCE_CONFIG.SLA_THRESHOLD_MS
      }
    );

    // Cache and dispatch results
    simulationCache.set(simulationId, simulation.results);
    dispatch(simulationCreated(simulation));

    const duration = Date.now() - startTime;
    dispatch(simulationPerformance({ duration, success: true }));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    dispatch(simulationError(errorMessage));
    
    const duration = Date.now() - startTime;
    dispatch(simulationPerformance({ duration, success: false }));

    monitor.addError('simulation.fetch.failed', {
      error: errorMessage,
      simulationId,
      duration
    });
  } finally {
    monitoringSpan?.finish();
  }
};