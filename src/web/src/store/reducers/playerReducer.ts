// @reduxjs/toolkit: ^1.9.5
import { createReducer, createEntityAdapter } from '@reduxjs/toolkit';

// Internal imports
import { Player } from '../../types/player';
import { PlayersState } from '../types';
import { PlayerActionTypes } from '../actions/playerActions';

/**
 * Enhanced error state interface for detailed error tracking
 */
interface ErrorState {
  message: string | null;
  code: string | null;
  details: Record<string, any> | null;
}

/**
 * Initialize entity adapter for normalized player state management
 */
const playerAdapter = createEntityAdapter<Player>({
  selectId: (player) => player.id,
  sortComparer: (a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime()
});

/**
 * Initial state with normalized structure and enhanced tracking
 */
const initialState: PlayersState = {
  ...playerAdapter.getInitialState(),
  loading: false,
  error: null,
  selectedPlayer: null,
  lastUpdated: {},
  analysisStatus: 'idle',
  pendingUpdates: {},
  platformSync: {
    ESPN: false,
    SLEEPER: false
  }
};

/**
 * Enhanced player reducer with normalized state management
 */
export const playerReducer = createReducer(initialState, (builder) => {
  builder
    // Fetch players start
    .addCase(PlayerActionTypes.FETCH_PLAYERS_START, (state) => {
      state.loading = true;
      state.error = null;
    })

    // Fetch players success
    .addCase(PlayerActionTypes.FETCH_PLAYERS_SUCCESS, (state, action) => {
      state.loading = false;
      playerAdapter.upsertMany(state, action.payload);
      action.payload.forEach(player => {
        state.lastUpdated[player.id] = Date.now();
      });
    })

    // Fetch players failure
    .addCase(PlayerActionTypes.FETCH_PLAYERS_FAILURE, (state, action) => {
      state.loading = false;
      state.error = {
        message: action.payload,
        code: 'FETCH_ERROR',
        details: null
      };
    })

    // Select player
    .addCase(PlayerActionTypes.SELECT_PLAYER, (state, action) => {
      state.selectedPlayer = action.payload;
      state.error = null;
    })

    // Update player stats with optimistic updates
    .addCase(PlayerActionTypes.UPDATE_PLAYER_STATS, (state, action) => {
      const { id, stats } = action.payload;
      state.pendingUpdates[id] = true;
      
      playerAdapter.updateOne(state, {
        id,
        changes: {
          stats,
          lastUpdated: new Date()
        }
      });
      
      state.lastUpdated[id] = Date.now();
    })

    // Batch update players
    .addCase(PlayerActionTypes.BATCH_UPDATE_PLAYERS, (state, action) => {
      playerAdapter.upsertMany(state, action.payload);
      action.payload.forEach(player => {
        state.lastUpdated[player.id] = Date.now();
        delete state.pendingUpdates[player.id];
      });
    })

    // Handle real-time updates
    .addCase(PlayerActionTypes.PLAYER_REAL_TIME_UPDATE, (state, action) => {
      const player = action.payload;
      playerAdapter.upsertOne(state, player);
      state.lastUpdated[player.id] = Date.now();
    })

    // Platform sync status
    .addCase(PlayerActionTypes.PLATFORM_SYNC_STATUS, (state, action) => {
      const { platform, synced } = action.payload;
      state.platformSync[platform] = synced;
    })

    // Cache invalidation
    .addCase(PlayerActionTypes.INVALIDATE_CACHE, (state, action) => {
      const playerIds = action.payload;
      playerIds.forEach(id => {
        delete state.lastUpdated[id];
      });
    })

    // Analysis status updates
    .addCase(PlayerActionTypes.UPDATE_ANALYSIS_STATUS, (state, action) => {
      state.analysisStatus = action.payload;
    })

    // Error handling for failed updates
    .addCase(PlayerActionTypes.UPDATE_PLAYER_STATS_FAILURE, (state, action) => {
      const { playerId, error } = action.payload;
      delete state.pendingUpdates[playerId];
      state.error = {
        message: error.message,
        code: error.code,
        details: error.details
      };
    });
});

/**
 * Export memoized selectors for player state
 */
export const {
  selectAll: selectAllPlayers,
  selectById: selectPlayerById,
  selectIds: selectPlayerIds,
  selectEntities: selectPlayerEntities,
  selectTotal: selectTotalPlayers
} = playerAdapter.getSelectors();

/**
 * Export additional selectors for enhanced functionality
 */
export const selectPlayersByPlatform = (state: PlayersState, platform: string) =>
  selectAllPlayers(state).filter(player => player.platform === platform);

export const selectPendingUpdates = (state: PlayersState) =>
  Object.keys(state.pendingUpdates);

export const selectSyncStatus = (state: PlayersState) =>
  state.platformSync;

export default playerReducer;