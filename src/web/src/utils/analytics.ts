import { datadogLogs } from '@datadog/browser-logs'; // v4.0.0
import { datadogRum } from '@datadog/browser-rum';   // v4.0.0
import { ChartType, AnalyticsMetric } from '../types/analytics';

/**
 * Analytics event name constants
 */
export const ANALYTICS_EVENTS = {
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  LINEUP_CHANGE: 'lineup_change',
  TRADE_ANALYSIS: 'trade_analysis',
  SIMULATION_RUN: 'simulation_run',
  PREMIUM_CONVERSION: 'premium_conversion',
} as const;

/**
 * Analytics property name constants
 */
export const ANALYTICS_PROPERTIES = {
  USER_ID: 'user_id',
  TIMESTAMP: 'timestamp',
  PLATFORM: 'platform',
  SCREEN_NAME: 'screen_name',
  ERROR_TYPE: 'error_type',
  ERROR_MESSAGE: 'error_message',
} as const;

/**
 * Configuration interface for analytics initialization
 */
interface AnalyticsConfig {
  applicationId: string;
  clientToken: string;
  site: string;
  service: string;
  env: 'production' | 'staging' | 'development';
  sampleRate: number;
  trackInteractions: boolean;
  defaultPrivacyLevel?: 'mask-user-input' | 'allow' | 'mask';
}

/**
 * Offline event queue for storing events when offline
 */
const offlineEventQueue: Array<{
  type: string;
  data: Record<string, any>;
  timestamp: number;
}> = [];

/**
 * Performance observer for resource timing
 */
let performanceObserver: PerformanceObserver | null = null;

/**
 * Initializes DataDog RUM and Logs for analytics tracking
 */
export const initializeAnalytics = (config: AnalyticsConfig): void => {
  try {
    // Initialize RUM
    datadogRum.init({
      applicationId: config.applicationId,
      clientToken: config.clientToken,
      site: config.site,
      service: config.service,
      env: config.env,
      sampleRate: config.sampleRate,
      trackInteractions: config.trackInteractions,
      defaultPrivacyLevel: config.defaultPrivacyLevel || 'mask-user-input',
      trackResources: true,
      trackLongTasks: true,
      trackUserInteractions: true,
      trackViewsManually: false,
      trackSessionAcrossSubdomains: true,
    });

    // Initialize Logs
    datadogLogs.init({
      clientToken: config.clientToken,
      site: config.site,
      forwardErrorsToLogs: true,
      sampleRate: config.sampleRate,
      service: config.service,
      env: config.env,
    });

    // Set up performance observer
    if (typeof PerformanceObserver !== 'undefined') {
      performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          datadogRum.addTiming(entry.name, entry.duration);
        });
      });

      performanceObserver.observe({
        entryTypes: ['resource', 'navigation', 'longtask'],
      });
    }

    // Set up offline event handling
    window.addEventListener('online', flushOfflineEvents);
    window.addEventListener('offline', () => {
      console.log('Application is offline - buffering events');
    });

    // Set up global error handling
    window.addEventListener('unhandledrejection', (event) => {
      trackError(event.reason, 'Unhandled Promise Rejection');
    });

  } catch (error) {
    console.error('Failed to initialize analytics:', error);
  }
};

/**
 * Tracks user and system events with enhanced property enrichment
 */
export const trackEvent = (
  eventName: keyof typeof ANALYTICS_EVENTS,
  properties: Record<string, any> = {}
): void => {
  try {
    const enrichedProperties = {
      ...properties,
      timestamp: Date.now(),
      platform: getPlatformInfo(),
      connection: getConnectionInfo(),
      ...getUserContext(),
    };

    if (navigator.onLine) {
      datadogRum.addAction(eventName, enrichedProperties);
    } else {
      offlineEventQueue.push({
        type: eventName,
        data: enrichedProperties,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    console.error('Failed to track event:', error);
  }
};

/**
 * Tracks application errors with enhanced context capture
 */
export const trackError = (error: Error, context: string): void => {
  try {
    const errorContext = {
      error_type: error.name,
      error_message: error.message,
      error_stack: error.stack,
      context,
      ...getUserContext(),
      timestamp: Date.now(),
    };

    datadogLogs.logger.error('Application Error', errorContext);
    datadogRum.addError(error, errorContext);
  } catch (e) {
    console.error('Failed to track error:', e);
  }
};

/**
 * Tracks detailed performance metrics with resource timing
 */
export const trackPerformance = (
  metricName: string,
  duration: number,
  metadata: Record<string, any> = {}
): void => {
  try {
    const performanceData = {
      ...metadata,
      duration,
      timestamp: Date.now(),
      cpu: getCPUInfo(),
      memory: getMemoryInfo(),
      ...getResourceTiming(),
    };

    datadogRum.addTiming(metricName, duration);
    datadogRum.addAction('performance_metric', performanceData);
  } catch (error) {
    console.error('Failed to track performance:', error);
  }
};

/**
 * Tracks screen views with enhanced navigation timing
 */
export const trackScreenView = (
  screenName: string,
  properties: Record<string, any> = {}
): void => {
  try {
    const viewProperties = {
      ...properties,
      screen_name: screenName,
      view_timestamp: Date.now(),
      navigation_type: getNavigationType(),
      ...getUserContext(),
    };

    datadogRum.startView(screenName, viewProperties);
  } catch (error) {
    console.error('Failed to track screen view:', error);
  }
};

/**
 * Helper function to get platform information
 */
const getPlatformInfo = (): Record<string, any> => {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenSize: `${window.screen.width}x${window.screen.height}`,
  };
};

/**
 * Helper function to get connection information
 */
const getConnectionInfo = (): Record<string, any> => {
  const connection = (navigator as any).connection;
  return connection ? {
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
  } : {};
};

/**
 * Helper function to get CPU information
 */
const getCPUInfo = (): Record<string, any> => {
  return {
    cores: navigator.hardwareConcurrency || 'unknown',
  };
};

/**
 * Helper function to get memory information
 */
const getMemoryInfo = (): Record<string, any> => {
  const memory = (performance as any).memory;
  return memory ? {
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    totalJSHeapSize: memory.totalJSHeapSize,
    usedJSHeapSize: memory.usedJSHeapSize,
  } : {};
};

/**
 * Helper function to get resource timing data
 */
const getResourceTiming = (): Record<string, any> => {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  return navigation ? {
    domComplete: navigation.domComplete,
    domInteractive: navigation.domInteractive,
    loadEventEnd: navigation.loadEventEnd,
    responseEnd: navigation.responseEnd,
    responseStart: navigation.responseStart,
  } : {};
};

/**
 * Helper function to get navigation type
 */
const getNavigationType = (): string => {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  return navigation ? navigation.type : 'unknown';
};

/**
 * Helper function to get user context
 */
const getUserContext = (): Record<string, any> => {
  try {
    return {
      session_id: datadogRum.getInternalContext().session_id || 'unknown',
      user_id: datadogRum.getInternalContext().user_id || 'unknown',
    };
  } catch {
    return {};
  }
};

/**
 * Helper function to flush offline events
 */
const flushOfflineEvents = async (): Promise<void> => {
  while (offlineEventQueue.length > 0) {
    const event = offlineEventQueue.shift();
    if (event) {
      await datadogRum.addAction(event.type, event.data);
    }
  }
};