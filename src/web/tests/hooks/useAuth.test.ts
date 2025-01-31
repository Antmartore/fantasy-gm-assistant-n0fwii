import { renderHook, act } from '@testing-library/react-hooks'; // v8.0.0
import { Provider } from 'react-redux'; // v8.0.0
import { configureStore } from '@reduxjs/toolkit'; // v1.9.0
import { mockFirebase } from '@firebase/testing'; // v0.20.0
import { useAuth } from '../../src/hooks/useAuth';
import { AuthProvider, UserRole, AUTH_ERRORS } from '../../src/types/auth';
import { analyticsTracker } from '../../src/utils/analytics';

// Mock Firebase Auth
jest.mock('@firebase/auth', () => ({
  getAuth: jest.fn(),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  OAuthProvider: jest.fn(),
  signOut: jest.fn(),
  multiFactor: jest.fn(),
  PhoneAuthProvider: jest.fn(),
  PhoneMultiFactorGenerator: jest.fn()
}));

// Mock Redux store
const createMockStore = (role = UserRole.FREE_USER) => configureStore({
  reducer: {
    auth: (state = {
      user: null,
      loading: false,
      error: null,
      isAuthenticated: false,
      lastLogin: null
    }, action) => state
  }
});

// Mock analytics tracking
jest.mock('../../src/utils/analytics', () => ({
  trackEvent: jest.fn(),
  trackError: jest.fn(),
  trackPerformance: jest.fn()
}));

describe('useAuth Hook', () => {
  let mockStore: any;
  let mockFirebaseAuth: any;

  beforeEach(() => {
    mockStore = createMockStore();
    mockFirebaseAuth = mockFirebase.auth();
    jest.clearAllMocks();
  });

  const renderAuthHook = (role = UserRole.FREE_USER) => {
    mockStore = createMockStore(role);
    return renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={mockStore}>{children}</Provider>
      )
    });
  };

  describe('Initial State', () => {
    it('should initialize with correct default values', () => {
      const { result } = renderAuthHook();
      
      expect(result.current.user).toBeNull();
      expect(result.current.loading).toBeFalsy();
      expect(result.current.error).toBeNull();
    });
  });

  describe('Email Authentication', () => {
    const mockCredentials = {
      email: 'test@example.com',
      password: 'Test123!',
      provider: AuthProvider.EMAIL,
      providerToken: null
    };

    it('should handle successful email login', async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.loginWithEmail(mockCredentials);
      });

      expect(analyticsTracker.trackEvent).toHaveBeenCalledWith('USER_LOGIN', {
        provider: AuthProvider.EMAIL
      });
    });

    it('should handle failed email login with invalid credentials', async () => {
      const { result } = renderAuthHook();
      
      await act(async () => {
        try {
          await result.current.loginWithEmail({
            ...mockCredentials,
            password: 'wrong'
          });
        } catch (error) {
          expect(error.code).toBe(AUTH_ERRORS.WRONG_PASSWORD);
        }
      });

      expect(analyticsTracker.trackError).toHaveBeenCalled();
    });

    it('should handle rate limiting for login attempts', async () => {
      const { result } = renderAuthHook();
      
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          try {
            await result.current.loginWithEmail(mockCredentials);
          } catch (error) {
            if (i === 5) {
              expect(error.code).toBe('auth/too-many-requests');
            }
          }
        });
      }
    });
  });

  describe('OAuth Provider Authentication', () => {
    it('should handle successful Google login', async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.loginWithProvider(AuthProvider.GOOGLE);
      });

      expect(analyticsTracker.trackEvent).toHaveBeenCalledWith('USER_LOGIN', {
        provider: AuthProvider.GOOGLE
      });
    });

    it('should handle successful ESPN login', async () => {
      const { result } = renderAuthHook();

      await act(async () => {
        await result.current.loginWithProvider(AuthProvider.ESPN);
      });

      expect(analyticsTracker.trackEvent).toHaveBeenCalledWith('USER_LOGIN', {
        provider: AuthProvider.ESPN
      });
    });

    it('should handle popup closed by user', async () => {
      const { result } = renderAuthHook();
      
      await act(async () => {
        try {
          await result.current.loginWithProvider(AuthProvider.GOOGLE);
        } catch (error) {
          expect(error.code).toBe(AUTH_ERRORS.POPUP_CLOSED);
        }
      });
    });
  });

  describe('Multi-Factor Authentication', () => {
    const mockPhoneNumber = '+1234567890';

    it('should initiate MFA setup successfully', async () => {
      const { result } = renderAuthHook();
      
      await act(async () => {
        await result.current.setupMFA(mockPhoneNumber);
      });

      expect(analyticsTracker.trackEvent).toHaveBeenCalledWith('MFA_SETUP_INITIATED');
    });

    it('should handle MFA verification', async () => {
      const { result } = renderAuthHook();
      const mockVerificationId = 'mock-verification-id';
      const mockVerificationCode = '123456';

      sessionStorage.setItem('mfaVerificationId', mockVerificationId);

      await act(async () => {
        await result.current.verifyMFA(mockVerificationCode);
      });

      expect(sessionStorage.getItem('mfaVerificationId')).toBeNull();
    });
  });

  describe('Token Management', () => {
    it('should refresh token successfully', async () => {
      const { result } = renderAuthHook();
      const mockUser = { getIdToken: jest.fn().mockResolvedValue('new-token') };
      
      mockStore.dispatch({ type: 'auth/loginSuccess', payload: { user: mockUser } });

      await act(async () => {
        const token = await result.current.refreshToken();
        expect(token).toBe('new-token');
      });

      expect(analyticsTracker.trackEvent).toHaveBeenCalledWith('TOKEN_REFRESH');
    });

    it('should handle token refresh failure', async () => {
      const { result } = renderAuthHook();
      
      await act(async () => {
        try {
          await result.current.refreshToken();
        } catch (error) {
          expect(error.code).toBe(AUTH_ERRORS.USER_NOT_FOUND);
        }
      });
    });
  });

  describe('Role-Based Access Control', () => {
    it('should restrict AI access for free users', () => {
      const { result } = renderAuthHook(UserRole.FREE_USER);
      expect(result.current.checkPermission('canAccessAI')).toBeFalsy();
    });

    it('should allow AI access for premium users', () => {
      const { result } = renderAuthHook(UserRole.PREMIUM_USER);
      expect(result.current.checkPermission('canAccessAI')).toBeTruthy();
    });

    it('should grant full access to admin users', () => {
      const { result } = renderAuthHook(UserRole.ADMIN);
      expect(result.current.checkPermission('canAccessAI')).toBeTruthy();
      expect(result.current.checkPermission('canGenerateVideos')).toBeTruthy();
    });

    it('should enforce API rate limits for partners', () => {
      const { result } = renderAuthHook(UserRole.API_PARTNER);
      expect(result.current.checkPermission('apiRateLimit')).toBe(10000);
    });
  });

  describe('Logout Functionality', () => {
    it('should handle successful logout', async () => {
      const { result } = renderAuthHook();
      
      await act(async () => {
        await result.current.logout();
      });

      expect(analyticsTracker.trackEvent).toHaveBeenCalledWith('USER_LOGOUT');
      expect(mockFirebaseAuth.signOut).toHaveBeenCalled();
    });

    it('should clear session data on logout', async () => {
      const { result } = renderAuthHook();
      
      sessionStorage.setItem('mfaVerificationId', 'test-id');
      
      await act(async () => {
        await result.current.logout();
      });

      expect(sessionStorage.getItem('mfaVerificationId')).toBeNull();
    });
  });

  describe('Security Features', () => {
    it('should detect suspicious login patterns', async () => {
      const { result } = renderAuthHook();
      const suspiciousCredentials = {
        ...mockCredentials,
        email: 'suspicious@example.com'
      };

      for (let i = 0; i < 3; i++) {
        await act(async () => {
          try {
            await result.current.loginWithEmail(suspiciousCredentials);
          } catch {}
        });
      }

      expect(analyticsTracker.trackEvent).toHaveBeenCalledWith('SUSPICIOUS_ACTIVITY_DETECTED');
    });

    it('should enforce secure session timeouts', async () => {
      const { result } = renderAuthHook();
      jest.useFakeTimers();

      await act(async () => {
        await result.current.loginWithEmail(mockCredentials);
      });

      jest.advanceTimersByTime(30 * 60 * 1000); // 30 minutes
      expect(result.current.refreshToken).toHaveBeenCalled();
    });
  });
});