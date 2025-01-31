// External imports - redux-saga/effects: ^1.2.0
import { call, put, takeLatest, delay, select, race, take } from 'redux-saga/effects';
import { eventChannel } from 'redux-saga';
import { getAuth, onAuthStateChanged } from 'firebase/auth'; // firebase/auth: ^9.0.0

// Internal imports
import { loginWithEmail, loginWithProvider } from '../../api/auth';
import { setAuthToken, clearAuthToken } from '../../utils/api';
import { AuthState, AuthProvider, UserRole, AUTH_ERRORS } from '../../types/auth';
import { RATE_LIMITS } from '../../config/constants';

// Action Types
export const AUTH_ACTIONS = {
  LOGIN_EMAIL_REQUEST: 'auth/LOGIN_EMAIL_REQUEST',
  LOGIN_PROVIDER_REQUEST: 'auth/LOGIN_PROVIDER_REQUEST',
  LOGIN_SUCCESS: 'auth/LOGIN_SUCCESS',
  LOGIN_FAILURE: 'auth/LOGIN_FAILURE',
  LOGOUT_REQUEST: 'auth/LOGOUT_REQUEST',
  LOGOUT_SUCCESS: 'auth/LOGOUT_SUCCESS',
  TOKEN_REFRESH_REQUEST: 'auth/TOKEN_REFRESH_REQUEST',
  TOKEN_REFRESH_SUCCESS: 'auth/TOKEN_REFRESH_SUCCESS',
  TOKEN_REFRESH_FAILURE: 'auth/TOKEN_REFRESH_FAILURE',
  MFA_REQUIRED: 'auth/MFA_REQUIRED',
  MFA_VERIFY_REQUEST: 'auth/MFA_VERIFY_REQUEST',
} as const;

// Token refresh configuration
const TOKEN_CONFIG = {
  REFRESH_INTERVAL: 3600000, // 1 hour
  REFRESH_THRESHOLD: 300000, // 5 minutes before expiry
  MAX_REFRESH_ATTEMPTS: 3,
};

/**
 * Creates an auth state change channel for Firebase
 */
function createAuthChannel() {
  const auth = getAuth();
  return eventChannel(emit => {
    const unsubscribe = onAuthStateChanged(auth,
      user => emit({ user }),
      error => emit({ error })
    );
    return unsubscribe;
  });
}

/**
 * Handles email/password login with MFA support
 */
function* handleEmailLogin(action: { type: string; payload: { email: string; password: string } }) {
  try {
    yield put({ type: AUTH_ACTIONS.LOGIN_EMAIL_REQUEST });
    
    const { user, token, refreshToken, expiresIn, role } = yield call(
      loginWithEmail,
      action.payload
    );

    if (user.multiFactor.enrolled.length > 0) {
      yield put({ 
        type: AUTH_ACTIONS.MFA_REQUIRED,
        payload: { sessionInfo: user.multiFactor }
      });
      
      // Wait for MFA verification
      const mfaAction = yield take(AUTH_ACTIONS.MFA_VERIFY_REQUEST);
      yield call(verifyMfaCode, mfaAction.payload);
    }

    yield call(setAuthToken, token);
    yield call(scheduleTokenRefresh, expiresIn);

    yield put({
      type: AUTH_ACTIONS.LOGIN_SUCCESS,
      payload: { user, role, lastLogin: new Date() }
    });

  } catch (error: any) {
    yield put({
      type: AUTH_ACTIONS.LOGIN_FAILURE,
      payload: { error: error.message }
    });
  }
}

/**
 * Handles OAuth provider login with provider-specific validation
 */
function* handleProviderLogin(action: { type: string; payload: { provider: AuthProvider } }) {
  try {
    yield put({ type: AUTH_ACTIONS.LOGIN_PROVIDER_REQUEST });

    const { user, token, refreshToken, expiresIn, role } = yield call(
      loginWithProvider,
      action.payload.provider
    );

    yield call(setAuthToken, token);
    yield call(scheduleTokenRefresh, expiresIn);

    yield put({
      type: AUTH_ACTIONS.LOGIN_SUCCESS,
      payload: { user, role, lastLogin: new Date() }
    });

  } catch (error: any) {
    yield put({
      type: AUTH_ACTIONS.LOGIN_FAILURE,
      payload: { error: error.message }
    });
  }
}

/**
 * Handles user logout with cleanup
 */
function* handleLogout() {
  try {
    const auth = getAuth();
    yield call([auth, auth.signOut]);
    yield call(clearAuthToken);

    yield put({ type: AUTH_ACTIONS.LOGOUT_SUCCESS });
  } catch (error: any) {
    console.error('Logout error:', error);
    // Still clear local state even if Firebase logout fails
    yield call(clearAuthToken);
    yield put({ type: AUTH_ACTIONS.LOGOUT_SUCCESS });
  }
}

/**
 * Manages token refresh scheduling
 */
function* scheduleTokenRefresh(expiresIn: number) {
  while (true) {
    const refreshTime = expiresIn - TOKEN_CONFIG.REFRESH_THRESHOLD;
    yield delay(refreshTime);

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error(AUTH_ERRORS.USER_NOT_FOUND);
      }

      const token = yield call([user, user.getIdToken], true);
      yield call(setAuthToken, token);

      yield put({
        type: AUTH_ACTIONS.TOKEN_REFRESH_SUCCESS,
        payload: { token }
      });

    } catch (error: any) {
      yield put({
        type: AUTH_ACTIONS.TOKEN_REFRESH_FAILURE,
        payload: { error: error.message }
      });

      // Force logout on token refresh failure
      yield put({ type: AUTH_ACTIONS.LOGOUT_REQUEST });
      break;
    }
  }
}

/**
 * Verifies MFA code during authentication
 */
function* verifyMfaCode(payload: { code: string; sessionInfo: any }) {
  const { code, sessionInfo } = payload;
  try {
    const credential = yield call(
      [sessionInfo.resolver, sessionInfo.resolver.resolveSignIn],
      code
    );
    
    if (!credential.user) {
      throw new Error(AUTH_ERRORS.MFA_REQUIRED);
    }

    return credential.user;
  } catch (error: any) {
    throw new Error(error.message);
  }
}

/**
 * Watches for authentication state changes
 */
function* watchAuthState() {
  const channel = yield call(createAuthChannel);
  try {
    while (true) {
      const { user, error } = yield take(channel);
      if (error) {
        yield put({
          type: AUTH_ACTIONS.LOGIN_FAILURE,
          payload: { error: error.message }
        });
      } else if (!user) {
        yield put({ type: AUTH_ACTIONS.LOGOUT_SUCCESS });
      }
    }
  } finally {
    channel.close();
  }
}

/**
 * Root authentication saga
 */
export default function* authSaga() {
  yield takeLatest(AUTH_ACTIONS.LOGIN_EMAIL_REQUEST, handleEmailLogin);
  yield takeLatest(AUTH_ACTIONS.LOGIN_PROVIDER_REQUEST, handleProviderLogin);
  yield takeLatest(AUTH_ACTIONS.LOGOUT_REQUEST, handleLogout);
  yield call(watchAuthState);
}