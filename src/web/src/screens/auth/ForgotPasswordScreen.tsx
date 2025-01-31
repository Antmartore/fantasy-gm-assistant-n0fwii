import React, { useState } from 'react';
import { useNavigate } from '@react-navigation/native';
import styled from 'styled-components';
import debounce from 'lodash/debounce';

// Internal imports
import { resetPassword } from '../../api/auth';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import Toast from '../../components/base/Toast';
import { theme } from '../../config/theme';

// Constants
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT = 300000; // 5 minutes
const DEBOUNCE_DELAY = 300;

// Types
interface ForgotPasswordState {
  email: string;
  error: string | null;
  loading: boolean;
  success: boolean;
  attempts: number;
  lastAttempt: number;
}

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${theme.spacing.xl};
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  justify-content: center;
`;

const Title = styled.h1`
  font-size: ${theme.typography.fontSize.xl};
  color: ${theme.colors.text.primary};
  margin-bottom: ${theme.spacing.lg};
  text-align: center;
  font-weight: ${theme.typography.fontWeight.bold};
`;

const Form = styled.form`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const BackLink = styled.button`
  background: none;
  border: none;
  color: ${theme.colors.primary};
  font-size: ${theme.typography.fontSize.md};
  cursor: pointer;
  margin-top: ${theme.spacing.md};
  text-decoration: underline;
  
  &:hover {
    color: ${theme.colors.accent};
  }
  
  &:focus {
    outline: 2px solid ${theme.colors.accent};
    border-radius: 4px;
  }
`;

const ForgotPasswordScreen: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<ForgotPasswordState>({
    email: '',
    error: null,
    loading: false,
    success: false,
    attempts: 0,
    lastAttempt: 0
  });

  const validateEmail = (email: string): boolean => {
    if (!email) {
      setState(prev => ({ ...prev, error: 'Email is required' }));
      return false;
    }

    if (!EMAIL_REGEX.test(email)) {
      setState(prev => ({ ...prev, error: 'Please enter a valid email address' }));
      return false;
    }

    return true;
  };

  const checkRateLimit = (): boolean => {
    const now = Date.now();
    if (state.attempts >= MAX_ATTEMPTS && (now - state.lastAttempt) < ATTEMPT_TIMEOUT) {
      setState(prev => ({
        ...prev,
        error: `Too many attempts. Please try again in ${Math.ceil((ATTEMPT_TIMEOUT - (now - state.lastAttempt)) / 60000)} minutes`
      }));
      return false;
    }
    return true;
  };

  const handleSubmit = debounce(async (e: React.FormEvent) => {
    e.preventDefault();

    // Reset error state
    setState(prev => ({ ...prev, error: null }));

    // Validate email and rate limiting
    if (!validateEmail(state.email) || !checkRateLimit()) {
      return;
    }

    try {
      setState(prev => ({ ...prev, loading: true }));

      await resetPassword(state.email);

      setState(prev => ({
        ...prev,
        success: true,
        loading: false,
        attempts: prev.attempts + 1,
        lastAttempt: Date.now()
      }));

      Toast.show({
        message: 'Password reset instructions have been sent to your email',
        type: 'success',
        duration: 5000,
        ariaLive: 'polite'
      });

      // Redirect to login after short delay
      setTimeout(() => navigate('/login'), 3000);

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to send reset instructions. Please try again.',
        loading: false,
        attempts: prev.attempts + 1,
        lastAttempt: Date.now()
      }));

      Toast.show({
        message: 'Error sending reset instructions',
        type: 'error',
        duration: 5000,
        ariaLive: 'assertive'
      });
    }
  }, DEBOUNCE_DELAY);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setState(prev => ({
      ...prev,
      email: e.target.value,
      error: null
    }));
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  return (
    <Container>
      <Title>Reset Password</Title>
      
      <Form onSubmit={handleSubmit} noValidate>
        <Input
          name="email"
          type="email"
          label="Email Address"
          value={state.email}
          onChange={handleEmailChange}
          error={state.error}
          disabled={state.loading}
          required
          autoFocus
          aria-describedby="email-help"
          placeholder="Enter your email address"
        />
        
        <Button
          type="submit"
          variant="primary"
          size="large"
          fullWidth
          loading={state.loading}
          disabled={state.loading || state.success}
          aria-label="Send reset instructions"
        >
          Send Reset Instructions
        </Button>
      </Form>

      <BackLink
        onClick={handleBackToLogin}
        type="button"
        aria-label="Back to login"
      >
        Back to Login
      </BackLink>
    </Container>
  );
};

export default ForgotPasswordScreen;