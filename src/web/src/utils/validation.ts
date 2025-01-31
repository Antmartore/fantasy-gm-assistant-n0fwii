// Zod schema validation library v3.22.0
import { z } from 'zod';
// Profanity filter v3.0.4
import Filter from 'bad-words';

import { AuthCredentials, AuthProvider } from '../types/auth';
import { Team, FantasyPlatform, SportType } from '../types/team';
import { Player, PlayerPosition, InjuryStatus } from '../types/player';

// Constants for validation rules
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
const TEAM_NAME_MIN_LENGTH = 3;
const TEAM_NAME_MAX_LENGTH = 50;
const MFA_CODE_REGEX = /^\d{6}$/;

// Initialize profanity filter
const profanityFilter = new Filter();

// Validation result interface
interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Zod schemas for enhanced type safety
const authSchema = z.object({
  email: z.string().email().regex(EMAIL_REGEX),
  password: z.string().min(PASSWORD_MIN_LENGTH).regex(PASSWORD_COMPLEXITY_REGEX),
  mfaCode: z.string().regex(MFA_CODE_REGEX).optional(),
  provider: z.nativeEnum(AuthProvider)
});

const teamSchema = z.object({
  name: z.string().min(TEAM_NAME_MIN_LENGTH).max(TEAM_NAME_MAX_LENGTH),
  platform: z.nativeEnum(FantasyPlatform),
  sport: z.nativeEnum(SportType),
  roster: z.object({
    playerIds: z.array(z.string()),
    byPosition: z.record(z.nativeEnum(PlayerPosition), z.array(z.string())),
    injured: z.array(z.string())
  })
});

const playerSchema = z.object({
  name: z.string().min(1),
  position: z.nativeEnum(PlayerPosition),
  stats: z.object({
    points: z.number(),
    averagePoints: z.number(),
    weeklyPoints: z.record(z.string(), z.number())
  }),
  injuryStatus: z.nativeEnum(InjuryStatus).nullable()
});

/**
 * Validates user authentication credentials with enhanced security
 * @param credentials - User authentication credentials
 * @returns Validation result with status and errors
 */
export function validateAuthCredentials(credentials: AuthCredentials): ValidationResult {
  try {
    // Parse and validate using Zod schema
    authSchema.parse(credentials);

    const errors: string[] = [];

    // Additional security checks
    if (credentials.password.toLowerCase().includes(credentials.email.split('@')[0])) {
      errors.push('Password cannot contain email username');
    }

    // Common password check (simplified - in production would use a more comprehensive list)
    const commonPasswords = ['Password123!', 'Admin123!', 'Welcome123!'];
    if (commonPasswords.includes(credentials.password)) {
      errors.push('Password is too common');
    }

    // MFA validation if provided
    if (credentials.mfaCode && !MFA_CODE_REGEX.test(credentials.mfaCode)) {
      errors.push('Invalid MFA code format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.errors.map(e => e.message)
      };
    }
    return {
      isValid: false,
      errors: ['Invalid authentication credentials']
    };
  }
}

/**
 * Validates team data with cross-platform consistency
 * @param team - Team data to validate
 * @returns Validation result with status and errors
 */
export function validateTeam(team: Team): ValidationResult {
  try {
    // Parse and validate using Zod schema
    teamSchema.parse(team);

    const errors: string[] = [];

    // Profanity check for team name
    if (profanityFilter.isProfane(team.name)) {
      errors.push('Team name contains inappropriate content');
    }

    // Validate roster based on sport-specific rules
    const rosterValidation = validateRosterConfiguration(team);
    errors.push(...rosterValidation.errors);

    // Platform-specific validations
    if (team.platform === FantasyPlatform.ESPN) {
      // ESPN-specific validation rules
      if (team.name.length > 20) { // ESPN has stricter name length
        errors.push('Team name too long for ESPN platform');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.errors.map(e => e.message)
      };
    }
    return {
      isValid: false,
      errors: ['Invalid team configuration']
    };
  }
}

/**
 * Validates player data with sport-specific rules
 * @param player - Player data to validate
 * @returns Validation result with status and errors
 */
export function validatePlayer(player: Player): ValidationResult {
  try {
    // Parse and validate using Zod schema
    playerSchema.parse(player);

    const errors: string[] = [];

    // Validate stats ranges
    if (player.stats.points < 0) {
      errors.push('Points cannot be negative');
    }

    if (player.stats.averagePoints < 0) {
      errors.push('Average points cannot be negative');
    }

    // Validate position-specific stats
    if (player.position === PlayerPosition.QB) {
      validateQBStats(player, errors);
    } else if (player.position === PlayerPosition.K) {
      validateKickerStats(player, errors);
    }

    // Validate injury status consistency
    if (player.injuryStatus && !Object.values(InjuryStatus).includes(player.injuryStatus)) {
      errors.push('Invalid injury status');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.errors.map(e => e.message)
      };
    }
    return {
      isValid: false,
      errors: ['Invalid player data']
    };
  }
}

/**
 * Validates roster configuration based on sport-specific rules
 * @param team - Team data containing roster configuration
 * @returns Validation result with status and errors
 */
function validateRosterConfiguration(team: Team): ValidationResult {
  const errors: string[] = [];
  const { roster, sport } = team;

  // Sport-specific roster validations
  if (sport === SportType.NFL) {
    if (!roster.byPosition[PlayerPosition.QB] || roster.byPosition[PlayerPosition.QB].length === 0) {
      errors.push('NFL roster must have at least one QB');
    }
    if (!roster.byPosition[PlayerPosition.RB] || roster.byPosition[PlayerPosition.RB].length < 2) {
      errors.push('NFL roster must have at least two RBs');
    }
  } else if (sport === SportType.NBA) {
    // Add NBA-specific roster validations
    errors.push('NBA roster validation not implemented');
  }

  // Validate injured players are in injury slots
  if (roster.injured.length > 0 && !roster.injured.every(id => roster.playerIds.includes(id))) {
    errors.push('Invalid injured player configuration');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates quarterback-specific statistics
 * @param player - Player data for quarterback
 * @param errors - Array to collect validation errors
 */
function validateQBStats(player: Player, errors: string[]): void {
  if (!player.stats.positionStats?.passingYards && player.stats.points > 0) {
    errors.push('QB must have passing yards stats');
  }
}

/**
 * Validates kicker-specific statistics
 * @param player - Player data for kicker
 * @param errors - Array to collect validation errors
 */
function validateKickerStats(player: Player, errors: string[]): void {
  if (!player.stats.positionStats?.fieldGoals && player.stats.points > 0) {
    errors.push('Kicker must have field goal stats');
  }
}