/**
 * @fileoverview Redux reducer for managing fantasy sports teams state
 * Implements optimistic updates, caching, and cross-platform synchronization
 * @version 1.0.0
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'; // @reduxjs/toolkit: ^1.9.0
import { persistReducer } from 'redux-persist'; // redux-persist: ^6.0.0

import { Team, FantasyPlatform } from '../../types/team';
import { TeamsState } from '../../store/types';
import { TeamActions } from '../actions/teamActions';

// Cache duration in milliseconds (15 minutes)
const CACHE_TTL = 900000;

// Interface for cache entries
interface CacheEntry {
  data: Team;
  timestamp: number;
}

// Interface for sync status tracking
type SyncStatus = 'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR';

// Initial state with enhanced caching and sync tracking
const initialState: TeamsState = {
  items: [],
  loading: false,
  error: null,
  selectedTeam: null,
  cache: {},
  platformSync: {
    ESPN: 'IDLE',
    SLEEPER: 'IDLE'
  }
};

// Persist configuration for redux-persist
const persistConfig = {
  key: 'teams',
  storage: localStorage,
  whitelist: ['items', 'selectedTeam', 'cache']
};

// Create the teams slice with enhanced functionality
const teamsSlice = createSlice({
  name: 'teams',
  initialState,
  reducers: {
    // Select a team with cache validation
    selectTeam: (state, action: PayloadAction<string>) => {
      const teamId = action.payload;
      const cachedTeam = state.cache[teamId];
      
      // Check if cache is valid
      if (cachedTeam && Date.now() - cachedTeam.timestamp < CACHE_TTL) {
        state.selectedTeam = cachedTeam.data;
      } else {
        state.selectedTeam = state.items.find(team => team.id === teamId) || null;
        if (state.selectedTeam) {
          state.cache[teamId] = {
            data: state.selectedTeam,
            timestamp: Date.now()
          };
        }
      }
    },

    // Clear selected team
    clearSelectedTeam: (state) => {
      state.selectedTeam = null;
    },

    // Invalidate cache for specific team or all teams
    invalidateCache: (state, action: PayloadAction<string | undefined>) => {
      if (action.payload) {
        delete state.cache[action.payload];
      } else {
        state.cache = {};
      }
    },

    // Update platform sync status
    syncPlatform: (state, action: PayloadAction<{ platform: FantasyPlatform; status: SyncStatus }>) => {
      state.platformSync[action.payload.platform] = action.payload.status;
    }
  },
  extraReducers: (builder) => {
    // Handle fetch teams actions
    builder.addCase(TeamActions.fetchTeams.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(TeamActions.fetchTeams.fulfilled, (state, action) => {
      state.loading = false;
      state.items = action.payload;
      // Update cache for all teams
      action.payload.forEach(team => {
        state.cache[team.id] = {
          data: team,
          timestamp: Date.now()
        };
      });
    });
    builder.addCase(TeamActions.fetchTeams.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload || { message: 'Failed to fetch teams' };
    });

    // Handle create team actions with optimistic updates
    builder.addCase(TeamActions.createTeam.pending, (state, action) => {
      state.loading = true;
      // Optimistically add the team
      const optimisticTeam = {
        ...action.meta.arg,
        id: `temp_${Date.now()}`,
        lastSynced: new Date(),
        syncStatus: 'SYNCING' as SyncStatus
      };
      state.items.push(optimisticTeam);
    });
    builder.addCase(TeamActions.createTeam.fulfilled, (state, action) => {
      state.loading = false;
      // Replace optimistic team with real data
      const tempId = state.items.findIndex(team => team.id.startsWith('temp_'));
      if (tempId !== -1) {
        state.items[tempId] = action.payload;
        state.cache[action.payload.id] = {
          data: action.payload,
          timestamp: Date.now()
        };
      }
    });
    builder.addCase(TeamActions.createTeam.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload || { message: 'Failed to create team' };
      // Remove optimistic team
      state.items = state.items.filter(team => !team.id.startsWith('temp_'));
    });

    // Handle update team actions with optimistic updates
    builder.addCase(TeamActions.updateTeam.pending, (state, action) => {
      const { teamId, updates } = action.meta.arg;
      const teamIndex = state.items.findIndex(team => team.id === teamId);
      if (teamIndex !== -1) {
        // Store original state for rollback
        state.cache[`rollback_${teamId}`] = {
          data: state.items[teamIndex],
          timestamp: Date.now()
        };
        // Apply optimistic update
        state.items[teamIndex] = { ...state.items[teamIndex], ...updates };
      }
    });
    builder.addCase(TeamActions.updateTeam.fulfilled, (state, action) => {
      const teamIndex = state.items.findIndex(team => team.id === action.payload.id);
      if (teamIndex !== -1) {
        state.items[teamIndex] = action.payload;
        state.cache[action.payload.id] = {
          data: action.payload,
          timestamp: Date.now()
        };
        // Clean up rollback cache
        delete state.cache[`rollback_${action.payload.id}`];
      }
    });
    builder.addCase(TeamActions.updateTeam.rejected, (state, action) => {
      const teamId = action.meta.arg.teamId;
      const rollbackData = state.cache[`rollback_${teamId}`];
      if (rollbackData) {
        // Rollback to original state
        const teamIndex = state.items.findIndex(team => team.id === teamId);
        if (teamIndex !== -1) {
          state.items[teamIndex] = rollbackData.data;
        }
        delete state.cache[`rollback_${teamId}`];
      }
      state.error = action.payload || { message: 'Failed to update team' };
    });

    // Handle sync team actions
    builder.addCase(TeamActions.syncTeam.pending, (state, action) => {
      const teamId = action.meta.arg.teamId;
      const team = state.items.find(t => t.id === teamId);
      if (team) {
        state.platformSync[team.platform] = 'SYNCING';
      }
    });
    builder.addCase(TeamActions.syncTeam.fulfilled, (state, action) => {
      const teamIndex = state.items.findIndex(team => team.id === action.payload.id);
      if (teamIndex !== -1) {
        state.items[teamIndex] = action.payload;
        state.cache[action.payload.id] = {
          data: action.payload,
          timestamp: Date.now()
        };
        state.platformSync[action.payload.platform] = 'SYNCED';
      }
    });
    builder.addCase(TeamActions.syncTeam.rejected, (state, action) => {
      const teamId = action.meta.arg.teamId;
      const team = state.items.find(t => t.id === teamId);
      if (team) {
        state.platformSync[team.platform] = 'ERROR';
      }
      state.error = action.payload || { message: 'Failed to sync team' };
    });
  }
});

// Export actions
export const { selectTeam, clearSelectedTeam, invalidateCache, syncPlatform } = teamsSlice.actions;

// Export the persisted reducer
export const teamReducer = persistReducer(persistConfig, teamsSlice.reducer);