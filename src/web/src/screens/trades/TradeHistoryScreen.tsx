import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { VirtualList } from 'react-virtualized';
import { ErrorBoundary } from 'react-error-boundary';
import { SkeletonLoader } from '@mui/material';
import { usePerformanceMonitor } from '@datadog/mobile-react-native';
import analytics from '@segment/analytics-react-native';

import { TradeWidget } from '../../components/sports/TradeWidget';
import { fetchTradeHistory, sortTradeHistory } from '../../store/actions/tradeActions';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';
import { Trade, TradeStatus, TradeSortField } from '../../types/trade';
import { trackEvent } from '../../utils/analytics';

// Constants
const ITEMS_PER_PAGE = 20;
const PERFORMANCE_THRESHOLD = 2000; // 2 seconds
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Types
interface TradeHistoryScreenProps {
  className?: string;
}

interface TradeFilters {
  status: TradeStatus[];
  dateRange: [Date, Date] | null;
  platform: string[];
  riskScoreRange: [number, number];
}

// Styled Components
const Container = styled.div`
  padding: ${theme.spacing.md};
  max-width: 1200px;
  margin: 0 auto;

  ${media.tablet(`
    padding: ${theme.spacing.lg};
  `)}
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.lg};
  flex-wrap: wrap;
  gap: ${theme.spacing.md};
`;

const Title = styled.h1`
  font-size: ${theme.typography.fontSize.xl};
  color: ${theme.colors.text.primary};
  margin: 0;
`;

const FiltersContainer = styled.div`
  display: flex;
  gap: ${theme.spacing.md};
  flex-wrap: wrap;
  margin-bottom: ${theme.spacing.md};

  ${media.mobileS(`
    flex-direction: column;
  `)}

  ${media.tablet(`
    flex-direction: row;
  `)}
`;

const TradeList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.text.secondary};
`;

const ErrorContainer = styled.div`
  padding: ${theme.spacing.lg};
  background-color: ${theme.colors.status.error}20;
  border-radius: ${theme.spacing.sm};
  color: ${theme.colors.status.error};
  margin-bottom: ${theme.spacing.md};
`;

// Main Component
const TradeHistoryScreen: React.FC<TradeHistoryScreenProps> = React.memo(({ className }) => {
  const dispatch = useDispatch();
  const performanceMonitor = usePerformanceMonitor();

  // Redux state
  const trades = useSelector((state: any) => state.trades.history);
  const loading = useSelector((state: any) => state.trades.loading);
  const error = useSelector((state: any) => state.trades.error);

  // Local state
  const [filters, setFilters] = useState<TradeFilters>({
    status: [],
    dateRange: null,
    platform: [],
    riskScoreRange: [0, 100]
  });
  const [sortField, setSortField] = useState<TradeSortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // Performance monitoring
  useEffect(() => {
    performanceMonitor.startTracking('trade_history_load');
    return () => performanceMonitor.stopTracking('trade_history_load');
  }, []);

  // Analytics tracking
  useEffect(() => {
    analytics.screen('TradeHistory', {
      filters,
      sortField,
      sortOrder
    });
  }, [filters, sortField, sortOrder]);

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      const startTime = performance.now();
      await dispatch(fetchTradeHistory({ filters, page, limit: ITEMS_PER_PAGE }));
      const loadTime = performance.now() - startTime;

      if (loadTime > PERFORMANCE_THRESHOLD) {
        trackEvent('SLOW_TRADE_HISTORY_LOAD', { loadTime });
      }
    };

    fetchData();
  }, [dispatch, filters, page]);

  // Memoized sorted trades
  const sortedTrades = useMemo(() => {
    return sortTradeHistory(trades, sortField, sortOrder);
  }, [trades, sortField, sortOrder]);

  // Handlers
  const handleFilterChange = useCallback((newFilters: TradeFilters) => {
    trackEvent('TRADE_HISTORY_FILTER_CHANGE', { 
      previousFilters: filters,
      newFilters 
    });
    setFilters(newFilters);
    setPage(1);
  }, [filters]);

  const handleSortChange = useCallback((field: TradeSortField) => {
    setSortField(field);
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    trackEvent('TRADE_HISTORY_SORT_CHANGE', { field });
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!loading) {
      setPage(prev => prev + 1);
    }
  }, [loading]);

  // Row renderer for virtualized list
  const rowRenderer = useCallback(({ index, key, style }) => {
    const trade = sortedTrades[index];
    return (
      <div key={key} style={style}>
        <TradeWidget
          trade={trade}
          showAnalysis
          analyticsId={`trade_history_${trade.id}`}
          ariaLabel={`Trade ${index + 1} of ${sortedTrades.length}`}
        />
      </div>
    );
  }, [sortedTrades]);

  // Error fallback component
  const ErrorFallback = ({ error, resetErrorBoundary }: any) => (
    <ErrorContainer role="alert">
      <h3>Something went wrong:</h3>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </ErrorContainer>
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Container className={className}>
        <Header>
          <Title>Trade History</Title>
        </Header>

        <FiltersContainer>
          {/* Filter components would go here */}
        </FiltersContainer>

        {error && (
          <ErrorContainer role="alert">
            {error}
          </ErrorContainer>
        )}

        {loading && !trades.length ? (
          Array.from({ length: 3 }).map((_, index) => (
            <SkeletonLoader key={index} height={200} />
          ))
        ) : sortedTrades.length > 0 ? (
          <VirtualList
            width={window.innerWidth}
            height={window.innerHeight - 200}
            rowCount={sortedTrades.length}
            rowHeight={250}
            rowRenderer={rowRenderer}
            onScroll={({ clientHeight, scrollHeight, scrollTop }) => {
              if (scrollHeight - scrollTop - clientHeight < 300) {
                handleLoadMore();
              }
            }}
          />
        ) : (
          <EmptyState>
            <h3>No trades found</h3>
            <p>Try adjusting your filters to see more results</p>
          </EmptyState>
        )}
      </Container>
    </ErrorBoundary>
  );
});

TradeHistoryScreen.displayName = 'TradeHistoryScreen';

export default TradeHistoryScreen;