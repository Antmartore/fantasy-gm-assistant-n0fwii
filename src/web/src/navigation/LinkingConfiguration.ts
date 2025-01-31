/**
 * @fileoverview Deep linking and URL mapping configuration for React Navigation
 * Implements secure URL patterns and platform-specific deep linking for the Fantasy GM Assistant
 * @version 1.0.0
 */

import { LinkingOptions } from '@react-navigation/native'; // ^6.0.0
import { RootStackParamList } from './types';

/**
 * Deep linking configuration for React Navigation
 * Handles both universal links (https) and custom scheme (fantasygm://)
 */
export const linking: LinkingOptions<RootStackParamList> = {
  // Supported URL prefixes for deep linking
  prefixes: [
    'fantasygm://',           // Custom URL scheme
    'https://fantasygm.com',  // Production domain
    'https://beta.fantasygm.com', // Beta/staging domain
    'https://app.fantasygm.com'   // App subdomain
  ],

  // URL configuration and parameter mapping
  config: {
    // Initial URL handling
    initialRouteName: 'Auth',
    
    // Screen configurations
    screens: {
      // Authentication flow screens
      Auth: {
        screens: {
          Login: 'login',
          Register: 'register',
          ForgotPassword: 'forgot-password'
        }
      },

      // Main application screens
      App: {
        screens: {
          // Dashboard tab
          Dashboard: {
            path: 'dashboard',
            // Enable web-specific SEO patterns
            exact: true
          },

          // Teams management tab
          Teams: {
            screens: {
              TeamList: {
                path: 'teams',
                exact: true
              },
              TeamDetail: {
                path: 'teams/:teamId',
                // Parameter validation for teamId
                parse: {
                  teamId: (id: string) => id
                }
              },
              TeamCreate: 'teams/create',
              LineupEdit: {
                path: 'teams/:teamId/lineup/:weekNumber',
                // Parameter validation for lineup editing
                parse: {
                  teamId: (id: string) => id,
                  weekNumber: (week: string) => parseInt(week, 10)
                }
              },
              TradeCenter: {
                path: 'teams/:teamId/trades',
                parse: {
                  teamId: (id: string) => id
                }
              }
            }
          },

          // Analysis tools tab
          Analysis: {
            screens: {
              AnalysisDashboard: 'analysis',
              TradeAnalysis: {
                path: 'analysis/trade/:teamId',
                parse: {
                  teamId: (id: string) => id,
                  playersOffered: (ids: string) => ids.split(','),
                  playersRequested: (ids: string) => ids.split(',')
                }
              },
              SimulationDetail: {
                path: 'analysis/simulation/:simulationId',
                parse: {
                  simulationId: (id: string) => id,
                  teamId: (id: string) => id
                }
              },
              PlayerSearch: {
                path: 'analysis/players/:teamId',
                parse: {
                  teamId: (id: string) => id,
                  forTrade: (value: string) => value === 'true',
                  excludePlayers: (ids: string) => ids.split(',')
                }
              },
              VideoGeneration: {
                path: 'analysis/video/:analysisId',
                parse: {
                  analysisId: (id: string) => id,
                  type: (type: string) => type as 'trade' | 'simulation' | 'player'
                }
              }
            }
          },

          // User profile tab
          Profile: {
            path: 'profile',
            exact: true
          }
        }
      }
    }
  },

  // Configuration for handling malformed deep links
  getStateFromPath: (path, options) => {
    try {
      return options.getStateFromPath(path, options);
    } catch (error) {
      // Fallback to auth screen for invalid URLs
      return {
        routes: [
          {
            name: 'Auth',
            state: {
              routes: [{ name: 'Login' }]
            }
          }
        ]
      };
    }
  },

  // Custom path generation for sharing and deep linking
  getPathFromState: (state, config) => {
    try {
      return config.getPathFromState(state, config);
    } catch (error) {
      // Fallback to root path for invalid states
      return '/';
    }
  }
};

export default linking;