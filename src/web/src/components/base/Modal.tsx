import React, { memo, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { AnimatePresence, motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
import FocusTrap from 'focus-trap-react';
import { colors, spacing, breakpoints, zIndex } from '../../config/theme';
import Button from './Button';

// Types
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'small' | 'medium' | 'large';
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  footer?: React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
  onSwipeClose?: () => void;
  customAnimation?: AnimationVariants;
  direction?: 'ltr' | 'rtl';
}

interface AnimationVariants {
  initial: object;
  animate: object;
  exit: object;
}

// Styled Components
const Overlay = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${zIndex.modal - 1};
  backdrop-filter: blur(2px);
`;

const ModalContainer = styled(motion.div)<{ $size: string; $direction: string }>`
  position: relative;
  background-color: ${colors.background};
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  max-height: 90vh;
  width: 90%;
  max-width: ${({ $size }) => 
    $size === 'small' ? '400px' : 
    $size === 'large' ? '800px' : '600px'
  };
  margin: ${spacing.md};
  display: flex;
  flex-direction: column;
  direction: ${({ $direction }) => $direction};
  z-index: ${zIndex.modal};

  @media (min-width: ${breakpoints.tablet}px) {
    width: 85%;
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing.md} ${spacing.lg};
  border-bottom: 1px solid ${colors.surface};
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: ${colors.text.primary};
`;

const Content = styled.div<{ $hasFooter: boolean }>`
  padding: ${spacing.lg};
  overflow-y: auto;
  flex: 1;
  -webkit-overflow-scrolling: touch;
  
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: ${colors.surface};
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: ${colors.text.secondary};
    border-radius: 4px;
  }
`;

const Footer = styled.footer`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${spacing.md};
  padding: ${spacing.md} ${spacing.lg};
  border-top: 1px solid ${colors.surface};
`;

const ErrorMessage = styled.div`
  color: ${colors.status.error};
  padding: ${spacing.sm} ${spacing.md};
  margin-bottom: ${spacing.sm};
  background-color: ${colors.status.error}10;
  border-radius: 4px;
`;

// Animation variants
const defaultAnimations: AnimationVariants = {
  initial: { opacity: 0, scale: 0.95, y: 20 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: 'spring', damping: 20, stiffness: 300 }
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    y: 20,
    transition: { duration: 0.2 }
  }
};

// Custom hooks
const useModalKeyboard = (onClose: () => void, closeOnEsc: boolean) => {
  useEffect(() => {
    if (!closeOnEsc) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, closeOnEsc]);
};

const useBodyScrollLock = (isOpen: boolean) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);
};

// Main component
export const Modal = memo(({
  isOpen,
  onClose,
  title,
  size = 'medium',
  children,
  closeOnBackdrop = true,
  closeOnEsc = true,
  showCloseButton = true,
  footer,
  isLoading = false,
  error = null,
  onSwipeClose,
  customAnimation,
  direction = 'ltr',
}: ModalProps) => {
  useModalKeyboard(onClose, closeOnEsc);
  useBodyScrollLock(isOpen);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  }, [closeOnBackdrop, onClose]);

  const swipeHandlers = useSwipeable({
    onSwipedDown: () => onSwipeClose?.(),
    delta: 50,
    preventDefaultTouchmoveEvent: true,
  });

  const animations = customAnimation || defaultAnimations;

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <Overlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleBackdropClick}
        >
          <FocusTrap focusTrapOptions={{ initialFocus: false }}>
            <ModalContainer
              {...swipeHandlers}
              $size={size}
              $direction={direction}
              initial={animations.initial}
              animate={animations.animate}
              exit={animations.exit}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              aria-describedby="modal-content"
            >
              <Header>
                <Title id="modal-title">{title}</Title>
                {showCloseButton && (
                  <Button
                    variant="tertiary"
                    size="small"
                    onClick={onClose}
                    ariaLabel="Close modal"
                  >
                    ✕
                  </Button>
                )}
              </Header>

              {error && (
                <ErrorMessage role="alert">
                  {error}
                </ErrorMessage>
              )}

              <Content 
                id="modal-content"
                $hasFooter={!!footer}
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <div aria-label="Loading content">
                    {/* Add your loading spinner component here */}
                  </div>
                ) : children}
              </Content>

              {footer && <Footer>{footer}</Footer>}
            </ModalContainer>
          </FocusTrap>
        </Overlay>
      )}
    </AnimatePresence>
  );
});

Modal.displayName = 'Modal';

export default Modal;