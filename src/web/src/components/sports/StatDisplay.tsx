import React, { useMemo, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Player, PlayerStats, PlayerPosition, InjuryStatus } from '../../types/player';
import Card from '../base/Card';
import { formatPlayerStats } from '../../utils/format';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';

// Props interface with comprehensive type safety
interface StatDisplayProps {
  player: Player;
  loading?: boolean;
  showDetails?: boolean;
  onStatClick?: (statKey: string) => void;
  className?: string;
  refreshInterval?: number;
  ariaLabel?: string;
}

// Styled components with responsive design and accessibility
const StyledStatDisplay = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};
  width: 100%;
  min-height: 200px;

  ${media.mobileS(`
    grid-template-columns: repeat(2, 1fr);
  `)}

  ${media.tablet(`
    grid-template-columns: repeat(3, 1fr);
  `)}

  ${media.desktop(`
    grid-template-columns: repeat(4, 1fr);
  `)}
`;

const StatItem = styled(Card)<{ isNegative?: boolean }>`
  text-align: center;
  padding: ${theme.spacing.sm};
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    transform: translateY(-2px);
  }

  ${props => props.isNegative && `
    color: ${theme.colors.status.error};
  `}
`;

const StatLabel = styled.div`
  font-size: ${theme.typography.fontSize.sm};
  color: ${theme.colors.text.secondary};
  margin-bottom: ${theme.spacing.xs};
`;

const StatValue = styled.div`
  font-size: ${theme.typography.fontSize.lg};
  font-weight: ${theme.typography.fontWeight.bold};
  color: ${theme.colors.text.primary};
`;

const TrendIndicator = styled.span<{ direction: 'up' | 'down' | 'stable' }>`
  color: ${props => {
    switch (props.direction) {
      case 'up':
        return theme.colors.semantic.win;
      case 'down':
        return theme.colors.semantic.loss;
      default:
        return theme.colors.semantic.neutral;
    }
  }};
  margin-left: ${theme.spacing.xs};
`;

const InjuryBadge = styled.div`
  background-color: ${theme.colors.status.error};
  color: ${theme.colors.background};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: ${theme.spacing.xs};
  font-size: ${theme.typography.fontSize.sm};
  margin-bottom: ${theme.spacing.sm};
`;

const StatDisplay: React.FC<StatDisplayProps> = React.memo(({
  player,
  loading = false,
  showDetails = false,
  onStatClick,
  className,
  refreshInterval = 0,
  ariaLabel = 'Player Statistics Display'
}) => {
  // Memoize formatted stats to prevent unnecessary recalculations
  const formattedStats = useMemo(() => {
    return formatPlayerStats(player.stats, player.position, {
      includeLabels: true,
      accessibilityMode: true
    });
  }, [player.stats, player.position]);

  // Handle automatic refresh interval
  useEffect(() => {
    if (refreshInterval > 0) {
      const timer = setInterval(() => {
        // Trigger refresh callback if provided
        onStatClick?.('refresh');
      }, refreshInterval);

      return () => clearInterval(timer);
    }
  }, [refreshInterval, onStatClick]);

  // Handle stat item click with keyboard support
  const handleStatClick = useCallback((statKey: string) => {
    return (e: React.MouseEvent | React.KeyboardEvent) => {
      if (
        e.type === 'click' ||
        (e.type === 'keydown' && (e as React.KeyboardEvent).key === 'Enter')
      ) {
        onStatClick?.(statKey);
      }
    };
  }, [onStatClick]);

  // Render loading state
  if (loading) {
    return (
      <StyledStatDisplay
        className={className}
        role="region"
        aria-label={`${ariaLabel} Loading`}
        aria-busy="true"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <StatItem key={index} loading />
        ))}
      </StyledStatDisplay>
    );
  }

  // Core stats to always display
  const coreStats = [
    { key: 'points', label: 'Points' },
    { key: 'average', label: 'Avg Points' },
    { key: 'consistency', label: 'Consistency' },
    { key: 'trend', label: 'Trend' }
  ];

  // Additional stats for detailed view
  const detailedStats = [
    { key: 'ceiling', label: 'Ceiling' },
    { key: 'floor', label: 'Floor' },
    ...Object.entries(player.stats.positionStats).map(([key, _]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1)
    }))
  ];

  return (
    <StyledStatDisplay
      className={className}
      role="region"
      aria-label={ariaLabel}
    >
      {/* Injury Status Badge */}
      {player.injuryStatus && (
        <InjuryBadge
          role="alert"
          aria-live="polite"
        >
          {player.injuryStatus}
        </InjuryBadge>
      )}

      {/* Core Stats */}
      {coreStats.map(({ key, label }) => (
        <StatItem
          key={key}
          onClick={handleStatClick(key)}
          onKeyDown={handleStatClick(key)}
          tabIndex={0}
          role="button"
          aria-label={`${label}: ${formattedStats[key]}`}
        >
          <StatLabel>{label}</StatLabel>
          <StatValue>
            {formattedStats[key]}
            {key === 'trend' && (
              <TrendIndicator direction={player.stats.trends.direction}>
                {player.stats.trends.direction === 'up' ? '↑' :
                  player.stats.trends.direction === 'down' ? '↓' : '→'}
              </TrendIndicator>
            )}
          </StatValue>
        </StatItem>
      ))}

      {/* Detailed Stats */}
      {showDetails && detailedStats.map(({ key, label }) => (
        <StatItem
          key={key}
          onClick={handleStatClick(key)}
          onKeyDown={handleStatClick(key)}
          tabIndex={0}
          role="button"
          aria-label={`${label}: ${formattedStats[key]}`}
          isNegative={key === 'floor'}
        >
          <StatLabel>{label}</StatLabel>
          <StatValue>{formattedStats[key]}</StatValue>
        </StatItem>
      ))}
    </StyledStatDisplay>
  );
});

StatDisplay.displayName = 'StatDisplay';

export default StatDisplay;