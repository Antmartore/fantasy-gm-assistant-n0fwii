// External imports - versions from package.json
import { expectSaga, testSaga } from 'redux-saga-test-plan'; // ^4.0.0
import { call, put, take } from 'redux-saga/effects';
import { throwError } from 'redux-saga-test-plan/providers';
import * as matchers from 'redux-saga-test-plan/matchers';
import { describe, it, expect, jest } from '@jest/globals'; // ^29.0.0

// Internal imports
import { watchAuth } from '../../../src/store/sagas/authSaga';
import { authApi } from '../../../src/api/auth';
import { setAuthToken, clearAuthToken } from '../../../src/utils/api';
import * as authActions from '../../../src/store/actions/authActions';
import { AuthProvider, UserRole, AUTH_ERRORS } from '../../../src/types/auth';

// Test constants
const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  multiFactor: {
    enrolled: []
  }
};

const mockCredentials = {
  email: 'test@example.com',
  password: 'password123',
  provider: AuthProvider.EMAIL,
  providerToken: null
};

const mockTokens = {
  token: 'mock-jwt-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 3600
};

const mockAuthResponse = {
  user: mockUser,
  ...mockTokens,
  role: UserRole.FREE_USER
};

const mockMfaPayload = {
  sessionInfo: 'mock-session-info',
  mfaCode: '123456'
};

describe('Auth Saga Tests', () => {
  describe('Email Login Flow', () => {
    it('should handle successful email login', () => {
      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.loginWithEmail), mockAuthResponse],
          [matchers.call.fn(setAuthToken), undefined]
        ])
        .put(authActions.loginSuccess(mockAuthResponse))
        .dispatch(authActions.loginWithEmailRequest(mockCredentials))
        .silentRun();
    });

    it('should handle MFA challenge during email login', () => {
      const mfaUser = {
        ...mockUser,
        multiFactor: { enrolled: ['phone'] }
      };

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.loginWithEmail), { ...mockAuthResponse, user: mfaUser }],
          [matchers.call.fn(setAuthToken), undefined]
        ])
        .put(authActions.mfaRequired())
        .dispatch(authActions.loginWithEmailRequest(mockCredentials))
        .dispatch(authActions.mfaVerify(mockMfaPayload))
        .put(authActions.mfaSuccess(mockAuthResponse))
        .silentRun();
    });

    it('should handle login failure with invalid credentials', () => {
      const error = new Error(AUTH_ERRORS.WRONG_PASSWORD);

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.loginWithEmail), throwError(error)]
        ])
        .put(authActions.loginFailure(AUTH_ERRORS.WRONG_PASSWORD))
        .dispatch(authActions.loginWithEmailRequest(mockCredentials))
        .silentRun();
    });
  });

  describe('Provider Login Flow', () => {
    it('should handle successful Google login', () => {
      const googleResponse = {
        ...mockAuthResponse,
        user: { ...mockUser, providerData: [{ providerId: AuthProvider.GOOGLE }] }
      };

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.loginWithProvider), googleResponse],
          [matchers.call.fn(setAuthToken), undefined]
        ])
        .put(authActions.loginSuccess(googleResponse))
        .dispatch(authActions.loginWithProviderRequest(AuthProvider.GOOGLE))
        .silentRun();
    });

    it('should handle ESPN provider login', () => {
      const espnResponse = {
        ...mockAuthResponse,
        user: { ...mockUser, providerData: [{ providerId: AuthProvider.ESPN }] }
      };

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.loginWithProvider), espnResponse],
          [matchers.call.fn(setAuthToken), undefined]
        ])
        .put(authActions.loginSuccess(espnResponse))
        .dispatch(authActions.loginWithProviderRequest(AuthProvider.ESPN))
        .silentRun();
    });

    it('should handle provider login failure', () => {
      const error = new Error(AUTH_ERRORS.PROVIDER_ERROR);

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.loginWithProvider), throwError(error)]
        ])
        .put(authActions.loginFailure(AUTH_ERRORS.PROVIDER_ERROR))
        .dispatch(authActions.loginWithProviderRequest(AuthProvider.GOOGLE))
        .silentRun();
    });
  });

  describe('Token Management', () => {
    it('should handle successful token refresh', () => {
      const newTokens = {
        token: 'new-jwt-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600
      };

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.refreshToken), newTokens],
          [matchers.call.fn(setAuthToken), undefined]
        ])
        .put(authActions.refreshTokenSuccess(newTokens))
        .dispatch(authActions.refreshTokenRequest())
        .silentRun();
    });

    it('should handle token refresh failure', () => {
      const error = new Error(AUTH_ERRORS.TOKEN_EXPIRED);

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.refreshToken), throwError(error)]
        ])
        .put(authActions.refreshTokenFailure(AUTH_ERRORS.TOKEN_EXPIRED))
        .put(authActions.logoutRequest())
        .dispatch(authActions.refreshTokenRequest())
        .silentRun();
    });
  });

  describe('Logout Flow', () => {
    it('should handle successful logout', () => {
      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.logout), undefined],
          [matchers.call.fn(clearAuthToken), undefined]
        ])
        .put(authActions.logoutSuccess())
        .dispatch(authActions.logoutRequest())
        .silentRun();
    });

    it('should clear tokens even if logout fails', () => {
      const error = new Error('Network error');

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.logout), throwError(error)],
          [matchers.call.fn(clearAuthToken), undefined]
        ])
        .call(clearAuthToken)
        .put(authActions.logoutSuccess())
        .dispatch(authActions.logoutRequest())
        .silentRun();
    });
  });

  describe('Role Management', () => {
    it('should validate user role during login', () => {
      const invalidRoleResponse = {
        ...mockAuthResponse,
        role: 'INVALID_ROLE'
      };

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.loginWithEmail), invalidRoleResponse]
        ])
        .put(authActions.loginFailure(AUTH_ERRORS.INVALID_PROVIDER_TOKEN))
        .dispatch(authActions.loginWithEmailRequest(mockCredentials))
        .silentRun();
    });

    it('should handle role update', () => {
      const roleUpdate = {
        userId: mockUser.id,
        newRole: UserRole.PREMIUM_USER
      };

      return expectSaga(watchAuth)
        .put(authActions.updateUserRole(roleUpdate))
        .dispatch(authActions.updateUserRole(roleUpdate))
        .silentRun();
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', () => {
      const error = new Error(AUTH_ERRORS.NETWORK_ERROR);

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.loginWithEmail), throwError(error)]
        ])
        .put(authActions.loginFailure(AUTH_ERRORS.NETWORK_ERROR))
        .dispatch(authActions.loginWithEmailRequest(mockCredentials))
        .silentRun();
    });

    it('should handle rate limiting', () => {
      const error = new Error('Too many requests');

      return expectSaga(watchAuth)
        .provide([
          [matchers.call.fn(authApi.loginWithEmail), throwError(error)]
        ])
        .put(authActions.loginFailure(AUTH_ERRORS.NETWORK_ERROR))
        .dispatch(authActions.loginWithEmailRequest(mockCredentials))
        .silentRun();
    });
  });
});