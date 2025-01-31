// External imports
import { createAction } from '@reduxjs/toolkit'; // ^1.9.0

// Internal imports
import { 
  Lineup,
  LineupSlot,
  LineupOptimizationResult,
  LineupOptimizationParams,
  LineupUpdateEvent,
  LineupOptimizationProgress
} from '../../types/lineup';
import { 
  optimizeLineup,
  subscribeToLineupUpdates
} from '../../api/lineups';

// Action Types
export const SET_ACTIVE_LINEUP = 'lineup/setActive';
export const OPTIMIZE_LINEUP_REQUEST = 'lineup/optimizeRequest';
export const OPTIMIZE_LINEUP_PROGRESS = 'lineup/optimizeProgress';
export const OPTIMIZE_LINEUP_SUCCESS = 'lineup/optimizeSuccess';
export const OPTIMIZE_LINEUP_ERROR = 'lineup/optimizeError';
export const LINEUP_UPDATE_RECEIVED = 'lineup/updateReceived';
export const LINEUP_SYNC_STATUS = 'lineup/syncStatus';

// Action Creators with Performance Tracking
export const setActiveLineup = createAction<{
  lineupId: string;
  timestamp: number;
}>(SET_ACTIVE_LINEUP, (lineupId: string) => ({
  payload: {
    lineupId,
    timestamp: Date.now()
  }
}));

export const optimizeLineupRequest = createAction<
  LineupOptimizationParams & { 
    requestId: string; 
    timestamp: number;
  }
>(OPTIMIZE_LINEUP_REQUEST, (params: LineupOptimizationParams) => ({
  payload: {
    ...params,
    requestId: `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  }
}));

export const optimizeLineupProgress = createAction<{
  requestId: string;
  progress: LineupOptimizationProgress;
  timestamp: number;
}>(OPTIMIZE_LINEUP_PROGRESS);

export const optimizeLineupSuccess = createAction<{
  requestId: string;
  result: LineupOptimizationResult;
  processingTime: number;
  timestamp: number;
}>(OPTIMIZE_LINEUP_SUCCESS);

export const optimizeLineupError = createAction<{
  requestId: string;
  error: string;
  timestamp: number;
}>(OPTIMIZE_LINEUP_ERROR);

export const lineupUpdateReceived = createAction<{
  lineup: Lineup;
  source: 'websocket' | 'polling';
  timestamp: number;
}>(LINEUP_UPDATE_RECEIVED);

export const lineupSyncStatus = createAction<{
  synced: boolean;
  lastSyncTime: number;
  pendingChanges: number;
}>(LINEUP_SYNC_STATUS);

// Thunk Actions for Async Operations
export const startLineupOptimization = (params: LineupOptimizationParams) => 
  async (dispatch: any) => {
    const action = dispatch(optimizeLineupRequest(params));
    const { requestId, timestamp } = action.payload;

    try {
      const optimizationPromise = optimizeLineup(params);
      
      // Setup progress tracking
      let lastProgressUpdate = timestamp;
      const progressInterval = setInterval(() => {
        const currentTime = Date.now();
        const progress = {
          completedSimulations: 0,
          totalSimulations: params.simulationCount || 1000,
          currentConfidence: 0,
          elapsedTime: currentTime - timestamp
        };
        
        dispatch(optimizeLineupProgress({
          requestId,
          progress,
          timestamp: currentTime
        }));
        
        lastProgressUpdate = currentTime;
      }, 1000);

      const result = await optimizationPromise;
      clearInterval(progressInterval);

      dispatch(optimizeLineupSuccess({
        requestId,
        result,
        processingTime: Date.now() - timestamp,
        timestamp: Date.now()
      }));

      return result;
    } catch (error) {
      dispatch(optimizeLineupError({
        requestId,
        error: error instanceof Error ? error.message : 'Optimization failed',
        timestamp: Date.now()
      }));
      throw error;
    }
  };

export const setupLineupSync = (lineupId: string) => 
  (dispatch: any) => {
    let lastUpdateTime = Date.now();
    let pendingChanges = 0;

    const unsubscribe = subscribeToLineupUpdates(lineupId, (lineup) => {
      const currentTime = Date.now();
      
      dispatch(lineupUpdateReceived({
        lineup,
        source: 'websocket',
        timestamp: currentTime
      }));

      dispatch(lineupSyncStatus({
        synced: true,
        lastSyncTime: currentTime,
        pendingChanges: Math.max(0, --pendingChanges)
      }));

      lastUpdateTime = currentTime;
    });

    return {
      unsubscribe,
      updatePendingChanges: (delta: number) => {
        pendingChanges = Math.max(0, pendingChanges + delta);
        dispatch(lineupSyncStatus({
          synced: pendingChanges === 0,
          lastSyncTime: lastUpdateTime,
          pendingChanges
        }));
      }
    };
  };