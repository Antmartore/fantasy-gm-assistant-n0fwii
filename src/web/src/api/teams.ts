// External imports
import compression from 'compression'; // compression: ^1.7.4
import CircuitBreaker from 'circuit-breaker-js'; // circuit-breaker-js: ^0.0.1

// Internal imports
import { ApiResponse, ApiError, PaginatedResponse, RequestParams } from './types';
import { Team, TeamSettings, FantasyPlatform, SportType } from '../types/team';
import { apiService } from '../utils/api';
import { API_ENDPOINTS, CACHE_DURATION, RATE_LIMITS } from '../config/constants';

// Constants for team API configuration
const TEAMS_CACHE_TTL = CACHE_DURATION.TEAM_DATA;
const TEAMS_RATE_LIMIT = RATE_LIMITS.TEAMS;
const SYNC_CIRCUIT_BREAKER_OPTIONS = {
  windowDuration: 60000,
  numBuckets: 10,
  errorThreshold: 0.5,
  timeout: 30000
};

// Circuit breaker for platform sync operations
const syncCircuitBreaker = new CircuitBreaker(SYNC_CIRCUIT_BREAKER_OPTIONS);

/**
 * Interface for team creation request payload
 */
export interface CreateTeamRequest {
  name: string;
  platform: FantasyPlatform;
  sport: SportType;
  settings: TeamSettings;
}

/**
 * Interface for team update request payload
 */
export interface UpdateTeamRequest {
  name?: string;
  settings?: Partial<TeamSettings>;
  syncPlatform?: boolean;
}

/**
 * Interface for team sync options
 */
export interface TeamSyncOptions {
  forceFetch?: boolean;
  validateRoster?: boolean;
  updateStats?: boolean;
}

/**
 * Retrieves all teams for the authenticated user with caching and pagination
 * @param params Request parameters for pagination and filtering
 * @returns Promise with paginated team list
 */
export const getTeams = async (params?: RequestParams): Promise<PaginatedResponse<Team>> => {
  try {
    const cacheKey = `teams_${JSON.stringify(params)}`;
    const cachedData = await apiService.getCached<PaginatedResponse<Team>>(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const response = await apiService.request<PaginatedResponse<Team>>({
      method: 'GET',
      url: API_ENDPOINTS.TEAMS,
      params,
      headers: {
        'x-rate-limit': TEAMS_RATE_LIMIT.toString(),
        'accept-encoding': 'gzip'
      }
    });

    await apiService.setCached(cacheKey, response, TEAMS_CACHE_TTL);
    return response;
  } catch (error) {
    throw error as ApiError;
  }
};

/**
 * Creates a new team with the specified configuration
 * @param request Team creation request payload
 * @returns Promise with created team data
 */
export const createTeam = async (request: CreateTeamRequest): Promise<ApiResponse<Team>> => {
  try {
    const response = await apiService.request<Team>({
      method: 'POST',
      url: API_ENDPOINTS.TEAMS,
      data: request,
      headers: {
        'x-rate-limit': TEAMS_RATE_LIMIT.toString()
      }
    });

    await apiService.invalidateCache(/^teams_/);
    return response;
  } catch (error) {
    throw error as ApiError;
  }
};

/**
 * Updates an existing team's configuration
 * @param teamId Team identifier
 * @param request Team update request payload
 * @returns Promise with updated team data
 */
export const updateTeam = async (
  teamId: string,
  request: UpdateTeamRequest
): Promise<ApiResponse<Team>> => {
  try {
    const response = await apiService.request<Team>({
      method: 'PUT',
      url: `${API_ENDPOINTS.TEAMS}/${teamId}`,
      data: request,
      headers: {
        'x-rate-limit': TEAMS_RATE_LIMIT.toString()
      }
    });

    await apiService.invalidateCache(/^teams_/);
    return response;
  } catch (error) {
    throw error as ApiError;
  }
};

/**
 * Synchronizes team data with external platform using circuit breaker pattern
 * @param teamId Team identifier
 * @param options Sync operation options
 * @returns Promise with synchronized team data
 */
export const syncTeam = async (
  teamId: string,
  options: TeamSyncOptions = {}
): Promise<ApiResponse<Team>> => {
  return new Promise((resolve, reject) => {
    syncCircuitBreaker.run(
      async () => {
        try {
          const response = await apiService.request<Team>({
            method: 'POST',
            url: `${API_ENDPOINTS.TEAMS}/${teamId}/sync`,
            data: options,
            headers: {
              'x-rate-limit': TEAMS_RATE_LIMIT.toString()
            }
          });

          await apiService.invalidateCache(/^teams_/);
          resolve(response);
        } catch (error) {
          reject(error as ApiError);
        }
      },
      (error: Error) => reject(error)
    );
  });
};

/**
 * Deletes a team and all associated data
 * @param teamId Team identifier
 * @returns Promise with deletion confirmation
 */
export const deleteTeam = async (teamId: string): Promise<ApiResponse<void>> => {
  try {
    const response = await apiService.request<void>({
      method: 'DELETE',
      url: `${API_ENDPOINTS.TEAMS}/${teamId}`,
      headers: {
        'x-rate-limit': TEAMS_RATE_LIMIT.toString()
      }
    });

    await apiService.invalidateCache(/^teams_/);
    return response;
  } catch (error) {
    throw error as ApiError;
  }
};

/**
 * Retrieves detailed team statistics and analytics
 * @param teamId Team identifier
 * @returns Promise with team statistics
 */
export const getTeamStats = async (teamId: string): Promise<ApiResponse<Team>> => {
  try {
    const cacheKey = `team_stats_${teamId}`;
    const cachedData = await apiService.getCached<ApiResponse<Team>>(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const response = await apiService.request<Team>({
      method: 'GET',
      url: `${API_ENDPOINTS.TEAMS}/${teamId}/stats`,
      headers: {
        'x-rate-limit': TEAMS_RATE_LIMIT.toString(),
        'accept-encoding': 'gzip'
      }
    });

    await apiService.setCached(cacheKey, response, TEAMS_CACHE_TTL);
    return response;
  } catch (error) {
    throw error as ApiError;
  }
};

/**
 * Validates team roster against platform rules
 * @param teamId Team identifier
 * @returns Promise with validation results
 */
export const validateTeamRoster = async (teamId: string): Promise<ApiResponse<boolean>> => {
  try {
    return await apiService.request<boolean>({
      method: 'POST',
      url: `${API_ENDPOINTS.TEAMS}/${teamId}/validate`,
      headers: {
        'x-rate-limit': TEAMS_RATE_LIMIT.toString()
      }
    });
  } catch (error) {
    throw error as ApiError;
  }
};