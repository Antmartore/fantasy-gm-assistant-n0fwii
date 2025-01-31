import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import styled from 'styled-components';
import { withErrorBoundary } from 'react-error-boundary';
import * as analytics from '@segment/analytics-react-native';

import TradeWidget from '../../components/sports/TradeWidget';
import Modal from '../../components/base/Modal';
import { proposeTrade, analyzeTrade, generateTradeVideo } from '../../store/actions/tradeActions';
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';
import { trackEvent, trackError, trackPerformance } from '../../utils/analytics';
import { CacheManager } from '../../utils/cache';

// Types
interface TradeProposalScreenProps {
  route: {
    params: {
      teamId: string;
      initialPlayers?: Player[];
      isPremiumUser: boolean;
    };
  };
}

interface TradeAnalysisState {
  loading: boolean;
  error: Error | null;
  data: TradeAnalysis | null;
  videoProgress: number;
}

// Cache initialization
const tradeCache = new CacheManager({
  prefix: 'trade_proposal_',
  defaultTTL: 15 * 60 * 1000, // 15 minutes
  enableTelemetry: true
});

// Styled components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  padding: ${theme.spacing.md};
  max-width: 1200px;
  margin: 0 auto;

  ${media.tablet(`
    padding: ${theme.spacing.lg};
  `)}
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${theme.spacing.lg};
`;

const Title = styled.h1`
  font-size: ${theme.typography.fontSize.xl};
  color: ${theme.colors.text.primary};
  margin: 0;
`;

const ErrorContainer = styled.div`
  color: ${theme.colors.status.error};
  padding: ${theme.spacing.md};
  background-color: ${theme.colors.status.error}10;
  border-radius: ${theme.spacing.sm};
  margin-bottom: ${theme.spacing.md};
`;

// Main component
const TradeProposalScreen: React.FC<TradeProposalScreenProps> = ({ route }) => {
  const { teamId, initialPlayers, isPremiumUser } = route.params;
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const performanceRef = useRef<{ startTime: number }>({ startTime: 0 });

  // State
  const [analysisState, setAnalysisState] = useState<TradeAnalysisState>({
    loading: false,
    error: null,
    data: null,
    videoProgress: 0
  });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [currentTrade, setCurrentTrade] = useState<Trade | null>(null);

  // Performance monitoring
  useEffect(() => {
    performanceRef.current.startTime = performance.now();
    trackEvent('TRADE_SCREEN_VIEW', {
      teamId,
      hasPremium: isPremiumUser
    });

    return () => {
      const duration = performance.now() - performanceRef.current.startTime;
      trackPerformance('trade_screen_duration', duration, {
        teamId,
        hasPremium: isPremiumUser
      });
    };
  }, [teamId, isPremiumUser]);

  // Memoized trade analysis handler
  const handleTradeAnalysis = useCallback(async (trade: Trade) => {
    const analysisStartTime = performance.now();

    try {
      setAnalysisState(prev => ({ ...prev, loading: true, error: null }));

      // Check cache first
      const cachedAnalysis = await tradeCache.get<TradeAnalysis>(trade.id);
      if (cachedAnalysis) {
        setAnalysisState(prev => ({
          ...prev,
          loading: false,
          data: cachedAnalysis
        }));
        return;
      }

      const analysis = await dispatch(analyzeTrade(trade));
      await tradeCache.set(trade.id, analysis);

      setAnalysisState(prev => ({
        ...prev,
        loading: false,
        data: analysis
      }));

      trackPerformance('trade_analysis_duration', performance.now() - analysisStartTime, {
        tradeId: trade.id,
        playerCount: trade.playersOffered.length + trade.playersRequested.length
      });

    } catch (error) {
      setAnalysisState(prev => ({
        ...prev,
        loading: false,
        error: error as Error
      }));
      trackError(error as Error, 'Trade Analysis Failed');
    }
  }, [dispatch]);

  // Video generation handler
  const handleVideoGeneration = useCallback(async (trade: Trade) => {
    if (!isPremiumUser) {
      navigation.navigate('PremiumUpgrade');
      return;
    }

    try {
      setAnalysisState(prev => ({ ...prev, loading: true }));
      await dispatch(generateTradeVideo(trade.id));
    } catch (error) {
      trackError(error as Error, 'Video Generation Failed');
      setAnalysisState(prev => ({
        ...prev,
        loading: false,
        error: error as Error
      }));
    }
  }, [dispatch, isPremiumUser, navigation]);

  // Trade proposal handler
  const handleTradeProposal = useCallback(async (trade: Trade) => {
    try {
      setAnalysisState(prev => ({ ...prev, loading: true }));
      await dispatch(proposeTrade(trade));
      setShowConfirmModal(true);
      trackEvent('TRADE_PROPOSED', { tradeId: trade.id });
    } catch (error) {
      trackError(error as Error, 'Trade Proposal Failed');
      setAnalysisState(prev => ({
        ...prev,
        loading: false,
        error: error as Error
      }));
    }
  }, [dispatch]);

  // Memoized modal content
  const modalContent = useMemo(() => ({
    title: 'Trade Proposed',
    message: 'Your trade proposal has been sent successfully. You will be notified when the other team responds.',
    confirmLabel: 'View Trade History',
    cancelLabel: 'Close'
  }), []);

  return (
    <Container role="main" aria-label="Trade Proposal Screen">
      <Header>
        <Title>Propose Trade</Title>
      </Header>

      {analysisState.error && (
        <ErrorContainer role="alert" aria-live="polite">
          {analysisState.error.message}
        </ErrorContainer>
      )}

      <TradeWidget
        trade={currentTrade}
        loading={analysisState.loading}
        error={analysisState.error}
        onAccept={handleTradeProposal}
        onAnalyze={handleTradeAnalysis}
        onGenerateVideo={handleVideoGeneration}
        showAnalysis={true}
        analyticsId="trade_proposal_widget"
        ariaLabel="Trade proposal details"
      />

      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title={modalContent.title}
        size="small"
        closeOnEsc={true}
        closeOnBackdrop={true}
      >
        <p>{modalContent.message}</p>
      </Modal>
    </Container>
  );
};

// Error boundary wrapper
const TradeProposalScreenWithErrorBoundary = withErrorBoundary(TradeProposalScreen, {
  fallback: <ErrorContainer>Something went wrong. Please try again later.</ErrorContainer>,
  onError: (error) => trackError(error, 'Trade Screen Error Boundary')
});

export default TradeProposalScreenWithErrorBoundary;