import React, { useState, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { useNavigation } from '@react-navigation/native';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import { useAuth } from '../../hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { AuthProvider } from '../../types/auth';

// Types
interface LoginFormData {
  email: string;
  password: string;
}

interface ValidationErrors {
  email: string[];
  password: string[];
}

// Styled components with accessibility and theme support
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${({ theme }) => theme.spacing.xl};
  background-color: ${({ theme }) => theme.colors.background};
`;

const Form = styled.form`
  width: 100%;
  max-width: 400px;
  padding: ${({ theme }) => theme.spacing.xl};
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Title = styled.h1`
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  font-weight: ${({ theme }) => theme.typography.fontWeight.bold};
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  margin: ${({ theme }) => theme.spacing.md} 0;
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};

  &::before,
  &::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid ${({ theme }) => theme.colors.text.disabled};
  }

  span {
    margin: 0 ${({ theme }) => theme.spacing.sm};
  }
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.status.error};
  font-size: ${({ theme }) => theme.typography.fontSize.sm};
  padding: ${({ theme }) => theme.spacing.xs};
  margin-top: ${({ theme }) => theme.spacing.xs};
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.status.error}10;
  text-align: center;
  aria-live: polite;
`;

const LoginScreen: React.FC = () => {
  // Hooks
  const navigation = useNavigation();
  const { loginWithEmail, loginWithProvider, loading, error } = useAuth();
  const { trackEvent, trackError } = useAnalytics();
  const errorRef = useRef<HTMLDivElement>(null);

  // State
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({
    email: [],
    password: [],
  });

  // Form validation
  const validateForm = useCallback((): boolean => {
    const errors: ValidationErrors = {
      email: [],
      password: [],
    };

    // Email validation
    if (!formData.email) {
      errors.email.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email.push('Invalid email format');
    }

    // Password validation
    if (!formData.password) {
      errors.password.push('Password is required');
    } else if (formData.password.length < 8) {
      errors.password.push('Password must be at least 8 characters');
    }

    setValidationErrors(errors);
    return !errors.email.length && !errors.password.length;
  }, [formData]);

  // Event handlers
  const handleInputChange = useCallback((name: keyof LoginFormData, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    setValidationErrors(prev => ({ ...prev, [name]: [] }));
  }, []);

  const handleEmailLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (!validateForm()) {
        return;
      }

      trackEvent('USER_LOGIN', { provider: AuthProvider.EMAIL });

      await loginWithEmail({
        email: formData.email,
        password: formData.password,
        provider: AuthProvider.EMAIL,
        providerToken: null,
      });

      navigation.navigate('Dashboard');
    } catch (error) {
      trackError(error as Error, 'Email Login Error');
      errorRef.current?.focus();
    }
  }, [formData, validateForm, loginWithEmail, navigation, trackEvent, trackError]);

  const handleProviderLogin = useCallback(async (provider: AuthProvider) => {
    try {
      trackEvent('USER_LOGIN', { provider });
      await loginWithProvider(provider);
      navigation.navigate('Dashboard');
    } catch (error) {
      trackError(error as Error, `${provider} Login Error`);
      errorRef.current?.focus();
    }
  }, [loginWithProvider, navigation, trackEvent, trackError]);

  return (
    <Container role="main">
      <Form onSubmit={handleEmailLogin} noValidate>
        <Title>Fantasy GM Assistant</Title>

        <Input
          name="email"
          type="email"
          label="Email"
          value={formData.email}
          onChange={e => handleInputChange('email', e.target.value)}
          error={validationErrors.email[0]}
          disabled={loading}
          required
          autoComplete="email"
          aria-label="Email address"
        />

        <Input
          name="password"
          type="password"
          label="Password"
          value={formData.password}
          onChange={e => handleInputChange('password', e.target.value)}
          error={validationErrors.password[0]}
          disabled={loading}
          required
          autoComplete="current-password"
          aria-label="Password"
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={loading}
          disabled={loading}
          aria-label="Sign in with email"
        >
          Sign In
        </Button>

        {error && (
          <ErrorMessage ref={errorRef} role="alert" tabIndex={-1}>
            {error}
          </ErrorMessage>
        )}

        <Divider>
          <span>or continue with</span>
        </Divider>

        <Button
          variant="secondary"
          fullWidth
          onClick={() => handleProviderLogin(AuthProvider.GOOGLE)}
          disabled={loading}
          aria-label="Sign in with Google"
        >
          Continue with Google
        </Button>

        <Button
          variant="secondary"
          fullWidth
          onClick={() => handleProviderLogin(AuthProvider.ESPN)}
          disabled={loading}
          aria-label="Sign in with ESPN"
        >
          Continue with ESPN
        </Button>

        <Button
          variant="secondary"
          fullWidth
          onClick={() => handleProviderLogin(AuthProvider.SLEEPER)}
          disabled={loading}
          aria-label="Sign in with Sleeper"
        >
          Continue with Sleeper
        </Button>
      </Form>
    </Container>
  );
};

export default LoginScreen;