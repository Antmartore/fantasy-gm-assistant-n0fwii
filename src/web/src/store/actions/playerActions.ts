// External imports - version specified as required
import { createAction } from '@reduxjs/toolkit'; // ^1.9.5
import axiosRetry from 'axios-retry'; // ^3.5.0

// Internal imports
import { Player, PlayerSearchParams, PlatformSource } from '../../types/player';
import { AppThunk } from '../types';
import { PlayerAPI } from '../../api/players';
import { CACHE_DURATION, RATE_LIMITS } from '../../config/constants';
import storageManager from '../../utils/storage';

// Action Types
export enum PlayerActionTypes {
  FETCH_PLAYERS_START = 'players/fetchStart',
  FETCH_PLAYERS_SUCCESS = 'players/fetchSuccess',
  FETCH_PLAYERS_FAILURE = 'players/fetchFailure',
  SELECT_PLAYER_START = 'players/selectStart',
  SELECT_PLAYER_SUCCESS = 'players/selectSuccess',
  SELECT_PLAYER_FAILURE = 'players/selectFailure',
  UPDATE_PLAYER_STATS_START = 'players/updateStatsStart',
  UPDATE_PLAYER_STATS_SUCCESS = 'players/updateStatsSuccess',
  UPDATE_PLAYER_STATS_FAILURE = 'players/updateStatsFailure',
  PLAYER_WEBSOCKET_CONNECTED = 'players/websocketConnected',
  PLAYER_WEBSOCKET_DISCONNECTED = 'players/websocketDisconnected',
  PLAYER_REAL_TIME_UPDATE = 'players/realTimeUpdate'
}

// Action Creators
export const fetchPlayersStart = createAction(PlayerActionTypes.FETCH_PLAYERS_START);
export const fetchPlayersSuccess = createAction<Player[]>(PlayerActionTypes.FETCH_PLAYERS_SUCCESS);
export const fetchPlayersFailure = createAction<string>(PlayerActionTypes.FETCH_PLAYERS_FAILURE);

export const selectPlayerStart = createAction<string>(PlayerActionTypes.SELECT_PLAYER_START);
export const selectPlayerSuccess = createAction<Player>(PlayerActionTypes.SELECT_PLAYER_SUCCESS);
export const selectPlayerFailure = createAction<string>(PlayerActionTypes.SELECT_PLAYER_FAILURE);

export const updatePlayerStatsStart = createAction<string>(PlayerActionTypes.UPDATE_PLAYER_STATS_START);
export const updatePlayerStatsSuccess = createAction<Player>(PlayerActionTypes.UPDATE_PLAYER_STATS_SUCCESS);
export const updatePlayerStatsFailure = createAction<string>(PlayerActionTypes.UPDATE_PLAYER_STATS_FAILURE);

export const playerWebsocketConnected = createAction(PlayerActionTypes.PLAYER_WEBSOCKET_CONNECTED);
export const playerWebsocketDisconnected = createAction(PlayerActionTypes.PLAYER_WEBSOCKET_DISCONNECTED);
export const playerRealTimeUpdate = createAction<Player>(PlayerActionTypes.PLAYER_REAL_TIME_UPDATE);

// Thunk Actions
export const fetchPlayers = (params: PlayerSearchParams): AppThunk => async (dispatch) => {
  try {
    dispatch(fetchPlayersStart());

    // Check cache first
    const cacheKey = `players_search_${JSON.stringify(params)}`;
    const cachedData = await storageManager.getItem<Player[]>(cacheKey);
    if (cachedData) {
      dispatch(fetchPlayersSuccess(cachedData));
      return;
    }

    // Configure retry strategy
    axiosRetry(PlayerAPI, {
      retries: 3,
      retryDelay: (retryCount) => retryCount * 1000,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429;
      }
    });

    // Fetch players from all specified platforms
    const playerPromises = params.platforms.map(platform => 
      PlayerAPI.searchPlayers({ ...params, platform })
    );
    const results = await Promise.all(playerPromises);

    // Aggregate and deduplicate players
    const players = Array.from(new Set(
      results.flatMap(result => result.data)
    ));

    // Cache results
    await storageManager.setItem(cacheKey, players, {
      ttl: CACHE_DURATION.PLAYER_STATS,
      compressed: true
    });

    dispatch(fetchPlayersSuccess(players));
  } catch (error) {
    dispatch(fetchPlayersFailure(error instanceof Error ? error.message : 'Failed to fetch players'));
  }
};

export const selectPlayer = (playerId: string, platform: PlatformSource): AppThunk => async (dispatch) => {
  try {
    dispatch(selectPlayerStart(playerId));

    // Check cache
    const cacheKey = `player_${playerId}_${platform}`;
    const cachedPlayer = await storageManager.getItem<Player>(cacheKey);
    if (cachedPlayer) {
      dispatch(selectPlayerSuccess(cachedPlayer));
      return;
    }

    const player = await PlayerAPI.getPlayer(playerId, platform);
    
    // Cache player data
    await storageManager.setItem(cacheKey, player, {
      ttl: CACHE_DURATION.PLAYER_STATS,
      encrypted: true
    });

    dispatch(selectPlayerSuccess(player));
  } catch (error) {
    dispatch(selectPlayerFailure(error instanceof Error ? error.message : 'Failed to select player'));
  }
};

export const updatePlayerStats = (
  playerId: string,
  week: number,
  platform: PlatformSource
): AppThunk => async (dispatch) => {
  try {
    dispatch(updatePlayerStatsStart(playerId));

    // Subscribe to real-time updates
    const unsubscribe = await PlayerAPI.subscribeToUpdates(playerId, (updatedPlayer) => {
      dispatch(playerRealTimeUpdate(updatedPlayer));
    });

    // Get initial stats
    const stats = await PlayerAPI.getPlayerStats(playerId, week, platform);
    dispatch(updatePlayerStatsSuccess(stats));

    // Return unsubscribe function for cleanup
    return unsubscribe;
  } catch (error) {
    dispatch(updatePlayerStatsFailure(error instanceof Error ? error.message : 'Failed to update player stats'));
  }
};

export const subscribeToPlayerUpdates = (playerIds: string[]): AppThunk => async (dispatch) => {
  try {
    dispatch(playerWebsocketConnected());

    const unsubscribePromises = playerIds.map(playerId =>
      PlayerAPI.subscribeToUpdates(playerId, (updatedPlayer) => {
        dispatch(playerRealTimeUpdate(updatedPlayer));
      })
    );

    const unsubscribeFunctions = await Promise.all(unsubscribePromises);

    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
      dispatch(playerWebsocketDisconnected());
    };
  } catch (error) {
    dispatch(playerWebsocketDisconnected());
    throw error;
  }
};