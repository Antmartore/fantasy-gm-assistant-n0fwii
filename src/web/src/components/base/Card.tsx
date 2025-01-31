import React, { useMemo } from 'react';
import styled, { css } from 'styled-components';
import { theme } from '../../config/theme';
import { cardStyles, skeletonAnimation } from '../../styles/common';
import { media } from '../../styles/responsive';

// Types
export interface CardProps {
  variant?: 'primary' | 'secondary' | 'accent';
  size?: 'small' | 'medium' | 'large';
  selected?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  elevation?: 0 | 1 | 2 | 3;
}

// Shadow definitions based on elevation
const shadows = {
  0: 'none',
  1: '0 2px 4px rgba(0, 0, 0, 0.1)',
  2: '0 4px 8px rgba(0, 0, 0, 0.12)',
  3: '0 8px 16px rgba(0, 0, 0, 0.14)'
};

// Styled component with comprehensive styling
const StyledCard = styled.div<CardProps>`
  ${cardStyles}
  
  /* Base styles */
  background-color: ${theme.colors.background};
  border-radius: ${theme.spacing.sm};
  box-shadow: ${props => shadows[props.elevation || 0]};
  transition: all ${theme.animations?.default || '0.2s ease'};
  will-change: transform, box-shadow;
  min-height: 48px;
  position: relative;
  overflow: hidden;
  cursor: ${props => props.onClick ? 'pointer' : 'default'};

  /* Variant styles */
  ${props => props.variant && css`
    border: 1px solid ${theme.colors[props.variant]};
  `}

  /* Size-specific padding */
  ${props => {
    switch (props.size) {
      case 'small':
        return css`
          ${media.mobileS(`padding: ${theme.spacing.xs};`)}
          ${media.tablet(`padding: ${theme.spacing.sm};`)}
          ${media.desktop(`padding: ${theme.spacing.md};`)}
        `;
      case 'large':
        return css`
          ${media.mobileS(`padding: ${theme.spacing.md};`)}
          ${media.tablet(`padding: ${theme.spacing.lg};`)}
          ${media.desktop(`padding: ${theme.spacing.xl};`)}
        `;
      default:
        return css`
          ${media.mobileS(`padding: ${theme.spacing.sm};`)}
          ${media.tablet(`padding: ${theme.spacing.md};`)}
          ${media.desktop(`padding: ${theme.spacing.lg};`)}
        `;
    }
  }}

  /* Selected state */
  ${props => props.selected && css`
    border-color: ${theme.colors.accent};
    box-shadow: 0 0 0 2px ${theme.colors.accent}25;
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  `}

  /* Loading state */
  ${props => props.loading && css`
    opacity: 0.7;
    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        90deg,
        ${theme.colors.surface} 0%,
        ${theme.colors.background} 50%,
        ${theme.colors.surface} 100%
      );
      background-size: 200% 100%;
      animation: ${skeletonAnimation} 1.5s infinite linear;
    }
  `}

  /* Interactive states */
  ${props => props.onClick && css`
    &:hover {
      transform: translateY(-2px);
      box-shadow: ${shadows[(props.elevation || 0) + 1 as keyof typeof shadows]};
    }

    &:active {
      transform: translateY(0);
    }

    &:focus-visible {
      outline: 2px solid ${theme.colors.accent};
      outline-offset: 2px;
    }
  `}

  /* Responsive touch target sizing */
  @media (pointer: coarse) {
    min-height: 44px; /* WCAG 2.1 minimum touch target size */
  }
`;

export const Card = React.memo<CardProps>(({
  variant = 'primary',
  size = 'medium',
  selected = false,
  loading = false,
  onClick,
  children,
  className,
  testId = 'card',
  ariaLabel,
  elevation = 1,
  ...props
}) => {
  // Memoize interactive props for performance
  const interactiveProps = useMemo(() => {
    if (onClick) {
      return {
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyPress: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onClick();
          }
        },
      };
    }
    return {};
  }, [onClick]);

  return (
    <StyledCard
      variant={variant}
      size={size}
      selected={selected}
      loading={loading}
      elevation={elevation}
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
      aria-busy={loading}
      aria-selected={selected}
      {...interactiveProps}
      {...props}
    >
      {children}
    </StyledCard>
  );
});

Card.displayName = 'Card';

export default Card;