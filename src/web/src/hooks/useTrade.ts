/**
 * @fileoverview Custom React hook for managing trade operations and state in the Fantasy GM Assistant
 * Provides AI-powered trade analysis, video generation, and trade history functionality
 * @version 1.0.0
 */

import { useCallback, useState } from 'react'; // ^18.0.0
import { useDispatch, useSelector } from 'react-redux'; // ^8.0.0
import { analyzeTradeRequest, generateTradeVideoRequest, fetchTradeHistory } from '../store/actions/tradeActions';
import { Trade } from '../types/trade';
import { CacheManager } from '../utils/cache';

// Cache configuration for trade operations
const tradeCache = new CacheManager({
    prefix: 'trade_',
    defaultTTL: 15 * 60 * 1000, // 15 minutes
    maxSize: 50 * 1024 * 1024, // 50MB
    enableTelemetry: true
});

// Error types for trade operations
interface TradeError {
    code: string;
    message: string;
    details?: any;
}

/**
 * Custom hook for managing trade operations with AI analysis and video generation
 */
export const useTrade = () => {
    const dispatch = useDispatch();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<TradeError | null>(null);
    const [progress, setProgress] = useState(0);

    // Redux selectors
    const trades = useSelector((state: any) => state.trades.items);
    const activeTrade = useSelector((state: any) => state.trades.activeTrade);
    const isPremium = useSelector((state: any) => state.user.isPremium);

    /**
     * Analyzes a trade proposal using GPT-4 AI with risk scoring
     */
    const analyzeTrade = useCallback(async (tradeProposal: Trade) => {
        try {
            setLoading(true);
            setError(null);
            setProgress(0);

            // Premium feature check
            if (!isPremium) {
                throw {
                    code: 'PREMIUM_REQUIRED',
                    message: 'Trade analysis requires a premium subscription'
                };
            }

            // Check cache first
            const cachedAnalysis = await tradeCache.get<Trade>(`analysis_${tradeProposal.id}`);
            if (cachedAnalysis) {
                return cachedAnalysis;
            }

            // Dispatch analysis request
            const result = await dispatch(analyzeTradeRequest(tradeProposal));
            
            // Cache successful analysis
            if (result.payload) {
                await tradeCache.set(`analysis_${tradeProposal.id}`, result.payload);
            }

            setProgress(100);
            return result.payload;

        } catch (err: any) {
            setError({
                code: err.code || 'ANALYSIS_ERROR',
                message: err.message || 'Failed to analyze trade',
                details: err.details
            });
            throw err;
        } finally {
            setLoading(false);
        }
    }, [dispatch, isPremium]);

    /**
     * Generates an AI-narrated video breakdown for a trade
     */
    const generateTradeVideo = useCallback(async (tradeId: string) => {
        try {
            setLoading(true);
            setError(null);
            setProgress(0);

            // Premium feature check
            if (!isPremium) {
                throw {
                    code: 'PREMIUM_REQUIRED',
                    message: 'Video generation requires a premium subscription'
                };
            }

            // Check cache first
            const cachedVideo = await tradeCache.get<string>(`video_${tradeId}`);
            if (cachedVideo) {
                return cachedVideo;
            }

            // Handle video generation progress
            const handleProgress = (progressEvent: any) => {
                const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setProgress(progress);
            };

            // Dispatch video generation request
            const result = await dispatch(generateTradeVideoRequest(tradeId));
            
            // Cache successful video URL
            if (result.payload) {
                await tradeCache.set(`video_${tradeId}`, result.payload);
            }

            setProgress(100);
            return result.payload;

        } catch (err: any) {
            setError({
                code: err.code || 'VIDEO_ERROR',
                message: err.message || 'Failed to generate trade video',
                details: err.details
            });
            throw err;
        } finally {
            setLoading(false);
        }
    }, [dispatch, isPremium]);

    /**
     * Fetches paginated trade history with caching
     */
    const fetchHistory = useCallback(async (teamId: string) => {
        try {
            setLoading(true);
            setError(null);

            // Check cache first
            const cachedHistory = await tradeCache.get<Trade[]>(`history_${teamId}`);
            if (cachedHistory) {
                return cachedHistory;
            }

            // Dispatch history fetch request
            const result = await dispatch(fetchTradeHistory(teamId));
            
            // Cache successful history
            if (result.payload) {
                await tradeCache.set(`history_${teamId}`, result.payload);
            }

            return result.payload;

        } catch (err: any) {
            setError({
                code: err.code || 'HISTORY_ERROR',
                message: err.message || 'Failed to fetch trade history',
                details: err.details
            });
            throw err;
        } finally {
            setLoading(false);
        }
    }, [dispatch]);

    return {
        // Actions
        analyzeTrade,
        generateTradeVideo,
        fetchHistory,

        // State
        trades,
        activeTrade,
        loading,
        error,
        progress,
        isPremium
    };
};

export default useTrade;