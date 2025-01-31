/**
 * @fileoverview Custom React hook for managing Monte Carlo simulations and predictive analytics
 * Provides comprehensive simulation management with performance optimization and caching
 * @version 1.0.0
 */

// External imports
import { useState, useEffect, useCallback, useMemo } from 'react'; // ^18.0.0
import { useDispatch, useSelector } from 'react-redux'; // ^8.0.0
import { datadogRum } from '@datadog/browser-rum'; // ^4.0.0
import { LRUCache } from 'lru-cache'; // ^7.0.0
import { retry } from 'retry-ts'; // ^0.1.0

// Internal imports
import { 
  createSimulation, 
  getSimulation, 
  getSimulations, 
  cancelSimulation 
} from '../../api/simulations';
import { simulationActions } from '../../store/actions/simulationActions';
import { 
  Simulation, 
  SimulationType, 
  SimulationStatus, 
  SimulationParameters, 
  SimulationResults, 
  SimulationError 
} from '../../types/simulation';

// Constants
const POLLING_INTERVAL = 2000; // 2 seconds
const MAX_RETRIES = 3;
const CACHE_TTL = 3600000; // 1 hour
const CACHE_MAX_SIZE = 100;
const PERFORMANCE_THRESHOLD = 2000; // 2 seconds per technical spec

// Default simulation parameters
const DEFAULT_SIMULATION_PARAMS: Partial<SimulationParameters> = {
  weeksToSimulate: 8,
  iterations: 1000,
  includeInjuries: true,
  includeWeather: true,
  includeMatchups: true,
  includeTradeImpact: false
};

// Initialize LRU cache for simulation results
const simulationCache = new LRUCache<string, SimulationResults>({
  max: CACHE_MAX_SIZE,
  ttl: CACHE_TTL
});

export function useSimulation(teamId: string) {
  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<SimulationError | null>(null);
  const [progress, setProgress] = useState(0);
  const [activeSimulation, setActiveSimulation] = useState<Simulation | null>(null);

  // Redux
  const dispatch = useDispatch();
  const simulationHistory = useSelector(state => state.simulations.results);

  // Performance monitoring
  const monitorPerformance = useCallback((action: string, duration: number) => {
    datadogRum.addAction('simulation.performance', {
      action,
      duration,
      success: duration <= PERFORMANCE_THRESHOLD
    });
  }, []);

  // Cache management
  const getCacheKey = useCallback((params: SimulationParameters): string => {
    return `${teamId}-${JSON.stringify(params)}`;
  }, [teamId]);

  // Run simulation with enhanced error handling and performance tracking
  const runSimulation = useCallback(async (parameters: SimulationParameters) => {
    const startTime = Date.now();
    setIsLoading(true);
    setError(null);
    setProgress(0);

    try {
      // Check cache first
      const cacheKey = getCacheKey(parameters);
      const cachedResults = simulationCache.get(cacheKey);
      
      if (cachedResults) {
        setActiveSimulation({
          id: `cached-${cacheKey}`,
          teamId,
          type: SimulationType.SEASON,
          parameters,
          status: SimulationStatus.COMPLETED,
          results: cachedResults,
          createdAt: new Date(),
          completedAt: new Date()
        });
        monitorPerformance('cache.hit', Date.now() - startTime);
        return;
      }

      // Create new simulation with retry logic
      const simulation = await retry(
        async () => {
          const response = await createSimulation(parameters, teamId);
          return response.data;
        },
        {
          retries: MAX_RETRIES,
          delay: 1000,
          timeout: PERFORMANCE_THRESHOLD
        }
      );

      setActiveSimulation(simulation);
      dispatch(simulationActions.startSimulation(parameters));

      // Start polling for progress
      const pollInterval = setInterval(async () => {
        const status = await getSimulation(simulation.id);
        setProgress(status.data.results?.progress || 0);

        if (status.data.status === SimulationStatus.COMPLETED) {
          clearInterval(pollInterval);
          simulationCache.set(cacheKey, status.data.results);
          setActiveSimulation(status.data);
          dispatch(simulationActions.simulationCreated(status.data));
        }
      }, POLLING_INTERVAL);

      monitorPerformance('simulation.complete', Date.now() - startTime);

    } catch (err) {
      const simulationError: SimulationError = {
        code: 'SIMULATION_ERROR',
        message: err instanceof Error ? err.message : 'Unknown error occurred',
        timestamp: new Date()
      };
      setError(simulationError);
      dispatch(simulationActions.simulationError(simulationError.message));
      monitorPerformance('simulation.error', Date.now() - startTime);
    } finally {
      setIsLoading(false);
    }
  }, [teamId, dispatch, getCacheKey, monitorPerformance]);

  // Cancel active simulation
  const cancelActiveSimulation = useCallback(async () => {
    if (activeSimulation?.id) {
      try {
        await cancelSimulation(activeSimulation.id);
        setActiveSimulation(null);
        setProgress(0);
      } catch (err) {
        setError({
          code: 'CANCEL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to cancel simulation',
          timestamp: new Date()
        });
      }
    }
  }, [activeSimulation]);

  // Clear cache for specific parameters or all
  const clearCache = useCallback((parameters?: SimulationParameters) => {
    if (parameters) {
      simulationCache.delete(getCacheKey(parameters));
    } else {
      simulationCache.clear();
    }
  }, [getCacheKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activeSimulation?.id) {
        cancelActiveSimulation();
      }
    };
  }, [activeSimulation, cancelActiveSimulation]);

  // Memoized return value
  return useMemo(() => ({
    runSimulation,
    cancelSimulation: cancelActiveSimulation,
    isLoading,
    error,
    progress,
    activeSimulation,
    simulationHistory,
    clearCache,
    defaultParams: DEFAULT_SIMULATION_PARAMS
  }), [
    runSimulation,
    cancelActiveSimulation,
    isLoading,
    error,
    progress,
    activeSimulation,
    simulationHistory,
    clearCache
  ]);
}