/**
 * @fileoverview Core type definitions for Redux store state management
 * Provides comprehensive type safety for the Fantasy GM Assistant application
 * @version 1.0.0
 */

// redux v4.2.1
import { Action } from 'redux';
// redux-thunk v2.4.2
import { ThunkAction } from 'redux-thunk';

import { AuthState, UserRole, AuthProvider } from '../types/auth';
import { Team, FantasyPlatform, TeamSettings, TeamStats } from '../types/team';
import { 
  Player, 
  PlayerPosition, 
  PlayerStatus,
  PlayerStats,
  WeatherImpact 
} from '../types/player';

/**
 * Team synchronization status with external platforms
 */
export interface TeamSyncStatus {
  lastSync: Date;
  platform: FantasyPlatform;
  status: 'synced' | 'pending' | 'failed';
  error?: string;
}

/**
 * AI analysis status tracking
 */
export type AIAnalysisStatus = 'idle' | 'analyzing' | 'completed' | 'failed';

/**
 * Trade analysis with AI recommendations
 */
export interface Trade {
  id: string;
  proposedBy: string;
  proposedTo: string;
  playersOffered: Player[];
  playersRequested: Player[];
  riskScore: number;
  aiRecommendation: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

/**
 * AI-powered trade recommendations
 */
export interface AIRecommendation {
  playersToOffer: Player[];
  playersToRequest: Player[];
  confidenceScore: number;
  reasoning: string;
  expectedValueGain: number;
}

/**
 * Monte Carlo simulation configuration
 */
export interface SimulationConfig {
  weeks: number;
  iterations: number;
  includeWeather: boolean;
  includeInjuries: boolean;
  confidenceInterval: number;
}

/**
 * Simulation results with Monte Carlo analysis
 */
export interface Simulation {
  id: string;
  teamId: string;
  config: SimulationConfig;
  winProbability: number;
  projectedPoints: number;
  confidenceInterval: [number, number];
  recommendations: string[];
  createdAt: Date;
}

/**
 * Teams slice of Redux store
 */
export interface TeamsState {
  items: Team[];
  loading: boolean;
  error: string | null;
  selectedTeam: Team | null;
  syncStatus: Record<string, TeamSyncStatus>;
}

/**
 * Players slice of Redux store
 */
export interface PlayersState {
  items: Player[];
  loading: boolean;
  error: string | null;
  selectedPlayer: Player | null;
  analysisStatus: AIAnalysisStatus;
}

/**
 * Trades slice of Redux store
 */
export interface TradesState {
  history: Trade[];
  currentProposal: Trade | null;
  loading: boolean;
  error: string | null;
  recommendations: AIRecommendation[];
}

/**
 * Simulations slice of Redux store
 */
export interface SimulationsState {
  results: Simulation[];
  loading: boolean;
  progress: number;
  error: string | null;
  currentConfig: SimulationConfig;
}

/**
 * Root state interface combining all slices
 */
export interface RootState {
  auth: AuthState;
  teams: TeamsState;
  players: PlayersState;
  trades: TradesState;
  simulations: SimulationsState;
}

/**
 * Loading state type with idle support
 */
export type LoadingState = 'idle' | 'loading' | 'succeeded' | 'failed';

/**
 * Action types for each state slice
 */
export type AuthActionType = 
  | { type: 'auth/login'; payload: { provider: AuthProvider } }
  | { type: 'auth/loginSuccess'; payload: { user: AuthState['user'] } }
  | { type: 'auth/loginFailure'; payload: { error: string } }
  | { type: 'auth/logout' };

export type TeamActionType =
  | { type: 'teams/fetch' }
  | { type: 'teams/fetchSuccess'; payload: { teams: Team[] } }
  | { type: 'teams/fetchFailure'; payload: { error: string } }
  | { type: 'teams/select'; payload: { team: Team } }
  | { type: 'teams/sync'; payload: { teamId: string; platform: FantasyPlatform } };

export type PlayerActionType =
  | { type: 'players/fetch' }
  | { type: 'players/fetchSuccess'; payload: { players: Player[] } }
  | { type: 'players/fetchFailure'; payload: { error: string } }
  | { type: 'players/select'; payload: { player: Player } }
  | { type: 'players/analyze'; payload: { playerId: string } };

export type TradeActionType =
  | { type: 'trades/propose'; payload: Trade }
  | { type: 'trades/analyze'; payload: { tradeId: string } }
  | { type: 'trades/getRecommendations'; payload: { teamId: string } }
  | { type: 'trades/updateStatus'; payload: { tradeId: string; status: Trade['status'] } };

export type SimulationActionType =
  | { type: 'simulations/start'; payload: SimulationConfig }
  | { type: 'simulations/progress'; payload: { progress: number } }
  | { type: 'simulations/complete'; payload: Simulation }
  | { type: 'simulations/error'; payload: { error: string } };

/**
 * Union type of all action types
 */
export type ActionType = 
  | AuthActionType 
  | TeamActionType 
  | PlayerActionType 
  | TradeActionType 
  | SimulationActionType;

/**
 * Type for Redux thunk actions supporting async operations
 */
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;

/**
 * Initial state for Redux store
 */
export const INITIAL_STATE: RootState = {
  auth: {
    user: null,
    loading: false,
    error: null,
    isAuthenticated: false,
    lastLogin: null
  },
  teams: {
    items: [],
    loading: false,
    error: null,
    selectedTeam: null,
    syncStatus: {}
  },
  players: {
    items: [],
    loading: false,
    error: null,
    selectedPlayer: null,
    analysisStatus: 'idle'
  },
  trades: {
    history: [],
    currentProposal: null,
    loading: false,
    error: null,
    recommendations: []
  },
  simulations: {
    results: [],
    loading: false,
    progress: 0,
    error: null,
    currentConfig: {
      weeks: 8,
      iterations: 10000,
      includeWeather: true,
      includeInjuries: true,
      confidenceInterval: 0.95
    }
  }
};