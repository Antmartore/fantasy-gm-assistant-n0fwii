/**
 * @fileoverview Redux reducer for managing lineup state with optimization features
 * Handles lineup optimization, real-time updates, and state management
 * @version 1.0.0
 */

import { createReducer, PayloadAction } from '@reduxjs/toolkit'; // ^1.9.0

import {
  Lineup,
  LineupSlot,
  LineupOptimizationResult,
  OptimizationStatus
} from '../../types/lineup';

import {
  SET_ACTIVE_LINEUP,
  FETCH_LINEUP_REQUEST,
  FETCH_LINEUP_SUCCESS,
  FETCH_LINEUP_ERROR,
  OPTIMIZE_LINEUP_REQUEST,
  OPTIMIZE_LINEUP_SUCCESS,
  OPTIMIZE_LINEUP_ERROR,
  UPDATE_OPTIMIZATION_PROGRESS,
  CACHE_OPTIMIZATION_RESULT,
  CLEAR_OPTIMIZATION_CACHE
} from '../actions/lineupActions';

// State interface
export interface LineupState {
  items: Lineup[];
  activeLineupId: string | null;
  loading: boolean;
  error: string | null;
  optimizationResult: LineupOptimizationResult | null;
  optimizationProgress: number;
  optimizationCache: Record<string, LineupOptimizationResult>;
  lastOptimizationTimestamp: number;
  isOptimizing: boolean;
  optimizationStatus: OptimizationStatus;
}

// Initial state
const initialState: LineupState = {
  items: [],
  activeLineupId: null,
  loading: false,
  error: null,
  optimizationResult: null,
  optimizationProgress: 0,
  optimizationCache: {},
  lastOptimizationTimestamp: 0,
  isOptimizing: false,
  optimizationStatus: 'idle'
};

// Cache invalidation time (15 minutes)
const CACHE_INVALIDATION_TIME = 15 * 60 * 1000;

// Helper function to check if cache is valid
const isCacheValid = (timestamp: number): boolean => {
  return Date.now() - timestamp < CACHE_INVALIDATION_TIME;
};

// Create the reducer
export const lineupReducer = createReducer(initialState, (builder) => {
  builder
    // Handle setting active lineup
    .addCase(SET_ACTIVE_LINEUP, (state, action: PayloadAction<{ lineupId: string; timestamp: number }>) => {
      state.activeLineupId = action.payload.lineupId;
      state.error = null;

      // Check cache for existing optimization results
      const cachedResult = state.optimizationCache[action.payload.lineupId];
      if (cachedResult && isCacheValid(state.lastOptimizationTimestamp)) {
        state.optimizationResult = cachedResult;
      } else {
        state.optimizationResult = null;
      }
    })

    // Handle lineup fetch request
    .addCase(FETCH_LINEUP_REQUEST, (state) => {
      state.loading = true;
      state.error = null;
    })

    // Handle lineup fetch success
    .addCase(FETCH_LINEUP_SUCCESS, (state, action: PayloadAction<Lineup[]>) => {
      state.items = action.payload;
      state.loading = false;
      state.error = null;
    })

    // Handle lineup fetch error
    .addCase(FETCH_LINEUP_ERROR, (state, action: PayloadAction<string>) => {
      state.loading = false;
      state.error = action.payload;
    })

    // Handle optimization request
    .addCase(OPTIMIZE_LINEUP_REQUEST, (state, action: PayloadAction<{ requestId: string }>) => {
      state.isOptimizing = true;
      state.optimizationProgress = 0;
      state.optimizationStatus = 'running';
      state.error = null;
    })

    // Handle optimization success
    .addCase(OPTIMIZE_LINEUP_SUCCESS, (state, action: PayloadAction<{
      requestId: string;
      result: LineupOptimizationResult;
      processingTime: number;
      timestamp: number;
    }>) => {
      state.isOptimizing = false;
      state.optimizationResult = action.payload.result;
      state.optimizationProgress = 100;
      state.optimizationStatus = 'completed';
      state.lastOptimizationTimestamp = action.payload.timestamp;

      // Cache the result
      if (state.activeLineupId) {
        state.optimizationCache[state.activeLineupId] = action.payload.result;
      }
    })

    // Handle optimization error
    .addCase(OPTIMIZE_LINEUP_ERROR, (state, action: PayloadAction<{
      requestId: string;
      error: string;
      timestamp: number;
    }>) => {
      state.isOptimizing = false;
      state.error = action.payload.error;
      state.optimizationStatus = 'error';
      state.optimizationProgress = 0;
    })

    // Handle optimization progress updates
    .addCase(UPDATE_OPTIMIZATION_PROGRESS, (state, action: PayloadAction<{
      requestId: string;
      progress: number;
      timestamp: number;
    }>) => {
      state.optimizationProgress = action.payload.progress;
    })

    // Handle caching optimization result
    .addCase(CACHE_OPTIMIZATION_RESULT, (state, action: PayloadAction<{
      lineupId: string;
      result: LineupOptimizationResult;
      timestamp: number;
    }>) => {
      state.optimizationCache[action.payload.lineupId] = action.payload.result;
      state.lastOptimizationTimestamp = action.payload.timestamp;
    })

    // Handle clearing optimization cache
    .addCase(CLEAR_OPTIMIZATION_CACHE, (state) => {
      state.optimizationCache = {};
      state.lastOptimizationTimestamp = 0;
      state.optimizationResult = null;
      state.optimizationProgress = 0;
      state.optimizationStatus = 'idle';
    });
});

export default lineupReducer;