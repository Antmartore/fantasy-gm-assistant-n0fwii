import React from 'react';
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ThemeProvider } from 'styled-components';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { theme } from '../../../src/config/theme';
import Chart from '../../../src/components/analytics/Chart';
import { ChartType, ChartData, ChartProps } from '../../../src/types/analytics';

// Add jest-axe matchers
expect.extend(toHaveNoViolations);

// Mock Victory components
jest.mock('victory', () => ({
  VictoryChart: jest.fn(({ children }) => <div data-testid="victory-chart">{children}</div>),
  VictoryLine: jest.fn(() => <div data-testid="victory-line" />),
  VictoryBar: jest.fn(() => <div data-testid="victory-bar" />),
  VictoryPie: jest.fn(() => <div data-testid="victory-pie" />),
  VictoryTooltip: jest.fn(() => <div data-testid="victory-tooltip" />),
  VictoryContainer: jest.fn(({ children }) => <div data-testid="victory-container">{children}</div>),
  VictoryAxis: jest.fn(() => <div data-testid="victory-axis" />),
  VictoryLabel: jest.fn(() => <div data-testid="victory-label" />),
  VictoryTheme: { material: {} }
}));

// Mock ResizeObserver
const mockResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));
window.ResizeObserver = mockResizeObserver;

// Test data generator
const generateMockChartData = (type: ChartType): ChartData => {
  const baseData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr'],
    datasets: [{
      label: 'Test Dataset',
      data: [
        { x: 'Jan', y: 10, label: 'January Data' },
        { x: 'Feb', y: 20, label: 'February Data' },
        { x: 'Mar', y: 15, label: 'March Data' },
        { x: 'Apr', y: 25, label: 'April Data' }
      ]
    }],
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 300 }
    }
  };

  switch (type) {
    case ChartType.LINE:
      return {
        ...baseData,
        datasets: [{
          ...baseData.datasets[0],
          borderColor: '#4A90E2',
          backgroundColor: 'rgba(74, 144, 226, 0.1)'
        }]
      };
    case ChartType.BAR:
      return {
        ...baseData,
        datasets: [{
          ...baseData.datasets[0],
          backgroundColor: '#00FF88'
        }]
      };
    case ChartType.PIE:
      return {
        ...baseData,
        datasets: [{
          ...baseData.datasets[0],
          backgroundColor: ['#4A90E2', '#00FF88', '#FFC107', '#FF4444']
        }]
      };
    default:
      return baseData;
  }
};

describe('Chart Component', () => {
  const mockOnDataPointClick = jest.fn();
  let defaultProps: ChartProps;

  beforeEach(() => {
    defaultProps = {
      type: ChartType.LINE,
      data: generateMockChartData(ChartType.LINE),
      height: 400,
      width: 600,
      interactive: true,
      onDataPointClick: mockOnDataPointClick,
      loading: false,
      ariaLabel: 'Test Chart'
    };
    jest.clearAllMocks();
  });

  const renderChart = (props = {}) => {
    return render(
      <ThemeProvider theme={theme}>
        <Chart {...defaultProps} {...props} />
      </ThemeProvider>
    );
  };

  describe('Rendering', () => {
    it('should render each chart type correctly', () => {
      const chartTypes = [ChartType.LINE, ChartType.BAR, ChartType.PIE];
      
      chartTypes.forEach(type => {
        const { getByTestId, rerender } = renderChart({ type, data: generateMockChartData(type) });
        expect(getByTestId(`victory-${type.toLowerCase()}`)).toBeInTheDocument();
        rerender(<ThemeProvider theme={theme}><Chart {...defaultProps} type={type} /></ThemeProvider>);
      });
    });

    it('should display loading state correctly', async () => {
      const { getByRole } = renderChart({ loading: true });
      const loadingElement = getByRole('status');
      expect(loadingElement).toHaveTextContent('Loading chart data...');
    });

    it('should handle empty data gracefully', () => {
      const { getByRole } = renderChart({ data: { labels: [], datasets: [] } });
      expect(getByRole('alert')).toHaveTextContent('No data available for visualization');
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = renderChart();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should support keyboard navigation', async () => {
      const { getByRole } = renderChart();
      const chart = getByRole('figure');
      
      chart.focus();
      expect(document.activeElement).toBe(chart);
      
      fireEvent.keyPress(chart, { key: 'Enter', code: 'Enter' });
      await waitFor(() => {
        expect(mockOnDataPointClick).toHaveBeenCalled();
      });
    });

    it('should have proper ARIA attributes', () => {
      const { getByRole } = renderChart();
      const chart = getByRole('figure');
      
      expect(chart).toHaveAttribute('aria-label', 'Test Chart');
      expect(chart).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Interactivity', () => {
    it('should handle data point clicks', async () => {
      const { getByTestId } = renderChart();
      const chart = getByTestId('victory-line');
      
      fireEvent.click(chart);
      await waitFor(() => {
        expect(mockOnDataPointClick).toHaveBeenCalled();
      });
    });

    it('should not trigger interactions when interactive is false', async () => {
      const { getByTestId } = renderChart({ interactive: false });
      const chart = getByTestId('victory-line');
      
      fireEvent.click(chart);
      expect(mockOnDataPointClick).not.toHaveBeenCalled();
    });

    it('should show tooltips on hover', async () => {
      const { getByTestId } = renderChart();
      const chart = getByTestId('victory-line');
      
      fireEvent.mouseOver(chart);
      await waitFor(() => {
        expect(getByTestId('victory-tooltip')).toBeInTheDocument();
      });
    });
  });

  describe('Performance', () => {
    it('should maintain performance with large datasets', async () => {
      const largeData = {
        ...generateMockChartData(ChartType.LINE),
        datasets: [{
          label: 'Large Dataset',
          data: Array.from({ length: 1000 }, (_, i) => ({
            x: i,
            y: Math.random() * 100,
            label: `Data point ${i}`
          }))
        }]
      };

      const startTime = performance.now();
      const { getByTestId } = renderChart({ data: largeData });
      const renderTime = performance.now() - startTime;

      expect(renderTime).toBeLessThan(100); // Render should take less than 100ms
      expect(getByTestId('victory-line')).toBeInTheDocument();
    });

    it('should handle window resize events efficiently', async () => {
      renderChart();
      
      // Simulate rapid resize events
      Array.from({ length: 10 }).forEach(() => {
        window.dispatchEvent(new Event('resize'));
      });

      // Wait for debounced resize handler
      await waitFor(() => {
        expect(mockResizeObserver).toHaveBeenCalled();
      });
    });
  });

  describe('Data Visualization', () => {
    it('should format trade analysis data correctly', () => {
      const tradeData = {
        ...generateMockChartData(ChartType.BAR),
        datasets: [{
          label: 'Trade Value',
          data: [
            { x: 'Team A', y: 85, label: 'Current Team' },
            { x: 'Team B', y: 92, label: 'Trade Partner' }
          ]
        }]
      };

      const { getByTestId } = renderChart({ type: ChartType.BAR, data: tradeData });
      expect(getByTestId('victory-bar')).toBeInTheDocument();
    });

    it('should display simulation results accurately', () => {
      const simulationData = {
        ...generateMockChartData(ChartType.LINE),
        datasets: [{
          label: 'Win Probability',
          data: Array.from({ length: 16 }, (_, i) => ({
            x: `Week ${i + 1}`,
            y: Math.random() * 100,
            label: `Week ${i + 1} Projection`
          }))
        }]
      };

      const { getByTestId } = renderChart({ type: ChartType.LINE, data: simulationData });
      expect(getByTestId('victory-line')).toBeInTheDocument();
    });
  });
});