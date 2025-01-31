import React, { useState, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import styled from 'styled-components';
import analytics from '@react-native-firebase/analytics';
import { toast } from 'react-toastify';
import { withErrorBoundary } from 'react-error-boundary';

import Input from '../../components/base/Input';
import Button from '../../components/base/Button';
import { theme } from '../../config/theme';

// Constants for validation and analytics
const VALIDATION_RULES = {
  name: {
    minLength: 3,
    maxLength: 50,
    pattern: '^[a-zA-Z0-9\\s-_]+$',
    platformSpecific: {
      ESPN: {
        maxLength: 40,
        pattern: '^[a-zA-Z0-9\\s-]+$'
      },
      Sleeper: {
        maxLength: 50,
        pattern: '^[a-zA-Z0-9\\s-_]+$'
      }
    }
  }
};

const ANALYTICS_EVENTS = {
  FORM_START: 'team_creation_started',
  FORM_COMPLETE: 'team_creation_completed',
  FORM_ERROR: 'team_creation_error',
  PLATFORM_ERROR: 'platform_connection_error'
};

// Styled components
const Container = styled.div`
  padding: ${theme.spacing.lg};
  max-width: 600px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: ${theme.typography.fontSize.xl};
  margin-bottom: ${theme.spacing.lg};
  color: ${theme.colors.text.primary};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const PlatformSelect = styled.select`
  ${theme.inputStyles}
  height: 40px;
`;

const SportSelect = styled.select`
  ${theme.inputStyles}
  height: 40px;
`;

interface FormState {
  name: string;
  platform: 'ESPN' | 'Sleeper' | '';
  sport: 'NFL' | 'NBA' | 'MLB' | '';
}

interface FormErrors {
  name?: string;
  platform?: string;
  sport?: string;
}

const TeamCreateScreen: React.FC = () => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  
  // Form state
  const [formState, setFormState] = useState<FormState>({
    name: '',
    platform: '',
    sport: ''
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [platformStatus, setPlatformStatus] = useState<{[key: string]: boolean}>({
    ESPN: true,
    Sleeper: true
  });

  // Track form start
  useEffect(() => {
    analytics().logEvent(ANALYTICS_EVENTS.FORM_START);
  }, []);

  // Validate form field
  const validateField = useCallback((name: string, value: string) => {
    const errors: FormErrors = {};
    
    if (name === 'name') {
      const platformRules = formState.platform ? 
        VALIDATION_RULES.name.platformSpecific[formState.platform] : 
        VALIDATION_RULES.name;

      if (value.length < VALIDATION_RULES.name.minLength) {
        errors.name = `Team name must be at least ${VALIDATION_RULES.name.minLength} characters`;
      } else if (value.length > platformRules.maxLength) {
        errors.name = `Team name cannot exceed ${platformRules.maxLength} characters for ${formState.platform}`;
      } else if (!new RegExp(platformRules.pattern).test(value)) {
        errors.name = `Invalid characters for ${formState.platform} platform`;
      }
    }

    return errors;
  }, [formState.platform]);

  // Handle form changes
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormState(prev => ({
      ...prev,
      [name]: value
    }));

    const fieldErrors = validateField(name, value);
    setErrors(prev => ({
      ...prev,
      [name]: fieldErrors[name]
    }));
  }, [validateField]);

  // Check platform availability
  const checkPlatformStatus = useCallback(async (platform: string) => {
    try {
      // Simulated platform status check
      const response = await fetch(`/api/v1/platforms/${platform}/status`);
      const status = await response.json();
      
      setPlatformStatus(prev => ({
        ...prev,
        [platform]: status.available
      }));
    } catch (error) {
      analytics().logEvent(ANALYTICS_EVENTS.PLATFORM_ERROR, {
        platform,
        error: error.message
      });
      
      toast.error(`Unable to verify ${platform} platform status`);
    }
  }, []);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate all fields
      const formErrors = Object.keys(formState).reduce((acc, key) => ({
        ...acc,
        ...validateField(key, formState[key as keyof FormState])
      }), {});

      if (Object.keys(formErrors).length > 0) {
        setErrors(formErrors);
        throw new Error('Validation failed');
      }

      // Check platform availability
      if (!platformStatus[formState.platform]) {
        throw new Error(`${formState.platform} is currently unavailable`);
      }

      // Dispatch team creation action
      await dispatch({
        type: 'CREATE_TEAM',
        payload: formState
      });

      // Track successful creation
      analytics().logEvent(ANALYTICS_EVENTS.FORM_COMPLETE, {
        platform: formState.platform,
        sport: formState.sport
      });

      toast.success('Team created successfully!');
      navigation.navigate('TeamDashboard');

    } catch (error) {
      analytics().logEvent(ANALYTICS_EVENTS.FORM_ERROR, {
        error: error.message
      });
      
      toast.error(error.message || 'Failed to create team');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container>
      <Title>Create New Team</Title>
      
      <Form onSubmit={handleSubmit}>
        <Input
          name="name"
          label="Team Name"
          value={formState.name}
          onChange={handleChange}
          error={errors.name}
          required
          maxLength={formState.platform ? 
            VALIDATION_RULES.name.platformSpecific[formState.platform].maxLength :
            VALIDATION_RULES.name.maxLength
          }
        />

        <PlatformSelect
          name="platform"
          value={formState.platform}
          onChange={handleChange}
          required
        >
          <option value="">Select Platform</option>
          <option value="ESPN" disabled={!platformStatus.ESPN}>ESPN</option>
          <option value="Sleeper" disabled={!platformStatus.Sleeper}>Sleeper</option>
        </PlatformSelect>

        <SportSelect
          name="sport"
          value={formState.sport}
          onChange={handleChange}
          required
        >
          <option value="">Select Sport</option>
          <option value="NFL">NFL</option>
          <option value="NBA">NBA</option>
          <option value="MLB">MLB</option>
        </SportSelect>

        <Button
          type="submit"
          variant="primary"
          size="large"
          fullWidth
          loading={isSubmitting}
          disabled={Object.keys(errors).length > 0}
        >
          Create Team
        </Button>
      </Form>
    </Container>
  );
};

export default withErrorBoundary(TeamCreateScreen, {
  fallback: <div>Something went wrong creating your team. Please try again.</div>
});