import { css } from 'styled-components'; // v5.3.0
import { breakpoints } from '../config/theme';

// Types
export type ResponsiveValue<T> = {
  mobileS?: T;
  mobileL?: T;
  tablet?: T;
  desktop?: T;
};

export type ResponsiveObject = {
  mobileS?: Record<string, unknown>;
  mobileL?: Record<string, unknown>;
  tablet?: Record<string, unknown>;
  desktop?: Record<string, unknown>;
};

export type MediaQueryProps = {
  minWidth: number;
  styles: string | Record<string, unknown>;
};

// Constants
export const CONTAINER_PADDING: ResponsiveValue<string> = {
  mobileS: '16px',
  mobileL: '24px',
  tablet: '32px',
  desktop: '48px',
};

export const GRID_COLUMNS: ResponsiveValue<number> = {
  mobileS: 1,
  mobileL: 1,
  tablet: 2,
  desktop: 3,
};

export const MAX_CONTENT_WIDTH = '1200px';

// Media query generator with memoization
const memoizedMediaQueries: Map<number, Function> = new Map();

const generateMediaQuery = ({ minWidth, styles }: MediaQueryProps): string => {
  if (memoizedMediaQueries.has(minWidth)) {
    return memoizedMediaQueries.get(minWidth)!(styles);
  }

  const mediaQueryFn = (styleContent: string | Record<string, unknown>) => css`
    @media (min-width: ${minWidth}px) {
      ${typeof styleContent === 'string' ? styleContent : css(styleContent)}
    }
  `;

  memoizedMediaQueries.set(minWidth, mediaQueryFn);
  return mediaQueryFn(styles);
};

// Media query helpers
export const media = {
  mobileS: (styles: string | Record<string, unknown>) =>
    generateMediaQuery({ minWidth: breakpoints.mobileS, styles }),
  mobileL: (styles: string | Record<string, unknown>) =>
    generateMediaQuery({ minWidth: breakpoints.mobileL, styles }),
  tablet: (styles: string | Record<string, unknown>) =>
    generateMediaQuery({ minWidth: breakpoints.tablet, styles }),
  desktop: (styles: string | Record<string, unknown>) =>
    generateMediaQuery({ minWidth: breakpoints.desktop, styles }),
};

// Responsive style generator
export const createResponsiveStyles = (stylesByBreakpoint: ResponsiveObject) => css`
  ${stylesByBreakpoint.mobileS && css(stylesByBreakpoint.mobileS)}
  ${stylesByBreakpoint.mobileL && media.mobileL(stylesByBreakpoint.mobileL)}
  ${stylesByBreakpoint.tablet && media.tablet(stylesByBreakpoint.tablet)}
  ${stylesByBreakpoint.desktop && media.desktop(stylesByBreakpoint.desktop)}
`;

// Responsive container
export const responsiveContainer = css`
  width: 100%;
  max-width: ${MAX_CONTENT_WIDTH};
  margin: 0 auto;
  padding: ${CONTAINER_PADDING.mobileS};

  ${media.mobileL`
    padding: ${CONTAINER_PADDING.mobileL};
  `}

  ${media.tablet`
    padding: ${CONTAINER_PADDING.tablet};
  `}

  ${media.desktop`
    padding: ${CONTAINER_PADDING.desktop};
  `}
`;

// Responsive grid
export const responsiveGrid = css`
  display: grid;
  grid-template-columns: repeat(${GRID_COLUMNS.mobileS}, 1fr);
  gap: ${CONTAINER_PADDING.mobileS};
  width: 100%;

  ${media.mobileL`
    grid-template-columns: repeat(${GRID_COLUMNS.mobileL}, 1fr);
    gap: ${CONTAINER_PADDING.mobileL};
  `}

  ${media.tablet`
    grid-template-columns: repeat(${GRID_COLUMNS.tablet}, 1fr);
    gap: ${CONTAINER_PADDING.tablet};
  `}

  ${media.desktop`
    grid-template-columns: repeat(${GRID_COLUMNS.desktop}, 1fr);
    gap: ${CONTAINER_PADDING.desktop};
  `}
`;

// Responsive flex
export const responsiveFlex = css`
  display: flex;
  flex-direction: column;
  gap: ${CONTAINER_PADDING.mobileS};

  ${media.tablet`
    flex-direction: row;
    gap: ${CONTAINER_PADDING.tablet};
  `}

  ${media.desktop`
    gap: ${CONTAINER_PADDING.desktop};
  `}
`;

// Performance optimization: Pre-compile common media queries
Object.keys(breakpoints).forEach((breakpoint) => {
  const width = breakpoints[breakpoint as keyof typeof breakpoints];
  memoizedMediaQueries.set(width, (styles: string | Record<string, unknown>) =>
    generateMediaQuery({ minWidth: width, styles })
  );
});