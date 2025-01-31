/**
 * @fileoverview TypeScript type definitions for React Navigation route parameters and screen configurations
 * Defines the navigation structure and type safety for the Fantasy GM Assistant mobile application
 * @version 1.0.0
 */

// External imports - React Navigation type definitions
import { NavigatorScreenParams } from '@react-navigation/native'; // ^6.0.0
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs'; // ^6.0.0
import { StackScreenProps } from '@react-navigation/stack'; // ^6.0.0

// Internal imports - Data structure types
import { Team } from '../types/team';
import { Player } from '../types/player';

/**
 * Root navigation stack parameter list
 * Defines the main navigation structure for authenticated and unauthenticated flows
 */
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppTabParamList>;
};

/**
 * Authentication flow navigation parameters
 * Defines screens for user authentication process
 */
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

/**
 * Main application bottom tab navigation parameters
 * Defines the primary navigation tabs for authenticated users
 */
export type AppTabParamList = {
  Dashboard: undefined;
  Teams: NavigatorScreenParams<TeamsStackParamList>;
  Analysis: NavigatorScreenParams<AnalysisStackParamList>;
  Profile: undefined;
};

/**
 * Team management navigation parameters
 * Defines screens for team-related operations
 */
export type TeamsStackParamList = {
  TeamList: undefined;
  TeamDetail: {
    teamId: Team['id'];
  };
  TeamCreate: undefined;
  LineupEdit: {
    teamId: Team['id'];
    weekNumber: number;
  };
  TradeCenter: {
    teamId: Team['id'];
  };
};

/**
 * Analysis tools navigation parameters
 * Defines screens for advanced analysis features
 */
export type AnalysisStackParamList = {
  AnalysisDashboard: undefined;
  TradeAnalysis: {
    teamId: Team['id'];
    playersOffered?: Player['id'][];
    playersRequested?: Player['id'][];
  };
  SimulationDetail: {
    simulationId: string;
    teamId: Team['id'];
  };
  PlayerSearch: {
    teamId: Team['id'];
    forTrade?: boolean;
    excludePlayers?: Player['id'][];
  };
  VideoGeneration: {
    analysisId: string;
    type: 'trade' | 'simulation' | 'player';
  };
};

/**
 * Type helper for root stack screen props
 * Provides type safety for screen navigation props
 */
export type RootStackScreenProps<T extends keyof RootStackParamList> = 
  StackScreenProps<RootStackParamList, T>;

/**
 * Type helper for bottom tab screen props
 * Provides type safety for tab navigation props
 */
export type AppTabScreenProps<T extends keyof AppTabParamList> = 
  BottomTabScreenProps<AppTabParamList, T>;

/**
 * Type helper for teams stack screen props
 * Provides type safety for teams navigation props
 */
export type TeamsStackScreenProps<T extends keyof TeamsStackParamList> = 
  StackScreenProps<TeamsStackParamList, T>;

/**
 * Type helper for analysis stack screen props
 * Provides type safety for analysis navigation props
 */
export type AnalysisStackScreenProps<T extends keyof AnalysisStackParamList> = 
  StackScreenProps<AnalysisStackParamList, T>;

/**
 * Navigation state type for persisting navigation state
 */
export interface NavigationState {
  index: number;
  routes: Array<{
    name: string;
    state?: NavigationState;
    params?: Record<string, unknown>;
  }>;
}