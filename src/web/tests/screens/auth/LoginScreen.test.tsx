import React from 'react';
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { jest } from '@jest/globals';
import LoginScreen from '../../../../src/screens/auth/LoginScreen';
import { useAuth } from '../../../../src/hooks/useAuth';
import { useAnalytics } from '../../../../src/hooks/useAnalytics';
import { AuthProvider } from '../../../../src/types/auth';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock hooks
jest.mock('../../../../src/hooks/useAuth');
jest.mock('../../../../src/hooks/useAnalytics');
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

// Test data
const validCredentials = {
  email: 'test@example.com',
  password: 'Password123!',
  mfaCode: '123456',
};

const invalidCredentials = {
  email: 'invalid-email',
  password: 'short',
  mfaCode: '12345',
};

describe('LoginScreen', () => {
  // Mock implementations
  const mockLoginWithEmail = jest.fn();
  const mockLoginWithProvider = jest.fn();
  const mockHandleMFA = jest.fn();
  const mockTrackEvent = jest.fn();
  const mockNavigate = jest.fn();

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock useAuth hook
    (useAuth as jest.Mock).mockReturnValue({
      loginWithEmail: mockLoginWithEmail,
      loginWithProvider: mockLoginWithProvider,
      handleMFA: mockHandleMFA,
      loading: false,
      error: null,
    });

    // Mock useAnalytics hook
    (useAnalytics as jest.Mock).mockReturnValue({
      trackEvent: mockTrackEvent,
      trackError: jest.fn(),
    });

    // Set mobile viewport
    window.innerWidth = 375;
    window.innerHeight = 812;
  });

  it('should render without crashing', () => {
    render(<LoginScreen />);
    expect(screen.getByText('Fantasy GM Assistant')).toBeInTheDocument();
  });

  it('should pass accessibility checks', async () => {
    const { container } = render(<LoginScreen />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  describe('Form Validation', () => {
    it('should show validation errors for empty fields', async () => {
      render(<LoginScreen />);
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument();
        expect(screen.getByText('Password is required')).toBeInTheDocument();
      });
    });

    it('should validate email format', async () => {
      render(<LoginScreen />);
      
      const emailInput = screen.getByRole('textbox', { name: /email/i });
      fireEvent.change(emailInput, { target: { value: invalidCredentials.email } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid email format')).toBeInTheDocument();
      });
    });

    it('should validate password length', async () => {
      render(<LoginScreen />);
      
      const passwordInput = screen.getByLabelText(/password/i);
      fireEvent.change(passwordInput, { target: { value: invalidCredentials.password } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
      });
    });
  });

  describe('Authentication Flow', () => {
    it('should handle email login successfully', async () => {
      render(<LoginScreen />);
      
      const emailInput = screen.getByRole('textbox', { name: /email/i });
      const passwordInput = screen.getByLabelText(/password/i);
      
      fireEvent.change(emailInput, { target: { value: validCredentials.email } });
      fireEvent.change(passwordInput, { target: { value: validCredentials.password } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockLoginWithEmail).toHaveBeenCalledWith({
          email: validCredentials.email,
          password: validCredentials.password,
          provider: AuthProvider.EMAIL,
          providerToken: null,
        });
        expect(mockTrackEvent).toHaveBeenCalledWith('USER_LOGIN', { provider: AuthProvider.EMAIL });
      });
    });

    it('should handle provider login for each supported provider', async () => {
      render(<LoginScreen />);
      
      const providers = ['Google', 'ESPN', 'Sleeper'];
      
      for (const provider of providers) {
        const providerButton = screen.getByRole('button', { name: new RegExp(provider, 'i') });
        fireEvent.click(providerButton);
        
        await waitFor(() => {
          expect(mockLoginWithProvider).toHaveBeenCalledWith(
            AuthProvider[provider.toUpperCase()]
          );
          expect(mockTrackEvent).toHaveBeenCalledWith('USER_LOGIN', {
            provider: AuthProvider[provider.toUpperCase()],
          });
        });
      }
    });

    it('should handle MFA flow when required', async () => {
      mockLoginWithEmail.mockRejectedValueOnce({ code: 'auth/mfa-required' });
      
      render(<LoginScreen />);
      
      const emailInput = screen.getByRole('textbox', { name: /email/i });
      const passwordInput = screen.getByLabelText(/password/i);
      
      fireEvent.change(emailInput, { target: { value: validCredentials.email } });
      fireEvent.change(passwordInput, { target: { value: validCredentials.password } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockHandleMFA).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display authentication errors', async () => {
      const errorMessage = 'Invalid credentials';
      (useAuth as jest.Mock).mockReturnValue({
        ...useAuth(),
        error: errorMessage,
      });

      render(<LoginScreen />);
      
      expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
    });

    it('should handle network errors', async () => {
      mockLoginWithEmail.mockRejectedValueOnce(new Error('Network error'));
      
      render(<LoginScreen />);
      
      const emailInput = screen.getByRole('textbox', { name: /email/i });
      const passwordInput = screen.getByLabelText(/password/i);
      
      fireEvent.change(emailInput, { target: { value: validCredentials.email } });
      fireEvent.change(passwordInput, { target: { value: validCredentials.password } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('should disable form during authentication', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        ...useAuth(),
        loading: true,
      });

      render(<LoginScreen />);
      
      const inputs = screen.getAllByRole('textbox');
      const buttons = screen.getAllByRole('button');
      
      inputs.forEach(input => {
        expect(input).toBeDisabled();
      });
      
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Analytics Tracking', () => {
    it('should track successful login events', async () => {
      render(<LoginScreen />);
      
      const emailInput = screen.getByRole('textbox', { name: /email/i });
      const passwordInput = screen.getByLabelText(/password/i);
      
      fireEvent.change(emailInput, { target: { value: validCredentials.email } });
      fireEvent.change(passwordInput, { target: { value: validCredentials.password } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith('USER_LOGIN', {
          provider: AuthProvider.EMAIL,
        });
      });
    });

    it('should track login errors', async () => {
      mockLoginWithEmail.mockRejectedValueOnce(new Error('Login failed'));
      
      render(<LoginScreen />);
      
      const emailInput = screen.getByRole('textbox', { name: /email/i });
      const passwordInput = screen.getByLabelText(/password/i);
      
      fireEvent.change(emailInput, { target: { value: validCredentials.email } });
      fireEvent.change(passwordInput, { target: { value: validCredentials.password } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith('USER_LOGIN', {
          provider: AuthProvider.EMAIL,
        });
      });
    });
  });
});