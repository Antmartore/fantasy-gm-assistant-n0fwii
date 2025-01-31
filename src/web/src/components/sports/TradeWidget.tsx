import React, { useCallback, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import { ErrorBoundary } from 'react-error-boundary';
import Card from '../base/Card';
import Button from '../base/Button';
import PlayerCard from './PlayerCard';
import { trackEvent } from '../../utils/analytics';
import { Player, PlayerStatus } from '../../types/player';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';

// Types
interface Trade {
  id: string;
  playersOffered: Player[];
  playersRequested: Player[];
  riskScore: number;
  winProbabilityChange: number;
  aiAnalysis: string;
  status: 'pending' | 'accepted' | 'rejected' | 'countered';
}

interface TradeWidgetProps {
  trade: Trade;
  loading?: boolean;
  error?: Error | null;
  onAccept?: (trade: Trade) => Promise<void>;
  onReject?: (trade: Trade) => Promise<void>;
  onCounter?: (trade: Trade) => Promise<void>;
  showAnalysis?: boolean;
  className?: string;
  analyticsId?: string;
  ariaLabel?: string;
}

// Styled Components
const StyledTradeWidget = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.md};
  width: 100%;
  max-width: 800px;
  margin: 0 auto;

  ${media.mobileS(`
    padding: ${theme.spacing.sm};
  `)}

  ${media.tablet(`
    padding: ${theme.spacing.md};
  `)}
`;

const TradeSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
`;

const TradePlayers = styled.div`
  display: grid;
  gap: ${theme.spacing.sm};

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

const AnalysisSection = styled.div`
  background-color: ${theme.colors.surface};
  padding: ${theme.spacing.md};
  border-radius: ${theme.spacing.xs};
  border-left: 4px solid ${theme.colors.accent};
`;

const RiskIndicator = styled.div<{ riskScore: number }>`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  color: ${props => {
    if (props.riskScore < 30) return theme.colors.semantic.win;
    if (props.riskScore < 70) return theme.colors.semantic.neutral;
    return theme.colors.semantic.loss;
  }};
  font-weight: ${theme.typography.fontWeight.semibold};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: ${theme.spacing.sm};
  margin-top: ${theme.spacing.md};

  ${media.mobileS(`
    flex-direction: column;
  `)}

  ${media.tablet(`
    flex-direction: row;
  `)}
`;

// Error Fallback Component
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <StyledTradeWidget>
    <div role="alert">
      <h3>Something went wrong:</h3>
      <pre>{error.message}</pre>
      <Button onClick={resetErrorBoundary} variant="secondary">
        Try again
      </Button>
    </div>
  </StyledTradeWidget>
);

// Main Component
const TradeWidget: React.FC<TradeWidgetProps> = ({
  trade,
  loading = false,
  error = null,
  onAccept,
  onReject,
  onCounter,
  showAnalysis = true,
  className,
  analyticsId = 'trade-widget',
  ariaLabel = 'Trade Proposal',
}) => {
  // Track component mount
  useEffect(() => {
    trackEvent('TRADE_ANALYSIS', {
      tradeId: trade.id,
      componentId: analyticsId,
      playersOffered: trade.playersOffered.length,
      playersRequested: trade.playersRequested.length,
    });
  }, [trade.id, analyticsId]);

  // Memoized handlers
  const handleAccept = useCallback(async () => {
    try {
      trackEvent('TRADE_ACCEPTED', { tradeId: trade.id });
      await onAccept?.(trade);
    } catch (err) {
      trackEvent('TRADE_ERROR', { 
        tradeId: trade.id, 
        error: err.message 
      });
    }
  }, [trade, onAccept]);

  const handleReject = useCallback(async () => {
    try {
      trackEvent('TRADE_REJECTED', { tradeId: trade.id });
      await onReject?.(trade);
    } catch (err) {
      trackEvent('TRADE_ERROR', { 
        tradeId: trade.id, 
        error: err.message 
      });
    }
  }, [trade, onReject]);

  const handleCounter = useCallback(async () => {
    try {
      trackEvent('TRADE_COUNTERED', { tradeId: trade.id });
      await onCounter?.(trade);
    } catch (err) {
      trackEvent('TRADE_ERROR', { 
        tradeId: trade.id, 
        error: err.message 
      });
    }
  }, [trade, onCounter]);

  // Memoized win probability indicator
  const winProbabilityIndicator = useMemo(() => {
    const change = trade.winProbabilityChange;
    const color = change > 0 ? theme.colors.semantic.win : 
                 change < 0 ? theme.colors.semantic.loss : 
                 theme.colors.semantic.neutral;
    return {
      text: `${change > 0 ? '+' : ''}${change.toFixed(1)}%`,
      color
    };
  }, [trade.winProbabilityChange]);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset error state
      }}
    >
      <StyledTradeWidget
        className={className}
        loading={loading}
        error={!!error}
        aria-label={ariaLabel}
        data-testid={analyticsId}
      >
        <TradeSection>
          <h3>Players Offered</h3>
          <TradePlayers>
            {trade.playersOffered.map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                loading={loading}
                variant="compact"
                ariaLabel={`Offered player: ${player.name}`}
              />
            ))}
          </TradePlayers>
        </TradeSection>

        <TradeSection>
          <h3>Players Requested</h3>
          <TradePlayers>
            {trade.playersRequested.map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                loading={loading}
                variant="compact"
                ariaLabel={`Requested player: ${player.name}`}
              />
            ))}
          </TradePlayers>
        </TradeSection>

        {showAnalysis && (
          <AnalysisSection role="region" aria-label="Trade Analysis">
            <RiskIndicator riskScore={trade.riskScore}>
              Risk Score: {trade.riskScore}%
            </RiskIndicator>
            <p>Win Probability Change: <span style={{ color: winProbabilityIndicator.color }}>
              {winProbabilityIndicator.text}
            </span></p>
            <p>{trade.aiAnalysis}</p>
          </AnalysisSection>
        )}

        <ButtonGroup>
          <Button
            variant="primary"
            onClick={handleAccept}
            disabled={loading || trade.status !== 'pending'}
            loading={loading}
            ariaLabel="Accept trade"
            fullWidth
          >
            Accept Trade
          </Button>
          <Button
            variant="secondary"
            onClick={handleCounter}
            disabled={loading || trade.status !== 'pending'}
            loading={loading}
            ariaLabel="Counter trade"
            fullWidth
          >
            Counter Offer
          </Button>
          <Button
            variant="tertiary"
            onClick={handleReject}
            disabled={loading || trade.status !== 'pending'}
            loading={loading}
            ariaLabel="Reject trade"
            fullWidth
          >
            Reject Trade
          </Button>
        </ButtonGroup>

        {error && (
          <div role="alert" aria-live="polite" style={{ color: theme.colors.status.error }}>
            {error.message}
          </div>
        )}
      </StyledTradeWidget>
    </ErrorBoundary>
  );
};

export default React.memo(TradeWidget);