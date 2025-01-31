import React from 'react';
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ThemeProvider } from 'styled-components';
import PlayerCard from '../../src/components/sports/PlayerCard';
import { Player, PlayerPosition, PlayerStatus, InjuryStatus } from '../../src/types/player';
import { theme } from '../../src/config/theme';

// Mock player data with comprehensive test coverage
const mockPlayer: Player = {
  id: 'test-player-1',
  name: 'Test Player',
  position: PlayerPosition.QB,
  team: 'Test Team',
  stats: {
    gamesPlayed: 10,
    points: 205.5,
    averagePoints: 20.5,
    weeklyPoints: { '1': 22.5, '2': 18.5 },
    positionStats: {
      passingYards: 2800,
      passingTouchdowns: 20,
      interceptions: 8
    },
    consistency: 0.75,
    ceiling: 32.5,
    floor: 12.5,
    trends: {
      direction: 'up',
      percentage: 0.15,
      lastGames: [18.5, 22.5, 24.5],
      description: 'Improving performance'
    }
  },
  status: PlayerStatus.ACTIVE,
  injuryStatus: null,
  projectedPoints: 21.5,
  lastUpdated: new Date('2024-01-20T12:00:00Z'),
  platform: 'ESPN',
  weather: null
};

describe('PlayerCard Component', () => {
  // Mock handlers
  const onSelect = jest.fn();
  const onRetry = jest.fn();

  // Setup and teardown
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // Wrapper component with theme provider
  const renderWithTheme = (ui: React.ReactElement) => {
    return render(
      <ThemeProvider theme={theme}>
        {ui}
      </ThemeProvider>
    );
  };

  it('should render player information correctly', async () => {
    const { getByText, getByTestId } = renderWithTheme(
      <PlayerCard
        player={mockPlayer}
        testId="player-card"
        ariaLabel="Test Player Card"
      />
    );

    // Verify core player information
    expect(getByText(mockPlayer.name)).toBeTruthy();
    expect(getByText(mockPlayer.position)).toBeTruthy();
    expect(getByTestId('player-card')).toHaveAttribute('aria-label', 'Test Player Card');

    // Verify stats display
    const statsDisplay = within(getByTestId('player-card')).getByLabelText(/Statistics for Test Player/);
    expect(statsDisplay).toBeTruthy();
    expect(statsDisplay).toHaveTextContent(mockPlayer.stats.points.toString());
    expect(statsDisplay).toHaveTextContent(mockPlayer.stats.averagePoints.toString());
  });

  it('should handle loading states correctly', async () => {
    const { getByTestId, rerender } = renderWithTheme(
      <PlayerCard
        player={mockPlayer}
        loading={true}
        testId="player-card"
      />
    );

    // Verify loading state
    expect(getByTestId('player-card')).toHaveAttribute('aria-busy', 'true');

    // Verify transition to loaded state
    rerender(
      <ThemeProvider theme={theme}>
        <PlayerCard
          player={mockPlayer}
          loading={false}
          testId="player-card"
        />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(getByTestId('player-card')).not.toHaveAttribute('aria-busy');
    });
  });

  it('should handle selection states correctly', () => {
    const { getByTestId } = renderWithTheme(
      <PlayerCard
        player={mockPlayer}
        selected={false}
        onSelect={onSelect}
        testId="player-card"
      />
    );

    const card = getByTestId('player-card');

    // Verify initial unselected state
    expect(card).toHaveAttribute('aria-selected', 'false');

    // Trigger selection
    fireEvent.press(card);
    expect(onSelect).toHaveBeenCalledWith(mockPlayer);

    // Verify keyboard interaction
    fireEvent.keyPress(card, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('should display injury status when present', () => {
    const injuredPlayer = {
      ...mockPlayer,
      injuryStatus: InjuryStatus.QUESTIONABLE
    };

    const { getByText } = renderWithTheme(
      <PlayerCard player={injuredPlayer} />
    );

    const injuryBadge = getByText(InjuryStatus.QUESTIONABLE);
    expect(injuryBadge).toBeTruthy();
    expect(injuryBadge).toHaveAttribute('role', 'status');
  });

  it('should handle variant display modes', () => {
    const { getByTestId, rerender } = renderWithTheme(
      <PlayerCard
        player={mockPlayer}
        variant="compact"
        testId="player-card"
      />
    );

    // Verify compact mode
    expect(getByTestId('player-card')).toHaveStyle({ padding: theme.spacing.sm });

    // Verify detailed mode
    rerender(
      <ThemeProvider theme={theme}>
        <PlayerCard
          player={mockPlayer}
          variant="detailed"
          testId="player-card"
        />
      </ThemeProvider>
    );

    expect(getByTestId('player-card')).toHaveStyle({ padding: theme.spacing.md });
  });

  it('should be accessible', async () => {
    const { getByTestId } = renderWithTheme(
      <PlayerCard
        player={mockPlayer}
        testId="player-card"
      />
    );

    const card = getByTestId('player-card');

    // Verify accessibility attributes
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabIndex', '0');
    expect(card).toHaveAttribute('aria-label');

    // Verify keyboard navigation
    fireEvent.keyPress(card, { key: 'Enter' });
    fireEvent.keyPress(card, { key: ' ' });
  });

  it('should handle projections display', () => {
    const { getByText } = renderWithTheme(
      <PlayerCard
        player={mockPlayer}
        showProjections={true}
        variant="detailed"
      />
    );

    // Verify projections are displayed
    expect(getByText(/Projected:/)).toBeTruthy();
    expect(getByText(mockPlayer.projectedPoints.toFixed(1))).toBeTruthy();
  });

  it('should handle responsive layout', async () => {
    const { getByTestId } = renderWithTheme(
      <PlayerCard
        player={mockPlayer}
        testId="player-card"
      />
    );

    const card = getByTestId('player-card');

    // Verify responsive styles
    expect(card).toHaveStyle({
      minWidth: '280px',
      maxWidth: '400px'
    });
  });

  it('should prevent default on keyboard events', () => {
    const preventDefault = jest.fn();
    const { getByTestId } = renderWithTheme(
      <PlayerCard
        player={mockPlayer}
        onSelect={onSelect}
        testId="player-card"
      />
    );

    const card = getByTestId('player-card');
    fireEvent.keyPress(card, {
      key: 'Enter',
      preventDefault
    });

    expect(preventDefault).toHaveBeenCalled();
  });
});