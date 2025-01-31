// @reduxjs/toolkit version ^1.9.0
import { createAction, PayloadAction } from '@reduxjs/toolkit';
import { 
  AuthState, 
  AuthProvider, 
  AuthCredentials,
  AuthResponse,
  UserRole,
  AuthErrorCode,
  AUTH_ERRORS
} from '../../types/auth';

/**
 * Constants for all authentication action types
 */
export const AUTH_ACTION_TYPES = {
  LOGIN_EMAIL_REQUEST: 'auth/loginEmailRequest',
  LOGIN_PROVIDER_REQUEST: 'auth/loginProviderRequest',
  LOGIN_SUCCESS: 'auth/loginSuccess',
  LOGIN_FAILURE: 'auth/loginFailure',
  LOGOUT_REQUEST: 'auth/logoutRequest',
  LOGOUT_SUCCESS: 'auth/logoutSuccess',
  LOGOUT_FAILURE: 'auth/logoutFailure',
  REFRESH_TOKEN_REQUEST: 'auth/refreshTokenRequest',
  REFRESH_TOKEN_SUCCESS: 'auth/refreshTokenSuccess',
  REFRESH_TOKEN_FAILURE: 'auth/refreshTokenFailure',
  MFA_REQUIRED: 'auth/mfaRequired',
  MFA_VERIFY: 'auth/mfaVerify',
  MFA_SUCCESS: 'auth/mfaSuccess',
  MFA_FAILURE: 'auth/mfaFailure',
  UPDATE_USER_ROLE: 'auth/updateUserRole'
} as const;

/**
 * Action creator for email/password login request
 * Supports optional MFA code for two-factor authentication
 */
export const loginWithEmailRequest = createAction<AuthCredentials>(
  AUTH_ACTION_TYPES.LOGIN_EMAIL_REQUEST
);

/**
 * Action creator for OAuth provider login request
 * Supports Google, ESPN, and Sleeper authentication
 */
export const loginWithProviderRequest = createAction<AuthProvider>(
  AUTH_ACTION_TYPES.LOGIN_PROVIDER_REQUEST
);

/**
 * Action creator for successful login
 * Includes complete user profile with role and permissions
 */
export const loginSuccess = createAction<AuthResponse>(
  AUTH_ACTION_TYPES.LOGIN_SUCCESS
);

/**
 * Action creator for login failure
 * Includes typed error codes for proper error handling
 */
export const loginFailure = createAction<AuthErrorCode>(
  AUTH_ACTION_TYPES.LOGIN_FAILURE
);

/**
 * Action creator for logout request
 * Initiates secure session termination
 */
export const logoutRequest = createAction(
  AUTH_ACTION_TYPES.LOGOUT_REQUEST
);

/**
 * Action creator for successful logout
 */
export const logoutSuccess = createAction(
  AUTH_ACTION_TYPES.LOGOUT_SUCCESS
);

/**
 * Action creator for logout failure
 */
export const logoutFailure = createAction<AuthErrorCode>(
  AUTH_ACTION_TYPES.LOGOUT_FAILURE
);

/**
 * Action creator for token refresh request
 * Maintains session continuity
 */
export const refreshTokenRequest = createAction(
  AUTH_ACTION_TYPES.REFRESH_TOKEN_REQUEST
);

/**
 * Action creator for successful token refresh
 */
export const refreshTokenSuccess = createAction<{
  token: string;
  refreshToken: string;
  expiresIn: number;
}>(AUTH_ACTION_TYPES.REFRESH_TOKEN_SUCCESS);

/**
 * Action creator for token refresh failure
 */
export const refreshTokenFailure = createAction<AuthErrorCode>(
  AUTH_ACTION_TYPES.REFRESH_TOKEN_FAILURE
);

/**
 * Action creator when MFA is required
 * Triggers 2FA flow
 */
export const mfaRequired = createAction(
  AUTH_ACTION_TYPES.MFA_REQUIRED
);

/**
 * Action creator for MFA code verification
 */
export const mfaVerify = createAction<{
  mfaCode: string;
  sessionInfo: string;
}>(AUTH_ACTION_TYPES.MFA_VERIFY);

/**
 * Action creator for successful MFA verification
 */
export const mfaSuccess = createAction<AuthResponse>(
  AUTH_ACTION_TYPES.MFA_SUCCESS
);

/**
 * Action creator for MFA verification failure
 */
export const mfaFailure = createAction<AuthErrorCode>(
  AUTH_ACTION_TYPES.MFA_FAILURE
);

/**
 * Action creator for updating user role
 * Handles role changes (e.g., upgrade to premium)
 */
export const updateUserRole = createAction<{
  userId: string;
  newRole: UserRole;
}>(AUTH_ACTION_TYPES.UPDATE_USER_ROLE);

/**
 * Type containing all possible auth action types
 */
export type AuthActionTypes = typeof AUTH_ACTION_TYPES[keyof typeof AUTH_ACTION_TYPES];

/**
 * Type for all possible auth actions
 */
export type AuthActions = 
  | ReturnType<typeof loginWithEmailRequest>
  | ReturnType<typeof loginWithProviderRequest>
  | ReturnType<typeof loginSuccess>
  | ReturnType<typeof loginFailure>
  | ReturnType<typeof logoutRequest>
  | ReturnType<typeof logoutSuccess>
  | ReturnType<typeof logoutFailure>
  | ReturnType<typeof refreshTokenRequest>
  | ReturnType<typeof refreshTokenSuccess>
  | ReturnType<typeof refreshTokenFailure>
  | ReturnType<typeof mfaRequired>
  | ReturnType<typeof mfaVerify>
  | ReturnType<typeof mfaSuccess>
  | ReturnType<typeof mfaFailure>
  | ReturnType<typeof updateUserRole>;