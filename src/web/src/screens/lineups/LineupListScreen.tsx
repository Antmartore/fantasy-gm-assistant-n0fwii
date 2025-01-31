import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { debounce } from 'lodash';
import { VirtualList } from 'react-virtualized';
import { useWebSocket } from 'react-use-websocket';

// Internal imports
import LineupGrid from '../../components/sports/LineupGrid';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';
import { CACHE_DURATION, API_ENDPOINTS } from '../../config/constants';
import { lineupApi } from '../../api/lineups';
import { 
  startLineupOptimization, 
  setupLineupSync 
} from '../../store/actions/lineupActions';
import { 
  LineupValidationStatus, 
  OptimizationStrategy 
} from '../../types/lineup';

// Styled components
const ScreenContainer = styled.div`
  padding: ${theme.spacing.lg};
  background: ${theme.colors.background};
  min-height: 100vh;
  position: relative;
  aria-live: polite;

  ${media.mobileS(`
    padding: ${theme.spacing.md};
  `)}
`;

const ListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  max-width: 1200px;
  margin: 0 auto;
`;

const FilterBar = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  margin-bottom: ${theme.spacing.lg};
  flex-wrap: wrap;

  ${media.mobileS(`
    flex-direction: column;
  `)}
`;

const SearchInput = styled.input`
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border: 1px solid ${theme.colors.text.secondary};
  border-radius: ${theme.spacing.xs};
  flex: 1;
  min-width: 200px;
`;

const OptimizationStatus = styled.div<{ status: 'running' | 'complete' | 'error' }>`
  position: fixed;
  top: ${theme.spacing.md};
  right: ${theme.spacing.md};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  border-radius: ${theme.spacing.sm};
  background: ${props => 
    props.status === 'running' ? theme.colors.accent :
    props.status === 'complete' ? theme.colors.semantic.win :
    theme.colors.status.error};
  color: ${theme.colors.background};
  z-index: ${theme.zIndex.tooltip};
  transition: all 0.3s ease;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.text.secondary};
`;

// Props interface
interface LineupListScreenProps {
  navigation: any;
  analyticsTracker: {
    trackEvent: (event: string, properties: Record<string, any>) => void;
  };
}

const LineupListScreen: React.FC<LineupListScreenProps> = ({
  navigation,
  analyticsTracker
}) => {
  // State management
  const [lineups, setLineups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [optimizationStatus, setOptimizationStatus] = useState<'running' | 'complete' | 'error' | null>(null);
  const [optimizationProgress, setOptimizationProgress] = useState(0);

  const dispatch = useDispatch();

  // WebSocket setup for real-time updates
  const { sendMessage, lastMessage, readyState } = useWebSocket(
    `${process.env.REACT_APP_WS_URL}/lineups`,
    {
      reconnectAttempts: 10,
      reconnectInterval: 3000,
      shouldReconnect: true
    }
  );

  // Memoized filtered lineups
  const filteredLineups = useMemo(() => {
    return lineups.filter(lineup => 
      lineup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lineup.team.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [lineups, searchQuery]);

  // Debounced search handler
  const handleSearch = debounce((query: string) => {
    setSearchQuery(query);
    analyticsTracker.trackEvent('lineup_search', { query });
  }, 300);

  // Lineup optimization handler
  const handleOptimize = useCallback(async (lineupId: string) => {
    setOptimizationStatus('running');
    analyticsTracker.trackEvent('lineup_optimization_started', { lineupId });

    try {
      const result = await dispatch(startLineupOptimization({
        teamId: lineupId,
        week: new Date().getWeek(),
        optimizationStrategy: OptimizationStrategy.BALANCED,
        simulationCount: 1000,
        considerWeather: true,
        considerInjuries: true,
        riskTolerance: 0.5
      }));

      setOptimizationStatus('complete');
      analyticsTracker.trackEvent('lineup_optimization_completed', {
        lineupId,
        improvement: result.projectedPoints
      });
    } catch (error) {
      setOptimizationStatus('error');
      analyticsTracker.trackEvent('lineup_optimization_failed', {
        lineupId,
        error: error.message
      });
    }
  }, [dispatch, analyticsTracker]);

  // Initial data fetch
  useEffect(() => {
    const fetchLineups = async () => {
      try {
        const response = await lineupApi.getLineups('user_id', {
          page: 1,
          limit: 50,
          includeProjections: true
        });
        setLineups(response.data);
        analyticsTracker.trackEvent('lineup_list_loaded', {
          count: response.data.length
        });
      } catch (error) {
        console.error('Failed to fetch lineups:', error);
        analyticsTracker.trackEvent('lineup_list_error', {
          error: error.message
        });
      } finally {
        setLoading(false);
      }
    };

    fetchLineups();
  }, [analyticsTracker]);

  // WebSocket message handler
  useEffect(() => {
    if (lastMessage) {
      const update = JSON.parse(lastMessage.data);
      setLineups(prevLineups => 
        prevLineups.map(lineup => 
          lineup.id === update.lineupId ? { ...lineup, ...update.data } : lineup
        )
      );
    }
  }, [lastMessage]);

  // Render lineup row
  const renderLineupRow = useCallback(({ index, style }) => {
    const lineup = filteredLineups[index];
    return (
      <LineupGrid
        key={lineup.id}
        teamId={lineup.teamId}
        week={lineup.week}
        onOptimize={() => handleOptimize(lineup.id)}
        style={style}
      />
    );
  }, [filteredLineups, handleOptimize]);

  if (loading) {
    return (
      <ScreenContainer>
        <EmptyState>Loading lineups...</EmptyState>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <FilterBar>
        <SearchInput
          type="text"
          placeholder="Search lineups..."
          onChange={(e) => handleSearch(e.target.value)}
          aria-label="Search lineups"
        />
      </FilterBar>

      {optimizationStatus && (
        <OptimizationStatus status={optimizationStatus}>
          {optimizationStatus === 'running' && `Optimizing... ${optimizationProgress}%`}
          {optimizationStatus === 'complete' && 'Optimization complete!'}
          {optimizationStatus === 'error' && 'Optimization failed'}
        </OptimizationStatus>
      )}

      <ListContainer>
        {filteredLineups.length > 0 ? (
          <VirtualList
            width={1200}
            height={800}
            rowCount={filteredLineups.length}
            rowHeight={300}
            rowRenderer={renderLineupRow}
            overscanRowCount={2}
          />
        ) : (
          <EmptyState>
            No lineups found. Try adjusting your search.
          </EmptyState>
        )}
      </ListContainer>
    </ScreenContainer>
  );
};

export default LineupListScreen;