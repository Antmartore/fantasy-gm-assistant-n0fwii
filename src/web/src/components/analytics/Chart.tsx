import React, { useMemo, useCallback } from 'react';
import styled from 'styled-components'; // v5.3.0
import {
  VictoryChart, VictoryLine, VictoryBar, VictoryPie,
  VictoryTooltip, VictoryTheme, VictoryContainer,
  VictoryAxis, VictoryLabel
} from 'victory'; // v36.0.0

import { ChartType, ChartData, ChartProps } from '../../types/analytics';
import { baseStyles, cardStyles } from '../../styles/common';
import { media, responsiveContainer } from '../../styles/responsive';

// Styled components with accessibility features
const ChartContainer = styled.div`
  ${baseStyles}
  ${cardStyles}
  ${responsiveContainer}
  position: relative;
  min-height: 200px;

  ${media.tablet`
    min-height: 300px;
  `}

  &:focus-within {
    outline: 2px solid ${props => props.theme.colors.accent};
    outline-offset: 2px;
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
  color: ${props => props.theme.colors.text.primary};
`;

const ErrorMessage = styled.div`
  color: ${props => props.theme.colors.status.error};
  text-align: center;
  padding: ${props => props.theme.spacing.md};
`;

const AccessibleTooltip = styled(VictoryTooltip)`
  font-family: ${props => props.theme.typography.fontFamily.primary};
  font-size: ${props => props.theme.typography.fontSize.sm};
`;

// Chart theme with WCAG compliant colors
const chartTheme = {
  ...VictoryTheme.material,
  axis: {
    ...VictoryTheme.material.axis,
    style: {
      ...VictoryTheme.material.axis.style,
      grid: {
        stroke: 'rgba(0, 0, 0, 0.1)',
        strokeDasharray: '4, 4'
      },
      tickLabels: {
        fill: '#1A1A1A',
        fontSize: 12
      }
    }
  },
  line: {
    style: {
      data: {
        stroke: '#4A90E2',
        strokeWidth: 2
      }
    }
  },
  bar: {
    style: {
      data: {
        fill: '#00FF88'
      }
    }
  },
  pie: {
    colorScale: ['#4A90E2', '#00FF88', '#FFC107', '#FF4444', '#9E9E9E']
  }
};

const Chart: React.FC<ChartProps> = React.memo(({
  type,
  data,
  height = 400,
  width = 600,
  interactive = true,
  onDataPointClick,
  theme = chartTheme,
  loading = false,
  ariaLabel = 'Analytics Chart'
}) => {
  // Memoized chart configuration
  const chartConfig = useMemo(() => ({
    padding: { top: 40, right: 40, bottom: 50, left: 60 },
    domainPadding: { x: 20, y: 20 },
    animate: {
      duration: 300,
      onLoad: { duration: 200 }
    }
  }), []);

  // Event handler with debouncing
  const handleDataPointClick = useCallback((event: React.MouseEvent | React.KeyboardEvent, point: any) => {
    if (!interactive || !onDataPointClick) return;
    
    if (event.type === 'click' || (event as React.KeyboardEvent).key === 'Enter') {
      event.preventDefault();
      onDataPointClick(point);
    }
  }, [interactive, onDataPointClick]);

  // Render appropriate chart type
  const renderChart = useMemo(() => {
    if (!data || !data.datasets || data.datasets.length === 0) {
      return (
        <ErrorMessage role="alert">
          No data available for visualization
        </ErrorMessage>
      );
    }

    switch (type) {
      case ChartType.LINE:
        return (
          <VictoryLine
            data={data.datasets[0].data}
            theme={theme.line}
            labels={({ datum }) => datum.label}
            labelComponent={<AccessibleTooltip />}
            events={interactive ? [{
              target: 'data',
              eventHandlers: {
                onClick: (evt) => handleDataPointClick(evt as any, evt.datum),
                onKeyPress: (evt) => handleDataPointClick(evt as any, evt.datum)
              }
            }] : []}
          />
        );

      case ChartType.BAR:
        return (
          <VictoryBar
            data={data.datasets[0].data}
            theme={theme.bar}
            labels={({ datum }) => datum.label}
            labelComponent={<AccessibleTooltip />}
            events={interactive ? [{
              target: 'data',
              eventHandlers: {
                onClick: (evt) => handleDataPointClick(evt as any, evt.datum),
                onKeyPress: (evt) => handleDataPointClick(evt as any, evt.datum)
              }
            }] : []}
          />
        );

      case ChartType.PIE:
        return (
          <VictoryPie
            data={data.datasets[0].data}
            theme={theme.pie}
            labelComponent={<VictoryLabel style={{ fontSize: 12 }} />}
            events={interactive ? [{
              target: 'data',
              eventHandlers: {
                onClick: (evt) => handleDataPointClick(evt as any, evt.datum),
                onKeyPress: (evt) => handleDataPointClick(evt as any, evt.datum)
              }
            }] : []}
          />
        );

      default:
        return (
          <ErrorMessage role="alert">
            Unsupported chart type
          </ErrorMessage>
        );
    }
  }, [type, data, theme, interactive, handleDataPointClick]);

  return (
    <ChartContainer
      role="figure"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      {loading ? (
        <LoadingOverlay role="status" aria-live="polite">
          Loading chart data...
        </LoadingOverlay>
      ) : (
        <VictoryChart
          {...chartConfig}
          theme={theme}
          width={width}
          height={height}
          containerComponent={
            <VictoryContainer
              responsive={true}
              role="img"
              aria-label={ariaLabel}
            />
          }
        >
          <VictoryAxis
            tickFormat={data.labels}
            style={theme.axis.style}
          />
          <VictoryAxis
            dependentAxis
            style={theme.axis.style}
          />
          {renderChart}
        </VictoryChart>
      )}
    </ChartContainer>
  );
});

Chart.displayName = 'Chart';

export default Chart;