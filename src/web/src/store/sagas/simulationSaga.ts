/**
 * @fileoverview Redux saga for managing simulation operations in the Fantasy GM Assistant
 * Implements Monte Carlo simulations with enhanced error handling and performance monitoring
 * @version 1.0.0
 */

import { 
  call, 
  put, 
  takeLatest, 
  delay, 
  race, 
  take, 
  select 
} from 'redux-saga/effects';
import { datadogRum } from '@datadog/browser-rum'; // v4.0.0

import { SimulationActionType } from '../actions/simulationActions';
import { Simulation, SimulationStatus } from '../../types/simulation';
import { SimulationAPI } from '../../api/simulations';
import { POLLING_INTERVAL, MAX_RETRIES, CACHE_TTL, ERROR_CODES } from '../../config/constants';

// Performance monitoring decorator
const monitorPerformance = (actionType: string) => (saga: any) => {
  return function* (...args: any[]) {
    const startTime = Date.now();
    try {
      yield* saga(...args);
      datadogRum.addAction('simulation.success', {
        actionType,
        duration: Date.now() - startTime
      });
    } catch (error) {
      datadogRum.addError('simulation.error', {
        actionType,
        error,
        duration: Date.now() - startTime
      });
      throw error;
    }
  };
};

/**
 * Handles starting a new simulation with enhanced error handling
 */
function* handleStartSimulation(action: ReturnType<typeof SimulationActionType.START_SIMULATION>) {
  const monitoringSpan = datadogRum.startSpan('simulation.start');
  
  try {
    // Create simulation with retry logic
    const simulation: Simulation = yield call(
      SimulationAPI.createSimulation,
      action.payload
    );

    yield put({ 
      type: SimulationActionType.FETCH_SIMULATION, 
      payload: simulation.id 
    });

    // Start polling for updates
    yield call(pollSimulationStatus, simulation.id);

  } catch (error) {
    yield put({
      type: SimulationActionType.STOP_SIMULATION,
      payload: {
        error: ERROR_CODES.SIMULATION_FAILED,
        message: error instanceof Error ? error.message : 'Simulation failed'
      }
    });
  } finally {
    monitoringSpan?.end();
  }
}

/**
 * Enhanced polling mechanism for simulation status with circuit breaker pattern
 */
function* pollSimulationStatus(simulationId: string) {
  let retryCount = 0;
  let currentInterval = POLLING_INTERVAL;

  while (retryCount < MAX_RETRIES) {
    try {
      // Race between polling timeout and simulation completion
      const { simulation, timeout } = yield race({
        simulation: call(SimulationAPI.getSimulation, simulationId),
        timeout: delay(currentInterval)
      });

      if (timeout) {
        // Implement exponential backoff
        currentInterval = Math.min(currentInterval * 2, 10000);
        retryCount++;
        continue;
      }

      if (simulation.status === SimulationStatus.COMPLETED) {
        yield put({
          type: SimulationActionType.FETCH_SIMULATION,
          payload: simulation
        });
        break;
      }

      if (simulation.status === SimulationStatus.FAILED) {
        throw new Error('Simulation processing failed');
      }

      // Update progress
      yield put({
        type: 'simulation/progress',
        payload: {
          id: simulationId,
          progress: simulation.progress
        }
      });

      // Reset retry count on successful poll
      retryCount = 0;
      currentInterval = POLLING_INTERVAL;

    } catch (error) {
      retryCount++;
      currentInterval = Math.min(currentInterval * 2, 10000);

      if (retryCount >= MAX_RETRIES) {
        yield put({
          type: SimulationActionType.STOP_SIMULATION,
          payload: {
            error: ERROR_CODES.API_ERROR,
            message: 'Failed to fetch simulation status'
          }
        });
        break;
      }
    }

    yield delay(currentInterval);
  }
}

/**
 * Handles cancelling an active simulation
 */
function* handleCancelSimulation(action: ReturnType<typeof SimulationActionType.STOP_SIMULATION>) {
  const monitoringSpan = datadogRum.startSpan('simulation.cancel');
  
  try {
    yield call(SimulationAPI.cancelSimulation, action.payload);
    yield put({
      type: 'simulation/cancelled',
      payload: action.payload
    });
  } catch (error) {
    yield put({
      type: 'simulation/error',
      payload: {
        error: ERROR_CODES.API_ERROR,
        message: 'Failed to cancel simulation'
      }
    });
  } finally {
    monitoringSpan?.end();
  }
}

/**
 * Root saga combining all simulation-related sagas
 */
export default function* simulationSaga() {
  yield takeLatest(
    SimulationActionType.START_SIMULATION,
    monitorPerformance('start_simulation')(handleStartSimulation)
  );
  yield takeLatest(
    SimulationActionType.STOP_SIMULATION,
    monitorPerformance('cancel_simulation')(handleCancelSimulation)
  );
}