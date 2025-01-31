/**
 * @fileoverview Advanced React hook for managing fantasy sports team operations
 * Provides optimized caching, platform synchronization, and comprehensive error handling
 * @version 1.0.0
 */

import { useCallback, useEffect } from 'react'; // ^18.0.0
import { useDispatch, useSelector } from 'react-redux'; // ^8.0.0
import { debounce } from 'lodash'; // ^4.17.21
import { Team, FantasyPlatform, TeamUpdateParams } from '../../types/team';
import { CacheManager, CacheError } from '../../utils/cache';

// Constants
const TEAM_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const DEBOUNCE_DELAY = 500; // 500ms

// Types
interface FetchOptions {
  forceRefresh?: boolean;
  skipCache?: boolean;
}

interface UpdateOptions {
  optimistic?: boolean;
  skipSync?: boolean;
}

interface ImportOptions {
  validateRoster?: boolean;
  autoSync?: boolean;
}

interface SyncResult {
  success: boolean;
  timestamp: number;
  changes: number;
}

interface CacheStatus {
  size: number;
  items: number;
  lastCleanup: number;
}

interface TeamState {
  teams: Record<string, Team>;
  selectedTeamId: string | null;
  loading: boolean;
  error: Error | null;
  syncStatus: Record<string, SyncStatus>;
}

enum SyncStatus {
  IDLE = 'IDLE',
  SYNCING = 'SYNCING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

/**
 * Advanced hook for managing fantasy sports team operations with optimized performance
 */
export function useTeam() {
  const dispatch = useDispatch();
  const teamState = useSelector((state: any) => state.team) as TeamState;
  const cacheManager = new CacheManager({ prefix: 'team_' });

  // Initialize background sync interval
  useEffect(() => {
    const syncInterval = setInterval(syncAllTeams, SYNC_INTERVAL);
    return () => clearInterval(syncInterval);
  }, []);

  /**
   * Fetches all teams with caching and platform sync
   */
  const fetchTeams = useCallback(async (options: FetchOptions = {}) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });

      if (!options.skipCache && !options.forceRefresh) {
        const cachedTeams = await cacheManager.get<Record<string, Team>>('teams');
        if (cachedTeams) {
          dispatch({ type: 'SET_TEAMS', payload: cachedTeams });
          return;
        }
      }

      const response = await fetch('/api/teams');
      const teams = await response.json();

      await cacheManager.set('teams', teams, TEAM_CACHE_TTL);
      dispatch({ type: 'SET_TEAMS', payload: teams });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  /**
   * Fetches a single team by ID with caching
   */
  const fetchTeamById = useCallback(async (teamId: string, options: FetchOptions = {}) => {
    try {
      if (!options.skipCache && !options.forceRefresh) {
        const cachedTeam = await cacheManager.get<Team>(`team_${teamId}`);
        if (cachedTeam) {
          dispatch({ type: 'UPDATE_TEAM', payload: { id: teamId, data: cachedTeam } });
          return;
        }
      }

      const response = await fetch(`/api/teams/${teamId}`);
      const team = await response.json();

      await cacheManager.set(`team_${teamId}`, team, TEAM_CACHE_TTL);
      dispatch({ type: 'UPDATE_TEAM', payload: { id: teamId, data: team } });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error });
    }
  }, []);

  /**
   * Creates a new team with platform integration
   */
  const createTeam = useCallback(async (teamData: TeamUpdateParams): Promise<string> => {
    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify(teamData)
      });
      const newTeam = await response.json();

      await cacheManager.set(`team_${newTeam.id}`, newTeam, TEAM_CACHE_TTL);
      dispatch({ type: 'ADD_TEAM', payload: newTeam });

      return newTeam.id;
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error });
      throw error;
    }
  }, []);

  /**
   * Updates team data with optimistic updates and sync
   */
  const updateTeam = useCallback(async (
    teamId: string,
    teamData: TeamUpdateParams,
    options: UpdateOptions = {}
  ) => {
    try {
      if (options.optimistic) {
        dispatch({ type: 'UPDATE_TEAM', payload: { id: teamId, data: teamData } });
      }

      const response = await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        body: JSON.stringify(teamData)
      });
      const updatedTeam = await response.json();

      await cacheManager.set(`team_${teamId}`, updatedTeam, TEAM_CACHE_TTL);
      dispatch({ type: 'UPDATE_TEAM', payload: { id: teamId, data: updatedTeam } });

      if (!options.skipSync) {
        await syncTeam(teamId);
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error });
      throw error;
    }
  }, []);

  /**
   * Deletes a team and cleans up cache
   */
  const deleteTeam = useCallback(async (teamId: string) => {
    try {
      await fetch(`/api/teams/${teamId}`, { method: 'DELETE' });
      await cacheManager.remove(`team_${teamId}`);
      dispatch({ type: 'REMOVE_TEAM', payload: teamId });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error });
      throw error;
    }
  }, []);

  /**
   * Imports team from external platform
   */
  const importTeam = useCallback(async (
    platform: FantasyPlatform,
    externalTeamId: string,
    options: ImportOptions = {}
  ) => {
    try {
      const response = await fetch('/api/teams/import', {
        method: 'POST',
        body: JSON.stringify({ platform, externalTeamId, ...options })
      });
      const importedTeam = await response.json();

      await cacheManager.set(`team_${importedTeam.id}`, importedTeam, TEAM_CACHE_TTL);
      dispatch({ type: 'ADD_TEAM', payload: importedTeam });

      if (options.autoSync) {
        await syncTeam(importedTeam.id);
      }
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error });
      throw error;
    }
  }, []);

  /**
   * Syncs team data with external platform
   */
  const syncTeam = useCallback(async (teamId: string): Promise<SyncResult> => {
    try {
      dispatch({ type: 'SET_SYNC_STATUS', payload: { id: teamId, status: SyncStatus.SYNCING } });

      const response = await fetch(`/api/teams/${teamId}/sync`, { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        await fetchTeamById(teamId, { forceRefresh: true });
        dispatch({ type: 'SET_SYNC_STATUS', payload: { id: teamId, status: SyncStatus.SUCCESS } });
      } else {
        dispatch({ type: 'SET_SYNC_STATUS', payload: { id: teamId, status: SyncStatus.ERROR } });
      }

      return result;
    } catch (error) {
      dispatch({ type: 'SET_SYNC_STATUS', payload: { id: teamId, status: SyncStatus.ERROR } });
      throw error;
    }
  }, []);

  // Debounced sync for frequent updates
  const debouncedSync = debounce(syncTeam, DEBOUNCE_DELAY);

  /**
   * Syncs all teams in background
   */
  const syncAllTeams = useCallback(async () => {
    const teams = Object.keys(teamState.teams);
    await Promise.all(teams.map(teamId => debouncedSync(teamId)));
  }, [teamState.teams]);

  /**
   * Selects a team for active management
   */
  const selectTeam = useCallback((teamId: string) => {
    dispatch({ type: 'SET_SELECTED_TEAM', payload: teamId });
  }, []);

  /**
   * Clears selected team
   */
  const clearSelectedTeam = useCallback(() => {
    dispatch({ type: 'SET_SELECTED_TEAM', payload: null });
  }, []);

  /**
   * Gets cache status information
   */
  const getCacheStatus = useCallback((): CacheStatus => {
    return {
      size: cacheManager.getCurrentCacheSize(),
      items: cacheManager.getItemCount(),
      lastCleanup: cacheManager.getLastCleanupTime()
    };
  }, []);

  /**
   * Clears all team-related cache
   */
  const clearCache = useCallback(async () => {
    await cacheManager.clear();
    dispatch({ type: 'CLEAR_CACHE' });
  }, []);

  return {
    teams: teamState.teams,
    selectedTeamId: teamState.selectedTeamId,
    loading: teamState.loading,
    error: teamState.error,
    syncStatus: teamState.syncStatus,
    fetchTeams,
    fetchTeamById,
    createTeam,
    updateTeam,
    deleteTeam,
    importTeam,
    syncTeam,
    selectTeam,
    clearSelectedTeam,
    getCacheStatus,
    clearCache
  };
}