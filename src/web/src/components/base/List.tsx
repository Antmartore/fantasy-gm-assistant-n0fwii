import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { css } from 'styled-components'; // v5.3.0
import { theme } from '../../config/theme';
import Card from './Card';

// Types
export interface ListProps {
  items: Array<any>;
  renderItem: (item: any, index: number) => React.ReactNode;
  variant?: 'primary' | 'secondary' | 'accent';
  loading?: boolean;
  emptyMessage?: string;
  onItemClick?: (item: any, index: number) => void;
  selectedIndex?: number;
  className?: string;
  virtualized?: boolean;
  itemHeight?: number;
  ariaLabel?: string;
  role?: 'listbox' | 'list' | 'grid';
}

// Styled components
const StyledList = styled.div<Pick<ListProps, 'variant' | 'loading'>>`
  display: flex;
  flex-direction: column;
  gap: ${theme.spacing.sm};
  width: 100%;
  position: relative;
  will-change: transform;
  contain: content;
  min-height: 0;

  /* Variant styles */
  ${props => props.variant && css`
    color: ${theme.colors[props.variant]};
  `}

  /* Loading state */
  ${props => props.loading && css`
    opacity: 0.7;
    pointer-events: none;
  `}

  /* Empty state */
  &:empty::after {
    content: attr(data-empty-message);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: ${theme.spacing.lg};
    color: ${theme.colors.text.secondary};
    font-style: italic;
  }

  /* Responsive styles */
  @media (min-width: ${theme.breakpoints.mobileS}px) {
    gap: ${theme.spacing.xs};
    touch-action: manipulation;
    min-height: 44px; /* WCAG minimum touch target */
  }

  @media (min-width: ${theme.breakpoints.tablet}px) {
    gap: ${theme.spacing.md};
    min-height: 48px;
  }

  @media (min-width: ${theme.breakpoints.desktop}px) {
    gap: ${theme.spacing.lg};
    min-height: 52px;
  }
`;

const ListItem = styled.div<{ selected?: boolean }>`
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  outline: none;
  position: relative;

  /* Selected state */
  ${props => props.selected && css`
    transform: translateX(4px);
    border-left: 4px solid ${theme.colors.accent};
    background: ${theme.colors.semantic.highlight};
  `}

  /* Interactive states */
  &:hover {
    transform: translateX(2px);
    opacity: 0.9;
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.accent};
    outline-offset: 2px;
  }
`;

export const List = React.memo<ListProps>(({
  items,
  renderItem,
  variant = 'primary',
  loading = false,
  emptyMessage = 'No items to display',
  onItemClick,
  selectedIndex,
  className,
  virtualized = false,
  itemHeight = 60,
  ariaLabel,
  role = 'list',
  ...props
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Handle virtualization
  const updateVisibleRange = useCallback(() => {
    if (!virtualized || !listRef.current) return;

    const { scrollTop, clientHeight } = listRef.current;
    const start = Math.floor(scrollTop / itemHeight);
    const end = start + Math.ceil(clientHeight / itemHeight) + 1;

    setVisibleRange({
      start: Math.max(0, start - 5), // Buffer
      end: Math.min(items.length, end + 5)
    });
  }, [virtualized, itemHeight, items.length]);

  // Set up intersection observer for lazy loading
  useEffect(() => {
    if (!virtualized) return;

    observerRef.current = new IntersectionObserver(updateVisibleRange, {
      root: listRef.current,
      threshold: 0.1
    });

    return () => observerRef.current?.disconnect();
  }, [virtualized, updateVisibleRange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (!onItemClick) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        onItemClick(items[index], index);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (index < items.length - 1) {
          onItemClick(items[index + 1], index + 1);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (index > 0) {
          onItemClick(items[index - 1], index - 1);
        }
        break;
    }
  }, [items, onItemClick]);

  // Memoize visible items for performance
  const visibleItems = useMemo(() => {
    if (!virtualized) return items;
    return items.slice(visibleRange.start, visibleRange.end);
  }, [items, virtualized, visibleRange]);

  // Render loading state
  if (loading) {
    return (
      <StyledList
        variant={variant}
        loading={loading}
        className={className}
        aria-busy="true"
        role={role}
        aria-label={ariaLabel}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={`skeleton-${i}`} loading />
        ))}
      </StyledList>
    );
  }

  // Render empty state
  if (!items.length) {
    return (
      <StyledList
        variant={variant}
        className={className}
        data-empty-message={emptyMessage}
        role={role}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <StyledList
      ref={listRef}
      variant={variant}
      className={className}
      role={role}
      aria-label={ariaLabel}
      onScroll={virtualized ? updateVisibleRange : undefined}
      style={virtualized ? { height: items.length * itemHeight } : undefined}
      {...props}
    >
      {visibleItems.map((item, index) => {
        const actualIndex = virtualized ? index + visibleRange.start : index;
        return (
          <ListItem
            key={actualIndex}
            selected={selectedIndex === actualIndex}
            onClick={() => onItemClick?.(item, actualIndex)}
            onKeyDown={(e) => handleKeyDown(e, actualIndex)}
            tabIndex={onItemClick ? 0 : -1}
            role={role === 'listbox' ? 'option' : 'listitem'}
            aria-selected={selectedIndex === actualIndex}
          >
            {renderItem(item, actualIndex)}
          </ListItem>
        );
      })}
    </StyledList>
  );
});

List.displayName = 'List';

export default List;