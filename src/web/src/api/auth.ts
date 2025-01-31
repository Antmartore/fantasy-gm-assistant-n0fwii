// External imports
import { 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  getIdToken,
  User,
  Auth,
  getAuth
} from 'firebase/auth'; // firebase/auth: ^9.0.0
import { ESPNAuthProvider } from '@fantasy-gm/espn-auth'; // @fantasy-gm/espn-auth: ^1.0.0
import { SleeperAuthProvider } from '@fantasy-gm/sleeper-auth'; // @fantasy-gm/sleeper-auth: ^1.0.0

// Internal imports
import { request, setAuthToken, clearAuthToken } from '../utils/api';
import { AuthState, AuthProvider, UserRole } from '../types/auth';
import { ApiResponse } from '../api/types';

// Constants for enhanced security
const AUTH_ERRORS = {
  INVALID_EMAIL: 'auth/invalid-email',
  USER_NOT_FOUND: 'auth/user-not-found',
  WRONG_PASSWORD: 'auth/wrong-password',
  EMAIL_IN_USE: 'auth/email-already-in-use',
  WEAK_PASSWORD: 'auth/weak-password',
  POPUP_CLOSED: 'auth/popup-closed-by-user',
  PROVIDER_ERROR: 'auth/provider-error',
  ESPN_AUTH_FAILED: 'auth/espn-authentication-failed',
  SLEEPER_AUTH_FAILED: 'auth/sleeper-authentication-failed',
  RATE_LIMIT_EXCEEDED: 'auth/rate-limit-exceeded',
  TOKEN_EXPIRED: 'auth/token-expired',
  INVALID_ROLE: 'auth/invalid-role-claim'
};

const TOKEN_CONFIG = {
  ROTATION_INTERVAL: 3600, // 1 hour
  REFRESH_THRESHOLD: 300, // 5 minutes before expiry
  MAX_REFRESH_ATTEMPTS: 3
};

// Types
interface AuthCredentials {
  email: string;
  password: string;
}

interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresIn: number;
  role: UserRole;
}

// Provider configuration
const providerConfig = {
  [AuthProvider.GOOGLE]: new GoogleAuthProvider(),
  [AuthProvider.ESPN]: new ESPNAuthProvider(),
  [AuthProvider.SLEEPER]: new SleeperAuthProvider()
};

/**
 * Authenticates user with email and password
 * @param credentials User credentials
 * @returns Authentication response with tokens and role
 */
export async function loginWithEmail(
  credentials: AuthCredentials
): Promise<AuthResponse> {
  try {
    const auth = getAuth();
    const { user } = await signInWithEmailAndPassword(
      auth,
      credentials.email,
      credentials.password
    );

    const token = await user.getIdToken();
    const { claims } = await user.getIdTokenResult();

    if (!claims.role || !Object.values(UserRole).includes(claims.role)) {
      throw new Error(AUTH_ERRORS.INVALID_ROLE);
    }

    await setAuthToken(token);

    return {
      user,
      token,
      refreshToken: user.refreshToken,
      expiresIn: claims.exp * 1000,
      role: claims.role as UserRole
    };
  } catch (error: any) {
    clearAuthToken();
    throw enhanceAuthError(error);
  }
}

/**
 * Authenticates user with OAuth provider
 * @param provider OAuth provider (Google, ESPN, Sleeper)
 * @returns Authentication response with provider-specific data
 */
export async function loginWithProvider(
  provider: AuthProvider
): Promise<AuthResponse> {
  try {
    const auth = getAuth();
    const providerInstance = providerConfig[provider];

    if (!providerInstance) {
      throw new Error(AUTH_ERRORS.PROVIDER_ERROR);
    }

    // Add provider-specific scopes and configuration
    if (provider === AuthProvider.GOOGLE) {
      providerInstance.addScope('email');
      providerInstance.addScope('profile');
    }

    const { user } = await signInWithPopup(auth, providerInstance);
    const token = await user.getIdToken();
    const { claims } = await user.getIdTokenResult();

    // Validate role claim
    if (!claims.role || !Object.values(UserRole).includes(claims.role)) {
      throw new Error(AUTH_ERRORS.INVALID_ROLE);
    }

    await setAuthToken(token);

    return {
      user,
      token,
      refreshToken: user.refreshToken,
      expiresIn: claims.exp * 1000,
      role: claims.role as UserRole
    };
  } catch (error: any) {
    clearAuthToken();
    throw enhanceAuthError(error);
  }
}

/**
 * Refreshes authentication token with enhanced security
 * @returns New authentication token with updated claims
 */
export async function refreshToken(): Promise<string> {
  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      throw new Error(AUTH_ERRORS.USER_NOT_FOUND);
    }

    const { claims, token } = await user.getIdTokenResult(true);
    
    // Validate token expiration
    const expirationTime = claims.exp * 1000;
    if (Date.now() >= expirationTime) {
      throw new Error(AUTH_ERRORS.TOKEN_EXPIRED);
    }

    // Validate role claim
    if (!claims.role || !Object.values(UserRole).includes(claims.role)) {
      throw new Error(AUTH_ERRORS.INVALID_ROLE);
    }

    await setAuthToken(token);
    return token;
  } catch (error: any) {
    clearAuthToken();
    throw enhanceAuthError(error);
  }
}

/**
 * Enhances authentication errors with additional context
 * @param error Original error object
 * @returns Enhanced error with additional context
 */
function enhanceAuthError(error: any): Error {
  const errorCode = error.code || error.message;
  const errorMessage = Object.entries(AUTH_ERRORS).find(
    ([_, code]) => code === errorCode
  )?.[0] || 'Unknown authentication error';

  return new Error(errorMessage);
}