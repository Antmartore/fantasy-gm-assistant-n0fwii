// External imports
import { createAsyncThunk } from '@reduxjs/toolkit'; // @reduxjs/toolkit: ^1.9.0
import debounce from 'lodash/debounce'; // lodash: ^4.17.21
import CircuitBreaker from 'opossum'; // opossum: ^6.0.0
import { RateLimiter } from 'rate-limiter-flexible'; // rate-limiter-flexible: ^2.3.0

// Internal imports
import { 
  Team, 
  TeamSettings, 
  FantasyPlatform, 
  SportType, 
  TeamUpdateParams 
} from '../../types/team';
import { 
  getTeams, 
  getTeam, 
  createTeam, 
  updateTeam, 
  deleteTeam, 
  syncTeam, 
  batchUpdateTeams 
} from '../../api/teams';
import { ApiError, RequestParams } from '../../api/types';
import storageManager from '../../utils/storage';

// Constants
const CACHE_TTL = 900000; // 15 minutes
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_RETRY_ATTEMPTS = 3;

// Rate limiter configuration
const rateLimiter = new RateLimiter({
  points: 100,
  duration: RATE_LIMIT_WINDOW
});

// Circuit breaker configuration
const circuitBreaker = new CircuitBreaker(async (fn: Function) => await fn(), {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});

// Action Types
export enum TeamActionTypes {
  FETCH_TEAMS = 'teams/fetchTeams',
  FETCH_TEAM = 'teams/fetchTeam',
  CREATE_TEAM = 'teams/createTeam',
  UPDATE_TEAM = 'teams/updateTeam',
  DELETE_TEAM = 'teams/deleteTeam',
  SYNC_TEAM = 'teams/syncTeam',
  BATCH_UPDATE = 'teams/batchUpdate'
}

// Async Thunks
export const fetchTeams = createAsyncThunk<
  { teams: Team[]; total: number },
  RequestParams,
  { rejectValue: ApiError }
>(
  TeamActionTypes.FETCH_TEAMS,
  async (params, { rejectWithValue }) => {
    try {
      await rateLimiter.consume('fetchTeams');

      // Check cache first
      const cacheKey = `teams_${JSON.stringify(params)}`;
      const cachedData = await storageManager.getItem<{ teams: Team[]; total: number }>(cacheKey);
      
      if (cachedData) {
        return cachedData;
      }

      const response = await circuitBreaker.fire(() => getTeams(params));
      
      // Cache the response
      await storageManager.setItem(cacheKey, response, {
        ttl: CACHE_TTL,
        compressed: true
      });

      return response;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  }
);

export const fetchTeamById = createAsyncThunk<
  Team,
  string,
  { rejectValue: ApiError }
>(
  TeamActionTypes.FETCH_TEAM,
  async (teamId, { rejectWithValue }) => {
    try {
      await rateLimiter.consume('fetchTeam');

      const cacheKey = `team_${teamId}`;
      const cachedTeam = await storageManager.getItem<Team>(cacheKey);

      if (cachedTeam) {
        return cachedTeam;
      }

      const team = await circuitBreaker.fire(() => getTeam(teamId));
      
      await storageManager.setItem(cacheKey, team, {
        ttl: CACHE_TTL,
        encrypted: true
      });

      return team;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  }
);

export const createNewTeam = createAsyncThunk<
  Team,
  { name: string; platform: FantasyPlatform; sport: SportType; settings: TeamSettings },
  { rejectValue: ApiError }
>(
  TeamActionTypes.CREATE_TEAM,
  async (teamData, { rejectWithValue }) => {
    try {
      await rateLimiter.consume('createTeam');
      const team = await circuitBreaker.fire(() => createTeam(teamData));
      await storageManager.invalidateCache(/^teams_/);
      return team;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  }
);

export const updateTeamDetails = createAsyncThunk<
  Team,
  { teamId: string; updates: TeamUpdateParams },
  { rejectValue: ApiError }
>(
  TeamActionTypes.UPDATE_TEAM,
  async ({ teamId, updates }, { rejectWithValue, dispatch }) => {
    try {
      await rateLimiter.consume('updateTeam');

      // Optimistic update
      dispatch({ 
        type: 'teams/optimisticUpdate', 
        payload: { id: teamId, ...updates } 
      });

      const team = await circuitBreaker.fire(() => updateTeam(teamId, updates));
      
      // Invalidate related caches
      await storageManager.removeItem(`team_${teamId}`);
      await storageManager.invalidateCache(/^teams_/);

      return team;
    } catch (error) {
      // Revert optimistic update
      dispatch({ 
        type: 'teams/revertOptimisticUpdate', 
        payload: teamId 
      });
      return rejectWithValue(error as ApiError);
    }
  }
);

export const deleteTeamById = createAsyncThunk<
  void,
  string,
  { rejectValue: ApiError }
>(
  TeamActionTypes.DELETE_TEAM,
  async (teamId, { rejectWithValue }) => {
    try {
      await rateLimiter.consume('deleteTeam');
      await circuitBreaker.fire(() => deleteTeam(teamId));
      
      // Clean up caches
      await storageManager.removeItem(`team_${teamId}`);
      await storageManager.invalidateCache(/^teams_/);
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  }
);

export const syncTeamWithPlatform = createAsyncThunk<
  Team,
  { teamId: string; forceFetch?: boolean },
  { rejectValue: ApiError }
>(
  TeamActionTypes.SYNC_TEAM,
  async ({ teamId, forceFetch }, { rejectWithValue }) => {
    try {
      await rateLimiter.consume('syncTeam');
      
      const team = await circuitBreaker.fire(() => 
        syncTeam(teamId, { 
          forceFetch, 
          validateRoster: true,
          updateStats: true 
        })
      );

      // Update caches with fresh data
      await storageManager.setItem(`team_${teamId}`, team, {
        ttl: CACHE_TTL,
        encrypted: true
      });
      await storageManager.invalidateCache(/^teams_/);

      return team;
    } catch (error) {
      return rejectWithValue(error as ApiError);
    }
  }
);

// Debounced batch update function
export const batchUpdateTeams = debounce(
  createAsyncThunk<
    Team[],
    { teams: Partial<Team>[] },
    { rejectValue: ApiError }
  >(
    TeamActionTypes.BATCH_UPDATE,
    async ({ teams }, { rejectWithValue }) => {
      try {
        await rateLimiter.consume('batchUpdate');
        const updatedTeams = await circuitBreaker.fire(() => 
          batchUpdateTeams(teams)
        );

        // Update caches
        for (const team of updatedTeams) {
          await storageManager.setItem(`team_${team.id}`, team, {
            ttl: CACHE_TTL,
            encrypted: true
          });
        }
        await storageManager.invalidateCache(/^teams_/);

        return updatedTeams;
      } catch (error) {
        return rejectWithValue(error as ApiError);
      }
    }
  ),
  1000, // Debounce for 1 second
  { maxWait: 5000 } // Maximum wait time of 5 seconds
);

// Export all actions
export const TeamThunkActions = {
  fetchTeams,
  fetchTeamById,
  createNewTeam,
  updateTeamDetails,
  deleteTeamById,
  syncTeamWithPlatform,
  batchUpdateTeams
};