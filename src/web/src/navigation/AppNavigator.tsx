import React, { useEffect, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native'; // ^6.0.0
import { createStackNavigator } from '@react-navigation/stack'; // ^6.0.0
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'; // ^6.0.0
import { useNavigationContainerRef } from '@react-navigation/native'; // ^6.0.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0
import { theme } from '../config/theme';

// Internal imports
import { RootStackParamList } from './types';
import linking from './LinkingConfiguration';
import AuthNavigator from './AuthNavigator';
import { useAuth } from '../hooks/useAuth';
import { useAnalytics } from '../hooks/useAnalytics';

// Screen imports
import DashboardScreen from '../screens/DashboardScreen';
import TeamsNavigator from './TeamsNavigator';
import AnalysisNavigator from './AnalysisNavigator';
import ProfileScreen from '../screens/ProfileScreen';

// Create navigators
const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Error fallback component
const NavigationErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
  error,
  resetErrorBoundary
}) => (
  <div
    role="alert"
    style={{
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.status.error,
      color: theme.colors.background,
    }}
  >
    <h3>Navigation Error:</h3>
    <pre>{error.message}</pre>
    <button onClick={resetErrorBoundary}>Reset Navigation</button>
  </div>
);

// Bottom tab navigator for authenticated users
const AppTabNavigator: React.FC = () => {
  const { trackScreenView } = useAnalytics();

  const screenOptions = {
    headerShown: false,
    tabBarActiveTintColor: theme.colors.primary,
    tabBarInactiveTintColor: theme.colors.text.secondary,
    tabBarLabelStyle: {
      fontFamily: theme.typography.fontFamily.primary,
      fontSize: theme.typography.fontSize.sm,
    },
    tabBarStyle: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.surface,
      backgroundColor: theme.colors.background,
    },
  };

  // Track screen views for analytics
  const handleTabPress = useCallback((screenName: string) => {
    trackScreenView(screenName, {
      navigator: 'AppTabNavigator',
      journey: 'main_navigation'
    });
  }, [trackScreenView]);

  return (
    <Tab.Navigator screenOptions={screenOptions}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <span role="img" aria-label="Dashboard">
              🏠
            </span>
          ),
          tabBarAccessibilityLabel: 'Dashboard Tab'
        }}
        listeners={{
          tabPress: () => handleTabPress('Dashboard')
        }}
      />
      <Tab.Screen
        name="Teams"
        component={TeamsNavigator}
        options={{
          tabBarIcon: ({ color }) => (
            <span role="img" aria-label="Teams">
              👥
            </span>
          ),
          tabBarAccessibilityLabel: 'Teams Tab'
        }}
        listeners={{
          tabPress: () => handleTabPress('Teams')
        }}
      />
      <Tab.Screen
        name="Analysis"
        component={AnalysisNavigator}
        options={{
          tabBarIcon: ({ color }) => (
            <span role="img" aria-label="Analysis">
              📊
            </span>
          ),
          tabBarAccessibilityLabel: 'Analysis Tab'
        }}
        listeners={{
          tabPress: () => handleTabPress('Analysis')
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color }) => (
            <span role="img" aria-label="Profile">
              👤
            </span>
          ),
          tabBarAccessibilityLabel: 'Profile Tab'
        }}
        listeners={{
          tabPress: () => handleTabPress('Profile')
        }}
      />
    </Tab.Navigator>
  );
};

// Root navigation component
const AppNavigator: React.FC = () => {
  const navigationRef = useNavigationContainerRef();
  const { isAuthenticated, loading } = useAuth();
  const { trackScreenView } = useAnalytics();

  // Track navigation state changes
  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      const currentRoute = navigationRef.getCurrentRoute();
      if (currentRoute) {
        trackScreenView(currentRoute.name, {
          path: currentRoute.path,
          params: currentRoute.params
        });
      }
    });

    return unsubscribe;
  }, [navigationRef, trackScreenView]);

  if (loading) {
    return null; // Or a loading spinner
  }

  return (
    <ErrorBoundary
      FallbackComponent={NavigationErrorFallback}
      onReset={() => {
        navigationRef.reset({
          index: 0,
          routes: [{ name: isAuthenticated ? 'App' : 'Auth' }]
        });
      }}
    >
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        fallback={<div>Loading...</div>}
        documentTitle={{
          formatter: (options, route) => 
            `Fantasy GM Assistant - ${route?.name || 'Loading...'}`
        }}
      >
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            presentation: 'modal',
            animationEnabled: true,
            gestureEnabled: true
          }}
        >
          {isAuthenticated ? (
            <Stack.Screen
              name="App"
              component={AppTabNavigator}
              options={{ animationEnabled: false }}
            />
          ) : (
            <Stack.Screen
              name="Auth"
              component={AuthNavigator}
              options={{ animationEnabled: false }}
            />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
};

export default AppNavigator;