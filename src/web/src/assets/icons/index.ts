import React, { useMemo } from 'react';
import { ViewStyle } from 'react-native';
import Svg, { SvgProps, Path } from 'react-native-svg';

// Version comments for external dependencies
// react: ^18.0.0
// react-native-svg: ^13.0.0

// Global constants
export const DEFAULT_ICON_SIZE = 24;
export const DEFAULT_ICON_COLOR = {
  light: '#1A1A1A',
  dark: '#FFFFFF',
};
export const ICON_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };

// Type definitions
export interface ThemeColor {
  light: string;
  dark: string;
}

export interface IconProps {
  size?: number;
  color?: string | ThemeColor;
  style?: ViewStyle;
  accessibilityLabel?: string;
  testID?: string;
  onPress?: () => void;
  direction?: 'ltr' | 'rtl';
}

// Icon creation utility
const createIcon = (
  SvgContent: React.FC<SvgProps>,
  defaultProps?: Partial<IconProps>
): React.FC<IconProps> => {
  return React.memo(({
    size = DEFAULT_ICON_SIZE,
    color = DEFAULT_ICON_COLOR,
    style,
    accessibilityLabel,
    testID,
    onPress,
    direction = 'ltr',
    ...props
  }: IconProps) => {
    const colorValue = useMemo(() => {
      if (typeof color === 'string') return color;
      // Use light theme color by default, dark theme handling would be implemented via theme context
      return color.light;
    }, [color]);

    const transform = useMemo(() => {
      return direction === 'rtl' ? [{ scaleX: -1 }] : undefined;
    }, [direction]);

    return (
      <SvgContent
        width={size}
        height={size}
        fill={colorValue}
        style={[style, transform && { transform }]}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        hitSlop={ICON_HIT_SLOP}
        {...props}
      />
    );
  });
};

// Icon Components
export const HomeIcon = createIcon(({ ...props }) => (
  <Svg viewBox="0 0 24 24" {...props}>
    <Path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </Svg>
));

export const TeamsIcon = createIcon(({ ...props }) => (
  <Svg viewBox="0 0 24 24" {...props}>
    <Path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
  </Svg>
));

export const AnalysisIcon = createIcon(({ ...props }) => (
  <Svg viewBox="0 0 24 24" {...props}>
    <Path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
  </Svg>
));

export const ProfileIcon = createIcon(({ ...props }) => (
  <Svg viewBox="0 0 24 24" {...props}>
    <Path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </Svg>
));

export const PremiumIcon = createIcon(({ ...props }) => (
  <Svg viewBox="0 0 24 24" {...props}>
    <Path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </Svg>
));

export const InfoIcon = createIcon(({ ...props }) => (
  <Svg viewBox="0 0 24 24" {...props}>
    <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
  </Svg>
));

export const AddIcon = createIcon(({ ...props }) => (
  <Svg viewBox="0 0 24 24" {...props}>
    <Path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </Svg>
));

export const CloseIcon = createIcon(({ ...props }) => (
  <Svg viewBox="0 0 24 24" {...props}>
    <Path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </Svg>
));