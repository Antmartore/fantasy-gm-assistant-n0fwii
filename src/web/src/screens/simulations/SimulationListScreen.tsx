/**
 * @fileoverview Screen component for displaying Monte Carlo simulations with enhanced filtering and performance
 * Features virtualized list rendering, optimized caching, and comprehensive performance monitoring
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import styled from 'styled-components';
import { datadogRum } from '@datadog/browser-rum';
import { ErrorBoundary } from 'react-error-boundary';

import List from '../../components/base/List';
import { useSimulation } from '../../hooks/useSimulation';
import { SimulationType, SimulationStatus, SimulationFilterParams } from '../../types/simulation';
import { theme } from '../../config/theme';
import { RATE_LIMITS } from '../../config/constants';

// Constants
const FILTER_DEBOUNCE_MS = 300;
const LIST_ITEM_HEIGHT = 120;
const DEFAULT_PAGE_SIZE = 20;

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  padding: ${theme.spacing.lg};
  gap: ${theme.spacing.md};
  min-height: 100vh;
  background: ${theme.colors.background};
`;

const FilterPanel = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${theme.spacing.sm};
  padding: ${theme.spacing.md};
  background: ${theme.colors.surface};
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const FilterInput = styled.input`
  padding: ${theme.spacing.sm};
  border: 1px solid ${theme.colors.text.secondary};
  border-radius: 4px;
  min-width: 200px;

  &:focus {
    outline: none;
    border-color: ${theme.colors.accent};
  }
`;

const FilterSelect = styled.select`
  padding: ${theme.spacing.sm};
  border: 1px solid ${theme.colors.text.secondary};
  border-radius: 4px;
  background: ${theme.colors.background};
`;

const SimulationCard = styled.div`
  padding: ${theme.spacing.md};
  background: ${theme.colors.surface};
  border-radius: 8px;
  border-left: 4px solid ${props => 
    props.status === SimulationStatus.COMPLETED ? theme.colors.semantic.win :
    props.status === SimulationStatus.FAILED ? theme.colors.semantic.loss :
    theme.colors.semantic.neutral
  };
`;

// Types
interface SimulationListScreenProps {
  teamId: string;
}

export const SimulationListScreen: React.FC<SimulationListScreenProps> = ({ teamId }) => {
  // Hooks
  const navigation = useNavigation();
  const { 
    runSimulation, 
    cancelSimulation, 
    simulationHistory, 
    isLoading, 
    cacheStatus 
  } = useSimulation(teamId);

  // State
  const [filters, setFilters] = useState<SimulationFilterParams>({
    type: [],
    status: [],
    dateRange: [new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date()],
    confidenceLevel: 0.95
  });

  // Performance monitoring setup
  useEffect(() => {
    datadogRum.addAction('simulation.list.view', {
      teamId,
      cacheHitRate: cacheStatus?.hitRate,
      filterCount: Object.keys(filters).length
    });
  }, [teamId, cacheStatus?.hitRate, filters]);

  // Memoized filtered simulations
  const filteredSimulations = useMemo(() => {
    return simulationHistory.filter(sim => {
      const matchesType = filters.type?.length === 0 || filters.type?.includes(sim.type);
      const matchesStatus = filters.status?.length === 0 || filters.status?.includes(sim.status);
      const matchesDate = filters.dateRange ? (
        new Date(sim.createdAt) >= filters.dateRange[0] &&
        new Date(sim.createdAt) <= filters.dateRange[1]
      ) : true;

      return matchesType && matchesStatus && matchesDate;
    });
  }, [simulationHistory, filters]);

  // Handlers
  const handleFilterChange = useCallback((newFilters: Partial<SimulationFilterParams>) => {
    const startTime = performance.now();
    
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));

    datadogRum.addAction('simulation.filter.change', {
      filterType: Object.keys(newFilters)[0],
      duration: performance.now() - startTime
    });
  }, []);

  const renderSimulationCard = useCallback(({ item: simulation }) => (
    <SimulationCard 
      status={simulation.status}
      onClick={() => navigation.navigate('SimulationDetail', { id: simulation.id })}
      role="button"
      tabIndex={0}
      aria-label={`Simulation ${simulation.id} - ${simulation.type}`}
    >
      <h3>{simulation.type} Simulation</h3>
      <p>Status: {simulation.status}</p>
      {simulation.results && (
        <>
          <p>Playoff Odds: {(simulation.results.playoffOdds * 100).toFixed(1)}%</p>
          <p>Projected Record: {simulation.results.projectedRecord}</p>
          <p>Avg Points/Week: {simulation.results.averagePointsPerWeek.toFixed(1)}</p>
        </>
      )}
      <small>Created: {new Date(simulation.createdAt).toLocaleDateString()}</small>
    </SimulationCard>
  ), [navigation]);

  return (
    <ErrorBoundary
      fallbackRender={({ error }) => (
        <div>Error loading simulations: {error.message}</div>
      )}
    >
      <Container>
        <FilterPanel role="search" aria-label="Simulation filters">
          <FilterSelect
            value={filters.type}
            onChange={e => handleFilterChange({ type: [e.target.value as SimulationType] })}
            aria-label="Simulation type filter"
          >
            <option value="">All Types</option>
            {Object.values(SimulationType).map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </FilterSelect>

          <FilterSelect
            value={filters.status}
            onChange={e => handleFilterChange({ status: [e.target.value as SimulationStatus] })}
            aria-label="Simulation status filter"
          >
            <option value="">All Statuses</option>
            {Object.values(SimulationStatus).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </FilterSelect>

          <FilterInput
            type="date"
            value={filters.dateRange?.[0].toISOString().split('T')[0]}
            onChange={e => handleFilterChange({
              dateRange: [new Date(e.target.value), filters.dateRange?.[1] || new Date()]
            })}
            aria-label="Start date filter"
          />

          <FilterInput
            type="date"
            value={filters.dateRange?.[1].toISOString().split('T')[0]}
            onChange={e => handleFilterChange({
              dateRange: [filters.dateRange?.[0] || new Date(), new Date(e.target.value)]
            })}
            aria-label="End date filter"
          />
        </FilterPanel>

        <List
          items={filteredSimulations}
          renderItem={renderSimulationCard}
          loading={isLoading}
          virtualized
          itemHeight={LIST_ITEM_HEIGHT}
          emptyMessage="No simulations found. Run a new simulation to get started."
          ariaLabel="Simulations list"
          role="list"
        />
      </Container>
    </ErrorBoundary>
  );
};

SimulationListScreen.displayName = 'SimulationListScreen';

export default SimulationListScreen;