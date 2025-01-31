// External imports
import { AxiosResponse, AxiosError } from 'axios'; // axios: ^1.4.0
import { ref, onValue } from 'firebase/database'; // firebase/database: ^9.0.0

// Internal imports
import { ApiResponse, ApiError, PaginatedResponse } from './types';
import { 
  Lineup, 
  LineupSlot, 
  LineupOptimizationResult, 
  OptimizationStrategy,
  LineupValidationStatus,
  LineupRecommendation
} from '../types/lineup';
import apiClient from '../utils/api';
import { API_ENDPOINTS, CACHE_DURATION, RATE_LIMITS } from '../config/constants';
import storageManager from '../utils/storage';

// Cache keys
const CACHE_KEYS = {
  LINEUP_LIST: 'lineup_list',
  LINEUP_DETAIL: 'lineup_detail',
  OPTIMIZATION_RESULT: 'optimization_result'
} as const;

// Types
interface LineupParams {
  page?: number;
  limit?: number;
  includeProjections?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface OptimizationParams {
  strategy?: OptimizationStrategy;
  simulationCount?: number;
  considerWeather?: boolean;
  considerInjuries?: boolean;
  customScoring?: Record<string, number>;
  riskTolerance?: number;
}

interface LineupUpdateParams {
  slots: LineupSlot[];
  version: number;
}

// Utility functions
const generateCacheKey = (key: string, params: Record<string, any>): string => {
  return `${key}_${JSON.stringify(params)}`;
};

const handleError = (error: AxiosError<ApiError>): never => {
  throw error.response?.data || {
    code: 500,
    message: 'An unexpected error occurred',
    details: error
  };
};

/**
 * Lineup API service for managing fantasy team lineups
 */
class LineupApi {
  private activeSubscriptions: Map<string, () => void> = new Map();

  /**
   * Retrieves paginated list of lineups with real-time updates
   */
  public async getLineups(
    teamId: string,
    params: LineupParams = {}
  ): Promise<PaginatedResponse<Lineup>> {
    const cacheKey = generateCacheKey(CACHE_KEYS.LINEUP_LIST, { teamId, ...params });
    
    try {
      // Check cache first
      const cached = await storageManager.getItem<PaginatedResponse<Lineup>>(cacheKey);
      if (cached) return cached;

      const response = await apiClient.request<PaginatedResponse<Lineup>>({
        url: `${API_ENDPOINTS.LINEUPS}`,
        method: 'GET',
        params: {
          teamId,
          page: params.page || 1,
          limit: params.limit || 20,
          includeProjections: params.includeProjections,
          sortBy: params.sortBy,
          sortOrder: params.sortOrder
        }
      });

      // Cache the response
      await storageManager.setItem(cacheKey, response, {
        ttl: CACHE_DURATION.PLAYER_STATS,
        compressed: true
      });

      return response;
    } catch (error) {
      return handleError(error as AxiosError<ApiError>);
    }
  }

  /**
   * Retrieves a specific lineup with real-time updates
   */
  public async getLineup(lineupId: string): Promise<ApiResponse<Lineup>> {
    const cacheKey = generateCacheKey(CACHE_KEYS.LINEUP_DETAIL, { lineupId });

    try {
      // Check cache first
      const cached = await storageManager.getItem<ApiResponse<Lineup>>(cacheKey);
      if (cached) return cached;

      const response = await apiClient.request<ApiResponse<Lineup>>({
        url: `${API_ENDPOINTS.LINEUPS}/${lineupId}`,
        method: 'GET'
      });

      // Cache the response
      await storageManager.setItem(cacheKey, response, {
        ttl: CACHE_DURATION.PLAYER_STATS
      });

      return response;
    } catch (error) {
      return handleError(error as AxiosError<ApiError>);
    }
  }

  /**
   * Updates a lineup with optimistic updates and conflict resolution
   */
  public async updateLineup(
    lineupId: string,
    params: LineupUpdateParams
  ): Promise<ApiResponse<Lineup>> {
    try {
      const response = await apiClient.request<ApiResponse<Lineup>>({
        url: `${API_ENDPOINTS.LINEUPS}/${lineupId}`,
        method: 'PUT',
        data: params
      });

      // Invalidate related caches
      await storageManager.removeItem(
        generateCacheKey(CACHE_KEYS.LINEUP_DETAIL, { lineupId })
      );

      return response;
    } catch (error) {
      if ((error as AxiosError).response?.status === 409) {
        // Handle version conflict
        const currentLineup = await this.getLineup(lineupId);
        return this.updateLineup(lineupId, {
          ...params,
          version: currentLineup.data.version
        });
      }
      return handleError(error as AxiosError<ApiError>);
    }
  }

  /**
   * Optimizes lineup using Monte Carlo simulation and AI analysis
   */
  public async optimizeLineup(
    lineupId: string,
    params: OptimizationParams = {}
  ): Promise<ApiResponse<LineupOptimizationResult>> {
    const cacheKey = generateCacheKey(CACHE_KEYS.OPTIMIZATION_RESULT, { lineupId, ...params });

    try {
      // Check cache for recent optimization
      const cached = await storageManager.getItem<ApiResponse<LineupOptimizationResult>>(cacheKey);
      if (cached) return cached;

      const response = await apiClient.request<ApiResponse<LineupOptimizationResult>>({
        url: `${API_ENDPOINTS.LINEUPS}/${lineupId}/optimize`,
        method: 'POST',
        data: {
          strategy: params.strategy || OptimizationStrategy.BALANCED,
          simulationCount: params.simulationCount || 1000,
          considerWeather: params.considerWeather ?? true,
          considerInjuries: params.considerInjuries ?? true,
          customScoring: params.customScoring,
          riskTolerance: params.riskTolerance || 0.5
        }
      });

      // Cache optimization results
      await storageManager.setItem(cacheKey, response, {
        ttl: CACHE_DURATION.PLAYER_STATS,
        compressed: true
      });

      return response;
    } catch (error) {
      return handleError(error as AxiosError<ApiError>);
    }
  }

  /**
   * Validates lineup against league rules and constraints
   */
  public async validateLineup(lineupId: string): Promise<ApiResponse<LineupValidationStatus>> {
    try {
      return await apiClient.request<ApiResponse<LineupValidationStatus>>({
        url: `${API_ENDPOINTS.LINEUPS}/${lineupId}/validate`,
        method: 'POST'
      });
    } catch (error) {
      return handleError(error as AxiosError<ApiError>);
    }
  }

  /**
   * Subscribes to real-time lineup updates
   */
  public subscribeToLineupUpdates(
    lineupId: string,
    callback: (lineup: Lineup) => void
  ): () => void {
    // Unsubscribe from existing subscription if any
    this.unsubscribeFromLineupUpdates(lineupId);

    const lineupRef = ref(`lineups/${lineupId}`);
    const unsubscribe = onValue(lineupRef, (snapshot) => {
      const lineup = snapshot.val() as Lineup;
      if (lineup) {
        callback(lineup);
      }
    });

    this.activeSubscriptions.set(lineupId, unsubscribe);
    return unsubscribe;
  }

  /**
   * Unsubscribes from real-time lineup updates
   */
  public unsubscribeFromLineupUpdates(lineupId: string): void {
    const unsubscribe = this.activeSubscriptions.get(lineupId);
    if (unsubscribe) {
      unsubscribe();
      this.activeSubscriptions.delete(lineupId);
    }
  }

  /**
   * Gets AI-powered lineup recommendations
   */
  public async getLineupRecommendations(
    lineupId: string
  ): Promise<ApiResponse<LineupRecommendation[]>> {
    try {
      return await apiClient.request<ApiResponse<LineupRecommendation[]>>({
        url: `${API_ENDPOINTS.LINEUPS}/${lineupId}/recommendations`,
        method: 'GET'
      });
    } catch (error) {
      return handleError(error as AxiosError<ApiError>);
    }
  }
}

// Export singleton instance
export const lineupApi = new LineupApi();