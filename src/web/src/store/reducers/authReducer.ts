// @reduxjs/toolkit version ^1.9.0
import { createReducer } from '@reduxjs/toolkit';
import { User, AuthError } from 'firebase/auth';
import { AuthState, UserRole, UserPermissions } from '../../types/auth';
import * as authActions from '../actions/authActions';

/**
 * Initial state for authentication reducer
 * Defines default values for all auth-related state properties
 */
const initialState: AuthState = {
  user: null,
  loading: false,
  error: null,
  role: UserRole.FREE_USER,
  permissions: [],
  mfaRequired: false,
  sessionExpiry: 0
};

/**
 * Role-based permission mappings
 * Defines access levels for different user roles
 */
const rolePermissions: Record<UserRole, UserPermissions> = {
  [UserRole.FREE_USER]: {
    canAccessAI: false,
    canGenerateVideos: false,
    maxSimulations: 10,
    apiRateLimit: 100
  },
  [UserRole.PREMIUM_USER]: {
    canAccessAI: true,
    canGenerateVideos: true,
    maxSimulations: 100,
    apiRateLimit: 1000
  },
  [UserRole.ADMIN]: {
    canAccessAI: true,
    canGenerateVideos: true,
    maxSimulations: -1,
    apiRateLimit: -1
  },
  [UserRole.API_PARTNER]: {
    canAccessAI: true,
    canGenerateVideos: false,
    maxSimulations: 1000,
    apiRateLimit: 10000
  }
};

/**
 * Authentication reducer handling all auth-related state changes
 * Implements comprehensive auth flows including MFA and role-based access
 */
const authReducer = createReducer(initialState, (builder) => {
  builder
    // Handle email login request
    .addCase(authActions.loginWithEmailRequest, (state) => {
      state.loading = true;
      state.error = null;
      state.mfaRequired = false;
    })

    // Handle provider login request (Google, ESPN, Sleeper)
    .addCase(authActions.loginWithProviderRequest, (state) => {
      state.loading = true;
      state.error = null;
      state.mfaRequired = false;
    })

    // Handle successful login
    .addCase(authActions.loginSuccess, (state, action) => {
      state.loading = false;
      state.error = null;
      state.user = action.payload.user;
      state.role = action.payload.role;
      state.permissions = rolePermissions[action.payload.role];
      state.sessionExpiry = Date.now() + action.payload.expiresIn * 1000;
      state.mfaRequired = false;
    })

    // Handle login failure
    .addCase(authActions.loginFailure, (state, action) => {
      state.loading = false;
      state.error = action.payload;
      state.user = null;
      state.role = UserRole.FREE_USER;
      state.permissions = rolePermissions[UserRole.FREE_USER];
    })

    // Handle MFA requirement
    .addCase(authActions.mfaRequired, (state) => {
      state.loading = false;
      state.mfaRequired = true;
      state.error = null;
    })

    // Handle MFA verification
    .addCase(authActions.mfaVerify, (state) => {
      state.loading = true;
      state.error = null;
    })

    // Handle successful MFA verification
    .addCase(authActions.mfaSuccess, (state, action) => {
      state.loading = false;
      state.mfaRequired = false;
      state.error = null;
      state.user = action.payload.user;
      state.role = action.payload.role;
      state.permissions = rolePermissions[action.payload.role];
      state.sessionExpiry = Date.now() + action.payload.expiresIn * 1000;
    })

    // Handle MFA verification failure
    .addCase(authActions.mfaFailure, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    })

    // Handle logout request
    .addCase(authActions.logoutRequest, (state) => {
      state.loading = true;
      state.error = null;
    })

    // Handle successful logout
    .addCase(authActions.logoutSuccess, (state) => {
      state.loading = false;
      state.user = null;
      state.error = null;
      state.role = UserRole.FREE_USER;
      state.permissions = rolePermissions[UserRole.FREE_USER];
      state.mfaRequired = false;
      state.sessionExpiry = 0;
    })

    // Handle logout failure
    .addCase(authActions.logoutFailure, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    })

    // Handle token refresh request
    .addCase(authActions.refreshTokenRequest, (state) => {
      state.loading = true;
      state.error = null;
    })

    // Handle successful token refresh
    .addCase(authActions.refreshTokenSuccess, (state, action) => {
      state.loading = false;
      state.error = null;
      state.sessionExpiry = Date.now() + action.payload.expiresIn * 1000;
    })

    // Handle token refresh failure
    .addCase(authActions.refreshTokenFailure, (state, action) => {
      state.loading = false;
      state.error = action.payload;
      // Force logout on token refresh failure
      state.user = null;
      state.role = UserRole.FREE_USER;
      state.permissions = rolePermissions[UserRole.FREE_USER];
      state.sessionExpiry = 0;
    })

    // Handle user role updates
    .addCase(authActions.updateUserRole, (state, action) => {
      if (state.user && state.user.uid === action.payload.userId) {
        state.role = action.payload.newRole;
        state.permissions = rolePermissions[action.payload.newRole];
      }
    });
});

export default authReducer;