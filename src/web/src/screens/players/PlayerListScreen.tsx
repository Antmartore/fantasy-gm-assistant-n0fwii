import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';
import { debounce } from 'lodash';
import { useVirtual } from 'react-virtual';
import { useWebSocket } from 'react-use-websocket';

import PlayerCard from '../../components/sports/PlayerCard';
import SearchBar from '../../components/navigation/SearchBar';
import { fetchPlayers, selectPlayer, updatePlayerStats } from '../../store/actions/playerActions';
import { theme } from '../../config/theme';
import { media, responsiveContainer, responsiveGrid } from '../../styles/responsive';
import { Player, PlayerPosition, PlayerSearchParams } from '../../types/player';
import { FantasyPlatform } from '../../types/team';
import { RootState } from '../../store/types';
import { API_CONFIG, RATE_LIMITS } from '../../config/constants';

// Constants
const ITEMS_PER_PAGE = 20;
const SCROLL_THRESHOLD = 0.8;
const DEBOUNCE_DELAY = 300;
const WS_RECONNECT_ATTEMPTS = 3;

// Styled Components
const Container = styled.div`
  ${responsiveContainer}
  min-height: 100vh;
  padding-top: ${theme.spacing.lg};
`;

const PlayerGrid = styled.div`
  ${responsiveGrid}
  margin-top: ${theme.spacing.lg};
  min-height: 400px;
`;

const LoadingOverlay = styled.div<{ visible: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: ${props => props.visible ? 'flex' : 'none'};
  justify-content: center;
  align-items: center;
  z-index: ${theme.zIndex.overlay};
`;

const NoResults = styled.div`
  text-align: center;
  padding: ${theme.spacing.xl};
  color: ${theme.colors.text.secondary};
  font-size: ${theme.typography.fontSize.lg};
`;

const ErrorMessage = styled.div`
  background-color: ${theme.colors.status.error}20;
  color: ${theme.colors.status.error};
  padding: ${theme.spacing.md};
  margin: ${theme.spacing.md} 0;
  border-radius: ${theme.spacing.xs};
  text-align: center;
`;

// Component Props
interface PlayerListScreenProps {
  platform?: FantasyPlatform;
  initialFilters?: Partial<PlayerSearchParams>;
  onPlayerSelect?: (player: Player) => void;
  className?: string;
}

const PlayerListScreen: React.FC<PlayerListScreenProps> = ({
  platform = FantasyPlatform.ESPN,
  initialFilters = {},
  onPlayerSelect,
  className
}) => {
  // Redux
  const dispatch = useDispatch();
  const { items: players, loading, error } = useSelector((state: RootState) => state.players);

  // State
  const [searchParams, setSearchParams] = useState<PlayerSearchParams>({
    query: '',
    positions: [],
    statuses: [],
    injuryStatuses: [],
    teams: [],
    minPoints: 0,
    maxPoints: 1000,
    platforms: [platform],
    weatherImpacted: false,
    ...initialFilters
  });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // WebSocket setup for real-time updates
  const { sendMessage, lastMessage, readyState } = useWebSocket(
    `${API_CONFIG.BASE_URL.replace('http', 'ws')}/ws/players`,
    {
      reconnectAttempts: WS_RECONNECT_ATTEMPTS,
      reconnectInterval: 3000,
      shouldReconnect: () => true
    }
  );

  // Virtual list setup
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtual({
    size: players.length,
    parentRef,
    estimateSize: useCallback(() => 200, []),
    overscan: 5
  });

  // Memoized search handler
  const debouncedSearch = useMemo(
    () => debounce((params: PlayerSearchParams) => {
      dispatch(fetchPlayers(params));
    }, DEBOUNCE_DELAY),
    [dispatch]
  );

  // Search handler
  const handleSearch = useCallback((query: string) => {
    setSearchParams(prev => ({ ...prev, query }));
    setPage(1);
    setHasMore(true);
    debouncedSearch({ ...searchParams, query });
  }, [searchParams, debouncedSearch]);

  // Filter handler
  const handleFilterChange = useCallback((filters: Partial<PlayerSearchParams>) => {
    setSearchParams(prev => ({ ...prev, ...filters }));
    setPage(1);
    setHasMore(true);
    debouncedSearch({ ...searchParams, ...filters });
  }, [searchParams, debouncedSearch]);

  // Player selection handler
  const handlePlayerSelect = useCallback((player: Player) => {
    dispatch(selectPlayer(player.id, platform));
    onPlayerSelect?.(player);
  }, [dispatch, platform, onPlayerSelect]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!parentRef.current || !hasMore || loading) return;

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    if (scrollPercentage > SCROLL_THRESHOLD) {
      setPage(prev => prev + 1);
    }
  }, [hasMore, loading]);

  // WebSocket message handler
  useEffect(() => {
    if (lastMessage) {
      try {
        const updatedPlayer = JSON.parse(lastMessage.data) as Player;
        dispatch(updatePlayerStats(updatedPlayer.id, platform));
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    }
  }, [lastMessage, dispatch, platform]);

  // Initial load and pagination
  useEffect(() => {
    dispatch(fetchPlayers({
      ...searchParams,
      page,
      limit: ITEMS_PER_PAGE
    }));
  }, [dispatch, searchParams, page]);

  // Cleanup
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  return (
    <Container className={className} role="main" aria-label="Player List">
      <SearchBar
        onSearch={handleSearch}
        placeholder="Search players by name, team, or position..."
        initialValue={searchParams.query}
        platform={platform}
        weatherImpact={searchParams.weatherImpacted}
        ariaLabel="Search players"
      />

      {error && (
        <ErrorMessage role="alert">
          {error}
        </ErrorMessage>
      )}

      <PlayerGrid
        ref={parentRef}
        onScroll={handleScroll}
        role="grid"
        aria-busy={loading}
        aria-label="Player grid"
      >
        {players.length === 0 && !loading ? (
          <NoResults>No players found matching your criteria</NoResults>
        ) : (
          rowVirtualizer.virtualItems.map(virtualRow => {
            const player = players[virtualRow.index];
            return (
              <PlayerCard
                key={player.id}
                player={player}
                onSelect={() => handlePlayerSelect(player)}
                loading={loading}
                showProjections
                variant="detailed"
                testId={`player-card-${player.id}`}
              />
            );
          })
        )}
      </PlayerGrid>

      <LoadingOverlay 
        visible={loading}
        role="progressbar"
        aria-label="Loading players"
      >
        Loading...
      </LoadingOverlay>
    </Container>
  );
};

export default React.memo(PlayerListScreen);