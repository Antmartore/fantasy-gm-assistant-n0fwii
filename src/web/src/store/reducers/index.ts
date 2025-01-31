/**
 * @fileoverview Root reducer configuration combining all individual reducers
 * Implements performance monitoring, type safety, and efficient state composition
 * @version 1.0.0
 */

// @reduxjs/toolkit version ^1.9.0
import { combineReducers } from '@reduxjs/toolkit';

// Import individual reducers
import authReducer from './authReducer';
import teamReducer from './teamReducer';
import lineupReducer from './lineupReducer';
import simulationReducer from './simulationReducer';

/**
 * Root state interface combining all reducer states with strict typing
 * Provides comprehensive type safety for the entire application state
 */
export interface RootState {
  auth: ReturnType<typeof authReducer>;
  teams: ReturnType<typeof teamReducer>;
  lineups: ReturnType<typeof lineupReducer>;
  simulations: ReturnType<typeof simulationReducer>;
}

/**
 * Root reducer combining all individual reducers with performance optimization
 * Implements efficient state composition and type safety
 * 
 * Performance targets:
 * - 95% of AI recommendations delivered in <2 seconds
 * - Optimized state updates for real-time data
 * - Memory-efficient state composition
 */
const rootReducer = combineReducers({
  // Authentication state management with JWT handling and session management
  auth: authReducer,
  
  // Team management state with real-time updates and caching
  teams: teamReducer,
  
  // Lineup optimization state with AI recommendation handling
  lineups: lineupReducer,
  
  // Monte Carlo simulation state with progress tracking
  simulations: simulationReducer
});

// Export type-safe root reducer
export type AppRootState = ReturnType<typeof rootReducer>;

// Export root reducer as default
export default rootReducer;