// External imports - versions specified in package.json
import { all, fork, call, spawn } from 'redux-saga/effects'; // redux-saga: ^1.2.1
import { createSagaErrorBoundary, monitorSagaExecution } from '@redux-saga/core'; // ^1.2.1

// Internal imports
import { watchAuth } from './authSaga';
import { watchTeamSagas } from './teamSaga';
import { watchTradeActions } from './tradeSaga';

// Error boundary configuration
const createErrorBoundary = (name: string) => {
  return createSagaErrorBoundary({
    handleError: (error: Error, { sagaStack }) => {
      console.error(`Saga Error in ${name}:`, error);
      console.error('Saga Stack:', sagaStack);
      // Here you would typically send to your error tracking service
    },
    handleRetry: (error: Error, retryCount) => {
      // Implement exponential backoff
      return retryCount < 3 ? Math.min(1000 * Math.pow(2, retryCount), 30000) : null;
    }
  });
};

/**
 * Creates a fault-tolerant saga that restarts on errors
 * @param saga The saga to make resilient
 * @param name Name of the saga for monitoring
 */
function* resilientSaga(saga: () => Generator, name: string) {
  while (true) {
    try {
      const boundSaga = createErrorBoundary(name)(saga);
      yield call(boundSaga);
      break;
    } catch (error) {
      console.error(`Saga ${name} crashed - restarting:`, error);
      // Add delay before restart to prevent rapid cycling
      yield call(delay, 1000);
    }
  }
}

/**
 * Delay utility function
 * @param ms Milliseconds to delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Performance monitoring wrapper for sagas
 * @param saga The saga to monitor
 * @param name Name of the saga for metrics
 */
function* monitoredSaga(saga: () => Generator, name: string) {
  const startTime = performance.now();
  try {
    yield call(saga);
  } finally {
    const duration = performance.now() - startTime;
    console.log(`Saga ${name} execution time:`, duration);
    // Here you would typically send metrics to your monitoring service
  }
}

/**
 * Root saga that combines all feature-specific sagas with error boundaries,
 * monitoring, and cleanup
 */
@monitorSagaExecution('rootSaga')
export function* rootSaga(): Generator {
  try {
    // Spawn all feature sagas with error boundaries and monitoring
    const sagas = [
      {
        saga: watchAuth,
        name: 'Authentication'
      },
      {
        saga: watchTeamSagas,
        name: 'Team Management'
      },
      {
        saga: watchTradeActions,
        name: 'Trade Operations'
      }
    ];

    // Use spawn to ensure saga independence - if one fails, others continue
    const spawnedSagas = sagas.map(({ saga, name }) =>
      spawn(function* () {
        yield call(resilientSaga, 
          function* () {
            yield call(monitoredSaga, saga, name);
          },
          name
        );
      })
    );

    // Combine all sagas
    yield all(spawnedSagas);

  } catch (error) {
    // Root level error handling
    console.error('Root saga error:', error);
    // Here you would typically send to your error tracking service
    throw error; // Re-throw to trigger saga middleware error handling
  } finally {
    // Cleanup logic when root saga is cancelled
    console.log('Root saga cleanup');
    // Here you would typically clean up any resources
  }
}

// Default export
export default rootSaga;