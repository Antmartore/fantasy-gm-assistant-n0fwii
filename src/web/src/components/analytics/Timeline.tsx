import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { List, AutoSizer, WindowScroller } from 'react-virtualized';
import 'intersection-observer';
import { Card } from '../base/Card';
import { TimelineEvent, TimelineEventType } from '../../types/analytics';
import { media } from '../../styles/responsive';
import { theme } from '../../config/theme';

// Constants
const VIRTUALIZATION_THRESHOLD = 50;
const INTERSECTION_OPTIONS = {
  root: null,
  rootMargin: '20px',
  threshold: 0.1,
};

// Types
interface TimelineProps {
  events: TimelineEvent[];
  height?: number;
  width?: number;
  interactive?: boolean;
  onEventClick?: (event: TimelineEvent) => void;
  realTimeUpdates?: boolean;
  virtualizeThreshold?: number;
  customEventRenderer?: (event: TimelineEvent) => React.ReactNode;
  accessibilityLabels?: Record<string, string>;
}

interface TimelineScale {
  start: Date;
  end: Date;
  steps: Date[];
  unit: 'hour' | 'day' | 'week' | 'month';
}

// Styled Components
const TimelineContainer = styled.div`
  position: relative;
  width: 100%;
  overflow-x: hidden;
  padding: ${theme.spacing.md} 0;
  touch-action: pan-x;
  -webkit-overflow-scrolling: touch;

  ${media.tablet`
    overflow-x: auto;
    padding: ${theme.spacing.lg} 0;
  `}
`;

const TimelineAxis = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background-color: ${theme.colors.text.secondary};
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
`;

const TimelineMarker = styled.div<{ left: string }>`
  position: absolute;
  left: ${props => props.left};
  top: -4px;
  width: 2px;
  height: 8px;
  background-color: ${theme.colors.text.secondary};
`;

const TimelineEventContainer = styled(Card)<{ left: string; type: TimelineEventType }>`
  position: absolute;
  left: ${props => props.left};
  transform: translateX(-50%);
  min-width: 200px;
  max-width: 300px;
  cursor: ${props => props.onClick ? 'pointer' : 'default'};
  border-left: 4px solid ${props => getEventColor(props.type)};
  transition: transform 0.2s ease-in-out;

  &:hover {
    transform: translateX(-50%) scale(1.05);
  }

  ${media.mobileS`
    min-width: 150px;
    max-width: 250px;
  `}
`;

const TimelineEventTitle = styled.h3`
  margin: 0;
  font-size: ${theme.typography.fontSize.md};
  font-weight: ${theme.typography.fontWeight.semibold};
  color: ${theme.colors.text.primary};
`;

const TimelineEventDescription = styled.p`
  margin: ${theme.spacing.xs} 0 0;
  font-size: ${theme.typography.fontSize.sm};
  color: ${theme.colors.text.secondary};
`;

const TimelineEventMetadata = styled.div`
  display: flex;
  align-items: center;
  gap: ${theme.spacing.xs};
  margin-top: ${theme.spacing.xs};
  font-size: ${theme.typography.fontSize.xs};
  color: ${theme.colors.text.secondary};
`;

// Helper Functions
const getEventColor = (type: TimelineEventType): string => {
  switch (type) {
    case 'trade':
      return theme.colors.semantic.highlight;
    case 'injury':
      return theme.colors.status.error;
    case 'performance':
      return theme.colors.semantic.win;
    case 'prediction':
      return theme.colors.accent;
    case 'simulation':
      return theme.colors.secondary;
    default:
      return theme.colors.text.secondary;
  }
};

// Custom Hooks
const useTimelineScale = (events: TimelineEvent[], width: number): TimelineScale => {
  return useMemo(() => {
    const dates = events.map(e => e.timestamp);
    const start = new Date(Math.min(...dates.map(d => d.getTime())));
    const end = new Date(Math.max(...dates.map(d => d.getTime())));
    const timeSpan = end.getTime() - start.getTime();
    
    let unit: TimelineScale['unit'] = 'hour';
    if (timeSpan > 1000 * 60 * 60 * 24 * 7) unit = 'week';
    else if (timeSpan > 1000 * 60 * 60 * 24) unit = 'day';
    else if (timeSpan > 1000 * 60 * 60) unit = 'hour';
    
    const steps = generateTimeSteps(start, end, unit);
    
    return { start, end, steps, unit };
  }, [events, width]);
};

// Main Component
export const Timeline: React.FC<TimelineProps> = React.memo(({
  events,
  height = 400,
  width,
  interactive = true,
  onEventClick,
  realTimeUpdates = false,
  virtualizeThreshold = VIRTUALIZATION_THRESHOLD,
  customEventRenderer,
  accessibilityLabels = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleEvents, setVisibleEvents] = useState<TimelineEvent[]>([]);
  const scale = useTimelineScale(events, width || 0);
  
  // Intersection Observer setup
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const eventId = entry.target.getAttribute('data-event-id');
          if (eventId) {
            setVisibleEvents(prev => 
              prev.find(e => e.id === eventId) ? prev : [...prev, events.find(e => e.id === eventId)!]
            );
          }
        }
      });
    }, INTERSECTION_OPTIONS);
    
    const elements = containerRef.current.querySelectorAll('[data-event-id]');
    elements.forEach(el => observer.observe(el));
    
    return () => observer.disconnect();
  }, [events]);

  // Real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return;
    
    const interval = setInterval(() => {
      setVisibleEvents(prev => [...prev]);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [realTimeUpdates]);

  // Event rendering
  const renderEvent = useCallback((event: TimelineEvent) => {
    if (customEventRenderer) {
      return customEventRenderer(event);
    }

    const position = calculateEventPosition(event.timestamp, scale);
    
    return (
      <TimelineEventContainer
        key={event.id}
        left={`${position}%`}
        type={event.type}
        onClick={interactive && onEventClick ? () => onEventClick(event) : undefined}
        data-event-id={event.id}
        aria-label={accessibilityLabels[event.type] || event.data.title}
        role={interactive ? 'button' : 'article'}
        tabIndex={interactive ? 0 : undefined}
      >
        <TimelineEventTitle>{event.data.title}</TimelineEventTitle>
        <TimelineEventDescription>{event.data.description}</TimelineEventDescription>
        <TimelineEventMetadata>
          <span>{new Date(event.timestamp).toLocaleString()}</span>
          {event.data.severity && (
            <span>• Severity: {event.data.severity}</span>
          )}
        </TimelineEventMetadata>
      </TimelineEventContainer>
    );
  }, [customEventRenderer, interactive, onEventClick, scale, accessibilityLabels]);

  // Virtualized rendering for large datasets
  const renderVirtualized = useCallback(() => (
    <AutoSizer>
      {({ width }) => (
        <WindowScroller>
          {({ height, isScrolling, onChildScroll, scrollTop }) => (
            <List
              autoHeight
              height={height}
              width={width}
              isScrolling={isScrolling}
              onScroll={onChildScroll}
              scrollTop={scrollTop}
              rowCount={events.length}
              rowHeight={100}
              rowRenderer={({ index, style }) => (
                <div style={style}>
                  {renderEvent(events[index])}
                </div>
              )}
            />
          )}
        </WindowScroller>
      )}
    </AutoSizer>
  ), [events, renderEvent]);

  return (
    <TimelineContainer
      ref={containerRef}
      style={{ height }}
      role="region"
      aria-label={accessibilityLabels.timeline || 'Timeline'}
    >
      <TimelineAxis>
        {scale.steps.map((step, index) => (
          <TimelineMarker
            key={index}
            left={`${calculateEventPosition(step, scale)}%`}
            aria-hidden="true"
          />
        ))}
      </TimelineAxis>
      
      {events.length > virtualizeThreshold ? (
        renderVirtualized()
      ) : (
        events.map(renderEvent)
      )}
    </TimelineContainer>
  );
});

Timeline.displayName = 'Timeline';

export default Timeline;