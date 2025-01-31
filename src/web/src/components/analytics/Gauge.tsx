import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import * as d3 from 'd3'; // v7.0.0
import { theme } from '../../config/theme';
import Card from '../base/Card';
import type { GaugeProps } from '../../types/analytics';

// Enhanced internal configuration type
interface GaugeConfig {
  startAngle: number;
  endAngle: number;
  radius: number;
  thickness: number;
  confidenceInterval?: {
    lower: number;
    upper: number;
  };
  animationDuration: number;
}

// Styled components with comprehensive styling
const GaugeContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;
`;

const GaugeSVG = styled.svg`
  overflow: visible;
  transform-origin: center;
  will-change: transform;
`;

const GaugeBackground = styled.path<{ thickness: number }>`
  fill: none;
  stroke: ${theme.colors.background};
  stroke-width: ${props => props.thickness}px;
  opacity: 0.2;
`;

const GaugeForeground = styled.path<{ thickness: number }>`
  fill: none;
  stroke: ${theme.colors.primary};
  stroke-width: ${props => props.thickness}px;
  transition: all 0.3s ease-in-out;
  stroke-linecap: round;
`;

const GaugeConfidenceInterval = styled.path<{ thickness: number }>`
  fill: none;
  stroke: ${theme.colors.secondary};
  stroke-width: ${props => props.thickness * 0.5}px;
  opacity: 0.3;
`;

const GaugeLabel = styled.div`
  position: absolute;
  bottom: ${theme.spacing.md};
  text-align: center;
  font-size: ${theme.typography.fontSize.sm};
  color: ${theme.colors.text.primary};
  font-weight: ${theme.typography.fontWeight.medium};
`;

const GaugeValue = styled.div`
  position: absolute;
  font-size: ${theme.typography.fontSize.xl};
  font-weight: ${theme.typography.fontWeight.bold};
  color: ${theme.colors.primary};
  transition: color 0.3s ease-in-out;
`;

// Helper function to calculate gauge arcs
const calculateGaugeArc = (
  value: number,
  min: number,
  max: number,
  config: GaugeConfig
): { mainArc: string; confidenceArc?: string } => {
  const percentage = Math.min(Math.max((value - min) / (max - min), 0), 1);
  
  const arc = d3.arc()
    .innerRadius(config.radius - config.thickness)
    .outerRadius(config.radius)
    .startAngle(config.startAngle)
    .cornerRadius(config.thickness / 2);

  const mainArc = arc({
    endAngle: config.startAngle + (config.endAngle - config.startAngle) * percentage
  } as any);

  let confidenceArc: string | undefined;
  if (config.confidenceInterval) {
    const lowerPercentage = (config.confidenceInterval.lower - min) / (max - min);
    const upperPercentage = (config.confidenceInterval.upper - min) / (max - min);
    
    confidenceArc = arc({
      startAngle: config.startAngle + (config.endAngle - config.startAngle) * lowerPercentage,
      endAngle: config.startAngle + (config.endAngle - config.startAngle) * upperPercentage
    } as any);
  }

  return { mainArc: mainArc!, confidenceArc };
};

// Enhanced Gauge component with memo optimization
export const Gauge = React.memo<GaugeProps>(({
  value,
  min,
  max,
  label,
  theme: gaugeTheme,
  animation = { duration: 750, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  eventHandlers = {},
  accessibility = {}
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const prevValue = useRef(value);

  // Configure gauge dimensions and angles
  const config = useMemo<GaugeConfig>(() => ({
    startAngle: -Math.PI * 0.75,
    endAngle: Math.PI * 0.75,
    radius: 80,
    thickness: 12,
    confidenceInterval: {
      lower: value * 0.9,
      upper: value * 1.1
    },
    animationDuration: animation.duration
  }), [value, animation.duration]);

  // Calculate gauge arcs with confidence intervals
  const { mainArc, confidenceArc } = useMemo(() => 
    calculateGaugeArc(value, min, max, config),
    [value, min, max, config]
  );

  // Handle value animation
  useEffect(() => {
    if (!svgRef.current || value === prevValue.current) return;

    const foregroundPath = d3.select(svgRef.current).select('.gauge-foreground');
    const transition = d3.transition()
      .duration(config.animationDuration)
      .ease(d3.easeCubicInOut);

    const newArc = calculateGaugeArc(value, min, max, config).mainArc;
    
    foregroundPath
      .transition(transition as any)
      .attrTween('d', () => {
        const interpolate = d3.interpolate(
          calculateGaugeArc(prevValue.current, min, max, config).mainArc,
          newArc
        );
        return (t: number) => interpolate(t);
      });

    prevValue.current = value;
  }, [value, min, max, config]);

  // Handle interaction events
  const handleClick = useCallback((event: React.MouseEvent) => {
    eventHandlers.onClick?.(event as unknown as MouseEvent);
  }, [eventHandlers]);

  // Format value for display
  const formattedValue = useMemo(() => {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0
    }).format(value);
  }, [value]);

  return (
    <Card>
      <GaugeContainer
        onClick={handleClick}
        role={accessibility.role || 'meter'}
        aria-label={accessibility.ariaLabel || `${label}: ${formattedValue}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={accessibility.ariaValueText || `${formattedValue} out of ${max}`}
      >
        <GaugeSVG
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox="-100 -100 200 200"
          preserveAspectRatio="xMidYMid meet"
        >
          <GaugeBackground
            className="gauge-background"
            d={calculateGaugeArc(1, 0, 1, config).mainArc}
            thickness={config.thickness}
          />
          {confidenceArc && (
            <GaugeConfidenceInterval
              className="gauge-confidence"
              d={confidenceArc}
              thickness={config.thickness}
            />
          )}
          <GaugeForeground
            className="gauge-foreground"
            d={mainArc}
            thickness={config.thickness}
          />
        </GaugeSVG>
        <GaugeValue>{formattedValue}</GaugeValue>
        <GaugeLabel>{label}</GaugeLabel>
      </GaugeContainer>
    </Card>
  );
});

Gauge.displayName = 'Gauge';

export default Gauge;