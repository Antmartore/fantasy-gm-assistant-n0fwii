import React, { memo, useCallback, useEffect } from 'react';
import styled from 'styled-components'; // v5.3.0
import { useNavigation } from '@react-navigation/native'; // v6.0.0
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // v4.0.0
import { Button } from '../base/Button';
import { useAuth } from '../../hooks/useAuth';
import { useAnalytics } from '../../hooks/useAnalytics';
import { colors, typography, spacing, Z_INDEX } from '../../config/theme';

// Menu item configuration type
interface MenuItem {
  id: string;
  label: string;
  icon: string;
  route: keyof AppTabParamList;
  requiresAuth?: boolean;
  roles?: string[];
}

// Props interface for Menu component
interface MenuProps {
  isOpen: boolean;
  onClose: () => void;
}

// Menu items configuration
const MENU_ITEMS: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    route: 'Dashboard',
    requiresAuth: true,
    roles: ['user', 'admin']
  },
  {
    id: 'teams',
    label: 'Teams',
    icon: 'teams',
    route: 'Teams',
    requiresAuth: true,
    roles: ['user', 'admin']
  },
  {
    id: 'analysis',
    label: 'Analysis',
    icon: 'analysis',
    route: 'Analysis',
    requiresAuth: true,
    roles: ['premium', 'admin']
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: 'profile',
    route: 'Profile',
    requiresAuth: true,
    roles: ['user', 'admin']
  }
];

// Styled components with accessibility and animation support
const MenuContainer = styled.div<{ isOpen: boolean; top: number }>`
  position: fixed;
  top: ${props => props.top}px;
  right: 0;
  bottom: 0;
  width: 85%;
  max-width: 360px;
  background-color: ${colors.background};
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  transform: translateX(${props => props.isOpen ? '0' : '100%'});
  transition: transform 0.3s ease-in-out;
  z-index: ${Z_INDEX.modal};
  overflow: hidden;
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const MenuContent = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: ${spacing.md};
  gap: ${spacing.sm};
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
`;

const MenuItem = styled(Button)`
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: ${spacing.sm} ${spacing.md};
  font-size: ${typography.fontSize.md};
  text-align: left;
  border-radius: 8px;
  
  &:focus-visible {
    outline: 2px solid ${colors.accent};
    outline-offset: 2px;
  }
`;

const Overlay = styled.div<{ isOpen: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  opacity: ${props => props.isOpen ? 1 : 0};
  visibility: ${props => props.isOpen ? 'visible' : 'hidden'};
  transition: opacity 0.3s ease-in-out;
  z-index: ${Z_INDEX.overlay};
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// Memoized Menu component
export const Menu = memo<MenuProps>(({ isOpen, onClose }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, logout, isLoading } = useAuth();
  const { trackEvent, trackScreenView } = useAnalytics();

  // Handle escape key for accessibility
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Filter menu items based on auth state and user roles
  const filteredMenuItems = MENU_ITEMS.filter(item => {
    if (item.requiresAuth && !user) return false;
    if (item.roles && user?.customClaims?.role) {
      return item.roles.includes(user.customClaims.role);
    }
    return true;
  });

  // Handle navigation with analytics tracking
  const handleNavigation = useCallback((route: keyof AppTabParamList) => {
    trackEvent('NAVIGATION_CLICK', { route });
    trackScreenView(route);
    navigation.navigate(route);
    onClose();
  }, [navigation, onClose, trackEvent, trackScreenView]);

  // Handle logout with analytics tracking
  const handleLogout = useCallback(async () => {
    try {
      trackEvent('USER_LOGOUT');
      await logout();
      onClose();
    } catch (error) {
      trackEvent('LOGOUT_ERROR', { error: (error as Error).message });
    }
  }, [logout, onClose, trackEvent]);

  return (
    <>
      <Overlay 
        isOpen={isOpen}
        onClick={onClose}
        aria-hidden="true"
        data-testid="menu-overlay"
      />
      <MenuContainer
        isOpen={isOpen}
        top={insets.top}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        data-testid="menu-container"
      >
        <MenuContent>
          {filteredMenuItems.map(item => (
            <MenuItem
              key={item.id}
              variant="tertiary"
              onClick={() => handleNavigation(item.route)}
              aria-label={item.label}
              data-testid={`menu-item-${item.id}`}
            >
              <i className={`icon-${item.icon}`} aria-hidden="true" />
              {item.label}
            </MenuItem>
          ))}
          {user && (
            <MenuItem
              variant="secondary"
              onClick={handleLogout}
              disabled={isLoading}
              loading={isLoading}
              aria-label="Logout"
              data-testid="menu-item-logout"
            >
              <i className="icon-logout" aria-hidden="true" />
              Logout
            </MenuItem>
          )}
        </MenuContent>
      </MenuContainer>
    </>
  );
});

Menu.displayName = 'Menu';

export default Menu;