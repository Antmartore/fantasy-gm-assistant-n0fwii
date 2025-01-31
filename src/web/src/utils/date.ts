import { format } from 'date-fns'; // ^2.30.0
import { utcToZonedTime } from 'date-fns-tz'; // ^2.0.0
import { SUPPORTED_SPORTS } from '../config/constants';

// Constants for date formatting
const DEFAULT_DATE_FORMAT = 'MMM dd, yyyy';
const DEFAULT_TIME_FORMAT = 'h:mm a z';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Sport-specific date formats
const STAT_DATE_FORMATS: Record<SUPPORTED_SPORTS, string> = {
  [SUPPORTED_SPORTS.NFL]: 'Week W, yyyy',
  [SUPPORTED_SPORTS.NBA]: 'MMM dd, yyyy',
  [SUPPORTED_SPORTS.MLB]: 'MMM dd, yyyy',
};

// Interface for date formatting options
export interface DateFormatOptions {
  format?: string;
  timezone?: string;
  includeYear?: boolean;
  locale?: string;
  includeDST?: boolean;
}

// Cache for memoized results
const dateCache = new Map<string, { value: string; timestamp: number }>();

/**
 * Formats a date into the application's standard format with locale support
 * @param date - Date to format
 * @param formatStr - Optional format string
 * @param options - Optional formatting options
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | string | number,
  formatStr?: string,
  options: DateFormatOptions = {}
): string {
  try {
    const cacheKey = `format_${date}_${formatStr}_${JSON.stringify(options)}`;
    const cached = dateCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.value;
    }

    const parsedDate = date instanceof Date ? date : new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid date provided');
    }

    const finalFormat = formatStr || DEFAULT_DATE_FORMAT;
    const result = format(parsedDate, finalFormat, {
      locale: options.locale ? require(`date-fns/locale/${options.locale}`) : undefined
    });

    dateCache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error('Date formatting error:', error);
    return 'Invalid Date';
  }
}

/**
 * Formats game time with timezone support and DST handling
 * @param date - Game date/time
 * @param timezone - Target timezone
 * @param options - Optional formatting options
 * @returns Formatted game time string
 */
export function formatGameTime(
  date: Date | string | number,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  options: DateFormatOptions = {}
): string {
  try {
    const cacheKey = `game_${date}_${timezone}_${JSON.stringify(options)}`;
    const cached = dateCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.value;
    }

    const parsedDate = date instanceof Date ? date : new Date(date);
    const zonedDate = utcToZonedTime(parsedDate, timezone);
    
    const formatStr = options.format || DEFAULT_TIME_FORMAT;
    let result = format(zonedDate, formatStr);

    if (options.includeDST) {
      const isDST = zonedDate.getTimezoneOffset() < new Date(zonedDate.getFullYear(), 0, 1).getTimezoneOffset();
      result += isDST ? ' (DST)' : '';
    }

    dateCache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error('Game time formatting error:', error);
    return 'Invalid Game Time';
  }
}

/**
 * Formats date for player statistics with sport-specific logic
 * @param date - Statistics date
 * @param sport - Sport type
 * @param options - Optional formatting options
 * @returns Formatted statistics date string
 */
export function formatStatDate(
  date: Date | string | number,
  sport: SUPPORTED_SPORTS,
  options: DateFormatOptions = {}
): string {
  try {
    const cacheKey = `stat_${date}_${sport}_${JSON.stringify(options)}`;
    const cached = dateCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.value;
    }

    if (!Object.values(SUPPORTED_SPORTS).includes(sport)) {
      throw new Error('Unsupported sport type');
    }

    const parsedDate = date instanceof Date ? date : new Date(date);
    const formatStr = options.format || STAT_DATE_FORMATS[sport];
    
    const result = format(parsedDate, formatStr, {
      locale: options.locale ? require(`date-fns/locale/${options.locale}`) : undefined
    });

    dateCache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error('Stat date formatting error:', error);
    return 'Invalid Stat Date';
  }
}

/**
 * Calculates fantasy sport week number
 * @param date - Date to calculate week for
 * @param sport - Sport type
 * @returns Week number or -1 for error
 */
export function getWeekNumber(
  date: Date | string | number,
  sport: SUPPORTED_SPORTS
): number {
  try {
    const cacheKey = `week_${date}_${sport}`;
    const cached = dateCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return parseInt(cached.value);
    }

    const parsedDate = date instanceof Date ? date : new Date(date);
    
    // Sport-specific season start dates (simplified example)
    const seasonStarts = {
      [SUPPORTED_SPORTS.NFL]: new Date(parsedDate.getFullYear(), 8, 1), // September 1st
      [SUPPORTED_SPORTS.NBA]: new Date(parsedDate.getFullYear(), 9, 15), // October 15th
      [SUPPORTED_SPORTS.MLB]: new Date(parsedDate.getFullYear(), 3, 1), // April 1st
    };

    const startDate = seasonStarts[sport];
    const weekNumber = Math.floor((parsedDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    
    if (weekNumber < 1) return 1;
    
    const result = weekNumber.toString();
    dateCache.set(cacheKey, { value: result, timestamp: Date.now() });
    return weekNumber;
  } catch (error) {
    console.error('Week number calculation error:', error);
    return -1;
  }
}

/**
 * Checks if date is a game day
 * @param date - Date to check
 * @param sport - Sport type
 * @returns Boolean indicating if it's a game day
 */
export function isGameDay(
  date: Date | string | number,
  sport: SUPPORTED_SPORTS
): boolean {
  try {
    const cacheKey = `gameday_${date}_${sport}`;
    const cached = dateCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.value === 'true';
    }

    const parsedDate = date instanceof Date ? date : new Date(date);
    const dayOfWeek = parsedDate.getDay();

    // Sport-specific game day logic
    const isGameDay = (() => {
      switch (sport) {
        case SUPPORTED_SPORTS.NFL:
          return dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 4; // Sunday, Monday, Thursday
        case SUPPORTED_SPORTS.NBA:
          return dayOfWeek !== 6; // All days except Saturday
        case SUPPORTED_SPORTS.MLB:
          return true; // Every day during season
        default:
          return false;
      }
    })();

    const result = isGameDay.toString();
    dateCache.set(cacheKey, { value: result, timestamp: Date.now() });
    return isGameDay;
  } catch (error) {
    console.error('Game day check error:', error);
    return false;
  }
}