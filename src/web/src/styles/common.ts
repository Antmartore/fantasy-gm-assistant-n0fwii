import { css } from 'styled-components'; // v5.3.0
import { colors, typography, spacing, breakpoints } from '../config/theme';

// Constants for accessibility and animations
const TRANSITION_DURATION = '0.2s';
const BORDER_RADIUS = '4px';
const BOX_SHADOW = '0 2px 4px rgba(0, 0, 0, 0.1)';
const FOCUS_RING = '0 0 0 2px rgba(74, 144, 226, 0.5)';
const MIN_TOUCH_TARGET = '44px'; // WCAG 2.1 minimum touch target size
const LOADING_KEYFRAMES = css`
  @keyframes loading {
    0% { opacity: 0.6; }
    50% { opacity: 0.8; }
    100% { opacity: 0.6; }
  }
`;

// Type definitions
export interface StyleProps {
  variant?: 'primary' | 'secondary' | 'accent';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
}

// Base styles with accessibility support
export const baseStyles = css`
  font-family: ${typography.fontFamily.primary};
  font-size: ${typography.fontSize.md};
  line-height: ${typography.lineHeight.normal};
  color: ${colors.text.primary};
  transition: all ${TRANSITION_DURATION} ease-in-out;

  /* High contrast mode support */
  @media (forced-colors: active) {
    forced-color-adjust: auto;
  }

  /* Reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    animation: none;
  }
`;

// WCAG compliant button styles
export const buttonStyles = css<StyleProps>`
  ${baseStyles}
  min-height: ${MIN_TOUCH_TARGET};
  min-width: ${MIN_TOUCH_TARGET};
  padding: ${spacing.sm} ${spacing.md};
  border-radius: ${BORDER_RADIUS};
  border: none;
  cursor: pointer;
  font-weight: ${typography.fontWeight.medium};
  text-align: center;
  
  /* Ensure sufficient color contrast (WCAG 2.1 Level AA) */
  background-color: ${props => props.variant === 'primary' ? colors.primary : 
    props.variant === 'secondary' ? colors.secondary : colors.accent};
  color: ${colors.background};

  /* Disabled state */
  ${props => props.disabled && css`
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  `}

  /* Loading state */
  ${props => props.loading && css`
    position: relative;
    color: transparent;
    pointer-events: none;
    
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: ${colors.background};
      animation: spin 0.8s linear infinite;
    }
  `}

  /* Focus state for keyboard navigation */
  &:focus-visible {
    outline: none;
    box-shadow: ${FOCUS_RING};
  }

  /* Hover state with sufficient contrast */
  &:hover:not(:disabled) {
    filter: brightness(90%);
  }

  /* Active state */
  &:active:not(:disabled) {
    transform: translateY(1px);
  }

  /* Size variants */
  ${props => generateSizeStyles(props)}
`;

// Accessible input styles
export const inputStyles = css<StyleProps>`
  ${baseStyles}
  width: 100%;
  min-height: ${MIN_TOUCH_TARGET};
  padding: ${spacing.sm} ${spacing.md};
  border: 1px solid ${colors.text.secondary};
  border-radius: ${BORDER_RADIUS};
  background-color: ${colors.background};

  /* Error state */
  ${props => props.error && css`
    border-color: ${colors.status.error};
    
    &:focus {
      border-color: ${colors.status.error};
      box-shadow: 0 0 0 2px ${colors.status.error}33;
    }
  `}

  /* Focus state */
  &:focus {
    outline: none;
    border-color: ${colors.accent};
    box-shadow: ${FOCUS_RING};
  }

  /* Disabled state */
  &:disabled {
    background-color: ${colors.surface};
    color: ${colors.text.disabled};
    cursor: not-allowed;
  }

  /* Placeholder styles with sufficient contrast */
  &::placeholder {
    color: ${colors.text.secondary};
  }
`;

// Card container styles
export const cardStyles = css<StyleProps>`
  ${baseStyles}
  padding: ${spacing.md};
  border-radius: ${BORDER_RADIUS};
  background-color: ${colors.background};
  box-shadow: ${BOX_SHADOW};

  /* Loading state with skeleton animation */
  ${props => props.loading && css`
    ${LOADING_KEYFRAMES}
    animation: loading 1.5s ease-in-out infinite;
    background: linear-gradient(
      90deg,
      ${colors.surface} 0%,
      ${colors.background} 50%,
      ${colors.surface} 100%
    );
    background-size: 200% 100%;
  `}

  /* Responsive adjustments */
  @media (min-width: ${breakpoints.tablet}px) {
    padding: ${spacing.lg};
  }
`;

// Helper function to generate variant-specific styles
const generateVariantStyles = (props: StyleProps) => {
  if (props.variant === 'primary') {
    return css`
      background-color: ${colors.primary};
      color: ${colors.background};
    `;
  }
  if (props.variant === 'secondary') {
    return css`
      background-color: ${colors.secondary};
      color: ${colors.text.primary};
    `;
  }
  return css`
    background-color: ${colors.accent};
    color: ${colors.background};
  `;
};

// Helper function to generate size-specific styles
const generateSizeStyles = (props: StyleProps) => {
  switch (props.size) {
    case 'small':
      return css`
        font-size: ${typography.fontSize.sm};
        padding: ${spacing.xs} ${spacing.sm};
      `;
    case 'large':
      return css`
        font-size: ${typography.fontSize.lg};
        padding: ${spacing.md} ${spacing.lg};
      `;
    default:
      return css`
        font-size: ${typography.fontSize.md};
        padding: ${spacing.sm} ${spacing.md};
      `;
  }
};