import React, { useState, useCallback, useEffect, useRef } from 'react';
import styled from 'styled-components'; // v5.3.0
import { debounce } from 'lodash'; // v4.17.21
import Input from '../base/Input';
import { useCache } from '../../hooks/useCache';
import { validatePlayer } from '../../utils/validation';
import { PlayerSearchParams, PlayerPosition, WeatherImpact } from '../../types/player';
import { FantasyPlatform } from '../../types/team';

// Constants
const DEFAULT_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const SEARCH_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const WEATHER_IMPACT_THRESHOLD = 30;

// Types
interface SearchFilters {
  positions: PlayerPosition[];
  weatherImpact: boolean;
  platform: FantasyPlatform;
}

interface SearchBarProps {
  onSearch: (query: string, filters: SearchFilters) => Promise<void>;
  placeholder?: string;
  initialValue?: string;
  debounceMs?: number;
  minQueryLength?: number;
  platform?: FantasyPlatform;
  weatherImpact?: boolean;
  ariaLabel?: string;
}

// Styled components with WCAG 2.1 Level AA compliance
const SearchContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
`;

const SearchStatus = styled.div<{ isVisible: boolean }>`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  ${({ isVisible }) => isVisible && `
    width: auto;
    height: auto;
    margin: 8px 0;
    clip: auto;
  `}
`;

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  placeholder = 'Search players, teams, or fantasy data...',
  initialValue = '',
  debounceMs = DEFAULT_DEBOUNCE_MS,
  minQueryLength = MIN_QUERY_LENGTH,
  platform = FantasyPlatform.ESPN,
  weatherImpact = false,
  ariaLabel = 'Search fantasy sports data'
}) => {
  // State management
  const [query, setQuery] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    positions: [],
    weatherImpact: false,
    platform
  });

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const searchStatusRef = useRef<HTMLDivElement>(null);

  // Cache setup with TTL
  const { data: cachedResults, setCache, error: cacheError } = useCache<PlayerSearchParams>(
    'search_results',
    SEARCH_CACHE_TTL,
    {
      validateData: (data) => {
        return data && typeof data === 'object' && 'query' in data;
      }
    }
  );

  // Debounced search handler
  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string, searchFilters: SearchFilters) => {
      if (searchQuery.length < minQueryLength) {
        return;
      }

      setLoading(true);

      try {
        // Check cache first
        const cacheKey = `${searchQuery}_${JSON.stringify(searchFilters)}`;
        const cachedData = cachedResults?.[cacheKey];

        if (cachedData) {
          // Validate cached data
          const validationResult = validatePlayer(cachedData);
          if (validationResult.isValid) {
            await onSearch(searchQuery, searchFilters);
            return;
          }
        }

        // Perform new search
        await onSearch(searchQuery, searchFilters);

        // Cache results
        await setCache({
          query: searchQuery,
          filters: searchFilters,
          timestamp: Date.now()
        });

      } catch (error) {
        console.error('Search error:', error);
        announceSearchStatus('Search failed. Please try again.');
      } finally {
        setLoading(false);
      }
    }, debounceMs),
    [onSearch, cachedResults, setCache, minQueryLength]
  );

  // Handle input changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    debouncedSearch(newQuery, filters);
  }, [debouncedSearch, filters]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: Partial<SearchFilters>) => {
    setFilters(prev => {
      const updated = { ...prev, ...newFilters };
      debouncedSearch(query, updated);
      return updated;
    });
  }, [query, debouncedSearch]);

  // Announce search status for screen readers
  const announceSearchStatus = useCallback((message: string) => {
    if (searchStatusRef.current) {
      searchStatusRef.current.textContent = message;
    }
  }, []);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Escape':
        setQuery('');
        inputRef.current?.blur();
        break;
      case 'Enter':
        if (query.length >= minQueryLength) {
          debouncedSearch(query, filters);
        }
        break;
    }
  }, [query, filters, debouncedSearch, minQueryLength]);

  // Effect for weather impact monitoring
  useEffect(() => {
    if (weatherImpact) {
      const checkWeatherImpact = async () => {
        try {
          const response = await fetch('/api/weather-impact');
          const data = await response.json();
          if (data.impact > WEATHER_IMPACT_THRESHOLD) {
            handleFilterChange({ weatherImpact: true });
          }
        } catch (error) {
          console.error('Weather impact check failed:', error);
        }
      };

      checkWeatherImpact();
    }
  }, [weatherImpact, handleFilterChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  return (
    <SearchContainer role="search" aria-label={ariaLabel}>
      <Input
        ref={inputRef}
        name="search"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby="search-status"
        aria-busy={loading}
        disabled={loading}
        type="search"
        autoComplete="off"
        spellCheck="false"
      />
      <SearchStatus
        ref={searchStatusRef}
        id="search-status"
        role="status"
        aria-live="polite"
        isVisible={loading || !!cacheError}
      >
        {loading ? 'Searching...' : cacheError ? 'Search error occurred' : ''}
      </SearchStatus>
    </SearchContainer>
  );
};

export default SearchBar;