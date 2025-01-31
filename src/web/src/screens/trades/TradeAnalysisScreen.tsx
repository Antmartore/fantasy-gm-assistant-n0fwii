import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ErrorBoundary, useErrorBoundary } from 'react-error-boundary';

// Components
import TradeWidget from '../../components/sports/TradeWidget';

// Hooks
import useTrade from '../../hooks/useTrade';
import useAnalytics from '../../hooks/useAnalytics';
import useCache from '../../hooks/useCache';

// Theme and styles
import { theme } from '../../config/theme';
import { media } from '../../styles/responsive';

// Types
import { Trade, TradeStatus } from '../../types/trade';

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.lg};
  padding: ${theme.spacing.md};
  max-width: 1200px;
  margin: 0 auto;
  min-height: 100vh;

  ${media.tablet(`
    padding: ${theme.spacing.lg};
  `)}
`;

const VideoSection = styled.div`
  width: 100%;
  aspect-ratio: 16/9;
  background: ${theme.colors.surface};
  border-radius: ${theme.spacing.sm};
  overflow: hidden;
  position: relative;
`;

const VideoPlayer = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.background};
`;

const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <Container role="alert">
    <h2>Something went wrong analyzing this trade:</h2>
    <pre style={{ color: theme.colors.status.error }}>{error.message}</pre>
    <button onClick={resetErrorBoundary}>Try again</button>
  </Container>
);

interface TradeAnalysisScreenProps {
  className?: string;
}

const TradeAnalysisScreen: React.FC<TradeAnalysisScreenProps> = ({ className }) => {
  // Hooks
  const { tradeId } = useParams<{ tradeId: string }>();
  const { showBoundary } = useErrorBoundary();
  const { trackEvent, trackError, trackPerformance } = useAnalytics();
  const { 
    analyzeTrade, 
    generateTradeVideo, 
    activeTrade,
    loading: tradeLoading 
  } = useTrade();

  // Cache trade data
  const { 
    data: cachedTrade,
    setCache: setCachedTrade,
    loading: cacheLoading
  } = useCache<Trade>(`trade_${tradeId}`, 15 * 60 * 1000); // 15 minutes cache

  // Local state
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<Error | null>(null);

  // Load trade data on mount
  useEffect(() => {
    const loadTrade = async () => {
      if (!tradeId) return;

      const startTime = performance.now();
      try {
        // Check cache first
        if (cachedTrade) {
          trackEvent('TRADE_CACHE_HIT', { tradeId });
          return;
        }

        // Analyze trade if not cached
        const analysis = await analyzeTrade(tradeId);
        if (analysis) {
          setCachedTrade(analysis);
          trackEvent('TRADE_ANALYZED', { 
            tradeId,
            riskScore: analysis.riskScore,
            winProbabilityChange: analysis.winProbabilityChange 
          });
        }

      } catch (error) {
        trackError(error as Error, 'Trade Analysis Error');
        showBoundary(error);
      } finally {
        trackPerformance(
          'trade_analysis_load',
          performance.now() - startTime,
          { tradeId }
        );
      }
    };

    loadTrade();
  }, [tradeId, analyzeTrade, setCachedTrade, trackEvent, trackError, trackPerformance]);

  // Handle trade acceptance
  const handleTradeAccept = useCallback(async (trade: Trade) => {
    try {
      trackEvent('TRADE_ACCEPT_INITIATED', { tradeId: trade.id });
      await analyzeTrade(trade.id);
      trackEvent('TRADE_ACCEPTED', { 
        tradeId: trade.id,
        playersOffered: trade.playersOffered.length,
        playersRequested: trade.playersRequested.length
      });
    } catch (error) {
      trackError(error as Error, 'Trade Accept Error');
      throw error;
    }
  }, [analyzeTrade, trackEvent, trackError]);

  // Handle trade rejection
  const handleTradeReject = useCallback(async (trade: Trade) => {
    try {
      trackEvent('TRADE_REJECTED', { tradeId: trade.id });
      // Additional rejection logic here
    } catch (error) {
      trackError(error as Error, 'Trade Reject Error');
      throw error;
    }
  }, [trackEvent, trackError]);

  // Handle video generation
  const handleGenerateVideo = useCallback(async (trade: Trade) => {
    if (trade.status !== TradeStatus.PENDING) return;

    const startTime = performance.now();
    setVideoLoading(true);
    setVideoError(null);

    try {
      trackEvent('VIDEO_GENERATION_STARTED', { tradeId: trade.id });
      await generateTradeVideo(trade.id);
      trackEvent('VIDEO_GENERATION_COMPLETED', { tradeId: trade.id });
    } catch (error) {
      setVideoError(error as Error);
      trackError(error as Error, 'Video Generation Error');
    } finally {
      setVideoLoading(false);
      trackPerformance(
        'video_generation',
        performance.now() - startTime,
        { tradeId: trade.id }
      );
    }
  }, [generateTradeVideo, trackEvent, trackError, trackPerformance]);

  const loading = tradeLoading || cacheLoading;
  const trade = cachedTrade || activeTrade;

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Container className={className}>
        {trade && (
          <>
            <TradeWidget
              trade={trade}
              loading={loading}
              onAccept={handleTradeAccept}
              onReject={handleTradeReject}
              showAnalysis={true}
              analyticsId="trade-analysis-widget"
            />

            {trade.analysis?.videoUrl && (
              <VideoSection>
                <VideoPlayer
                  src={trade.analysis.videoUrl}
                  controls
                  autoPlay={false}
                  playsInline
                  aria-label="Trade analysis video breakdown"
                />
                {videoLoading && (
                  <LoadingOverlay>
                    Generating video analysis...
                  </LoadingOverlay>
                )}
                {videoError && (
                  <div role="alert" style={{ color: theme.colors.status.error }}>
                    Failed to load video: {videoError.message}
                  </div>
                )}
              </VideoSection>
            )}
          </>
        )}
      </Container>
    </ErrorBoundary>
  );
};

export default React.memo(TradeAnalysisScreen);