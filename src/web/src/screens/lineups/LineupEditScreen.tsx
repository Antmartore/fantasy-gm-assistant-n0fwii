import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import styled from 'styled-components'; // v5.3.0
import debounce from 'lodash/debounce'; // v4.17.21

// Internal imports
import LineupGrid from '../../components/sports/LineupGrid';
import Button from '../../components/base/Button';
import Toast from '../../components/base/Toast';
import { useLineup } from '../../hooks/useLineup';
import { trackEvent, trackPerformance } from '../../utils/analytics';

// Styled components
const ScreenContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  height: 100%;
  background: ${({ theme }) => theme.colors.background};
  overflow-y: auto;

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    padding: ${({ theme }) => theme.spacing.sm};
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSize.xl};
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};

  @media (max-width: ${({ theme }) => theme.breakpoints.sm}) {
    width: 100%;
    flex-direction: column;
  }
`;

const OptimizationProgress = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const LineupEditScreen: React.FC = React.memo(() => {
  // Navigation and route params
  const route = useRoute();
  const navigation = useNavigation();
  const { teamId, week } = route.params as { teamId: string; week: number };

  // Local state
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' | 'info' }>(); 
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Custom hook for lineup management
  const {
    lineup,
    loading,
    error,
    updateLineup,
    optimizeLineup,
    optimizationProgress,
    syncStatus
  } = useLineup({
    teamId,
    week,
    optimizationConfig: {
      strategy: 'BALANCED',
      simulationCount: 1000,
      considerWeather: true,
      considerInjuries: true,
      riskTolerance: 0.5
    }
  });

  // Track screen view
  useEffect(() => {
    trackEvent('SCREEN_VIEW', {
      screen: 'LineupEdit',
      teamId,
      week
    });
  }, [teamId, week]);

  // Debounced lineup update handler
  const handleLineupChange = useCallback(
    debounce(async (updatedLineup) => {
      try {
        const startTime = performance.now();
        await updateLineup(updatedLineup);
        trackPerformance('lineup_update', performance.now() - startTime);
        
        setToastMessage({
          message: 'Lineup updated successfully',
          type: 'success'
        });
      } catch (err) {
        setToastMessage({
          message: 'Failed to update lineup',
          type: 'error'
        });
      }
    }, 500),
    [updateLineup]
  );

  // Optimization handler
  const handleOptimize = useCallback(async () => {
    try {
      setIsOptimizing(true);
      const startTime = performance.now();
      
      const result = await optimizeLineup();
      
      trackPerformance('lineup_optimization', performance.now() - startTime, {
        simulationCount: result.monteCarloSimulations.length,
        confidenceScore: result.confidenceScore
      });

      setToastMessage({
        message: `Lineup optimized with ${result.projectedPoints.toFixed(1)} projected points`,
        type: 'success'
      });
    } catch (err) {
      setToastMessage({
        message: 'Optimization failed',
        type: 'error'
      });
    } finally {
      setIsOptimizing(false);
    }
  }, [optimizeLineup]);

  // Save handler
  const handleSave = useCallback(async () => {
    try {
      const startTime = performance.now();
      await updateLineup(lineup?.starters || []);
      trackPerformance('lineup_save', performance.now() - startTime);
      
      navigation.goBack();
    } catch (err) {
      setToastMessage({
        message: 'Failed to save lineup',
        type: 'error'
      });
    }
  }, [lineup, updateLineup, navigation]);

  // Memoized sync status message
  const syncStatusMessage = useMemo(() => {
    if (!syncStatus.synced) {
      return `${syncStatus.pendingChanges} pending changes...`;
    }
    return 'All changes saved';
  }, [syncStatus]);

  if (error) {
    return (
      <ScreenContainer>
        <Toast
          message={error}
          type="error"
          onClose={() => {}}
          role="alert"
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Header>
        <Title>Edit Lineup - Week {week}</Title>
        <div>{syncStatusMessage}</div>
      </Header>

      <LineupGrid
        teamId={teamId}
        week={week}
        onOptimize={handleOptimize}
      />

      {isOptimizing && (
        <OptimizationProgress role="progressbar" aria-valuenow={optimizationProgress}>
          Optimizing lineup... {optimizationProgress}%
        </OptimizationProgress>
      )}

      <ButtonContainer>
        <Button
          variant="secondary"
          onClick={() => navigation.goBack()}
          ariaLabel="Cancel lineup changes"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleOptimize}
          loading={isOptimizing}
          disabled={loading || isOptimizing}
          ariaLabel="Optimize lineup using AI"
        >
          Optimize Lineup
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={loading || isOptimizing || !syncStatus.synced}
          ariaLabel="Save lineup changes"
        >
          Save Changes
        </Button>
      </ButtonContainer>

      {toastMessage && (
        <Toast
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(undefined)}
          position="bottom-right"
          duration={5000}
        />
      )}
    </ScreenContainer>
  );
});

LineupEditScreen.displayName = 'LineupEditScreen';

export default LineupEditScreen;