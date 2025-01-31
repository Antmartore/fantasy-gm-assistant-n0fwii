import React, { forwardRef, useCallback, useMemo } from 'react';
import styled, { css } from 'styled-components'; // v5.3.0
import { theme } from '../../config/theme';
import { inputStyles } from '../../styles/common';

// Constants
const TRANSITION_DURATION = '0.2s';
const INPUT_SIZES = {
  small: '32px',
  medium: '40px',
  large: '48px'
} as const;
const DEBOUNCE_DELAY = 150;
const MAX_LENGTH_DEFAULT = 524288;

// Types
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  variant?: 'primary' | 'secondary' | 'error';
  size?: keyof typeof INPUT_SIZES;
  label?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  maxLength?: number;
}

// Styled components
const InputContainer = styled.div`
  position: relative;
  width: 100%;
  margin-bottom: ${({ error }) => error ? theme.spacing.md : theme.spacing.sm};
`;

const InputLabel = styled.label<{ required?: boolean }>`
  display: block;
  margin-bottom: ${theme.spacing.xs};
  color: ${theme.colors.text.primary};
  font-family: ${theme.typography.fontFamily.primary};
  font-size: ${theme.typography.fontSize.sm};
  font-weight: ${theme.typography.fontWeight.medium};
  
  ${({ required }) => required && css`
    &::after {
      content: '*';
      color: ${theme.colors.status.error};
      margin-left: ${theme.spacing.xs};
    }
  `}
`;

const StyledInput = styled.input<Omit<InputProps, 'onChange' | 'label'>>`
  ${inputStyles}
  height: ${({ size = 'medium' }) => INPUT_SIZES[size]};
  transition: all ${TRANSITION_DURATION} ease-in-out;
  
  ${({ variant }) => {
    switch (variant) {
      case 'primary':
        return css`
          border-color: ${theme.colors.primary};
          &:focus {
            border-color: ${theme.colors.primary};
            box-shadow: 0 0 0 2px ${theme.colors.primary}33;
          }
        `;
      case 'secondary':
        return css`
          border-color: ${theme.colors.secondary};
          &:focus {
            border-color: ${theme.colors.secondary};
            box-shadow: 0 0 0 2px ${theme.colors.secondary}33;
          }
        `;
      case 'error':
        return css`
          border-color: ${theme.colors.status.error};
          &:focus {
            border-color: ${theme.colors.status.error};
            box-shadow: 0 0 0 2px ${theme.colors.status.error}33;
          }
        `;
      default:
        return '';
    }
  }}

  &:disabled {
    background-color: ${theme.colors.surface};
    color: ${theme.colors.text.disabled};
    cursor: not-allowed;
  }

  &::placeholder {
    color: ${theme.colors.text.secondary};
    opacity: 1;
  }
`;

const ErrorMessage = styled.span`
  display: block;
  margin-top: ${theme.spacing.xs};
  color: ${theme.colors.status.error};
  font-size: ${theme.typography.fontSize.sm};
  font-family: ${theme.typography.fontFamily.primary};
`;

// Input component
export const Input = forwardRef<HTMLInputElement, InputProps>(({
  name,
  value,
  onChange,
  variant = 'primary',
  size = 'medium',
  label,
  error,
  disabled = false,
  required = false,
  maxLength = MAX_LENGTH_DEFAULT,
  placeholder,
  type = 'text',
  ...rest
}, ref) => {
  // Generate unique IDs for accessibility
  const inputId = useMemo(() => `input-${name}-${Math.random().toString(36).substr(2, 9)}`, [name]);
  const errorId = useMemo(() => `error-${inputId}`, [inputId]);

  // Debounced onChange handler
  const debouncedOnChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const handler = setTimeout(() => {
        onChange(e);
      }, DEBOUNCE_DELAY);

      return () => {
        clearTimeout(handler);
      };
    },
    [onChange]
  );

  return (
    <InputContainer error={error}>
      {label && (
        <InputLabel
          htmlFor={inputId}
          required={required}
        >
          {label}
        </InputLabel>
      )}
      <StyledInput
        ref={ref}
        id={inputId}
        name={name}
        value={value}
        onChange={debouncedOnChange}
        variant={error ? 'error' : variant}
        size={size}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        type={type}
        aria-invalid={!!error}
        aria-required={required}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error && (
        <ErrorMessage
          id={errorId}
          role="alert"
        >
          {error}
        </ErrorMessage>
      )}
    </InputContainer>
  );
});

Input.displayName = 'Input';

export default Input;