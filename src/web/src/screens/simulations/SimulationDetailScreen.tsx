import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import styled from 'styled-components';
import { datadogRum } from '@datadog/browser-rum'; // v4.0.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.0

import Chart from '../../components/analytics/Chart';
import StatDisplay from '../../components/sports/StatDisplay';
import { useSimulation } from '../../hooks/useSimulation';
import { ChartType, ChartData } from '../../types/analytics';
import { SimulationType, SimulationStatus } from '../../types/simulation';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';
import { cardStyles } from '../../styles/common';

// Styled components with responsive design and accessibility
const Container = styled.View`
  flex: 1;
  padding: ${theme.spacing.md};
  background-color: ${theme.colors.background};
`;

const Header = styled.View`
  margin-bottom: ${theme.spacing.lg};
`;

const Title = styled.Text`
  font-size: ${theme.typography.fontSize.xl};
  font-weight: ${theme.typography.fontWeight.bold};
  color: ${theme.colors.text.primary};
`;

const ChartContainer = styled.View`
  ${cardStyles}
  margin-bottom: ${theme.spacing.lg};
  min-height: 400px;

  ${media.tablet`
    min-height: 500px;
  `}
`;

const StatsGrid = styled.View`
  display: grid;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};

  ${media.tablet`
    grid-template-columns: repeat(2, 1fr);
  `}

  ${media.desktop`
    grid-template-columns: repeat(3, 1fr);
  `}
`;

const ActionButton = styled.TouchableOpacity<{ variant?: 'primary' | 'secondary' }>`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  background-color: ${props => 
    props.variant === 'secondary' ? theme.colors.secondary : theme.colors.primary};
  border-radius: ${theme.spacing.sm};
  align-items: center;
  justify-content: center;
  min-height: 44px;
`;

const ButtonText = styled.Text`
  color: ${theme.colors.background};
  font-weight: ${theme.typography.fontWeight.medium};
`;

const ErrorContainer = styled.View`
  ${cardStyles}
  padding: ${theme.spacing.lg};
  align-items: center;
`;

const ErrorText = styled.Text`
  color: ${theme.colors.status.error};
  margin-bottom: ${theme.spacing.md};
`;

interface SimulationDetailScreenProps {
  route: {
    params: {
      simulationId: string;
    };
  };
}

const SimulationDetailScreen: React.FC<SimulationDetailScreenProps> = React.memo(() => {
  // Hooks and state
  const route = useRoute();
  const navigation = useNavigation();
  const { simulationId } = route.params;
  const [selectedDataPoint, setSelectedDataPoint] = useState<any>(null);

  const {
    runSimulation,
    cancelSimulation,
    isLoading,
    error,
    progress,
    activeSimulation
  } = useSimulation(simulationId);

  // Format simulation data for charts with performance optimization
  const chartData = useMemo((): ChartData => {
    if (!activeSimulation?.results) return { labels: [], datasets: [] };

    const { results } = activeSimulation;
    return {
      labels: results.scenarios.map((_, index) => `Week ${index + 1}`),
      datasets: [{
        label: 'Projected Points',
        data: results.scenarios.map(scenario => ({
          x: scenario.scenarioId,
          y: scenario.probability,
          metadata: scenario.impactFactors
        }))
      }]
    };
  }, [activeSimulation?.results]);

  // Performance monitoring for chart rendering
  useEffect(() => {
    datadogRum.addAction('simulation.chart.render', {
      simulationId,
      dataPoints: chartData.datasets[0]?.data.length || 0
    });
  }, [chartData, simulationId]);

  // Handle data point selection with debouncing
  const handleDataPointClick = useCallback((point: any) => {
    setSelectedDataPoint(point);
    datadogRum.addAction('simulation.dataPoint.select', {
      simulationId,
      pointId: point.x,
      value: point.y
    });
  }, [simulationId]);

  // Error fallback component
  const ErrorFallback = ({ error, resetErrorBoundary }) => (
    <ErrorContainer>
      <ErrorText>Error: {error.message}</ErrorText>
      <ActionButton onPress={resetErrorBoundary}>
        <ButtonText>Retry</ButtonText>
      </ActionButton>
    </ErrorContainer>
  );

  if (isLoading) {
    return (
      <Container>
        <StatDisplay loading player={null} />
      </Container>
    );
  }

  if (error) {
    return (
      <ErrorContainer>
        <ErrorText>{error}</ErrorText>
        <ActionButton onPress={() => runSimulation(activeSimulation?.parameters)}>
          <ButtonText>Retry Simulation</ButtonText>
        </ActionButton>
      </ErrorContainer>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Container>
        <Header>
          <Title>Simulation Results</Title>
        </Header>

        <ChartContainer>
          <Chart
            type={ChartType.LINE}
            data={chartData}
            height={400}
            width={600}
            interactive={true}
            onDataPointClick={handleDataPointClick}
            ariaLabel="Monte Carlo simulation results visualization"
          />
        </ChartContainer>

        <StatsGrid>
          {activeSimulation?.results && (
            <>
              <StatDisplay
                player={{
                  id: 'playoff-odds',
                  name: 'Playoff Odds',
                  stats: {
                    points: activeSimulation.results.playoffOdds * 100,
                    averagePoints: activeSimulation.results.averagePointsPerWeek,
                    consistency: activeSimulation.results.performanceMetrics.standardDeviation
                  }
                }}
                showDetails
                ariaLabel="Simulation statistics display"
              />

              <StatDisplay
                player={{
                  id: 'risk-metrics',
                  name: 'Risk Analysis',
                  stats: {
                    points: activeSimulation.results.riskMetrics.valueAtRisk * 100,
                    averagePoints: activeSimulation.results.riskMetrics.downsideRisk * 100,
                    consistency: activeSimulation.results.performanceMetrics.skewness
                  }
                }}
                showDetails
                ariaLabel="Risk metrics display"
              />
            </>
          )}
        </StatsGrid>

        <ActionButton
          onPress={() => navigation.goBack()}
          variant="secondary"
          accessibilityLabel="Return to simulations list"
        >
          <ButtonText>Back to Simulations</ButtonText>
        </ActionButton>
      </Container>
    </ErrorBoundary>
  );
});

SimulationDetailScreen.displayName = 'SimulationDetailScreen';

export default SimulationDetailScreen;