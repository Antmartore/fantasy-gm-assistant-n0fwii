// External imports
import qs from 'query-string'; // query-string: ^7.1.3
import axiosRetry from 'axios-retry'; // axios-retry: ^3.8.0

// Internal imports
import { ApiResponse, PaginatedResponse } from '../api/types';
import { 
  Player, 
  PlayerPosition, 
  PlayerStatus,
  PlatformSource,
  WeatherImpact,
  PlayerSearchParams 
} from '../types/player';
import { apiService } from '../utils/api';
import { API_ENDPOINTS, RATE_LIMITS, CACHE_DURATION } from '../config/constants';

// Types
interface SearchOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface PlayerSearchResponse {
  players: Player[];
  total: number;
  hasMore: boolean;
}

// Cache key generator
const generateCacheKey = (params: PlayerSearchParams, options: SearchOptions): string => {
  return `players_search_${JSON.stringify(params)}_${JSON.stringify(options)}`;
};

/**
 * Enhanced player search with cross-platform integration and advanced filtering
 * @param params Search parameters for filtering players
 * @param options Pagination and sorting options
 * @returns Promise with paginated player results
 */
export const searchPlayers = async (
  params: PlayerSearchParams,
  options: SearchOptions = {}
): Promise<PaginatedResponse<Player>> => {
  try {
    const queryParams = qs.stringify({
      ...params,
      page: options.page || 1,
      limit: options.limit || 20,
      sortBy: options.sortBy || 'lastUpdated',
      sortOrder: options.sortOrder || 'desc'
    }, { arrayFormat: 'bracket' });

    const response = await apiService.request<PlayerSearchResponse>({
      method: 'GET',
      url: `${API_ENDPOINTS.PLAYERS}/search?${queryParams}`,
      headers: {
        'x-rate-limit': RATE_LIMITS.PLAYERS.toString()
      }
    });

    return {
      data: response.data.players,
      total: response.data.total,
      page: options.page || 1,
      limit: options.limit || 20,
      hasMore: response.data.hasMore,
      totalPages: Math.ceil(response.data.total / (options.limit || 20))
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Fetch detailed player information by ID
 * @param playerId Unique player identifier
 * @returns Promise with detailed player data
 */
export const getPlayerById = async (playerId: string): Promise<Player> => {
  try {
    const response = await apiService.request<ApiResponse<Player>>({
      method: 'GET',
      url: `${API_ENDPOINTS.PLAYERS}/${playerId}`
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get real-time player statistics with weather impact analysis
 * @param playerId Player identifier
 * @returns Promise with updated player statistics
 */
export const getPlayerStats = async (playerId: string): Promise<Player> => {
  try {
    const response = await apiService.request<ApiResponse<Player>>({
      method: 'GET',
      url: `${API_ENDPOINTS.PLAYERS}/${playerId}/stats`,
      headers: {
        'Cache-Control': `max-age=${CACHE_DURATION.PLAYER_STATS / 1000}`
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Batch fetch multiple players' data
 * @param playerIds Array of player identifiers
 * @returns Promise with array of player data
 */
export const batchGetPlayers = async (playerIds: string[]): Promise<Player[]> => {
  try {
    const response = await apiService.request<ApiResponse<Player[]>>({
      method: 'POST',
      url: `${API_ENDPOINTS.PLAYERS}/batch`,
      data: { playerIds }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get player projections with AI-powered analysis
 * @param playerId Player identifier
 * @param weekNumber Optional week number for specific projections
 * @returns Promise with player projections
 */
export const getPlayerProjections = async (
  playerId: string,
  weekNumber?: number
): Promise<Player> => {
  try {
    const queryParams = weekNumber ? `?week=${weekNumber}` : '';
    const response = await apiService.request<ApiResponse<Player>>({
      method: 'GET',
      url: `${API_ENDPOINTS.PLAYERS}/${playerId}/projections${queryParams}`
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get weather impact analysis for player performance
 * @param playerId Player identifier
 * @returns Promise with weather impact data
 */
export const getWeatherImpact = async (
  playerId: string
): Promise<WeatherImpact> => {
  try {
    const response = await apiService.request<ApiResponse<WeatherImpact>>({
      method: 'GET',
      url: `${API_ENDPOINTS.PLAYERS}/${playerId}/weather`,
      headers: {
        'Cache-Control': `max-age=${CACHE_DURATION.PLAYER_STATS / 1000}`
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Export types for external use
export type {
  PlayerSearchParams,
  SearchOptions,
  PlayerSearchResponse
};