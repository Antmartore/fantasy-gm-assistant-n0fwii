import React, { useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigationContainerRef, CardStyleInterpolators } from '@react-navigation/native';
import { ErrorBoundary } from 'react-error-boundary';
import { theme } from '@app/theme';

// Internal imports
import { AuthStackParamList } from './types';
import { useAnalytics } from '../hooks/useAnalytics';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Create authentication stack navigator
const Stack = createStackNavigator<AuthStackParamList>();

// Default screen options with accessibility and styling
const screenOptions = {
  headerStyle: {
    backgroundColor: theme.colors.background,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTitleStyle: {
    fontFamily: theme.typography.fontFamily.primary,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
  },
  headerTintColor: theme.colors.text.primary,
  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
  headerBackTitleVisible: false,
  headerLeftContainerStyle: {
    paddingLeft: theme.spacing.md,
  },
  headerRightContainerStyle: {
    paddingRight: theme.spacing.md,
  },
};

/**
 * Authentication stack navigator component that manages the navigation flow
 * for unauthenticated users with accessibility support and analytics tracking.
 */
const AuthNavigator: React.FC = () => {
  const navigationRef = useNavigationContainerRef();
  const { trackScreenView } = useAnalytics();

  // Track screen views for analytics
  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      const currentRoute = navigationRef.getCurrentRoute();
      if (currentRoute) {
        trackScreenView(currentRoute.name, {
          navigator: 'AuthNavigator',
          path: currentRoute.path,
        });
      }
    });

    return unsubscribe;
  }, [navigationRef, trackScreenView]);

  // Error fallback component for error boundary
  const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
    error,
    resetErrorBoundary,
  }) => (
    <div
      role="alert"
      style={{
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.status.error,
        color: theme.colors.background,
      }}
    >
      <h3>Something went wrong:</h3>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset navigation state on error
        navigationRef.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }}
    >
      <Stack.Navigator
        screenOptions={screenOptions}
        initialRouteName="Login"
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            title: 'Sign In',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{
            title: 'Create Account',
            headerLeft: () => null,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="ForgotPassword"
          component={ForgotPasswordScreen}
          options={{
            title: 'Reset Password',
            headerTitleAlign: 'center',
          }}
        />
      </Stack.Navigator>
    </ErrorBoundary>
  );
};

export default AuthNavigator;