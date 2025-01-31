import React, { useCallback, useMemo, useRef } from 'react'; // v18.0.0
import styled from 'styled-components'; // v5.3.0
import { VictoryHeatMap, VictoryTooltip, VictoryContainer } from 'victory'; // v36.0.0

import { ChartType, ChartData, HeatmapData } from '../../types/analytics';
import { baseStyles, cardStyles, accessibilityStyles } from '../../styles/common';

// Styled components with accessibility support
const HeatmapContainer = styled.div`
  ${baseStyles}
  ${cardStyles}
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;

  &:focus-within {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.accent};
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.8);
  z-index: ${({ theme }) => theme.zIndex.overlay};
`;

const ErrorMessage = styled.div`
  ${baseStyles}
  color: ${({ theme }) => theme.colors.status.error};
  padding: ${({ theme }) => theme.spacing.md};
  text-align: center;
`;

const TooltipContainer = styled.div`
  ${baseStyles}
  padding: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface};
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  max-width: 200px;
`;

// Props interface
interface HeatmapProps {
  data: HeatmapData[];
  width: number;
  height: number;
  colorScale: string[] | ((value: number) => string);
  interactive?: boolean;
  loading?: boolean;
  error?: Error | null;
  ariaLabel?: string;
  tooltipFormat?: (cell: HeatmapData) => string;
  onCellClick?: (cell: HeatmapData) => void;
  onCellHover?: (cell: HeatmapData) => void;
}

// Normalize data for consistent visualization
const normalizeData = (rawData: HeatmapData[]): HeatmapData[] => {
  if (!rawData.length) return [];

  const values = rawData.map(d => d.intensity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  return rawData.map(cell => ({
    ...cell,
    normalizedIntensity: range === 0 ? 0.5 : (cell.intensity - min) / range
  }));
};

// Main component
export const Heatmap: React.FC<HeatmapProps> = React.memo(({
  data,
  width,
  height,
  colorScale,
  interactive = true,
  loading = false,
  error = null,
  ariaLabel = 'Heatmap visualization',
  tooltipFormat,
  onCellClick,
  onCellHover
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Memoize normalized data
  const normalizedData = useMemo(() => normalizeData(data), [data]);

  // Handle keyboard navigation
  const handleKeyPress = useCallback((event: React.KeyboardEvent, cell: HeatmapData) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCellClick?.(cell);
    }
  }, [onCellClick]);

  // Custom tooltip component
  const CustomTooltip = useCallback(({ datum }: { datum: HeatmapData }) => (
    <TooltipContainer role="tooltip">
      {tooltipFormat ? tooltipFormat(datum) : `Value: ${datum.intensity}`}
    </TooltipContainer>
  ), [tooltipFormat]);

  // Handle interaction events
  const handleInteraction = useCallback((event: React.MouseEvent | React.KeyboardEvent, cell: HeatmapData, type: 'click' | 'hover') => {
    if (!interactive) return;

    if (type === 'click' && onCellClick) {
      onCellClick(cell);
    } else if (type === 'hover' && onCellHover) {
      onCellHover(cell);
    }
  }, [interactive, onCellClick, onCellHover]);

  if (error) {
    return (
      <ErrorMessage role="alert">
        Error loading heatmap: {error.message}
      </ErrorMessage>
    );
  }

  return (
    <HeatmapContainer
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      tabIndex={interactive ? 0 : undefined}
    >
      {loading && (
        <LoadingOverlay aria-live="polite">
          Loading heatmap data...
        </LoadingOverlay>
      )}
      
      <VictoryHeatMap
        data={normalizedData}
        width={width}
        height={height}
        containerComponent={
          <VictoryContainer
            responsive={true}
            role="presentation"
          />
        }
        style={{
          data: {
            fill: ({ datum }) => {
              if (typeof colorScale === 'function') {
                return colorScale(datum.intensity);
              }
              return colorScale[Math.floor(datum.normalizedIntensity * (colorScale.length - 1))];
            },
            cursor: interactive ? 'pointer' : 'default'
          }
        }}
        events={interactive ? [
          {
            target: "data",
            eventHandlers: {
              onClick: (evt, { datum }) => {
                handleInteraction(evt as React.MouseEvent, datum, 'click');
                return [];
              },
              onMouseOver: (evt, { datum }) => {
                handleInteraction(evt as React.MouseEvent, datum, 'hover');
                return [];
              },
              onFocus: (evt, { datum }) => {
                handleInteraction(evt as React.MouseEvent, datum, 'hover');
                return [];
              },
              onKeyPress: (evt, { datum }) => {
                handleKeyPress(evt as unknown as React.KeyboardEvent, datum);
                return [];
              }
            }
          }
        ] : []}
        labelComponent={
          <VictoryTooltip
            flyoutComponent={<CustomTooltip />}
            constrainToVisibleArea
            active={false}
          />
        }
      />
    </HeatmapContainer>
  );
});

Heatmap.displayName = 'Heatmap';

export default Heatmap;