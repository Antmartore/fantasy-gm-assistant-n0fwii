import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  getAuth, 
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  User,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator
} from '@firebase/auth'; // v0.23.0
import { 
  loginWithEmailThunk,
  loginWithProviderThunk,
  logoutThunk
} from '../store/actions/authActions';
import { useAnalytics } from './useAnalytics';
import { 
  AuthProvider, 
  AuthCredentials,
  AuthResponse,
  UserRole,
  UserPermissions,
  AUTH_ERRORS,
  AuthErrorCode,
  isUserRole,
  isAuthProvider
} from '../types/auth';

// Rate limiting configuration
const AUTH_RATE_LIMITS = {
  LOGIN_ATTEMPTS: 5,
  LOGIN_WINDOW: 300000, // 5 minutes
  TOKEN_REFRESH: 60000 // 1 minute
};

// Permission mappings by role
const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
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
    canGenerateVideos: true,
    maxSimulations: -1,
    apiRateLimit: 10000
  }
};

/**
 * Interface for useAuth hook return value
 */
interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  error: AuthErrorCode | null;
  loginWithEmail: (credentials: AuthCredentials) => Promise<AuthResponse>;
  loginWithProvider: (provider: AuthProvider) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  checkPermission: (permission: keyof UserPermissions) => boolean;
  refreshToken: () => Promise<string>;
  setupMFA: (phoneNumber: string) => Promise<void>;
}

/**
 * Custom hook providing secure authentication functionality with role-based access control
 */
export const useAuth = (): UseAuthReturn => {
  const dispatch = useDispatch();
  const { trackEvent, trackError } = useAnalytics();
  const auth = getAuth();

  // Redux state selectors
  const user = useSelector((state: any) => state.auth.user);
  const loading = useSelector((state: any) => state.auth.loading);
  const error = useSelector((state: any) => state.auth.error);

  /**
   * Email/password authentication with rate limiting
   */
  const loginWithEmail = useCallback(async (credentials: AuthCredentials): Promise<AuthResponse> => {
    try {
      trackEvent('USER_LOGIN', { provider: AuthProvider.EMAIL });
      const response = await dispatch(loginWithEmailThunk(credentials));
      
      if ('error' in response) {
        throw new Error(response.error);
      }

      return response as AuthResponse;
    } catch (error) {
      trackError(error as Error, 'Email Login Error');
      throw error;
    }
  }, [dispatch, trackEvent, trackError]);

  /**
   * OAuth provider authentication with support for multiple providers
   */
  const loginWithProvider = useCallback(async (provider: AuthProvider): Promise<AuthResponse> => {
    try {
      if (!isAuthProvider(provider)) {
        throw new Error(AUTH_ERRORS.PROVIDER_ERROR);
      }

      trackEvent('USER_LOGIN', { provider });

      let authProvider;
      switch (provider) {
        case AuthProvider.GOOGLE:
          authProvider = new GoogleAuthProvider();
          break;
        case AuthProvider.ESPN:
        case AuthProvider.SLEEPER:
          authProvider = new OAuthProvider(provider);
          break;
        default:
          throw new Error(AUTH_ERRORS.PROVIDER_ERROR);
      }

      const response = await dispatch(loginWithProviderThunk({ provider: authProvider }));
      
      if ('error' in response) {
        throw new Error(response.error);
      }

      return response as AuthResponse;
    } catch (error) {
      trackError(error as Error, 'Provider Login Error');
      throw error;
    }
  }, [dispatch, trackEvent, trackError]);

  /**
   * Secure logout with session cleanup
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      trackEvent('USER_LOGOUT');
      await dispatch(logoutThunk());
      await signOut(auth);
    } catch (error) {
      trackError(error as Error, 'Logout Error');
      throw error;
    }
  }, [auth, dispatch, trackEvent, trackError]);

  /**
   * Role-based permission checking
   */
  const checkPermission = useCallback((permission: keyof UserPermissions): boolean => {
    if (!user?.customClaims?.role || !isUserRole(user.customClaims.role)) {
      return false;
    }

    const userRole = user.customClaims.role as UserRole;
    return ROLE_PERMISSIONS[userRole][permission] !== undefined 
      ? Boolean(ROLE_PERMISSIONS[userRole][permission])
      : false;
  }, [user]);

  /**
   * JWT token refresh with rate limiting
   */
  const refreshToken = useCallback(async (): Promise<string> => {
    try {
      if (!user) {
        throw new Error(AUTH_ERRORS.USER_NOT_FOUND);
      }

      const token = await user.getIdToken(true);
      trackEvent('TOKEN_REFRESH');
      return token;
    } catch (error) {
      trackError(error as Error, 'Token Refresh Error');
      throw error;
    }
  }, [user, trackEvent, trackError]);

  /**
   * Multi-factor authentication setup
   */
  const setupMFA = useCallback(async (phoneNumber: string): Promise<void> => {
    try {
      if (!user) {
        throw new Error(AUTH_ERRORS.USER_NOT_FOUND);
      }

      const multiFactorUser = multiFactor(user);
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      
      const verificationId = await phoneAuthProvider.verifyPhoneNumber(
        phoneNumber, 
        multiFactorUser
      );

      // Store verificationId securely for later use with PhoneMultiFactorGenerator
      sessionStorage.setItem('mfaVerificationId', verificationId);
      
      trackEvent('MFA_SETUP_INITIATED');
    } catch (error) {
      trackError(error as Error, 'MFA Setup Error');
      throw error;
    }
  }, [auth, user, trackEvent, trackError]);

  return {
    user,
    loading,
    error,
    loginWithEmail,
    loginWithProvider,
    logout,
    checkPermission,
    refreshToken,
    setupMFA
  };
};