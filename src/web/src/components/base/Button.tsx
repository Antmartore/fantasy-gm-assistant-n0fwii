import React from 'react'; // v18.0.0
import styled from 'styled-components'; // v5.3.0
import CircularProgress from '@mui/material/CircularProgress'; // v5.0.0
import { colors, typography, spacing } from '../../config/theme';
import { buttonStyles } from '../../styles/common';

// Button Props Interface
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  ariaLabel?: string;
  type?: 'button' | 'submit' | 'reset';
}

// Styled Button Component
const StyledButton = styled.button<ButtonProps>`
  ${buttonStyles}
  
  /* Base styles */
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  margin: 0;
  text-decoration: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  
  /* Typography */
  font-family: ${typography.fontFamily.primary};
  font-weight: ${typography.fontWeight.medium};
  
  /* Dimensions */
  width: ${props => props.fullWidth ? '100%' : 'auto'};
  min-width: 44px; /* WCAG 2.1 touch target size */
  
  /* Variant-specific styles */
  ${props => {
    switch (props.variant) {
      case 'secondary':
        return `
          background-color: ${colors.secondary};
          color: ${colors.text.primary};
        `;
      case 'tertiary':
        return `
          background-color: transparent;
          color: ${colors.primary};
          border: 1px solid ${colors.primary};
        `;
      default:
        return `
          background-color: ${colors.primary};
          color: ${colors.background};
        `;
    }
  }}
  
  /* Size-specific styles */
  ${props => {
    switch (props.size) {
      case 'small':
        return `
          padding: ${spacing.xs} ${spacing.sm};
          font-size: ${typography.fontSize.sm};
        `;
      case 'large':
        return `
          padding: ${spacing.md} ${spacing.lg};
          font-size: ${typography.fontSize.lg};
        `;
      default:
        return `
          padding: ${spacing.sm} ${spacing.md};
          font-size: ${typography.fontSize.md};
        `;
    }
  }}
  
  /* State styles */
  &:hover:not(:disabled) {
    filter: brightness(90%);
    transform: translateY(-1px);
  }
  
  &:active:not(:disabled) {
    filter: brightness(85%);
    transform: translateY(0);
  }
  
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${colors.accent}40;
  }
  
  /* Disabled state */
  ${props => props.disabled && `
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  `}
  
  /* Loading state */
  ${props => props.loading && `
    color: transparent;
    pointer-events: none;
  `}
  
  /* Transitions */
  transition: all 0.2s ease-in-out;
  
  /* Mobile optimizations */
  @media (max-width: 768px) {
    &:hover {
      transform: none;
    }
    
    &:active {
      transform: scale(0.98);
    }
  }
  
  /* Reduced motion preferences */
  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
    
    &:hover,
    &:active {
      transform: none;
    }
  }
`;

// Loading Spinner Wrapper
const SpinnerWrapper = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
`;

// Button Component
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  disabled = false,
  loading = false,
  onClick,
  children,
  ariaLabel,
  type = 'button',
  ...props
}) => {
  // Handle click with loading/disabled state check
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!loading && !disabled && onClick) {
      onClick(event);
    }
  };

  return (
    <StyledButton
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      disabled={disabled || loading}
      loading={loading}
      onClick={handleClick}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      type={type}
      {...props}
    >
      {children}
      {loading && (
        <SpinnerWrapper>
          <CircularProgress
            size={size === 'small' ? 16 : size === 'large' ? 24 : 20}
            color="inherit"
          />
        </SpinnerWrapper>
      )}
    </StyledButton>
  );
};

export default Button;