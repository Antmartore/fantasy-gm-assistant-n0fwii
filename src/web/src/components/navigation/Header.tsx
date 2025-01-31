import React, { useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Button } from '../base/Button';
import { Menu } from './Menu';
import { colors, typography, spacing } from '../../config/theme';
import { useAuth } from '../../hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';

// Constants
const HEADER_HEIGHT = '64px';
const MOBILE_MENU_BREAKPOINT = '768px';
const MENU_TRANSITION_MS = 300;

// Styled components with enhanced accessibility
const HeaderContainer = styled.header`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: ${HEADER_HEIGHT};
  background-color: ${colors.background};
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: ${({ theme }) => theme.zIndex.header};
  
  /* Ensure header is accessible */
  @supports (backdrop-filter: none) {
    background-color: ${colors.background}CC;
  }
  
  &:focus-within {
    outline: 2px solid ${colors.accent};
    outline-offset: -2px;
  }
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1200px;
  height: 100%;
  margin: 0 auto;
  padding: 0 ${spacing.md};
  
  @media (max-width: ${MOBILE_MENU_BREAKPOINT}) {
    padding: 0 ${spacing.sm};
  }
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  font-family: ${typography.fontFamily.primary};
  font-weight: ${typography.fontWeight.bold};
  font-size: ${typography.fontSize.lg};
  color: ${colors.text.primary};
  cursor: pointer;
  
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 4px;
    border-radius: 4px;
  }
`;

const Navigation = styled.nav`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
  
  @media (max-width: ${MOBILE_MENU_BREAKPOINT}) {
    display: none;
  }
`;

const MobileMenuButton = styled(Button)`
  display: none;
  
  @media (max-width: ${MOBILE_MENU_BREAKPOINT}) {
    display: flex;
  }
`;

const UserSection = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
`;

const PremiumBadge = styled.span`
  padding: ${spacing.xs} ${spacing.sm};
  background-color: ${colors.secondary};
  color: ${colors.text.primary};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.medium};
  border-radius: 4px;
`;

interface HeaderProps {
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({ className }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isPremium } = useAuth();
  const { trackEvent, trackScreenView } = useAnalytics();

  // Handle menu toggle with analytics
  const toggleMenu = useCallback(() => {
    setIsMenuOpen(prev => !prev);
    trackEvent('NAVIGATION_MENU_TOGGLE', {
      action: !isMenuOpen ? 'open' : 'close'
    });
  }, [isMenuOpen, trackEvent]);

  // Handle navigation with analytics
  const handleNavigation = useCallback((route: string) => {
    trackEvent('NAVIGATION_CLICK', { route });
    trackScreenView(route);
    navigate(route);
    setIsMenuOpen(false);
  }, [navigate, trackEvent, trackScreenView]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMenuOpen) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMenuOpen]);

  return (
    <HeaderContainer className={className} role="banner">
      <HeaderContent>
        <Logo
          onClick={() => handleNavigation('/')}
          role="link"
          tabIndex={0}
          aria-label="Fantasy GM Assistant Home"
        >
          Fantasy GM Assistant
          {isPremium && <PremiumBadge aria-label="Premium User">PRO</PremiumBadge>}
        </Logo>

        <Navigation role="navigation" aria-label="Main navigation">
          <Button
            variant="tertiary"
            onClick={() => handleNavigation('/dashboard')}
            aria-label="Dashboard"
          >
            Dashboard
          </Button>
          <Button
            variant="tertiary"
            onClick={() => handleNavigation('/teams')}
            aria-label="Teams"
          >
            Teams
          </Button>
          <Button
            variant="tertiary"
            onClick={() => handleNavigation('/analysis')}
            aria-label="Analysis"
          >
            Analysis
          </Button>
        </Navigation>

        <UserSection>
          {user ? (
            <>
              <Button
                variant="tertiary"
                onClick={() => handleNavigation('/profile')}
                aria-label="Profile"
              >
                Profile
              </Button>
              <MobileMenuButton
                variant="tertiary"
                onClick={toggleMenu}
                aria-expanded={isMenuOpen}
                aria-controls="mobile-menu"
                aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              >
                <i className={`icon-${isMenuOpen ? 'close' : 'menu'}`} aria-hidden="true" />
              </MobileMenuButton>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={() => handleNavigation('/login')}
              aria-label="Login"
            >
              Login
            </Button>
          )}
        </UserSection>
      </HeaderContent>

      <Menu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        id="mobile-menu"
        aria-hidden={!isMenuOpen}
      />
    </HeaderContainer>
  );
};

export default Header;