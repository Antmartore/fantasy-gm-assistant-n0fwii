/**
 * @fileoverview Redux action creators for managing trade-related operations
 * Includes trade analysis, video generation, and caching with performance monitoring
 * @version 1.0.0
 */

import { createAction } from '@reduxjs/toolkit';
import { retry } from 'axios-retry';
import { performance } from '@performance-monitor/core';

import { Trade, TradeStatus, TradeAnalysis } from '../../types/trade';
import { TradeCache } from '../../utils/cache';

// Version constants for API compatibility
const API_VERSION = 'v1';
const CACHE_VERSION = '1.0.0';

// Performance thresholds (ms)
const ANALYSIS_TIMEOUT = 2000;
const VIDEO_GENERATION_TIMEOUT = 30000;

// Cache configuration
const tradeCache = new TradeCache({
    prefix: 'trade_analysis_',
    defaultTTL: 15 * 60 * 1000, // 15 minutes
    maxSize: 50 * 1024 * 1024 // 50MB
});

/**
 * Enhanced enum of trade action type constants
 */
export enum TradeActionTypes {
    SET_TRADE_LOADING = 'SET_TRADE_LOADING',
    SET_TRADE_ERROR = 'SET_TRADE_ERROR',
    SET_CURRENT_TRADE = 'SET_CURRENT_TRADE',
    SET_TRADE_HISTORY = 'SET_TRADE_HISTORY',
    SET_TRADE_PROGRESS = 'SET_TRADE_PROGRESS',
    SET_VIDEO_STATUS = 'SET_VIDEO_STATUS',
    CANCEL_ANALYSIS = 'CANCEL_ANALYSIS'
}

/**
 * Action creators for trade state management
 */
export const setTradeLoading = createAction<boolean>(
    TradeActionTypes.SET_TRADE_LOADING
);

export const setTradeError = createAction<string | null>(
    TradeActionTypes.SET_TRADE_ERROR
);

export const setCurrentTrade = createAction<Trade | null>(
    TradeActionTypes.SET_CURRENT_TRADE
);

export const setTradeHistory = createAction<Trade[]>(
    TradeActionTypes.SET_TRADE_HISTORY
);

export const setTradeProgress = createAction<number>(
    TradeActionTypes.SET_TRADE_PROGRESS
);

export const setVideoStatus = createAction<{
    tradeId: string;
    status: 'generating' | 'completed' | 'error';
    progress?: number;
}>(TradeActionTypes.SET_VIDEO_STATUS);

export const cancelAnalysis = createAction(
    TradeActionTypes.CANCEL_ANALYSIS
);

/**
 * Analyzes a trade proposal with caching and performance monitoring
 */
export const analyzeTrade = (tradeProposal: Trade) => async (dispatch: any) => {
    const perfMarker = `trade_analysis_${tradeProposal.id}`;
    performance.mark(perfMarker);

    try {
        dispatch(setTradeLoading(true));
        dispatch(setTradeError(null));

        // Check cache first
        const cachedAnalysis = await tradeCache.getCachedAnalysis(tradeProposal.id);
        if (cachedAnalysis) {
            dispatch(setCurrentTrade({
                ...tradeProposal,
                analysis: cachedAnalysis
            }));
            return;
        }

        // Configure retry strategy
        const axiosWithRetry = retry(axios, {
            retries: 2,
            retryDelay: retry.exponentialDelay,
            retryCondition: (error) => {
                return retry.isNetworkOrIdempotentRequestError(error) ||
                    error.code === 'ECONNABORTED';
            }
        });

        // API call with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT);

        const response = await axiosWithRetry.post(
            `/api/${API_VERSION}/trades/analyze`,
            tradeProposal,
            {
                signal: controller.signal,
                timeout: ANALYSIS_TIMEOUT
            }
        );

        clearTimeout(timeoutId);

        const analysis: TradeAnalysis = response.data;

        // Cache successful analysis
        await tradeCache.setCachedAnalysis(tradeProposal.id, analysis);

        // Update trade with analysis
        dispatch(setCurrentTrade({
            ...tradeProposal,
            analysis,
            status: TradeStatus.PENDING
        }));

        // Log performance metrics
        performance.measure(
            `trade_analysis_complete`,
            perfMarker
        );

    } catch (error) {
        if (error.name === 'AbortError') {
            dispatch(setTradeError('Analysis timeout exceeded'));
        } else {
            dispatch(setTradeError(error.message));
        }
        performance.measure(
            `trade_analysis_error`,
            perfMarker
        );
    } finally {
        dispatch(setTradeLoading(false));
    }
};

/**
 * Generates video breakdown for trade analysis with progress tracking
 */
export const generateTradeVideo = (tradeId: string) => async (dispatch: any) => {
    const perfMarker = `trade_video_${tradeId}`;
    performance.mark(perfMarker);

    try {
        dispatch(setVideoStatus({ tradeId, status: 'generating', progress: 0 }));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), VIDEO_GENERATION_TIMEOUT);

        const eventSource = new EventSource(
            `/api/${API_VERSION}/trades/${tradeId}/video/generate`
        );

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            dispatch(setVideoStatus({
                tradeId,
                status: 'generating',
                progress: data.progress
            }));
        };

        eventSource.onerror = () => {
            eventSource.close();
            dispatch(setVideoStatus({
                tradeId,
                status: 'error'
            }));
        };

        const response = await new Promise((resolve, reject) => {
            eventSource.addEventListener('complete', (event) => {
                eventSource.close();
                clearTimeout(timeoutId);
                resolve(JSON.parse(event.data));
            });

            eventSource.addEventListener('error', () => {
                eventSource.close();
                clearTimeout(timeoutId);
                reject(new Error('Video generation failed'));
            });
        });

        dispatch(setVideoStatus({
            tradeId,
            status: 'completed',
            progress: 100
        }));

        // Update trade with video URL
        dispatch(setCurrentTrade({
            ...currentTrade,
            analysis: {
                ...currentTrade.analysis,
                videoUrl: response.videoUrl
            }
        }));

        performance.measure(
            `trade_video_complete`,
            perfMarker
        );

    } catch (error) {
        dispatch(setVideoStatus({
            tradeId,
            status: 'error'
        }));
        dispatch(setTradeError('Video generation failed'));
        
        performance.measure(
            `trade_video_error`,
            perfMarker
        );
    }
};