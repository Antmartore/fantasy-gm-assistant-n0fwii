import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { debounce } from 'lodash';
import { ErrorBoundary } from 'react-error-boundary';
import Button from '../../components/base/Button';
import Input from '../../components/base/Input';
import { useAuth } from '../../hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { theme, SPACING, TYPOGRAPHY } from '../../config/theme';

// Styled Components with accessibility support
const SettingsContainer = styled.main`
  padding: ${SPACING.lg};
  max-width: 800px;
  margin: 0 auto;
  
  @media (max-width: 768px) {
    padding: ${SPACING.md};
  }
`;

const SettingsSection = styled.section`
  background: ${theme.colors.surface};
  border-radius: 8px;
  padding: ${SPACING.lg};
  margin-bottom: ${SPACING.lg};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  h2 {
    font-size: ${TYPOGRAPHY.fontSize.lg};
    margin-bottom: ${SPACING.md};
    color: ${theme.colors.text.primary};
  }
`;

const FormGroup = styled.div`
  margin-bottom: ${SPACING.md};
`;

const SectionDivider = styled.hr`
  border: none;
  border-top: 1px solid ${theme.colors.text.disabled};
  margin: ${SPACING.lg} 0;
`;

const ErrorMessage = styled.div`
  color: ${theme.colors.status.error};
  font-size: ${TYPOGRAPHY.fontSize.sm};
  margin-top: ${SPACING.xs};
`;

// Types
interface SettingsFormData {
  displayName: string;
  email: string;
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
  subscription: {
    plan: 'free' | 'premium';
    autoRenew: boolean;
  };
  theme: 'light' | 'dark' | 'system';
}

// Initial form state
const initialFormData: SettingsFormData = {
  displayName: '',
  email: '',
  notifications: {
    email: true,
    push: true,
    inApp: true,
  },
  subscription: {
    plan: 'free',
    autoRenew: true,
  },
  theme: 'system',
};

const SettingsScreen: React.FC = () => {
  const dispatch = useDispatch();
  const { user, checkPermission } = useAuth();
  const { trackEvent, trackError, trackScreenView } = useAnalytics();
  
  const [formData, setFormData] = useState<SettingsFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof SettingsFormData, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Track screen view on mount
  useEffect(() => {
    trackScreenView('settings', {
      userId: user?.uid,
      userRole: user?.customClaims?.role,
    });
  }, []);

  // Load user settings
  useEffect(() => {
    if (user) {
      setFormData({
        ...initialFormData,
        displayName: user.displayName || '',
        email: user.email || '',
        // Additional settings would be loaded from your state management system
      });
    }
  }, [user]);

  // Validate form data
  const validateForm = useCallback((data: SettingsFormData): boolean => {
    const newErrors: Partial<Record<keyof SettingsFormData, string>> = {};

    if (!data.displayName.trim()) {
      newErrors.displayName = 'Display name is required';
    } else if (data.displayName.length < 2 || data.displayName.length > 50) {
      newErrors.displayName = 'Display name must be between 2 and 50 characters';
    }

    if (!data.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      newErrors.email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, []);

  // Debounced input handler
  const handleInputChange = debounce((name: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, 300);

  // Handle subscription changes
  const handleSubscriptionChange = useCallback(async (newPlan: 'free' | 'premium') => {
    try {
      setIsSaving(true);
      trackEvent('PREMIUM_CONVERSION', {
        fromPlan: formData.subscription.plan,
        toPlan: newPlan,
        userId: user?.uid,
      });

      // Subscription logic would go here
      setFormData(prev => ({
        ...prev,
        subscription: {
          ...prev.subscription,
          plan: newPlan,
        },
      }));
    } catch (error) {
      trackError(error as Error, 'Subscription Change Error');
      setErrors(prev => ({
        ...prev,
        subscription: 'Failed to update subscription',
      }));
    } finally {
      setIsSaving(false);
    }
  }, [formData.subscription.plan, user]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (!validateForm(formData)) {
        return;
      }

      setIsSaving(true);
      trackEvent('SETTINGS_UPDATE', {
        userId: user?.uid,
        changes: Object.keys(formData),
      });

      // Update logic would go here
      
      // Show success message
      // You would implement your own toast/notification system
    } catch (error) {
      trackError(error as Error, 'Settings Update Error');
      setErrors(prev => ({
        ...prev,
        general: 'Failed to update settings',
      }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ErrorBoundary
      fallback={<ErrorMessage>Something went wrong loading settings</ErrorMessage>}
      onError={(error) => trackError(error, 'Settings Screen Error')}
    >
      <SettingsContainer>
        <h1>Settings</h1>
        
        <form onSubmit={handleSubmit}>
          <SettingsSection>
            <h2>Profile Settings</h2>
            <FormGroup>
              <Input
                name="displayName"
                label="Display Name"
                value={formData.displayName}
                onChange={(e) => handleInputChange('displayName', e.target.value)}
                error={errors.displayName}
                required
              />
            </FormGroup>
            <FormGroup>
              <Input
                name="email"
                type="email"
                label="Email Address"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                error={errors.email}
                required
              />
            </FormGroup>
          </SettingsSection>

          <SettingsSection>
            <h2>Notification Preferences</h2>
            <FormGroup>
              <Input
                type="checkbox"
                name="notifications.email"
                label="Email Notifications"
                checked={formData.notifications.email}
                onChange={(e) => handleInputChange('notifications.email', e.target.checked)}
              />
            </FormGroup>
            <FormGroup>
              <Input
                type="checkbox"
                name="notifications.push"
                label="Push Notifications"
                checked={formData.notifications.push}
                onChange={(e) => handleInputChange('notifications.push', e.target.checked)}
              />
            </FormGroup>
            <FormGroup>
              <Input
                type="checkbox"
                name="notifications.inApp"
                label="In-App Notifications"
                checked={formData.notifications.inApp}
                onChange={(e) => handleInputChange('notifications.inApp', e.target.checked)}
              />
            </FormGroup>
          </SettingsSection>

          <SettingsSection>
            <h2>Subscription</h2>
            {formData.subscription.plan === 'free' ? (
              <Button
                variant="primary"
                onClick={() => handleSubscriptionChange('premium')}
                disabled={isSaving}
                loading={isSaving}
                fullWidth
              >
                Upgrade to Premium
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => handleSubscriptionChange('free')}
                disabled={isSaving}
                loading={isSaving}
                fullWidth
              >
                Cancel Premium
              </Button>
            )}
            {errors.subscription && (
              <ErrorMessage>{errors.subscription}</ErrorMessage>
            )}
          </SettingsSection>

          <SettingsSection>
            <h2>Theme</h2>
            <FormGroup>
              <Input
                type="radio"
                name="theme"
                value="light"
                label="Light Theme"
                checked={formData.theme === 'light'}
                onChange={(e) => handleInputChange('theme', e.target.value)}
              />
              <Input
                type="radio"
                name="theme"
                value="dark"
                label="Dark Theme"
                checked={formData.theme === 'dark'}
                onChange={(e) => handleInputChange('theme', e.target.value)}
              />
              <Input
                type="radio"
                name="theme"
                value="system"
                label="System Default"
                checked={formData.theme === 'system'}
                onChange={(e) => handleInputChange('theme', e.target.value)}
              />
            </FormGroup>
          </SettingsSection>

          <Button
            type="submit"
            variant="primary"
            disabled={isSaving || Object.keys(errors).length > 0}
            loading={isSaving}
            fullWidth
          >
            Save Settings
          </Button>
        </form>
      </SettingsContainer>
    </ErrorBoundary>
  );
};

export default SettingsScreen;