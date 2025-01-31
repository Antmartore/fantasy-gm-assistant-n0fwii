import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components'; // v5.3.0
import { useRoute, useNavigation } from '@react-navigation/native'; // v6.0.0
import { useNetInfo } from '@react-native-community/netinfo'; // v9.0.0
import AsyncStorage from '@react-native-async-storage/async-storage'; // v1.17.0

// Internal imports
import LineupGrid from '../../components/sports/LineupGrid';
import { useLineup } from '../../hooks/useLineup';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';
import { OptimizationStrategy } from '../../types/lineup';

// Styled components
const Container = styled.div`
  padding: ${theme.spacing.lg};
  min-height: 100vh;
  background: ${theme.colors.background};

  ${media.mobileS(`
    padding: ${theme.spacing.sm};
  `)}

  ${media.tablet(`
    padding: ${theme.spacing.md};
  `)}
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.lg};
`;

const Title = styled.h1`
  font-size: ${theme.typography.fontSize.xl};
  color: ${theme.colors.text.primary};
  margin: 0;
`;

const OptimizeButton = styled.button<{ loading?: boolean }>`
  background: ${theme.colors.accent};
  color: ${theme.colors.background};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: none;
  border-radius: ${theme.spacing.xs};
  font-weight: ${theme.typography.fontWeight.bold};
  cursor: ${props => props.loading ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.loading ? 0.7 : 1};
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`;

const ProgressBar = styled.div<{ progress: number }>`
  width: 100%;
  height: 4px;
  background: ${theme.colors.surface};
  border-radius: 2px;
  margin-top: ${theme.spacing.sm};
  overflow: hidden;

  &::after {
    content: '';
    display: block;
    width: ${props => props.progress}%;
    height: 100%;
    background: ${theme.colors.accent};
    transition: width 0.3s ease;
  }
`;

const StatusMessage = styled.div<{ type: 'error' | 'info' | 'success' }>`
  padding: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
  border-radius: ${theme.spacing.xs};
  background: ${props => 
    props.type === 'error' ? `${theme.colors.status.error}20` :
    props.type === 'success' ? `${theme.colors.status.success}20` :
    `${theme.colors.status.info}20`
  };
  color: ${props => 
    props.type === 'error' ? theme.colors.status.error :
    props.type === 'success' ? theme.colors.status.success :
    theme.colors.status.info
  };
`;

// Types
interface LineupDetailScreenProps {
  route: {
    params: {
      teamId: string;
      week: number;
    };
  };
}

const LineupDetailScreen: React.FC<LineupDetailScreenProps> = ({ route }) => {
  // Hooks and state
  const { teamId, week } = route.params;
  const navigation = useNavigation();
  const netInfo = useNetInfo();
  const [optimizing, setOptimizing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'error' | 'info' | 'success';
    message: string;
  } | null>(null);

  // Custom hook for lineup management
  const {
    lineup,
    loading,
    error,
    optimizeLineup,
    optimizationProgress,
    syncStatus,
    cacheStatus
  } = useLineup({
    teamId,
    week,
    optimizationConfig: {
      strategy: OptimizationStrategy.BALANCED,
      simulationCount: 1000,
      considerWeather: true,
      considerInjuries: true,
      riskTolerance: 0.5
    }
  });

  // Memoized optimization handler with debouncing and error handling
  const handleOptimize = useCallback(async () => {
    if (!netInfo.isConnected) {
      setStatusMessage({
        type: 'error',
        message: 'No internet connection. Please try again when online.'
      });
      return;
    }

    if (optimizing) return;

    try {
      setOptimizing(true);
      setStatusMessage({
        type: 'info',
        message: 'Optimizing lineup...'
      });

      const result = await optimizeLineup();

      setStatusMessage({
        type: 'success',
        message: `Lineup optimized! Projected points: ${result.projectedPoints.toFixed(1)}`
      });

      // Cache optimization result
      await AsyncStorage.setItem(
        `lineup_optimization_${teamId}_${week}`,
        JSON.stringify({
          result,
          timestamp: Date.now()
        })
      );
    } catch (error) {
      setStatusMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Optimization failed'
      });
    } finally {
      setOptimizing(false);
    }
  }, [teamId, week, optimizing, netInfo.isConnected, optimizeLineup]);

  // Effect for handling offline/online transitions
  useEffect(() => {
    if (!netInfo.isConnected && !cacheStatus.isCached) {
      setStatusMessage({
        type: 'error',
        message: 'Offline mode: Some features may be limited'
      });
    }
  }, [netInfo.isConnected, cacheStatus.isCached]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setOptimizing(false);
      setStatusMessage(null);
    };
  }, []);

  // Loading state
  if (loading) {
    return (
      <Container>
        <StatusMessage type="info">Loading lineup data...</StatusMessage>
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container>
        <StatusMessage type="error">
          {error}
        </StatusMessage>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Week {week} Lineup</Title>
        <OptimizeButton
          onClick={handleOptimize}
          disabled={optimizing || !netInfo.isConnected}
          loading={optimizing}
          aria-busy={optimizing}
        >
          {optimizing ? 'Optimizing...' : 'Optimize Lineup'}
        </OptimizeButton>
      </Header>

      {statusMessage && (
        <StatusMessage type={statusMessage.type}>
          {statusMessage.message}
        </StatusMessage>
      )}

      {optimizing && (
        <ProgressBar 
          progress={optimizationProgress}
          role="progressbar"
          aria-valuenow={optimizationProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      )}

      {!syncStatus.synced && (
        <StatusMessage type="info">
          Syncing changes... ({syncStatus.pendingChanges} pending)
        </StatusMessage>
      )}

      <LineupGrid
        teamId={teamId}
        week={week}
        onOptimize={handleOptimize}
        className="lineup-grid"
      />
    </Container>
  );
};

export default LineupDetailScreen;