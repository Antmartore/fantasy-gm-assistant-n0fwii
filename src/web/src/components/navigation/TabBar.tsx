import React, { useCallback, useRef } from 'react';
import { Platform, Animated } from 'react-native'; // ^0.72.0
import styled from 'styled-components/native'; // ^5.3.0
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'; // ^6.0.0
import * as Haptics from 'expo-haptics'; // ^12.0.0

import { AppTabParamList } from '../../navigation/types';
import { theme } from '../../config/theme';

// Icon mapping for tab routes
const TAB_ICONS = {
  Dashboard: 'dashboard',
  Teams: 'people',
  Analysis: 'analytics',
  Profile: 'person',
} as const;

// Badge counts for notifications
const TAB_BADGES = {
  Dashboard: 0,
  Teams: 2,
  Analysis: 0,
  Profile: 1,
} as const;

// Styled components
const Container = styled.View`
  background-color: ${theme.colors.background};
  flex-direction: row;
  padding-vertical: ${theme.spacing.sm};
  border-top-width: ${Platform.select({ ios: 0.5, android: 1 })}px;
  border-top-color: ${theme.colors.text.disabled};
  shadow-color: ${theme.colors.primary};
  shadow-offset: 0px -2px;
  shadow-opacity: 0.1;
  shadow-radius: 3px;
  elevation: 4;
`;

const TabButton = styled(Animated.View)`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-vertical: ${theme.spacing.xs};
  min-height: 56px;
`;

const TabIcon = styled(Animated.Text)`
  font-family: 'MaterialIcons';
  font-size: 24px;
  margin-bottom: 4px;
`;

const TabLabel = styled.Text`
  font-family: ${theme.typography.fontFamily.primary};
  font-size: ${theme.typography.fontSize.xs};
  color: ${theme.colors.text.secondary};
`;

const Badge = styled(Animated.View)<{ count: number }>`
  position: absolute;
  top: -4px;
  right: -4px;
  background-color: ${theme.colors.status.error};
  border-radius: 10px;
  min-width: ${props => props.count > 99 ? '24px' : '20px'};
  height: 20px;
  justify-content: center;
  align-items: center;
`;

const BadgeText = styled.Text`
  color: ${theme.colors.background};
  font-size: ${theme.typography.fontSize.xs};
  font-weight: ${theme.typography.fontWeight.bold};
`;

interface TabBarIconProps {
  routeName: keyof AppTabParamList;
  focused: boolean;
  pressAnimation: Animated.Value;
}

const TabBarIcon: React.FC<TabBarIconProps> = ({ routeName, focused, pressAnimation }) => {
  const iconName = TAB_ICONS[routeName];
  const color = focused ? theme.colors.primary : theme.colors.text.secondary;

  const animatedStyle = {
    transform: [{
      scale: pressAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.95],
      }),
    }],
  };

  return (
    <TabIcon
      style={animatedStyle}
      allowFontScaling={false}
      accessibilityLabel={`${routeName} tab`}
    >
      {String.fromCharCode(parseInt(iconName, 16))}
    </TabIcon>
  );
};

interface BadgeProps {
  count: number;
  scaleAnimation: Animated.Value;
}

const TabBadge: React.FC<BadgeProps> = ({ count, scaleAnimation }) => {
  if (count === 0) return null;

  const displayCount = count > 99 ? '99+' : count.toString();

  const animatedStyle = {
    transform: [{
      scale: scaleAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0.8, 1],
      }),
    }],
  };

  return (
    <Badge
      style={animatedStyle}
      count={count}
      accessibilityLabel={`${count} notifications`}
    >
      <BadgeText>{displayCount}</BadgeText>
    </Badge>
  );
};

export const TabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  // Animation refs for each tab
  const pressAnimations = useRef(
    state.routes.map(() => new Animated.Value(0))
  ).current;

  const badgeAnimations = useRef(
    state.routes.map(() => new Animated.Value(1))
  ).current;

  const handleTabPress = useCallback((route: string, index: number) => {
    // Trigger haptic feedback
    Haptics.selectionAsync();

    // Animate press effect
    Animated.sequence([
      Animated.timing(pressAnimations[index], {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(pressAnimations[index], {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Navigate to the route
    navigation.navigate(route);
  }, [navigation, pressAnimations]);

  return (
    <Container>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const routeName = route.name as keyof AppTabParamList;
        const isFocused = state.index === index;

        return (
          <TabButton
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={() => handleTabPress(routeName, index)}
          >
            <TabBarIcon
              routeName={routeName}
              focused={isFocused}
              pressAnimation={pressAnimations[index]}
            />
            <TabLabel style={{ color: isFocused ? theme.colors.primary : theme.colors.text.secondary }}>
              {routeName}
            </TabLabel>
            <TabBadge
              count={TAB_BADGES[routeName]}
              scaleAnimation={badgeAnimations[index]}
            />
          </TabButton>
        );
      })}
    </Container>
  );
};

export default TabBar;