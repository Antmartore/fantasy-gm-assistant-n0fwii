/**
 * Analytics Type Definitions v1.0.0
 * Defines types and interfaces for analytics data visualization components
 * used throughout the Fantasy GM Assistant application.
 */

/**
 * Supported chart types for analytics visualization
 */
export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  PIE = 'pie',
  GAUGE = 'gauge',
  HEATMAP = 'heatmap'
}

/**
 * Base data point structure for charts
 */
export type ChartDataPoint = {
  x: number | string;
  y: number;
  label?: string;
  color?: string;
  metadata?: Record<string, unknown>;
  tooltip?: string | (() => string);
}

/**
 * Dataset structure for charts
 */
export type ChartDataset = {
  label: string;
  data: ChartDataPoint[];
  color?: string;
  borderColor?: string;
  backgroundColor?: string;
  hoverBackgroundColor?: string;
}

/**
 * Chart animation options
 */
export type ChartAnimationOptions = {
  duration?: number;
  easing?: string;
  delay?: number;
  loop?: boolean;
}

/**
 * Chart plugin options
 */
export type ChartPluginOptions = {
  legend?: {
    display?: boolean;
    position?: 'top' | 'bottom' | 'left' | 'right';
  };
  tooltip?: {
    enabled?: boolean;
    mode?: 'point' | 'nearest' | 'index' | 'dataset';
  };
}

/**
 * Chart scale options
 */
export type ChartScaleOptions = {
  x?: {
    type?: 'linear' | 'category' | 'time';
    display?: boolean;
    title?: {
      display?: boolean;
      text?: string;
    };
  };
  y?: {
    type?: 'linear' | 'category' | 'time';
    display?: boolean;
    title?: {
      display?: boolean;
      text?: string;
    };
  };
}

/**
 * Chart interaction options
 */
export type ChartInteractionOptions = {
  mode?: 'point' | 'nearest' | 'index' | 'dataset';
  intersect?: boolean;
}

/**
 * Complete chart options configuration
 */
export type ChartOptions = {
  responsive?: boolean;
  maintainAspectRatio?: boolean;
  animation?: ChartAnimationOptions;
  plugins?: ChartPluginOptions;
  scales?: ChartScaleOptions;
  interaction?: ChartInteractionOptions;
}

/**
 * Main chart data structure
 */
export interface ChartData {
  labels: string[];
  datasets: Array<ChartDataset>;
  options: ChartOptions;
}

/**
 * Supported metric units
 */
export type MetricUnit = 'percentage' | 'points' | 'seconds' | 'count' | 'currency' | 'ratio';

/**
 * Analytics metric structure
 */
export interface AnalyticsMetric {
  name: string;
  value: number;
  unit: MetricUnit;
  trend: number;
  target: number;
}

/**
 * Timeline event types
 */
export type TimelineEventType = 'trade' | 'injury' | 'performance' | 'prediction' | 'simulation';

/**
 * Timeline event data structure
 */
export type TimelineEventData = {
  title: string;
  description: string;
  severity?: 'low' | 'medium' | 'high';
  impact?: number;
  confidence?: number;
}

/**
 * Timeline event interface
 */
export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: TimelineEventType;
  data: TimelineEventData;
}

/**
 * Chart theme configuration
 */
export type ChartTheme = {
  backgroundColor: string;
  textColor: string;
  gridColor: string;
  tickColor: string;
  borderColor: string;
}

/**
 * Chart event handlers
 */
export type ChartEventHandlers = {
  onClick?: (event: MouseEvent, point: ChartDataPoint) => void;
  onHover?: (event: MouseEvent, point: ChartDataPoint) => void;
  onLeave?: (event: MouseEvent) => void;
}

/**
 * Chart accessibility options
 */
export type ChartAccessibilityOptions = {
  ariaLabel?: string;
  role?: string;
  tabIndex?: number;
  description?: string;
}

/**
 * Props interface for Chart component
 */
export interface ChartProps {
  type: ChartType;
  data: ChartData;
  height: number;
  width: number;
  interactive: boolean;
  theme: ChartTheme;
  animation: ChartAnimationOptions;
  eventHandlers: ChartEventHandlers;
  accessibility: ChartAccessibilityOptions;
}

/**
 * Gauge theme configuration
 */
export type GaugeTheme = {
  dialColor: string;
  needleColor: string;
  valueColor: string;
  labelColor: string;
}

/**
 * Gauge animation options
 */
export type GaugeAnimationOptions = {
  duration: number;
  easing: string;
}

/**
 * Gauge event handlers
 */
export type GaugeEventHandlers = {
  onValueChange?: (value: number) => void;
  onClick?: (event: MouseEvent) => void;
}

/**
 * Gauge accessibility options
 */
export type GaugeAccessibilityOptions = {
  ariaLabel?: string;
  ariaValueText?: string;
  role?: string;
}

/**
 * Props interface for Gauge component
 */
export interface GaugeProps {
  value: number;
  min: number;
  max: number;
  label: string;
  theme: GaugeTheme;
  animation: GaugeAnimationOptions;
  eventHandlers: GaugeEventHandlers;
  accessibility: GaugeAccessibilityOptions;
}