// External imports - versions specified as per requirements
import { call, put, takeLatest, all, fork, delay, race, cancel } from 'redux-saga/effects'; // redux-saga: ^1.2.1
import { AxiosError } from 'axios'; // axios: ^1.4.0

// Internal imports
import {
  fetchTeams,
  fetchTeamById,
  createNewTeam,
  updateTeamDetails,
  deleteTeamById,
  syncTeamWithPlatform
} from '../actions/teamActions';
import { Team, TeamSettings, FantasyPlatform, SportType } from '../../types/team';
import { ApiResponse, ApiError } from '../../api/types';
import { apiService } from '../../utils/api';
import storageManager from '../../utils/storage';
import { CACHE_DURATION, RATE_LIMITS } from '../../config/constants';

// Constants for saga configuration
const SAGA_DEBOUNCE_MS = 500;
const SAGA_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const CACHE_TTL_MS = 300000; // 5 minutes

/**
 * Handles fetching teams with caching and error recovery
 */
function* handleFetchTeams(action: ReturnType<typeof fetchTeams.pending>) {
  try {
    const cacheKey = `teams_${JSON.stringify(action.payload)}`;
    const cachedData = yield call([storageManager, 'getItem'], cacheKey);

    if (cachedData) {
      yield put(fetchTeams.fulfilled(cachedData, action.meta.requestId, action.payload));
      return;
    }

    const { response, timeout } = yield race({
      response: call(apiService.request, {
        method: 'GET',
        url: '/teams',
        params: action.payload
      }),
      timeout: delay(SAGA_TIMEOUT_MS)
    });

    if (timeout) {
      throw new Error('Request timeout');
    }

    yield call([storageManager, 'setItem'], cacheKey, response.data, {
      ttl: CACHE_TTL_MS,
      compressed: true
    });

    yield put(fetchTeams.fulfilled(response.data, action.meta.requestId, action.payload));
  } catch (error) {
    const apiError = error as ApiError;
    yield put(fetchTeams.rejected(null, action.meta.requestId, action.payload, apiError));
  }
}

/**
 * Handles team creation with platform validation
 */
function* handleCreateTeam(action: ReturnType<typeof createNewTeam.pending>) {
  try {
    const { name, platform, sport, settings } = action.payload;
    const response: ApiResponse<Team> = yield call(apiService.request, {
      method: 'POST',
      url: '/teams',
      data: { name, platform, sport, settings }
    });

    yield call([storageManager, 'invalidateCache'], /^teams_/);
    yield put(createNewTeam.fulfilled(response.data, action.meta.requestId, action.payload));
  } catch (error) {
    yield put(createNewTeam.rejected(null, action.meta.requestId, action.payload, error as ApiError));
  }
}

/**
 * Handles team updates with optimistic updates and rollback
 */
function* handleUpdateTeam(action: ReturnType<typeof updateTeamDetails.pending>) {
  const { teamId, updates } = action.payload;
  const optimisticUpdate = { id: teamId, ...updates };

  try {
    // Perform optimistic update
    yield put({ type: 'teams/optimisticUpdate', payload: optimisticUpdate });

    const response: ApiResponse<Team> = yield call(apiService.request, {
      method: 'PUT',
      url: `/teams/${teamId}`,
      data: updates
    });

    yield call([storageManager, 'removeItem'], `team_${teamId}`);
    yield call([storageManager, 'invalidateCache'], /^teams_/);
    yield put(updateTeamDetails.fulfilled(response.data, action.meta.requestId, action.payload));
  } catch (error) {
    // Rollback optimistic update
    yield put({ type: 'teams/revertOptimisticUpdate', payload: teamId });
    yield put(updateTeamDetails.rejected(null, action.meta.requestId, action.payload, error as ApiError));
  }
}

/**
 * Handles team deletion with cache cleanup
 */
function* handleDeleteTeam(action: ReturnType<typeof deleteTeamById.pending>) {
  try {
    yield call(apiService.request, {
      method: 'DELETE',
      url: `/teams/${action.payload}`
    });

    yield call([storageManager, 'removeItem'], `team_${action.payload}`);
    yield call([storageManager, 'invalidateCache'], /^teams_/);
    yield put(deleteTeamById.fulfilled(undefined, action.meta.requestId, action.payload));
  } catch (error) {
    yield put(deleteTeamById.rejected(null, action.meta.requestId, action.payload, error as ApiError));
  }
}

/**
 * Handles platform synchronization with retry logic
 */
function* handleSyncTeam(action: ReturnType<typeof syncTeamWithPlatform.pending>) {
  const { teamId, forceFetch } = action.payload;
  let retryCount = 0;

  while (retryCount < MAX_RETRY_ATTEMPTS) {
    try {
      const response: ApiResponse<Team> = yield call(apiService.request, {
        method: 'POST',
        url: `/teams/${teamId}/sync`,
        data: { forceFetch, validateRoster: true }
      });

      yield call([storageManager, 'setItem'], `team_${teamId}`, response.data, {
        ttl: CACHE_DURATION.TEAM_DATA,
        encrypted: true
      });
      yield call([storageManager, 'invalidateCache'], /^teams_/);
      yield put(syncTeamWithPlatform.fulfilled(response.data, action.meta.requestId, action.payload));
      return;
    } catch (error) {
      retryCount++;
      if (retryCount === MAX_RETRY_ATTEMPTS) {
        yield put(syncTeamWithPlatform.rejected(null, action.meta.requestId, action.payload, error as ApiError));
        return;
      }
      yield delay(Math.pow(2, retryCount) * 1000); // Exponential backoff
    }
  }
}

/**
 * Root saga that combines all team-related sagas
 */
export function* watchTeamSagas() {
  yield all([
    takeLatest(fetchTeams.pending.type, handleFetchTeams),
    takeLatest(createNewTeam.pending.type, handleCreateTeam),
    takeLatest(updateTeamDetails.pending.type, handleUpdateTeam),
    takeLatest(deleteTeamById.pending.type, handleDeleteTeam),
    takeLatest(syncTeamWithPlatform.pending.type, handleSyncTeam)
  ]);
}