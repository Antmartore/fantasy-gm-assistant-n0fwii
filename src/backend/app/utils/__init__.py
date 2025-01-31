"""
Main entry point for the Fantasy GM Assistant backend utilities package.
Provides centralized access to commonly used utilities, constants, enums,
validators, helpers and decorators for cross-cutting concerns.

Version: 1.0.0
"""

# Import all utility modules
from app.utils.constants import (
    API_VERSION,
    API_PREFIX,
    SUPPORTED_SPORTS,
    RATE_LIMIT_TEAMS,
    RATE_LIMIT_PLAYERS,
    RATE_LIMIT_TRADES,
    RATE_LIMIT_SIMULATIONS,
    RATE_LIMIT_LINEUPS,
    CACHE_TTL_PLAYER_STATS,
    CACHE_TTL_WEATHER,
    CACHE_TTL_TRADE_ANALYSIS,
    CACHE_TTL_VIDEO,
    MAX_SIMULATION_SCENARIOS,
    MAX_TRADE_PLAYERS,
    MAX_LINEUP_CHANGES,
    GPT4_MAX_TOKENS,
    DEFAULT_PAGINATION_LIMIT,
    MAX_PAGINATION_LIMIT
)

from app.utils.enums import (
    SportType,
    PlayerPosition,
    TradeStatus,
    Platform
)

from app.utils.validators import (
    validate_email,
    validate_username,
    validate_password,
    validate_trade_players,
    validate_lineup_changes,
    SportValidator
)

from app.utils.helpers import (
    generate_cache_key,
    get_cache_ttl,
    format_player_stats,
    calculate_trade_risk,
    convert_platform_data,
    StatisticsCalculator
)

from app.utils.decorators import (
    require_auth,
    require_premium,
    cache_response,
    log_execution,
    AsyncRateLimiter
)

# Export all public utilities
__all__ = [
    # Constants
    'API_VERSION',
    'API_PREFIX',
    'SUPPORTED_SPORTS',
    'RATE_LIMIT_TEAMS',
    'RATE_LIMIT_PLAYERS',
    'RATE_LIMIT_TRADES',
    'RATE_LIMIT_SIMULATIONS',
    'RATE_LIMIT_LINEUPS',
    'CACHE_TTL_PLAYER_STATS',
    'CACHE_TTL_WEATHER',
    'CACHE_TTL_TRADE_ANALYSIS',
    'CACHE_TTL_VIDEO',
    'MAX_SIMULATION_SCENARIOS',
    'MAX_TRADE_PLAYERS',
    'MAX_LINEUP_CHANGES',
    'GPT4_MAX_TOKENS',
    'DEFAULT_PAGINATION_LIMIT',
    'MAX_PAGINATION_LIMIT',

    # Enums
    'SportType',
    'PlayerPosition',
    'TradeStatus',
    'Platform',

    # Validators
    'validate_email',
    'validate_username',
    'validate_password',
    'validate_trade_players',
    'validate_lineup_changes',
    'SportValidator',

    # Helpers
    'generate_cache_key',
    'get_cache_ttl',
    'format_player_stats',
    'calculate_trade_risk',
    'convert_platform_data',
    'StatisticsCalculator',

    # Decorators
    'require_auth',
    'require_premium',
    'cache_response',
    'log_execution',
    'AsyncRateLimiter'
]