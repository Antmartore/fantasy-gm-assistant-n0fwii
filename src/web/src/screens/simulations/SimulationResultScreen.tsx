import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';
import { debounce } from 'lodash';
import { ErrorBoundary } from 'react-error-boundary';

import Chart from '../../components/analytics/Chart';
import Gauge from '../../components/analytics/Gauge';
import Card from '../../components/base/Card';
import { 
  Simulation,
  SimulationType,
  SimulationStatus,
  SimulationResults,
  ConfidenceInterval
} from '../../types/simulation';
import { baseStyles, cardStyles } from '../../styles/common';
import { media, responsiveContainer } from '../../styles/responsive';

// Styled components with accessibility support
const Container = styled.div`
  ${responsiveContainer}
  padding: ${props => props.theme.spacing.lg};
`;

const Header = styled.header`
  ${baseStyles}
  margin-bottom: ${props => props.theme.spacing.xl};
`;

const Title = styled.h1`
  font-size: ${props => props.theme.typography.fontSize.xl};
  font-weight: ${props => props.theme.typography.fontWeight.bold};
  color: ${props => props.theme.colors.text.primary};
  margin-bottom: ${props => props.theme.spacing.md};
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: ${props => props.theme.spacing.md};

  ${media.tablet`
    grid-template-columns: repeat(2, 1fr);
  `}

  ${media.desktop`
    grid-template-columns: repeat(3, 1fr);
  `}
`;

const ChartContainer = styled.div`
  ${cardStyles}
  margin-top: ${props => props.theme.spacing.xl};
`;

const ErrorFallback = styled.div`
  ${cardStyles}
  color: ${props => props.theme.colors.status.error};
  padding: ${props => props.theme.spacing.lg};
  text-align: center;
`;

interface SimulationResultScreenProps {
  route: {
    params: {
      simulationId: string;
    };
  };
}

const SimulationResultScreen: React.FC<SimulationResultScreenProps> = React.memo(({ route }) => {
  const [selectedDataPoint, setSelectedDataPoint] = useState<number | null>(null);
  const simulation = useSelector((state: any) => 
    state.simulations.simulations[route.params.simulationId]
  );

  // Process simulation data for visualization
  const processedData = useMemo(() => {
    if (!simulation?.results) return null;

    const results = simulation.results as SimulationResults;
    return {
      playoffOddsData: {
        labels: ['Playoff Odds'],
        datasets: [{
          label: 'Probability',
          data: [{ x: 0, y: results.playoffOdds * 100, label: `${(results.playoffOdds * 100).toFixed(1)}%` }]
        }]
      },
      pointsData: {
        labels: results.scenarios.map((_, i) => `Week ${i + 1}`),
        datasets: [{
          label: 'Projected Points',
          data: results.scenarios.map((scenario, i) => ({
            x: i,
            y: scenario.playerPerformance.total?.projectedPoints || 0,
            label: `Week ${i + 1}: ${scenario.playerPerformance.total?.projectedPoints.toFixed(1)} pts`
          }))
        }]
      },
      confidenceIntervals: results.confidenceIntervals
    };
  }, [simulation]);

  // Handle chart interactions
  const handleChartClick = useCallback(debounce((point: any) => {
    setSelectedDataPoint(point.x);
  }, 100), []);

  // Error handler for ErrorBoundary
  const handleError = useCallback((error: Error) => {
    console.error('Simulation result visualization error:', error);
  }, []);

  if (!simulation) {
    return (
      <ErrorFallback>
        Simulation not found or failed to load
      </ErrorFallback>
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <ErrorFallback>
          Error displaying simulation results: {error.message}
        </ErrorFallback>
      )}
      onError={handleError}
    >
      <Container>
        <Header>
          <Title>Simulation Results</Title>
          <p>Type: {simulation.type} | Status: {simulation.status}</p>
        </Header>

        <MetricsGrid>
          <Card>
            <Gauge
              value={simulation.results.playoffOdds * 100}
              min={0}
              max={100}
              label="Playoff Odds"
              theme={{
                dialColor: '#f5f5f5',
                needleColor: '#4A90E2',
                valueColor: '#1A1A1A',
                labelColor: '#757575'
              }}
              animation={{ duration: 750, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
              accessibility={{
                ariaLabel: `Playoff odds gauge showing ${(simulation.results.playoffOdds * 100).toFixed(1)}%`,
                role: 'meter'
              }}
            />
          </Card>

          <Card>
            <h3>Projected Record</h3>
            <p>{simulation.results.projectedRecord}</p>
          </Card>

          <Card>
            <h3>Average Points</h3>
            <p>{simulation.results.averagePointsPerWeek.toFixed(1)} pts/week</p>
          </Card>
        </MetricsGrid>

        <ChartContainer>
          <Chart
            type="LINE"
            data={processedData?.pointsData}
            height={400}
            width={800}
            interactive={true}
            onDataPointClick={handleChartClick}
            theme={{
              backgroundColor: '#FFFFFF',
              textColor: '#1A1A1A',
              gridColor: '#E0E0E0',
              tickColor: '#757575',
              borderColor: '#BDBDBD'
            }}
            ariaLabel="Weekly projected points chart"
          />
        </ChartContainer>

        {selectedDataPoint !== null && processedData?.confidenceIntervals && (
          <Card>
            <h3>Confidence Intervals - Week {selectedDataPoint + 1}</h3>
            <p>
              Lower: {processedData.confidenceIntervals[`week${selectedDataPoint + 1}`].lower.toFixed(1)} pts
              <br />
              Upper: {processedData.confidenceIntervals[`week${selectedDataPoint + 1}`].upper.toFixed(1)} pts
              <br />
              Confidence: {(processedData.confidenceIntervals[`week${selectedDataPoint + 1}`].confidence * 100).toFixed(1)}%
            </p>
          </Card>
        )}
      </Container>
    </ErrorBoundary>
  );
});

SimulationResultScreen.displayName = 'SimulationResultScreen';

export default SimulationResultScreen;