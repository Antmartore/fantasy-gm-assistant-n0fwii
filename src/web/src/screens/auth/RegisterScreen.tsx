import React, { useState, useCallback, useRef } from 'react';
import styled from 'styled-components'; // v5.3.0
import { useNavigation } from '@react-navigation/native'; // v6.0.0
import ReCAPTCHA from 'react-google-recaptcha'; // v2.1.0
import { rateLimit } from '@rate-limiter/core'; // v1.0.0

import { Button } from '../../components/base/Button';
import { Input } from '../../components/base/Input';
import { useAuth } from '../../hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { AuthProvider } from '../../types/auth';
import { theme } from '../../config/theme';

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  WINDOW: 300000, // 5 minutes
  COOLDOWN: 900000 // 15 minutes
};

// Form validation constants
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Styled components with accessibility support
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: ${theme.spacing.lg};
  background-color: ${theme.colors.background};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const Form = styled.form`
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  background-color: ${theme.colors.surface};
  padding: ${theme.spacing.xl};
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  &:focus-within {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  text-align: center;
  margin: ${theme.spacing.md} 0;
  color: ${theme.colors.text.secondary};
  font-size: ${theme.typography.fontSize.sm};

  &::before,
  &::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid ${theme.colors.text.disabled};
  }

  &::before {
    margin-right: ${theme.spacing.sm};
  }

  &::after {
    margin-left: ${theme.spacing.sm};
  }
`;

// Types
interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
}

interface ValidationError {
  field: keyof RegisterFormData;
  message: string;
}

// Component
export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation();
  const { register, loginWithProvider } = useAuth();
  const { trackEvent, trackError } = useAnalytics();
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  // State management
  const [formData, setFormData] = useState<RegisterFormData>({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  // Form validation
  const validateForm = useCallback((): ValidationError[] => {
    const newErrors: ValidationError[] = [];

    if (!EMAIL_REGEX.test(formData.email)) {
      newErrors.push({
        field: 'email',
        message: 'Please enter a valid email address'
      });
    }

    if (!PASSWORD_REGEX.test(formData.password)) {
      newErrors.push({
        field: 'password',
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character'
      });
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.push({
        field: 'confirmPassword',
        message: 'Passwords do not match'
      });
    }

    return newErrors;
  }, [formData]);

  // Handle form input changes
  const handleInputChange = useCallback((name: keyof RegisterFormData, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => prev.filter(error => error.field !== name));
  }, []);

  // Handle CAPTCHA completion
  const handleCaptchaChange = useCallback((token: string | null) => {
    setCaptchaToken(token);
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Check rate limiting
      if (rateLimited) {
        throw new Error('Too many attempts. Please try again later.');
      }

      // Validate form
      const validationErrors = validateForm();
      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        return;
      }

      // Verify CAPTCHA
      if (!captchaToken) {
        throw new Error('Please complete the CAPTCHA verification');
      }

      setLoading(true);

      // Attempt registration
      await register({
        email: formData.email,
        password: formData.password,
        provider: AuthProvider.EMAIL,
        providerToken: null
      });

      trackEvent('USER_REGISTER', {
        provider: AuthProvider.EMAIL,
        success: true
      });

      // Navigate to dashboard on success
      navigation.navigate('Dashboard');

    } catch (error) {
      const err = error as Error;
      trackError(err, 'Registration Error');
      
      // Handle rate limiting
      if (err.message.includes('too many attempts')) {
        setRateLimited(true);
        setTimeout(() => setRateLimited(false), RATE_LIMIT.COOLDOWN);
      }

      setErrors([{
        field: 'email',
        message: err.message
      }]);

    } finally {
      setLoading(false);
      recaptchaRef.current?.reset();
      setCaptchaToken(null);
    }
  }, [formData, captchaToken, rateLimited, register, trackEvent, trackError, navigation, validateForm]);

  // Handle OAuth provider authentication
  const handleProviderAuth = useCallback(async (provider: AuthProvider) => {
    try {
      if (rateLimited) {
        throw new Error('Too many attempts. Please try again later.');
      }

      setLoading(true);

      await loginWithProvider(provider);

      trackEvent('USER_REGISTER', {
        provider,
        success: true
      });

      navigation.navigate('Dashboard');

    } catch (error) {
      const err = error as Error;
      trackError(err, 'Provider Auth Error');
      
      if (err.message.includes('too many attempts')) {
        setRateLimited(true);
        setTimeout(() => setRateLimited(false), RATE_LIMIT.COOLDOWN);
      }

      setErrors([{
        field: 'email',
        message: err.message
      }]);

    } finally {
      setLoading(false);
    }
  }, [rateLimited, loginWithProvider, trackEvent, trackError, navigation]);

  return (
    <Container>
      <Form onSubmit={handleSubmit} noValidate>
        <Input
          name="email"
          type="email"
          label="Email Address"
          value={formData.email}
          onChange={e => handleInputChange('email', e.target.value)}
          error={errors.find(e => e.field === 'email')?.message}
          disabled={loading || rateLimited}
          required
          aria-required="true"
          autoComplete="email"
        />

        <Input
          name="password"
          type="password"
          label="Password"
          value={formData.password}
          onChange={e => handleInputChange('password', e.target.value)}
          error={errors.find(e => e.field === 'password')?.message}
          disabled={loading || rateLimited}
          required
          aria-required="true"
          autoComplete="new-password"
        />

        <Input
          name="confirmPassword"
          type="password"
          label="Confirm Password"
          value={formData.confirmPassword}
          onChange={e => handleInputChange('confirmPassword', e.target.value)}
          error={errors.find(e => e.field === 'confirmPassword')?.message}
          disabled={loading || rateLimited}
          required
          aria-required="true"
          autoComplete="new-password"
        />

        <ReCAPTCHA
          ref={recaptchaRef}
          sitekey={process.env.REACT_APP_RECAPTCHA_SITE_KEY!}
          onChange={handleCaptchaChange}
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={loading}
          disabled={loading || rateLimited || !captchaToken}
          aria-label="Create account"
        >
          Create Account
        </Button>

        <Divider>or continue with</Divider>

        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => handleProviderAuth(AuthProvider.GOOGLE)}
          disabled={loading || rateLimited}
          aria-label="Sign up with Google"
        >
          Google
        </Button>

        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => handleProviderAuth(AuthProvider.ESPN)}
          disabled={loading || rateLimited}
          aria-label="Sign up with ESPN"
        >
          ESPN
        </Button>

        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={() => handleProviderAuth(AuthProvider.SLEEPER)}
          disabled={loading || rateLimited}
          aria-label="Sign up with Sleeper"
        >
          Sleeper
        </Button>
      </Form>
    </Container>
  );
};

export default RegisterScreen;