import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useFirestore, collection, onSnapshot, query, where } from 'firebase/firestore';
import { usePerformance, ErrorBoundary } from '@sentry/react';
import { Card } from '../../components/base/Card';
import { useAnalytics } from '../../hooks/useAnalytics';
import { theme } from '../../config/theme';
import { media, responsiveContainer, responsiveGrid } from '../../styles/responsive';
import type { NavigationProp } from '@react-navigation/native';
import type { AnalyticsMetric } from '../../types/analytics';

// Types
interface DashboardScreenProps {
  navigation: NavigationProp<any>;
  onError?: (error: Error) => void;
}

interface Team {
  id: string;
  name: string;
  sport: string;
  performance: number;
}

interface Alert {
  id: string;
  message: string;
  type: 'urgent' | 'warning' | 'info';
  timestamp: Date;
}

interface DashboardState {
  teams: Team[];
  alerts: Alert[];
  loading: Record<string, boolean>;
  errors: Record<string, Error | null>;
  analytics: AnalyticsMetric[];
}

// Styled Components
const DashboardContainer = styled.div`
  ${responsiveContainer}
  min-height: 100vh;
  padding-top: ${theme.spacing.lg};
  padding-bottom: ${theme.spacing.xl};
`;

const AlertBanner = styled(Card)`
  margin-bottom: ${theme.spacing.md};
  background-color: ${props => 
    props.type === 'urgent' ? theme.colors.status.error :
    props.type === 'warning' ? theme.colors.status.warning :
    theme.colors.status.info};
  color: ${theme.colors.background};
`;

const QuickActionsGrid = styled.div`
  ${responsiveGrid}
  margin-bottom: ${theme.spacing.lg};
`;

const TeamsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};

  ${media.tablet`
    flex-direction: row;
    flex-wrap: wrap;
  `}
`;

const ProgressBar = styled.div<{ progress: number }>`
  width: ${props => props.progress}%;
  height: 4px;
  background-color: ${theme.colors.accent};
  border-radius: 2px;
  transition: width 0.3s ease-in-out;
`;

// Component
export const DashboardScreen: React.FC<DashboardScreenProps> = React.memo(({ navigation, onError }) => {
  // Hooks
  const firestore = useFirestore();
  const performance = usePerformance();
  const { trackEvent, trackError, trackPerformance, trackScreenView } = useAnalytics();
  
  // State
  const [state, setState] = useState<DashboardState>({
    teams: [],
    alerts: [],
    loading: { teams: true, alerts: true, analytics: true },
    errors: {},
    analytics: []
  });

  // Firestore subscriptions
  useEffect(() => {
    const startTime = performance.now();
    trackScreenView('Dashboard');

    const unsubscribeTeams = onSnapshot(
      query(collection(firestore, 'teams')),
      (snapshot) => {
        try {
          const teamsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as Team));
          
          setState(prev => ({
            ...prev,
            teams: teamsData,
            loading: { ...prev.loading, teams: false }
          }));

          trackPerformance('teams_load', performance.now() - startTime, {
            count: teamsData.length
          });
        } catch (error) {
          handleError('teams', error as Error);
        }
      },
      (error) => handleError('teams', error as Error)
    );

    const unsubscribeAlerts = onSnapshot(
      query(collection(firestore, 'alerts'), where('active', '==', true)),
      (snapshot) => {
        try {
          const alertsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp.toDate()
          } as Alert));

          setState(prev => ({
            ...prev,
            alerts: alertsData,
            loading: { ...prev.loading, alerts: false }
          }));
        } catch (error) {
          handleError('alerts', error as Error);
        }
      },
      (error) => handleError('alerts', error as Error)
    );

    return () => {
      unsubscribeTeams();
      unsubscribeAlerts();
    };
  }, [firestore, performance, trackPerformance, trackScreenView]);

  // Error handling
  const handleError = useCallback((source: string, error: Error) => {
    setState(prev => ({
      ...prev,
      errors: { ...prev.errors, [source]: error },
      loading: { ...prev.loading, [source]: false }
    }));
    trackError(error, `Dashboard ${source} error`);
    onError?.(error);
  }, [trackError, onError]);

  // Memoized handlers
  const handleQuickAction = useCallback((action: string) => {
    trackEvent('dashboard_quick_action', { action });
    navigation.navigate(action);
  }, [navigation, trackEvent]);

  const handleTeamSelect = useCallback((teamId: string) => {
    trackEvent('team_select', { teamId });
    navigation.navigate('TeamDetails', { teamId });
  }, [navigation, trackEvent]);

  // Memoized renders
  const renderAlerts = useMemo(() => {
    if (state.loading.alerts) return <Card loading size="small" />;
    
    return state.alerts.map(alert => (
      <AlertBanner
        key={alert.id}
        type={alert.type}
        size="small"
        testId={`alert-${alert.id}`}
        ariaLabel={`${alert.type} alert: ${alert.message}`}
      >
        {alert.message}
      </AlertBanner>
    ));
  }, [state.alerts, state.loading.alerts]);

  const renderQuickActions = useMemo(() => (
    <QuickActionsGrid>
      <Card
        variant="primary"
        onClick={() => handleQuickAction('LineupOptimizer')}
        testId="quick-action-lineup"
        ariaLabel="Optimize lineup"
      >
        Optimize Lineup
      </Card>
      <Card
        variant="secondary"
        onClick={() => handleQuickAction('TradeAnalyzer')}
        testId="quick-action-trade"
        ariaLabel="Analyze trade"
      >
        Trade Analyzer
      </Card>
    </QuickActionsGrid>
  ), [handleQuickAction]);

  const renderTeams = useMemo(() => {
    if (state.loading.teams) return <Card loading size="medium" />;

    return (
      <TeamsList>
        {state.teams.map(team => (
          <Card
            key={team.id}
            onClick={() => handleTeamSelect(team.id)}
            size="medium"
            testId={`team-${team.id}`}
            ariaLabel={`${team.name} team performance: ${team.performance}%`}
          >
            <h3>{team.name}</h3>
            <p>{team.sport}</p>
            <ProgressBar progress={team.performance} />
          </Card>
        ))}
      </TeamsList>
    );
  }, [state.teams, state.loading.teams, handleTeamSelect]);

  return (
    <ErrorBoundary
      fallback={({ error }) => (
        <Card variant="primary" size="large">
          Error loading dashboard: {error.message}
        </Card>
      )}
    >
      <DashboardContainer>
        {renderAlerts}
        {renderQuickActions}
        <Card
          variant="primary"
          size="large"
          testId="teams-section"
          ariaLabel="Your teams"
        >
          <h2>Your Teams</h2>
          {renderTeams}
        </Card>
      </DashboardContainer>
    </ErrorBoundary>
  );
});

DashboardScreen.displayName = 'DashboardScreen';

export default DashboardScreen;