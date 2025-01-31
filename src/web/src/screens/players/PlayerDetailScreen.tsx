import React, { useEffect, useCallback, useMemo, useState } from 'react';
import styled from 'styled-components'; // v5.3.0
import { useParams } from 'react-router-dom'; // v6.0.0
import { useDispatch, useSelector } from 'react-redux'; // v8.0.0
import { debounce } from 'lodash'; // v4.17.21
import useWebSocket from 'react-use-websocket'; // v4.3.1

import { Player, PlayerPosition, InjuryStatus } from '../../types/player';
import PlayerCard from '../../components/sports/PlayerCard';
import StatDisplay from '../../components/sports/StatDisplay';
import Chart from '../../components/analytics/Chart';
import { ChartType } from '../../types/analytics';
import { media } from '../../styles/responsive';
import { theme } from '../../config/theme';

// Styled components with responsive design and accessibility
const ScreenContainer = styled.div`
  padding: ${theme.spacing.lg};
  max-width: 1200px;
  margin: 0 auto;
  min-height: 100vh;
  background: ${theme.colors.background.primary};
  color: ${theme.colors.text.primary};
  position: relative;

  ${media.mobileS(`
    padding: ${theme.spacing.md};
  `)}

  ${media.tablet(`
    padding: ${theme.spacing.lg};
  `)}

  ${media.desktop(`
    padding: ${theme.spacing.xl};
  `)}
`;

const HeaderSection = styled.div`
  margin-bottom: ${theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  background: ${theme.colors.background.secondary};
  border-radius: ${theme.spacing.lg};
  padding: ${theme.spacing.lg};
  box-shadow: ${theme.shadows.medium};
`;

const StatsSection = styled.div`
  display: grid;
  gap: ${theme.spacing.lg};
  margin-bottom: ${theme.spacing.xl};
  background: ${theme.colors.background.primary};
  border-radius: ${theme.spacing.md};
  padding: ${theme.spacing.lg};

  ${media.mobileS(`
    grid-template-columns: 1fr;
  `)}

  ${media.tablet(`
    grid-template-columns: repeat(2, 1fr);
  `)}

  ${media.desktop(`
    grid-template-columns: repeat(3, 1fr);
  `)}
`;

const ChartSection = styled.div`
  background: ${theme.colors.background.secondary};
  border-radius: ${theme.spacing.lg};
  padding: ${theme.spacing.xl};
  margin-top: ${theme.spacing.xl};
  box-shadow: ${theme.shadows.large};
  overflow: hidden;
`;

const ErrorMessage = styled.div`
  color: ${theme.colors.status.error};
  text-align: center;
  padding: ${theme.spacing.xl};
  background: ${theme.colors.background.primary};
  border-radius: ${theme.spacing.md};
  margin: ${theme.spacing.xl} 0;
`;

// Custom hook for player data management
const usePlayerData = (playerId: string) => {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useDispatch();

  // WebSocket setup for real-time updates
  const { lastMessage } = useWebSocket(`wss://api.fantasygm.com/ws/players/${playerId}`, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
  });

  // Debounced update handler
  const handleUpdate = useCallback(
    debounce((data: any) => {
      setPlayer(prevPlayer => ({
        ...prevPlayer,
        ...data,
        lastUpdated: new Date(),
      }));
    }, 250),
    []
  );

  // Effect for WebSocket updates
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        handleUpdate(data);
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    }
  }, [lastMessage, handleUpdate]);

  // Initial data fetch
  useEffect(() => {
    const fetchPlayerData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/players/${playerId}`);
        if (!response.ok) throw new Error('Failed to fetch player data');
        const data = await response.json();
        setPlayer(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerId]);

  return { player, loading, error };
};

// Main component
const PlayerDetailScreen: React.FC = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const { player, loading, error } = usePlayerData(playerId!);

  // Memoized chart data
  const performanceChartData = useMemo(() => {
    if (!player) return null;

    return {
      labels: Object.keys(player.stats.weeklyPoints),
      datasets: [{
        label: 'Weekly Performance',
        data: Object.entries(player.stats.weeklyPoints).map(([week, points]) => ({
          x: week,
          y: points,
          label: `Week ${week}: ${points} pts`,
        })),
      }],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
      },
    };
  }, [player]);

  if (error) {
    return (
      <ScreenContainer>
        <ErrorMessage role="alert">
          {error}
          <button onClick={() => window.location.reload()}>Retry</button>
        </ErrorMessage>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer role="main" aria-busy={loading}>
      {player && (
        <>
          <HeaderSection>
            <PlayerCard
              player={player}
              loading={loading}
              variant="detailed"
              showProjections
              ariaLabel={`Player details for ${player.name}`}
            />
          </HeaderSection>

          <StatsSection>
            <StatDisplay
              player={player}
              loading={loading}
              showDetails
              refreshInterval={30000}
              ariaLabel={`Statistics for ${player.name}`}
            />
          </StatsSection>

          <ChartSection>
            <Chart
              type={ChartType.LINE}
              data={performanceChartData!}
              height={400}
              width={800}
              interactive
              theme={{
                backgroundColor: theme.colors.background.primary,
                textColor: theme.colors.text.primary,
                gridColor: theme.colors.text.secondary,
                tickColor: theme.colors.text.secondary,
                borderColor: theme.colors.accent,
              }}
              animation={{
                duration: 300,
                easing: 'ease-in-out',
              }}
              accessibility={{
                ariaLabel: `Performance chart for ${player.name}`,
                role: 'img',
                description: `Weekly performance trend for ${player.name}`,
              }}
            />
          </ChartSection>
        </>
      )}
    </ScreenContainer>
  );
};

export default PlayerDetailScreen;