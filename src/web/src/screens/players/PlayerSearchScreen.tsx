import React, { useState, useCallback, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { useNavigation } from '@react-navigation/native';
import { VirtualList } from 'react-window';
import { ErrorBoundary } from 'react-error-boundary';
import { usePerformanceMonitor } from '@performance-monitor/react';

import PlayerCard from '../../components/sports/PlayerCard';
import SearchBar from '../../components/navigation/SearchBar';
import { useCache } from '../../hooks/useCache';
import { searchPlayers } from '../../api/players';
import { Player, PlayerPosition, PlatformSource } from '../../types/player';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';

// Constants
const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const RESULTS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_RESULTS_PER_PAGE = 20;
const PERFORMANCE_THRESHOLD_MS = 2000;
const ERROR_RETRY_ATTEMPTS = 3;
const CACHE_STALE_TIME = 5 * 60 * 1000; // 5 minutes

// Types
interface PlayerSearchScreenProps {
  route: RouteProp<RootStackParamList, 'PlayerSearch'>;
  navigation: NavigationProp<RootStackParamList>;
  platform?: PlatformSource;
  onPerformanceMetric?: (metric: PerformanceMetric) => void;
}

interface SearchState {
  query: string;
  loading: boolean;
  results: Player[];
  error: string | null;
  platform: PlatformSource;
  filters: {
    positions: PlayerPosition[];
    weatherImpacted: boolean;
  };
  pagination: {
    page: number;
    hasMore: boolean;
    total: number;
  };
  lastUpdated: number;
}

// Styled components with accessibility and responsive design
const Container = styled.div`
  flex: 1;
  padding: ${theme.spacing.md};
  background-color: ${theme.colors.background.primary};
  position: relative;

  ${media.tablet(`
    padding: ${theme.spacing.lg};
  `)}
`;

const SearchContainer = styled.div`
  margin-bottom: ${theme.spacing.md};
  z-index: 10;
  box-shadow: ${theme.shadows.small};
  background-color: ${theme.colors.background.primary};
  border-radius: ${theme.spacing.sm};
`;

const ResultsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  min-height: 200px;
  position: relative;
`;

const LoadingOverlay = styled.div<{ visible: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: ${props => props.visible ? 1 : 0};
  pointer-events: ${props => props.visible ? 'auto' : 'none'};
  transition: opacity 0.2s ease-in-out;
  z-index: 5;
`;

const ErrorMessage = styled.div`
  color: ${theme.colors.status.error};
  padding: ${theme.spacing.md};
  text-align: center;
  background-color: ${theme.colors.status.error}10;
  border-radius: ${theme.spacing.sm};
  margin: ${theme.spacing.md} 0;
`;

const PlayerSearchScreen: React.FC<PlayerSearchScreenProps> = ({
  route,
  navigation,
  platform = 'ESPN',
  onPerformanceMetric
}) => {
  // State management with performance optimization
  const [searchState, setSearchState] = useState<SearchState>({
    query: '',
    loading: false,
    results: [],
    error: null,
    platform,
    filters: {
      positions: [],
      weatherImpacted: false
    },
    pagination: {
      page: 1,
      hasMore: false,
      total: 0
    },
    lastUpdated: Date.now()
  });

  // Cache setup with TTL and validation
  const { data: cachedResults, setCache, error: cacheError } = useCache<Player[]>(
    'player_search',
    RESULTS_CACHE_TTL,
    {
      validateData: (data) => Array.isArray(data) && data.every(item => 'id' in item)
    }
  );

  // Performance monitoring setup
  const { trackMetric } = usePerformanceMonitor({
    threshold: PERFORMANCE_THRESHOLD_MS,
    onThresholdExceeded: (metric) => onPerformanceMetric?.(metric)
  });

  // Memoized search handler with debouncing and caching
  const handleSearch = useCallback(async (
    query: string,
    filters: SearchState['filters']
  ) => {
    if (query.length < MIN_QUERY_LENGTH) {
      setSearchState(prev => ({ ...prev, results: [], loading: false }));
      return;
    }

    const startTime = performance.now();
    setSearchState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Check cache first
      const cacheKey = `${query}_${JSON.stringify(filters)}_${platform}`;
      const cached = cachedResults?.[cacheKey];

      if (cached && Date.now() - searchState.lastUpdated < CACHE_STALE_TIME) {
        setSearchState(prev => ({
          ...prev,
          results: cached,
          loading: false
        }));
        return;
      }

      // Perform API search
      const response = await searchPlayers(
        {
          query,
          positions: filters.positions,
          platforms: [platform],
          weatherImpacted: filters.weatherImpacted
        },
        {
          page: 1,
          limit: MAX_RESULTS_PER_PAGE
        }
      );

      // Update cache and state
      await setCache(response.data);
      setSearchState(prev => ({
        ...prev,
        results: response.data,
        loading: false,
        pagination: {
          page: 1,
          hasMore: response.hasMore,
          total: response.total
        },
        lastUpdated: Date.now()
      }));

      // Track performance
      const duration = performance.now() - startTime;
      trackMetric({
        name: 'player_search',
        duration,
        query,
        resultCount: response.data.length
      });

    } catch (error) {
      setSearchState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to search players. Please try again.'
      }));
    }
  }, [platform, cachedResults, setCache, trackMetric]);

  // Virtual list row renderer for performance
  const rowRenderer = useCallback(({ index, style }) => {
    const player = searchState.results[index];
    return (
      <div style={style}>
        <PlayerCard
          player={player}
          variant="detailed"
          onSelect={() => navigation.navigate('PlayerDetails', { playerId: player.id })}
          testId={`player-card-${index}`}
        />
      </div>
    );
  }, [searchState.results, navigation]);

  // Load more results handler
  const handleLoadMore = useCallback(async () => {
    if (!searchState.pagination.hasMore || searchState.loading) return;

    setSearchState(prev => ({ ...prev, loading: true }));

    try {
      const response = await searchPlayers(
        {
          query: searchState.query,
          positions: searchState.filters.positions,
          platforms: [platform],
          weatherImpacted: searchState.filters.weatherImpacted
        },
        {
          page: searchState.pagination.page + 1,
          limit: MAX_RESULTS_PER_PAGE
        }
      );

      setSearchState(prev => ({
        ...prev,
        results: [...prev.results, ...response.data],
        loading: false,
        pagination: {
          page: prev.pagination.page + 1,
          hasMore: response.hasMore,
          total: response.total
        }
      }));
    } catch (error) {
      setSearchState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load more results.'
      }));
    }
  }, [searchState, platform]);

  return (
    <ErrorBoundary
      fallback={<ErrorMessage>Something went wrong. Please try again.</ErrorMessage>}
    >
      <Container>
        <SearchContainer>
          <SearchBar
            onSearch={(query) => handleSearch(query, searchState.filters)}
            placeholder="Search players by name, team, or position..."
            debounceMs={SEARCH_DEBOUNCE_MS}
            minQueryLength={MIN_QUERY_LENGTH}
            platform={platform}
            weatherImpact={true}
            ariaLabel="Search players"
          />
        </SearchContainer>

        <ResultsContainer>
          {searchState.error && (
            <ErrorMessage role="alert">{searchState.error}</ErrorMessage>
          )}

          <VirtualList
            height={800}
            width="100%"
            itemCount={searchState.results.length}
            itemSize={150}
            onItemsRendered={({ visibleStopIndex }) => {
              if (visibleStopIndex === searchState.results.length - 1) {
                handleLoadMore();
              }
            }}
          >
            {rowRenderer}
          </VirtualList>

          <LoadingOverlay 
            visible={searchState.loading}
            aria-busy={searchState.loading}
            aria-label="Loading results"
          >
            Loading...
          </LoadingOverlay>
        </ResultsContainer>
      </Container>
    </ErrorBoundary>
  );
};

export default PlayerSearchScreen;