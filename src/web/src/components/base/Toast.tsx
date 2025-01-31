import React, { useEffect, useRef } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { theme } from '../../config/theme';
import { trackEvent } from '../../utils/analytics';

// Animation keyframes
const slideIn = keyframes`
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const slideOut = keyframes`
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
`;

// Types
interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose: () => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  autoFocus?: boolean;
  role?: 'alert' | 'status';
  ariaLive?: 'polite' | 'assertive';
}

interface ToastStyleProps {
  type: ToastProps['type'];
  position: ToastProps['position'];
  isVisible: boolean;
}

// Styled components
const ToastContainer = styled(motion.div)<ToastStyleProps>`
  position: fixed;
  z-index: ${theme.zIndex.tooltip};
  padding: ${theme.spacing.md};
  min-width: 300px;
  max-width: 400px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: ${theme.spacing.sm};
  font-family: ${theme.typography.fontFamily.primary};
  animation: ${props => props.isVisible ? slideIn : slideOut} 0.3s ease-in-out;
  will-change: transform;

  ${({ position }) => {
    switch (position) {
      case 'top-left':
        return css`
          top: ${theme.spacing.lg};
          left: ${theme.spacing.lg};
        `;
      case 'bottom-left':
        return css`
          bottom: ${theme.spacing.lg};
          left: ${theme.spacing.lg};
        `;
      case 'bottom-right':
        return css`
          bottom: ${theme.spacing.lg};
          right: ${theme.spacing.lg};
        `;
      default:
        return css`
          top: ${theme.spacing.lg};
          right: ${theme.spacing.lg};
        `;
    }
  }}

  ${({ type }) => {
    switch (type) {
      case 'error':
        return css`
          background-color: ${theme.colors.status.error};
          color: white;
        `;
      case 'warning':
        return css`
          background-color: ${theme.colors.status.warning};
          color: ${theme.colors.text.primary};
        `;
      case 'success':
        return css`
          background-color: ${theme.colors.status.success};
          color: white;
        `;
      default:
        return css`
          background-color: ${theme.colors.status.info};
          color: white;
        `;
    }
  }}
`;

const ToastIcon = styled.div`
  width: 20px;
  height: 20px;
  flex-shrink: 0;
`;

const ToastMessage = styled.div`
  flex: 1;
  font-size: ${theme.typography.fontSize.md};
  line-height: ${theme.typography.lineHeight.normal};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  padding: ${theme.spacing.xs};
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }

  &:focus {
    outline: 2px solid rgba(255, 255, 255, 0.5);
    border-radius: 4px;
  }
`;

// Icons for different toast types
const icons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ'
};

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 5000,
  onClose,
  position = 'top-right',
  autoFocus = true,
  role = 'alert',
  ariaLive = 'polite'
}) => {
  const toastRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number>();

  useEffect(() => {
    // Track toast display
    trackEvent('toast_display', {
      type,
      message,
      duration
    });

    // Set up auto-dismiss timer
    if (duration > 0) {
      timerRef.current = window.setTimeout(() => {
        handleClose();
      }, duration);
    }

    // Focus management
    if (autoFocus && toastRef.current) {
      toastRef.current.focus();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClose = () => {
    trackEvent('toast_dismiss', {
      type,
      message,
      duration
    });
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClose();
    }
  };

  const variants = {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50 }
  };

  return (
    <AnimatePresence>
      <ToastContainer
        ref={toastRef}
        type={type}
        position={position}
        isVisible={true}
        role={role}
        aria-live={ariaLive}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants}
        transition={{ duration: 0.2 }}
      >
        <ToastIcon>{icons[type]}</ToastIcon>
        <ToastMessage>{message}</ToastMessage>
        <CloseButton
          onClick={handleClose}
          aria-label="Close notification"
        >
          ×
        </CloseButton>
      </ToastContainer>
    </AnimatePresence>
  );
};

export default Toast;