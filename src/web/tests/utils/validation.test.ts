import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { validateAuthCredentials, validateTeam, validatePlayer } from '../../src/utils/validation';
import { AuthProvider } from '../../src/types/auth';
import { FantasyPlatform, SportType } from '../../src/types/team';
import { PlayerPosition, InjuryStatus } from '../../src/types/player';

describe('validateAuthCredentials', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should validate correct email and password format', () => {
    const credentials = {
      email: 'user@example.com',
      password: 'SecurePass123!@#',
      provider: AuthProvider.EMAIL,
      providerToken: null
    };
    const result = validateAuthCredentials(credentials);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate complex email patterns', () => {
    const credentials = {
      email: 'user.name+tag@sub.domain.co.uk',
      password: 'SecurePass123!@#',
      provider: AuthProvider.EMAIL,
      providerToken: null
    };
    const result = validateAuthCredentials(credentials);
    expect(result.isValid).toBe(true);
  });

  it('should reject passwords containing email username', () => {
    const credentials = {
      email: 'john@example.com',
      password: 'john123Password!',
      provider: AuthProvider.EMAIL,
      providerToken: null
    };
    const result = validateAuthCredentials(credentials);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password cannot contain email username');
  });

  it('should reject common passwords', () => {
    const credentials = {
      email: 'user@example.com',
      password: 'Password123!',
      provider: AuthProvider.EMAIL,
      providerToken: null
    };
    const result = validateAuthCredentials(credentials);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Password is too common');
  });

  it('should validate MFA code format when provided', () => {
    const credentials = {
      email: 'user@example.com',
      password: 'SecurePass123!@#',
      provider: AuthProvider.EMAIL,
      providerToken: null,
      mfaCode: '123456'
    };
    const result = validateAuthCredentials(credentials);
    expect(result.isValid).toBe(true);
  });

  it('should reject invalid MFA code format', () => {
    const credentials = {
      email: 'user@example.com',
      password: 'SecurePass123!@#',
      provider: AuthProvider.EMAIL,
      providerToken: null,
      mfaCode: '12345' // Too short
    };
    const result = validateAuthCredentials(credentials);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid MFA code format');
  });
});

describe('validateTeam', () => {
  const mockTeam = {
    id: '123',
    name: 'Thunder Cats',
    platform: FantasyPlatform.ESPN,
    sport: SportType.NFL,
    userId: 'user123',
    roster: {
      playerIds: ['p1', 'p2'],
      byPosition: {
        [PlayerPosition.QB]: ['p1'],
        [PlayerPosition.RB]: ['p2', 'p3']
      },
      injured: []
    },
    settings: {
      rosterSize: 16,
      positionLimits: {
        [PlayerPosition.QB]: 3,
        [PlayerPosition.RB]: 6
      }
    }
  };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should validate a correctly formatted team', () => {
    const result = validateTeam(mockTeam);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should enforce team name length limits', () => {
    const longNameTeam = {
      ...mockTeam,
      name: 'This is an extremely long team name that exceeds the maximum length allowed'
    };
    const result = validateTeam(longNameTeam);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Team name too long for ESPN platform');
  });

  it('should validate NFL roster requirements', () => {
    const invalidRosterTeam = {
      ...mockTeam,
      roster: {
        ...mockTeam.roster,
        byPosition: {
          [PlayerPosition.RB]: ['p2'] // Missing QB
        }
      }
    };
    const result = validateTeam(invalidRosterTeam);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('NFL roster must have at least one QB');
  });

  it('should validate injured player configuration', () => {
    const invalidInjuredTeam = {
      ...mockTeam,
      roster: {
        ...mockTeam.roster,
        injured: ['nonexistent']
      }
    };
    const result = validateTeam(invalidInjuredTeam);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid injured player configuration');
  });
});

describe('validatePlayer', () => {
  const mockPlayer = {
    id: 'player123',
    name: 'John Doe',
    position: PlayerPosition.QB,
    stats: {
      points: 100,
      averagePoints: 20,
      weeklyPoints: { '1': 25, '2': 15 },
      positionStats: {
        passingYards: 300,
        touchdowns: 2
      }
    },
    injuryStatus: null
  };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should validate a correctly formatted player', () => {
    const result = validatePlayer(mockPlayer);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject negative points values', () => {
    const negativePointsPlayer = {
      ...mockPlayer,
      stats: {
        ...mockPlayer.stats,
        points: -10
      }
    };
    const result = validatePlayer(negativePointsPlayer);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Points cannot be negative');
  });

  it('should validate QB-specific stats', () => {
    const invalidQBPlayer = {
      ...mockPlayer,
      stats: {
        ...mockPlayer.stats,
        positionStats: {}
      }
    };
    const result = validatePlayer(invalidQBPlayer);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('QB must have passing yards stats');
  });

  it('should validate kicker-specific stats', () => {
    const invalidKickerPlayer = {
      ...mockPlayer,
      position: PlayerPosition.K,
      stats: {
        ...mockPlayer.stats,
        positionStats: {}
      }
    };
    const result = validatePlayer(invalidKickerPlayer);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Kicker must have field goal stats');
  });

  it('should validate injury status values', () => {
    const validInjuredPlayer = {
      ...mockPlayer,
      injuryStatus: InjuryStatus.QUESTIONABLE
    };
    const result = validatePlayer(validInjuredPlayer);
    expect(result.isValid).toBe(true);
  });

  it('should reject invalid injury status values', () => {
    const invalidInjuredPlayer = {
      ...mockPlayer,
      injuryStatus: 'INVALID_STATUS' as InjuryStatus
    };
    const result = validatePlayer(invalidInjuredPlayer);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Invalid injury status');
  });
});