import React from 'react'; // v18.0.0
import { render, fireEvent, screen, waitFor } from '@testing-library/react'; // v13.0.0
import userEvent from '@testing-library/user-event'; // v14.0.0
import '@testing-library/jest-dom/extend-expect'; // v5.16.0
import Button from '../../src/components/base/Button';
import { theme } from '../../src/config/theme';

describe('Button Component', () => {
  // Mock functions
  const mockOnClick = jest.fn();
  const mockOnFocus = jest.fn();

  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering and Styles', () => {
    test('renders with default props correctly', () => {
      render(<Button>Click me</Button>);
      const button = screen.getByRole('button', { name: /click me/i });
      
      expect(button).toBeInTheDocument();
      expect(button).toHaveStyle({
        backgroundColor: theme.colors.primary,
        color: theme.colors.background,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`
      });
    });

    test('applies variant-specific styles correctly', () => {
      const { rerender } = render(<Button variant="secondary">Secondary</Button>);
      let button = screen.getByRole('button');
      expect(button).toHaveStyle({ backgroundColor: theme.colors.secondary });

      rerender(<Button variant="tertiary">Tertiary</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveStyle({ 
        backgroundColor: 'transparent',
        border: `1px solid ${theme.colors.primary}`
      });
    });

    test('applies size-specific styles correctly', () => {
      const { rerender } = render(<Button size="small">Small</Button>);
      let button = screen.getByRole('button');
      expect(button).toHaveStyle({
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        fontSize: theme.typography.fontSize.sm
      });

      rerender(<Button size="large">Large</Button>);
      button = screen.getByRole('button');
      expect(button).toHaveStyle({
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        fontSize: theme.typography.fontSize.lg
      });
    });

    test('applies fullWidth style correctly', () => {
      render(<Button fullWidth>Full Width</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ width: '100%' });
    });
  });

  describe('Interaction Handling', () => {
    test('handles click events correctly', async () => {
      render(<Button onClick={mockOnClick}>Click me</Button>);
      const button = screen.getByRole('button');

      await userEvent.click(button);
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    test('prevents click when disabled', async () => {
      render(<Button onClick={mockOnClick} disabled>Disabled</Button>);
      const button = screen.getByRole('button');

      await userEvent.click(button);
      expect(mockOnClick).not.toHaveBeenCalled();
      expect(button).toBeDisabled();
    });

    test('prevents click when loading', async () => {
      render(<Button onClick={mockOnClick} loading>Loading</Button>);
      const button = screen.getByRole('button');

      await userEvent.click(button);
      expect(mockOnClick).not.toHaveBeenCalled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    test('handles keyboard navigation correctly', async () => {
      render(<Button onFocus={mockOnFocus}>Focus me</Button>);
      const button = screen.getByRole('button');

      await userEvent.tab();
      expect(button).toHaveFocus();
      expect(mockOnFocus).toHaveBeenCalledTimes(1);

      await userEvent.keyboard('{enter}');
      expect(button).toHaveFocus();
    });
  });

  describe('States and Transitions', () => {
    test('displays loading state correctly', () => {
      render(<Button loading>Loading</Button>);
      const button = screen.getByRole('button');
      const spinner = screen.getByRole('progressbar');

      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(spinner).toBeInTheDocument();
      expect(button).toHaveStyle({ color: 'transparent' });
    });

    test('handles disabled state correctly', () => {
      render(<Button disabled>Disabled</Button>);
      const button = screen.getByRole('button');

      expect(button).toBeDisabled();
      expect(button).toHaveStyle({ opacity: '0.5' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    test('applies hover styles correctly', async () => {
      render(<Button>Hover me</Button>);
      const button = screen.getByRole('button');

      await userEvent.hover(button);
      expect(button).toHaveStyle({ filter: 'brightness(90%)' });

      await userEvent.unhover(button);
      expect(button).not.toHaveStyle({ filter: 'brightness(90%)' });
    });
  });

  describe('Accessibility', () => {
    test('provides appropriate ARIA attributes', () => {
      render(<Button ariaLabel="Custom Label">Button</Button>);
      const button = screen.getByRole('button');

      expect(button).toHaveAttribute('aria-label', 'Custom Label');
    });

    test('maintains minimum touch target size', () => {
      render(<Button>Touch Target</Button>);
      const button = screen.getByRole('button');

      expect(button).toHaveStyle({
        minWidth: '44px',
        minHeight: '44px'
      });
    });

    test('handles focus visibility correctly', async () => {
      render(<Button>Focus me</Button>);
      const button = screen.getByRole('button');

      await userEvent.tab();
      expect(button).toHaveFocus();
      expect(button).toHaveStyle({
        boxShadow: `0 0 0 2px ${theme.colors.accent}40`
      });
    });

    test('supports reduced motion preferences', () => {
      // Mock matchMedia for prefers-reduced-motion
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
      }));

      render(<Button>Reduced Motion</Button>);
      const button = screen.getByRole('button');

      expect(button).toHaveStyle({ transition: 'none' });
    });
  });

  describe('Form Integration', () => {
    test('functions correctly as form submit button', async () => {
      const handleSubmit = jest.fn(e => e.preventDefault());
      
      render(
        <form onSubmit={handleSubmit}>
          <Button type="submit">Submit</Button>
        </form>
      );
      
      const button = screen.getByRole('button');
      await userEvent.click(button);
      
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });

    test('respects button type attribute', () => {
      render(<Button type="reset">Reset</Button>);
      const button = screen.getByRole('button');
      
      expect(button).toHaveAttribute('type', 'reset');
    });
  });
});