// Jest version ^29.0.0
import { describe, it, expect } from '@jest/globals';
import { User } from 'firebase/auth';
import authReducer from '../../../src/store/reducers/authReducer';
import { AuthState, UserRole, AuthProvider, AUTH_ERRORS } from '../../../src/types/auth';
import * as authActions from '../../../src/store/actions/authActions';

describe('authReducer', () => {
  // Initial state for tests
  const initialState: AuthState = {
    user: null,
    loading: false,
    error: null,
    role: UserRole.FREE_USER,
    permissions: {
      canAccessAI: false,
      canGenerateVideos: false,
      maxSimulations: 10,
      apiRateLimit: 100
    },
    mfaRequired: false,
    sessionExpiry: 0
  };

  // Mock user data
  const mockFreeUser = {
    uid: 'free-user-uid',
    email: 'free@example.com',
    displayName: 'Free User'
  } as User;

  const mockPremiumUser = {
    uid: 'premium-user-uid',
    email: 'premium@example.com',
    displayName: 'Premium User'
  } as User;

  const mockAdminUser = {
    uid: 'admin-user-uid',
    email: 'admin@example.com',
    displayName: 'Admin User'
  } as User;

  it('should return initial state', () => {
    expect(authReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  describe('Email Login Flow', () => {
    it('should handle login request', () => {
      const credentials = {
        email: 'test@example.com',
        password: 'password123',
        provider: AuthProvider.EMAIL,
        providerToken: null
      };

      const nextState = authReducer(
        initialState,
        authActions.loginWithEmailRequest(credentials)
      );

      expect(nextState.loading).toBe(true);
      expect(nextState.error).toBeNull();
      expect(nextState.mfaRequired).toBe(false);
    });

    it('should handle login success', () => {
      const loginResponse = {
        user: mockPremiumUser,
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        role: UserRole.PREMIUM_USER
      };

      const nextState = authReducer(
        { ...initialState, loading: true },
        authActions.loginSuccess(loginResponse)
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.user).toEqual(mockPremiumUser);
      expect(nextState.role).toBe(UserRole.PREMIUM_USER);
      expect(nextState.permissions.canAccessAI).toBe(true);
      expect(nextState.sessionExpiry).toBeGreaterThan(Date.now());
    });

    it('should handle login failure', () => {
      const nextState = authReducer(
        { ...initialState, loading: true },
        authActions.loginFailure(AUTH_ERRORS.INVALID_EMAIL)
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.error).toBe(AUTH_ERRORS.INVALID_EMAIL);
      expect(nextState.user).toBeNull();
      expect(nextState.role).toBe(UserRole.FREE_USER);
    });
  });

  describe('Provider Login Flow', () => {
    it('should handle Google login request', () => {
      const nextState = authReducer(
        initialState,
        authActions.loginWithProviderRequest(AuthProvider.GOOGLE)
      );

      expect(nextState.loading).toBe(true);
      expect(nextState.error).toBeNull();
    });

    it('should handle ESPN login request', () => {
      const nextState = authReducer(
        initialState,
        authActions.loginWithProviderRequest(AuthProvider.ESPN)
      );

      expect(nextState.loading).toBe(true);
      expect(nextState.error).toBeNull();
    });

    it('should handle provider login failure', () => {
      const nextState = authReducer(
        { ...initialState, loading: true },
        authActions.loginFailure(AUTH_ERRORS.PROVIDER_ERROR)
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.error).toBe(AUTH_ERRORS.PROVIDER_ERROR);
      expect(nextState.user).toBeNull();
    });
  });

  describe('MFA Flow', () => {
    it('should handle MFA requirement', () => {
      const nextState = authReducer(
        { ...initialState, loading: true },
        authActions.mfaRequired()
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.mfaRequired).toBe(true);
      expect(nextState.error).toBeNull();
    });

    it('should handle MFA verification', () => {
      const mfaData = {
        mfaCode: '123456',
        sessionInfo: 'session-token'
      };

      const nextState = authReducer(
        { ...initialState, mfaRequired: true },
        authActions.mfaVerify(mfaData)
      );

      expect(nextState.loading).toBe(true);
      expect(nextState.error).toBeNull();
    });

    it('should handle MFA success', () => {
      const mfaResponse = {
        user: mockPremiumUser,
        token: 'jwt-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        role: UserRole.PREMIUM_USER
      };

      const nextState = authReducer(
        { ...initialState, loading: true, mfaRequired: true },
        authActions.mfaSuccess(mfaResponse)
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.mfaRequired).toBe(false);
      expect(nextState.user).toEqual(mockPremiumUser);
      expect(nextState.role).toBe(UserRole.PREMIUM_USER);
    });

    it('should handle MFA failure', () => {
      const nextState = authReducer(
        { ...initialState, loading: true, mfaRequired: true },
        authActions.mfaFailure(AUTH_ERRORS.INVALID_EMAIL)
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.error).toBe(AUTH_ERRORS.INVALID_EMAIL);
      expect(nextState.mfaRequired).toBe(true);
    });
  });

  describe('Token Refresh Flow', () => {
    it('should handle refresh token request', () => {
      const nextState = authReducer(
        initialState,
        authActions.refreshTokenRequest()
      );

      expect(nextState.loading).toBe(true);
      expect(nextState.error).toBeNull();
    });

    it('should handle refresh token success', () => {
      const refreshData = {
        token: 'new-jwt-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600
      };

      const nextState = authReducer(
        { ...initialState, loading: true },
        authActions.refreshTokenSuccess(refreshData)
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.error).toBeNull();
      expect(nextState.sessionExpiry).toBeGreaterThan(Date.now());
    });

    it('should handle refresh token failure', () => {
      const nextState = authReducer(
        { ...initialState, loading: true },
        authActions.refreshTokenFailure(AUTH_ERRORS.TOKEN_EXPIRED)
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.error).toBe(AUTH_ERRORS.TOKEN_EXPIRED);
      expect(nextState.user).toBeNull();
      expect(nextState.role).toBe(UserRole.FREE_USER);
    });
  });

  describe('Role Management', () => {
    it('should handle user role update', () => {
      const initialStateWithUser = {
        ...initialState,
        user: mockFreeUser,
        role: UserRole.FREE_USER
      };

      const nextState = authReducer(
        initialStateWithUser,
        authActions.updateUserRole({
          userId: mockFreeUser.uid,
          newRole: UserRole.PREMIUM_USER
        })
      );

      expect(nextState.role).toBe(UserRole.PREMIUM_USER);
      expect(nextState.permissions.canAccessAI).toBe(true);
      expect(nextState.permissions.canGenerateVideos).toBe(true);
    });

    it('should ignore role update for different user', () => {
      const initialStateWithUser = {
        ...initialState,
        user: mockFreeUser,
        role: UserRole.FREE_USER
      };

      const nextState = authReducer(
        initialStateWithUser,
        authActions.updateUserRole({
          userId: 'different-user-id',
          newRole: UserRole.PREMIUM_USER
        })
      );

      expect(nextState.role).toBe(UserRole.FREE_USER);
      expect(nextState.permissions.canAccessAI).toBe(false);
    });
  });

  describe('Logout Flow', () => {
    it('should handle logout request', () => {
      const nextState = authReducer(
        initialState,
        authActions.logoutRequest()
      );

      expect(nextState.loading).toBe(true);
      expect(nextState.error).toBeNull();
    });

    it('should handle logout success', () => {
      const stateWithUser = {
        ...initialState,
        user: mockPremiumUser,
        role: UserRole.PREMIUM_USER,
        permissions: {
          canAccessAI: true,
          canGenerateVideos: true,
          maxSimulations: 100,
          apiRateLimit: 1000
        }
      };

      const nextState = authReducer(
        stateWithUser,
        authActions.logoutSuccess()
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.user).toBeNull();
      expect(nextState.role).toBe(UserRole.FREE_USER);
      expect(nextState.permissions.canAccessAI).toBe(false);
      expect(nextState.sessionExpiry).toBe(0);
    });

    it('should handle logout failure', () => {
      const nextState = authReducer(
        { ...initialState, loading: true },
        authActions.logoutFailure(AUTH_ERRORS.NETWORK_ERROR)
      );

      expect(nextState.loading).toBe(false);
      expect(nextState.error).toBe(AUTH_ERRORS.NETWORK_ERROR);
    });
  });
});