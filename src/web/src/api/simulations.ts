/**
 * @fileoverview API module for managing simulation operations in the Fantasy GM Assistant
 * Handles Monte Carlo simulations, season projections, and lineup optimizations
 * @version 1.0.0
 */

// External imports
import { monitor } from '@datadog/browser-rum'; // v4.0.0 - Performance monitoring

// Internal imports
import { ApiResponse, PaginatedResponse } from './types';
import { Simulation, SimulationParameters, SimulationType } from '../types/simulation';
import apiClient from '../utils/api';
import simulationCache from '../utils/cache';

// Constants
const SIMULATION_API_PATH = '/api/v1/simulations';
const REQUEST_TIMEOUT_MS = 2000; // 2 second timeout per technical spec
const CACHE_TTL_MS = 900000; // 15 minutes
const MAX_RETRIES = 3;

// Default simulation parameters based on technical requirements
const DEFAULT_SIMULATION_PARAMS: Partial<SimulationParameters> = {
  iterations: 1000,
  includeInjuries: true,
  includeWeather: true,
  includeMatchups: true,
  confidenceLevel: 0.95
};

// Error codes
const ERROR_CODES = {
  SIMULATION_VALIDATION_ERROR: 4001,
  SIMULATION_TIMEOUT_ERROR: 4002,
  SIMULATION_NOT_FOUND: 4004
} as const;

/**
 * Creates a new simulation with the specified parameters
 * @param params Simulation configuration parameters
 * @param teamId Team identifier for the simulation
 * @returns Promise resolving to the created simulation
 */
export async function createSimulation(
  params: SimulationParameters,
  teamId: string
): Promise<ApiResponse<Simulation>> {
  const monitoringSpan = monitor.startSpan('simulation.create');
  
  try {
    // Configure API client for simulation requests
    apiClient.setRequestTimeout(REQUEST_TIMEOUT_MS);
    apiClient.enableRetry({ maxRetries: MAX_RETRIES });

    // Merge with default parameters
    const simulationParams = {
      ...DEFAULT_SIMULATION_PARAMS,
      ...params,
      teamId
    };

    const response = await apiClient.request<ApiResponse<Simulation>>({
      method: 'POST',
      url: SIMULATION_API_PATH,
      data: simulationParams
    });

    // Cache the simulation response
    await simulationCache.set(
      `simulation_${response.data.id}`,
      response,
      CACHE_TTL_MS
    );

    monitor.addMonitoringMetric('simulation.create.success', 1);
    return response;

  } catch (error) {
    monitor.addMonitoringMetric('simulation.create.error', 1);
    throw error;
  } finally {
    monitoringSpan?.end();
  }
}

/**
 * Retrieves a specific simulation by ID
 * @param simulationId Unique identifier of the simulation
 * @returns Promise resolving to the simulation details
 */
export async function getSimulation(
  simulationId: string
): Promise<ApiResponse<Simulation>> {
  const monitoringSpan = monitor.startSpan('simulation.get');
  
  try {
    // Check cache first
    const cached = await simulationCache.get<ApiResponse<Simulation>>(
      `simulation_${simulationId}`
    );
    
    if (cached) {
      monitor.addMonitoringMetric('simulation.cache.hit', 1);
      return cached;
    }

    monitor.addMonitoringMetric('simulation.cache.miss', 1);

    const response = await apiClient.request<ApiResponse<Simulation>>({
      method: 'GET',
      url: `${SIMULATION_API_PATH}/${simulationId}`
    });

    // Cache the response
    await simulationCache.set(
      `simulation_${simulationId}`,
      response,
      CACHE_TTL_MS
    );

    return response;

  } catch (error) {
    monitor.addMonitoringMetric('simulation.get.error', 1);
    throw error;
  } finally {
    monitoringSpan?.end();
  }
}

/**
 * Retrieves a paginated list of simulations for a team
 * @param teamId Team identifier
 * @param page Page number
 * @param pageSize Number of items per page
 * @returns Promise resolving to paginated simulation results
 */
export async function getTeamSimulations(
  teamId: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResponse<Simulation>> {
  const monitoringSpan = monitor.startSpan('simulation.list');
  
  try {
    const cacheKey = `team_simulations_${teamId}_${page}_${pageSize}`;
    const cached = await simulationCache.get<PaginatedResponse<Simulation>>(cacheKey);

    if (cached) {
      monitor.addMonitoringMetric('simulation.list.cache.hit', 1);
      return cached;
    }

    const response = await apiClient.request<PaginatedResponse<Simulation>>({
      method: 'GET',
      url: SIMULATION_API_PATH,
      params: {
        teamId,
        page,
        pageSize
      }
    });

    await simulationCache.set(cacheKey, response, CACHE_TTL_MS);
    return response;

  } catch (error) {
    monitor.addMonitoringMetric('simulation.list.error', 1);
    throw error;
  } finally {
    monitoringSpan?.end();
  }
}

/**
 * Cancels a running simulation
 * @param simulationId Simulation identifier to cancel
 * @returns Promise resolving to the cancelled simulation
 */
export async function cancelSimulation(
  simulationId: string
): Promise<ApiResponse<Simulation>> {
  const monitoringSpan = monitor.startSpan('simulation.cancel');
  
  try {
    const response = await apiClient.request<ApiResponse<Simulation>>({
      method: 'POST',
      url: `${SIMULATION_API_PATH}/${simulationId}/cancel`
    });

    // Invalidate cache for this simulation
    await simulationCache.invalidate(`simulation_${simulationId}`);
    
    monitor.addMonitoringMetric('simulation.cancel.success', 1);
    return response;

  } catch (error) {
    monitor.addMonitoringMetric('simulation.cancel.error', 1);
    throw error;
  } finally {
    monitoringSpan?.end();
  }
}

/**
 * Deletes a simulation and its results
 * @param simulationId Simulation identifier to delete
 */
export async function deleteSimulation(
  simulationId: string
): Promise<void> {
  const monitoringSpan = monitor.startSpan('simulation.delete');
  
  try {
    await apiClient.request({
      method: 'DELETE',
      url: `${SIMULATION_API_PATH}/${simulationId}`
    });

    // Remove from cache
    await simulationCache.invalidate(`simulation_${simulationId}`);
    
    monitor.addMonitoringMetric('simulation.delete.success', 1);

  } catch (error) {
    monitor.addMonitoringMetric('simulation.delete.error', 1);
    throw error;
  } finally {
    monitoringSpan?.end();
  }
}

/**
 * Updates simulation parameters
 * @param simulationId Simulation identifier
 * @param params Updated simulation parameters
 * @returns Promise resolving to updated simulation
 */
export async function updateSimulation(
  simulationId: string,
  params: Partial<SimulationParameters>
): Promise<ApiResponse<Simulation>> {
  const monitoringSpan = monitor.startSpan('simulation.update');
  
  try {
    const response = await apiClient.request<ApiResponse<Simulation>>({
      method: 'PATCH',
      url: `${SIMULATION_API_PATH}/${simulationId}`,
      data: params
    });

    // Update cache
    await simulationCache.set(
      `simulation_${simulationId}`,
      response,
      CACHE_TTL_MS
    );

    monitor.addMonitoringMetric('simulation.update.success', 1);
    return response;

  } catch (error) {
    monitor.addMonitoringMetric('simulation.update.error', 1);
    throw error;
  } finally {
    monitoringSpan?.end();
  }
}