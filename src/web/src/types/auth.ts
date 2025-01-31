// Firebase Auth version ^9.0.0
import { User } from 'firebase/auth';

/**
 * Comprehensive authentication state interface for Redux store
 * Tracks user status, loading states, and errors
 */
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  lastLogin: Date | null;
}

/**
 * Enum defining all supported authentication providers
 */
export enum AuthProvider {
  EMAIL = 'email',
  GOOGLE = 'google',
  ESPN = 'espn',
  SLEEPER = 'sleeper'
}

/**
 * Interface for authentication credentials supporting multiple providers
 */
export interface AuthCredentials {
  email: string;
  password: string;
  provider: AuthProvider;
  providerToken: string | null;
}

/**
 * Comprehensive interface for authentication response data
 * Includes tokens, user data, and role information
 */
export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresIn: number;
  role: UserRole;
}

/**
 * Enum defining user role types and access levels
 */
export enum UserRole {
  FREE_USER = 'free_user',
  PREMIUM_USER = 'premium_user',
  ADMIN = 'admin',
  API_PARTNER = 'api_partner'
}

/**
 * Interface defining granular user permissions based on role
 */
export interface UserPermissions {
  canAccessAI: boolean;
  canGenerateVideos: boolean;
  maxSimulations: number;
  apiRateLimit: number;
}

/**
 * Constant defining all possible authentication error codes
 */
export const AUTH_ERRORS = {
  INVALID_EMAIL: 'auth/invalid-email',
  USER_NOT_FOUND: 'auth/user-not-found',
  WRONG_PASSWORD: 'auth/wrong-password',
  EMAIL_IN_USE: 'auth/email-already-in-use',
  WEAK_PASSWORD: 'auth/weak-password',
  POPUP_CLOSED: 'auth/popup-closed-by-user',
  PROVIDER_ERROR: 'auth/provider-error',
  INVALID_PROVIDER_TOKEN: 'auth/invalid-provider-token',
  MFA_REQUIRED: 'auth/mfa-required',
  TOKEN_EXPIRED: 'auth/token-expired',
  NETWORK_ERROR: 'auth/network-error'
} as const;

/**
 * Type for auth error codes
 */
export type AuthErrorCode = typeof AUTH_ERRORS[keyof typeof AUTH_ERRORS];

/**
 * Type guard to check if a value is a valid UserRole
 */
export function isUserRole(role: string): role is UserRole {
  return Object.values(UserRole).includes(role as UserRole);
}

/**
 * Type guard to check if a value is a valid AuthProvider
 */
export function isAuthProvider(provider: string): provider is AuthProvider {
  return Object.values(AuthProvider).includes(provider as AuthProvider);
}