import { DefaultTheme } from 'styled-components'; // v5.3.0

// Type definitions
export interface Theme extends DefaultTheme {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: {
      primary: string;
      secondary: string;
      disabled: string;
    };
    status: {
      error: string;
      warning: string;
      success: string;
      info: string;
    };
    semantic: {
      win: string;
      loss: string;
      neutral: string;
      highlight: string;
    };
  };
  typography: {
    fontFamily: {
      primary: string;
      monospace: string;
    };
    fontSize: {
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
      xxl: string;
    };
    fontWeight: {
      regular: number;
      medium: number;
      semibold: number;
      bold: number;
    };
    lineHeight: {
      tight: number;
      normal: number;
      relaxed: number;
    };
  };
  spacing: {
    base: number;
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    xxl: string;
  };
  breakpoints: {
    mobileS: number;
    mobileL: number;
    tablet: number;
    desktop: number;
    desktopL: number;
  };
  zIndex: {
    modal: number;
    overlay: number;
    dropdown: number;
    header: number;
    tooltip: number;
  };
}

// Constants
export const COLORS = {
  primary: '#1A1A1A',
  secondary: '#00FF88',
  accent: '#4A90E2',
  background: '#FFFFFF',
  surface: '#F5F5F5',
  text: {
    primary: '#1A1A1A',
    secondary: '#757575',
    disabled: '#BDBDBD',
  },
  status: {
    error: '#FF4444',
    warning: '#FFA000',
    success: '#00C853',
    info: '#2196F3',
  },
  semantic: {
    win: '#00C853',
    loss: '#FF4444',
    neutral: '#9E9E9E',
    highlight: '#FFC107',
  },
} as const;

export const DARK_COLORS = {
  primary: '#FFFFFF',
  secondary: '#00FF88',
  accent: '#4A90E2',
  background: '#121212',
  surface: '#1E1E1E',
  text: {
    primary: '#FFFFFF',
    secondary: '#BDBDBD',
    disabled: '#757575',
  },
} as const;

export const TYPOGRAPHY = {
  fontFamily: {
    primary: 'Inter, system-ui, sans-serif',
    monospace: 'SF Mono, monospace',
  },
  fontSize: {
    xs: '12px',
    sm: '14px',
    md: '16px',
    lg: '20px',
    xl: '24px',
    xxl: '32px',
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const SPACING = {
  base: 8,
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
} as const;

export const BREAKPOINTS = {
  mobileS: 320,
  mobileL: 425,
  tablet: 768,
  desktop: 1024,
  desktopL: 1440,
} as const;

export const Z_INDEX = {
  modal: 1000,
  overlay: 900,
  dropdown: 800,
  header: 700,
  tooltip: 600,
} as const;

// Helper functions
export const createMediaQuery = (breakpoint: keyof typeof BREAKPOINTS): string => {
  return `@media (min-width: ${BREAKPOINTS[breakpoint]}px)`;
};

export const createTheme = (themeOverrides = {}): Theme => {
  return {
    colors: {
      ...COLORS,
      ...themeOverrides,
    },
    typography: TYPOGRAPHY,
    spacing: SPACING,
    breakpoints: BREAKPOINTS,
    zIndex: Z_INDEX,
  } as Theme;
};

// Default theme export
export const theme = createTheme();

// Dark theme export
export const darkTheme = createTheme({
  colors: {
    ...COLORS,
    ...DARK_COLORS,
    status: COLORS.status,
    semantic: COLORS.semantic,
  },
});