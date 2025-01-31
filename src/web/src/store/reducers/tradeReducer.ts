/**
 * @fileoverview Redux reducer for managing trade-related state in the Fantasy GM Assistant application
 * Implements trade analysis, video generation, and performance monitoring
 * @version 1.0.0
 */

import { createReducer } from '@reduxjs/toolkit';
import { TradeState } from '../types';
import { Trade } from '../../types/trade';
import { TradeActionTypes } from '../actions/tradeActions';

/**
 * Initial state for trade management
 */
const INITIAL_STATE: TradeState = {
  history: [],
  currentProposal: null,
  loading: false,
  error: null,
  analysisProgress: 0,
  videoGenerationStatus: 'idle',
  lastUpdated: null
};

/**
 * Performance metrics interface for trade operations
 */
interface PerformanceMetrics {
  analysisTime: number;
  videoGenerationTime: number;
  cacheHitRate: number;
}

/**
 * Trade reducer with performance optimization and error handling
 */
export default createReducer(INITIAL_STATE, (builder) => {
  builder
    // Handle loading state
    .addCase(TradeActionTypes.SET_TRADE_LOADING, (state, action) => {
      state.loading = action.payload;
      if (action.payload) {
        state.error = null;
        state.analysisProgress = 0;
      }
      state.lastUpdated = new Date().toISOString();
    })

    // Handle error state
    .addCase(TradeActionTypes.SET_TRADE_ERROR, (state, action) => {
      state.error = action.payload;
      state.loading = false;
      state.analysisProgress = 0;
      state.videoGenerationStatus = 'idle';
      state.lastUpdated = new Date().toISOString();
    })

    // Handle current trade updates
    .addCase(TradeActionTypes.SET_CURRENT_TRADE, (state, action) => {
      state.currentProposal = action.payload;
      if (action.payload) {
        // Update history if trade is new or modified
        const existingIndex = state.history.findIndex(
          trade => trade.id === action.payload.id
        );
        if (existingIndex === -1) {
          state.history.unshift(action.payload);
        } else {
          state.history[existingIndex] = action.payload;
        }
        // Limit history size for performance
        if (state.history.length > 50) {
          state.history = state.history.slice(0, 50);
        }
      }
      state.lastUpdated = new Date().toISOString();
    })

    // Handle trade history updates
    .addCase(TradeActionTypes.SET_TRADE_HISTORY, (state, action) => {
      state.history = action.payload;
      // Sort by most recent first
      state.history.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      state.lastUpdated = new Date().toISOString();
    })

    // Handle analysis progress updates
    .addCase(TradeActionTypes.UPDATE_ANALYSIS_PROGRESS, (state, action) => {
      state.analysisProgress = action.payload;
      state.lastUpdated = new Date().toISOString();
    })

    // Handle video generation status updates
    .addCase(TradeActionTypes.UPDATE_VIDEO_STATUS, (state, action) => {
      if (state.currentProposal && action.payload.tradeId === state.currentProposal.id) {
        state.videoGenerationStatus = action.payload.status;
        if (action.payload.status === 'completed' && state.currentProposal) {
          state.currentProposal = {
            ...state.currentProposal,
            analysis: {
              ...state.currentProposal.analysis,
              videoUrl: action.payload.videoUrl
            }
          };
          // Update in history as well
          const historyIndex = state.history.findIndex(
            trade => trade.id === action.payload.tradeId
          );
          if (historyIndex !== -1) {
            state.history[historyIndex] = state.currentProposal;
          }
        }
      }
      state.lastUpdated = new Date().toISOString();
    })

    // Handle analysis cancellation
    .addCase(TradeActionTypes.CANCEL_ANALYSIS, (state) => {
      state.loading = false;
      state.analysisProgress = 0;
      state.videoGenerationStatus = 'idle';
      state.error = null;
      state.lastUpdated = new Date().toISOString();
    });
});