// External imports
import axios, { AxiosError } from 'axios'; // axios: ^1.4.0
import rateLimit from 'axios-rate-limit'; // axios-rate-limit: ^1.3.0
import CircuitBreaker from 'opossum'; // opossum: ^6.0.0

// Internal imports
import { ApiResponse, ErrorCode } from '../api/types';
import { Trade, TradeAnalysis, TradeStatus } from '../types/trade';
import { apiService } from '../utils/api';
import { API_ENDPOINTS, RATE_LIMITS, CACHE_DURATION } from '../config/constants';

// Types
interface AnalysisOptions {
  includeVideo?: boolean;
  detailedStats?: boolean;
  confidenceThreshold?: number;
  simulationCount?: number;
}

interface VideoOptions {
  duration?: number;
  includeVoiceover?: boolean;
  highlightKey?: string;
  quality?: 'high' | 'medium' | 'low';
}

interface VideoGeneration {
  videoUrl: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  estimatedTime: number;
}

// Constants
const TRADE_RATE_LIMIT = RATE_LIMITS.TRADES;
const VIDEO_RATE_LIMIT = 10; // Per hour
const ANALYSIS_CACHE_TTL = CACHE_DURATION.PLAYER_STATS;
const VIDEO_CACHE_TTL = 86400000; // 24 hours

// Circuit breaker configuration
const circuitBreakerOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
};

// Initialize circuit breakers
const analysisCircuitBreaker = new CircuitBreaker(async () => {}, circuitBreakerOptions);
const videoCircuitBreaker = new CircuitBreaker(async () => {}, circuitBreakerOptions);

/**
 * Analyzes a trade proposal using GPT-4 and Monte Carlo simulations
 * @param tradeProposal - The trade proposal to analyze
 * @param options - Analysis configuration options
 * @returns Promise with comprehensive trade analysis
 */
export async function analyzeTrade(
  tradeProposal: Trade,
  options: AnalysisOptions = {}
): Promise<ApiResponse<TradeAnalysis>> {
  try {
    // Validate trade proposal
    if (!tradeProposal.playersOffered?.length || !tradeProposal.playersRequested?.length) {
      throw new Error('Invalid trade proposal: Missing players');
    }

    // Apply rate limiting
    const rateLimitedRequest = rateLimit(apiService.request, {
      maxRequests: TRADE_RATE_LIMIT,
      perMilliseconds: 60000
    });

    // Execute analysis with circuit breaker
    return await analysisCircuitBreaker.fire(async () => {
      const response = await rateLimitedRequest<TradeAnalysis>({
        method: 'POST',
        url: `${API_ENDPOINTS.TRADES}/analyze`,
        data: {
          trade: tradeProposal,
          options: {
            includeVideo: options.includeVideo ?? false,
            detailedStats: options.detailedStats ?? true,
            confidenceThreshold: options.confidenceThreshold ?? 0.8,
            simulationCount: options.simulationCount ?? 1000
          }
        },
        headers: {
          'x-feature-video': options.includeVideo ? 'true' : 'false'
        }
      });

      return response;
    });
  } catch (error) {
    if (error instanceof AxiosError) {
      throw {
        code: error.response?.status === 429 ? ErrorCode.RATE_LIMIT_ERROR : ErrorCode.SERVER_ERROR,
        message: error.response?.data?.message || 'Trade analysis failed',
        details: error.response?.data
      };
    }
    throw error;
  }
}

/**
 * Generates a video breakdown of trade analysis
 * @param tradeId - ID of the analyzed trade
 * @param options - Video generation options
 * @returns Promise with video generation status and URL
 */
export async function generateTradeVideo(
  tradeId: string,
  options: VideoOptions = {}
): Promise<ApiResponse<VideoGeneration>> {
  try {
    // Apply hourly rate limiting for video generation
    const rateLimitedRequest = rateLimit(apiService.request, {
      maxRequests: VIDEO_RATE_LIMIT,
      perMilliseconds: 3600000
    });

    // Execute video generation with circuit breaker
    return await videoCircuitBreaker.fire(async () => {
      const response = await rateLimitedRequest<VideoGeneration>({
        method: 'POST',
        url: `${API_ENDPOINTS.TRADES}/${tradeId}/video`,
        data: {
          options: {
            duration: options.duration ?? 60,
            includeVoiceover: options.includeVoiceover ?? true,
            highlightKey: options.highlightKey,
            quality: options.quality ?? 'high'
          }
        },
        headers: {
          'x-feature-voice': options.includeVoiceover ? 'true' : 'false',
          'x-video-quality': options.quality || 'high'
        }
      });

      return response;
    });
  } catch (error) {
    if (error instanceof AxiosError) {
      throw {
        code: error.response?.status === 429 ? ErrorCode.RATE_LIMIT_ERROR : ErrorCode.SERVER_ERROR,
        message: error.response?.data?.message || 'Video generation failed',
        details: error.response?.data
      };
    }
    throw error;
  }
}

/**
 * Updates the status of an existing trade
 * @param tradeId - ID of the trade to update
 * @param status - New trade status
 * @returns Promise with updated trade
 */
export async function updateTradeStatus(
  tradeId: string,
  status: TradeStatus
): Promise<ApiResponse<Trade>> {
  try {
    const response = await apiService.request<Trade>({
      method: 'PATCH',
      url: `${API_ENDPOINTS.TRADES}/${tradeId}/status`,
      data: { status }
    });

    return response;
  } catch (error) {
    if (error instanceof AxiosError) {
      throw {
        code: ErrorCode.SERVER_ERROR,
        message: 'Failed to update trade status',
        details: error.response?.data
      };
    }
    throw error;
  }
}