/**
 * @fileoverview TypeScript type definitions for React Navigation route parameters and screen configurations
 * Provides type safety for navigation structure, route parameters, and screen props across the Fantasy GM Assistant
 * @version 1.0.0
 */

import { NavigatorScreenParams } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { StackScreenProps } from '@react-navigation/stack';
import { Team, SportType, FantasyPlatform } from './team';
import { Player, PlayerPosition } from './player';

/**
 * Root navigation stack parameters
 */
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: NavigatorScreenParams<AppTabParamList>;
};

/**
 * Authentication flow navigation parameters
 */
export type AuthStackParamList = {
  Login: undefined;
  Register: {
    referralCode?: string;
  };
  ForgotPassword: {
    email?: string;
  };
  MFA: {
    userId: string;
    method: 'sms' | 'email';
  };
};

/**
 * Main app bottom tab navigation parameters
 */
export type AppTabParamList = {
  Dashboard: {
    showTutorial?: boolean;
    activeAlert?: string;
  };
  Teams: NavigatorScreenParams<TeamsStackParamList>;
  Analysis: NavigatorScreenParams<AnalysisStackParamList>;
  Profile: {
    section?: 'settings' | 'subscription' | 'help' | 'notifications';
    showUpgrade?: boolean;
  };
};

/**
 * Team management navigation stack parameters
 */
export type TeamsStackParamList = {
  TeamList: {
    sportType?: SportType;
    platform?: FantasyPlatform;
    showArchived?: boolean;
  };
  TeamDetail: {
    teamId: string;
    section?: 'overview' | 'roster' | 'stats' | 'settings';
    highlightPlayerId?: string;
  };
  TeamCreate: {
    platform: FantasyPlatform;
    leagueId?: string;
    importSettings?: boolean;
  };
  LineupEdit: {
    teamId: string;
    weekNumber: number;
    isOptimized?: boolean;
    positions?: PlayerPosition[];
  };
  PlayerDetail: {
    playerId: string;
    teamId: string;
    showTradeOptions?: boolean;
  };
};

/**
 * Analysis tools navigation stack parameters
 */
export type AnalysisStackParamList = {
  AnalysisDashboard: {
    activeTeamId?: string;
    focusMetric?: 'performance' | 'trades' | 'projections';
  };
  TradeAnalysis: {
    teamId: string;
    proposedPlayers?: string[];
    targetPlayers?: string[];
    partnerTeamId?: string;
  };
  SimulationDetail: {
    simulationId: string;
    type: 'season' | 'trade' | 'lineup';
    compareId?: string;
  };
  PlayerSearch: {
    teamId: string;
    position?: PlayerPosition;
    searchQuery?: string;
    excludeRoster?: boolean;
    tradeTarget?: boolean;
  };
  VideoGeneration: {
    analysisId: string;
    type: 'trade' | 'player' | 'team';
    includeVoiceover?: boolean;
  };
};

/**
 * Type helper for root stack screen props
 */
export type RootStackScreenProps<T extends keyof RootStackParamList> = 
  StackScreenProps<RootStackParamList, T>;

/**
 * Type helper for auth stack screen props
 */
export type AuthStackScreenProps<T extends keyof AuthStackParamList> = 
  StackScreenProps<AuthStackParamList, T>;

/**
 * Type helper for bottom tab screen props
 */
export type AppTabScreenProps<T extends keyof AppTabParamList> = 
  BottomTabScreenProps<AppTabParamList, T>;

/**
 * Type helper for teams stack screen props
 */
export type TeamsStackScreenProps<T extends keyof TeamsStackParamList> = 
  StackScreenProps<TeamsStackParamList, T>;

/**
 * Type helper for analysis stack screen props
 */
export type AnalysisStackScreenProps<T extends keyof AnalysisStackParamList> = 
  StackScreenProps<AnalysisStackParamList, T>;

/**
 * Navigation state persistence configuration
 */
export interface NavigationPersistenceConfig {
  persistenceKey: string;
  persistenceVersion: number;
  persistTabs: boolean;
  persistStack: boolean;
  restoreState?: (key: string) => Promise<any>;
  persistState?: (key: string, state: any) => Promise<void>;
}

/**
 * Deep linking configuration type
 */
export type DeepLinkConfig = {
  screens: {
    App: {
      screens: {
        Teams: {
          screens: {
            TeamDetail: {
              path: 'team/:teamId/:section?';
              parse: {
                teamId: String;
                section: String;
              };
            };
          };
        };
        Analysis: {
          screens: {
            TradeAnalysis: {
              path: 'trade/:teamId';
              parse: {
                teamId: String;
              };
            };
            SimulationDetail: {
              path: 'simulation/:simulationId/:type';
              parse: {
                simulationId: String;
                type: String;
              };
            };
          };
        };
      };
    };
  };
};