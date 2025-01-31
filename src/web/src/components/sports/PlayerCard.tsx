import React, { useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Player, InjuryStatus } from '../../types/player';
import Card from '../base/Card';
import StatDisplay from './StatDisplay';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';

// Props interface with comprehensive type safety
interface PlayerCardProps {
  player: Player;
  selected?: boolean;
  loading?: boolean;
  showProjections?: boolean;
  variant?: 'compact' | 'detailed';
  onSelect?: (player: Player) => void;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

// Styled components with responsive design and accessibility
const StyledPlayerCard = styled(Card)<{ selected?: boolean }>`
  cursor: pointer;
  min-width: 280px;
  max-width: 400px;
  position: relative;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  touch-action: manipulation;

  ${media.mobileS(`
    padding: ${theme.spacing.sm};
  `)}

  ${media.tablet(`
    padding: ${theme.spacing.md};
  `)}

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${theme.shadows?.medium || '0 4px 8px rgba(0, 0, 0, 0.12)'};
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`;

const PlayerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${theme.spacing.md};
  gap: ${theme.spacing.sm};
`;

const PlayerName = styled.h3`
  font-size: ${theme.typography.fontSize.lg};
  font-weight: ${theme.typography.fontWeight.bold};
  color: ${theme.colors.text.primary};
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PlayerPosition = styled.div`
  font-size: ${theme.typography.fontSize.sm};
  color: ${theme.colors.text.secondary};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: ${theme.spacing.xs};
  background: ${theme.colors.background.secondary};
  min-width: 40px;
  text-align: center;
`;

const InjuryBadge = styled.div<{ status: InjuryStatus }>`
  position: absolute;
  top: ${theme.spacing.sm};
  right: ${theme.spacing.sm};
  padding: ${theme.spacing.xs} ${theme.spacing.sm};
  border-radius: ${theme.spacing.xs};
  font-size: ${theme.typography.fontSize.sm};
  font-weight: ${theme.typography.fontWeight.bold};
  background: ${props => getInjuryColor(props.status)};
  color: ${theme.colors.background};
  z-index: 1;
`;

// Helper function to get WCAG compliant injury status colors
const getInjuryColor = (status: InjuryStatus): string => {
  switch (status) {
    case InjuryStatus.OUT:
      return theme.colors.status.error;
    case InjuryStatus.DOUBTFUL:
      return theme.colors.status.warning;
    case InjuryStatus.QUESTIONABLE:
      return theme.colors.semantic.highlight;
    case InjuryStatus.PROBABLE:
      return theme.colors.status.info;
    default:
      return theme.colors.semantic.neutral;
  }
};

const PlayerCard: React.FC<PlayerCardProps> = React.memo(({
  player,
  selected = false,
  loading = false,
  showProjections = false,
  variant = 'detailed',
  onSelect,
  className,
  testId = 'player-card',
  ariaLabel,
}) => {
  // Memoize handler functions
  const handleClick = useCallback(() => {
    onSelect?.(player);
  }, [player, onSelect]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(player);
    }
  }, [player, onSelect]);

  // Memoize accessibility label
  const cardAriaLabel = useMemo(() => {
    return ariaLabel || `${player.name}, ${player.position}${player.injuryStatus ? `, ${player.injuryStatus}` : ''}`;
  }, [player, ariaLabel]);

  return (
    <StyledPlayerCard
      selected={selected}
      loading={loading}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={className}
      data-testid={testId}
      aria-label={cardAriaLabel}
      aria-selected={selected}
      tabIndex={0}
      role="button"
      elevation={selected ? 2 : 1}
    >
      <PlayerHeader>
        <PlayerName>{player.name}</PlayerName>
        <PlayerPosition>{player.position}</PlayerPosition>
      </PlayerHeader>

      {player.injuryStatus && (
        <InjuryBadge 
          status={player.injuryStatus}
          role="status"
          aria-live="polite"
        >
          {player.injuryStatus}
        </InjuryBadge>
      )}

      <StatDisplay
        player={player}
        loading={loading}
        showDetails={variant === 'detailed'}
        ariaLabel={`Statistics for ${player.name}`}
      />

      {showProjections && variant === 'detailed' && (
        <div aria-label={`Projected points: ${player.projectedPoints}`}>
          Projected: {player.projectedPoints.toFixed(1)}
        </div>
      )}
    </StyledPlayerCard>
  );
});

PlayerCard.displayName = 'PlayerCard';

export default PlayerCard;