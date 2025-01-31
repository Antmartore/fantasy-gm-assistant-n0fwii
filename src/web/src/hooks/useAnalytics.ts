import { useCallback, useEffect } from 'react'; // v18.0.0
import {
  trackEvent,
  trackError,
  trackPerformance,
  trackScreenView,
  ANALYTICS_EVENTS,
  ANALYTICS_PROPERTIES
} from '../utils/analytics';
import type { AnalyticsMetric } from '../types/analytics';

/**
 * Interface for the return type of useAnalytics hook
 */
interface UseAnalyticsReturn {
  trackEvent: (
    eventName: keyof typeof ANALYTICS_EVENTS,
    properties?: Record<string, any>,
    options?: {
      batch?: boolean;
      priority?: 'high' | 'normal' | 'low';
    }
  ) => void;
  trackError: (
    error: Error,
    context?: string,
    metadata?: Record<string, any>
  ) => void;
  trackPerformance: (
    metricName: string,
    duration: number,
    metadata?: Record<string, any>,
    options?: {
      threshold?: number;
    }
  ) => void;
  trackScreenView: (
    screenName: string,
    properties?: Record<string, any>,
    journey?: string
  ) => void;
}

/**
 * Custom hook that provides comprehensive analytics tracking functionality
 * with support for offline tracking, event batching, and privacy compliance.
 */
export const useAnalytics = (): UseAnalyticsReturn => {
  // Track initial mount for performance baseline
  useEffect(() => {
    const mountTime = performance.now();
    return () => {
      const unmountTime = performance.now();
      trackPerformance(
        'component_lifecycle',
        unmountTime - mountTime,
        { type: 'mount_to_unmount' }
      );
    };
  }, []);

  /**
   * Memoized event tracking with batching support
   */
  const memoizedTrackEvent = useCallback(
    (
      eventName: keyof typeof ANALYTICS_EVENTS,
      properties: Record<string, any> = {},
      options: {
        batch?: boolean;
        priority?: 'high' | 'normal' | 'low';
      } = {}
    ) => {
      try {
        const enrichedProperties = {
          ...properties,
          timestamp: Date.now(),
          priority: options.priority || 'normal',
          batch: options.batch || false
        };

        trackEvent(eventName, enrichedProperties);
      } catch (error) {
        console.error('Failed to track event:', error);
        trackError(error as Error, 'Event Tracking Error');
      }
    },
    []
  );

  /**
   * Memoized error tracking with enhanced context
   */
  const memoizedTrackError = useCallback(
    (error: Error, context?: string, metadata: Record<string, any> = {}) => {
      try {
        const enrichedMetadata = {
          ...metadata,
          timestamp: Date.now(),
          environment: process.env.NODE_ENV,
          componentStack: new Error().stack
        };

        trackError(error, context || 'Unknown Context', enrichedMetadata);
      } catch (err) {
        console.error('Failed to track error:', err);
      }
    },
    []
  );

  /**
   * Memoized performance tracking with threshold monitoring
   */
  const memoizedTrackPerformance = useCallback(
    (
      metricName: string,
      duration: number,
      metadata: Record<string, any> = {},
      options: { threshold?: number } = {}
    ) => {
      try {
        const { threshold = 0 } = options;
        const enrichedMetadata = {
          ...metadata,
          timestamp: Date.now(),
          threshold,
          exceededThreshold: threshold > 0 && duration > threshold
        };

        trackPerformance(metricName, duration, enrichedMetadata);

        // Track threshold violations separately
        if (threshold > 0 && duration > threshold) {
          trackEvent(ANALYTICS_EVENTS.PERFORMANCE_THRESHOLD_EXCEEDED, {
            metricName,
            duration,
            threshold,
            overage: duration - threshold
          });
        }
      } catch (error) {
        console.error('Failed to track performance:', error);
        trackError(error as Error, 'Performance Tracking Error');
      }
    },
    []
  );

  /**
   * Memoized screen view tracking with journey analysis
   */
  const memoizedTrackScreenView = useCallback(
    (screenName: string, properties: Record<string, any> = {}, journey?: string) => {
      try {
        const enrichedProperties = {
          ...properties,
          [ANALYTICS_PROPERTIES.SCREEN_NAME]: screenName,
          timestamp: Date.now(),
          journey: journey || 'default',
          previousScreen: window.history.state?.previousScreen || null
        };

        trackScreenView(screenName, enrichedProperties);

        // Update history state for journey tracking
        const currentState = window.history.state || {};
        window.history.replaceState(
          {
            ...currentState,
            previousScreen: screenName
          },
          ''
        );
      } catch (error) {
        console.error('Failed to track screen view:', error);
        trackError(error as Error, 'Screen View Tracking Error');
      }
    },
    []
  );

  return {
    trackEvent: memoizedTrackEvent,
    trackError: memoizedTrackError,
    trackPerformance: memoizedTrackPerformance,
    trackScreenView: memoizedTrackScreenView
  };
};