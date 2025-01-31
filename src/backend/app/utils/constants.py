"""
Core constants module containing application-wide constants, configuration values, and settings.
All constants are environment-overridable and type-safe.
"""

from typing import Final, List
from app.utils.enums import SportType  # Python 3.11+

# API Configuration
API_VERSION: Final[str] = 'v1'
API_PREFIX: Final[str] = '/api/v1'

# Supported Sports Leagues
SUPPORTED_SPORTS: Final[List[SportType]] = [SportType.NFL, SportType.NBA, SportType.MLB]

# Rate Limits (requests per minute)
RATE_LIMIT_TEAMS: Final[int] = 100  # List/manage teams
RATE_LIMIT_PLAYERS: Final[int] = 200  # Search/view players
RATE_LIMIT_TRADES: Final[int] = 50   # Trade analysis
RATE_LIMIT_SIMULATIONS: Final[int] = 20  # Monte Carlo simulations
RATE_LIMIT_LINEUPS: Final[int] = 100  # Lineup changes

# Cache TTLs (in seconds)
CACHE_TTL_PLAYER_STATS: Final[int] = 900     # 15 minutes
CACHE_TTL_WEATHER: Final[int] = 3600         # 1 hour
CACHE_TTL_TRADE_ANALYSIS: Final[int] = 86400 # 24 hours
CACHE_TTL_VIDEO: Final[int] = 604800         # 7 days

# Business Rules and Limits
MAX_SIMULATION_SCENARIOS: Final[int] = 1000  # Maximum Monte Carlo scenarios
MAX_TRADE_PLAYERS: Final[int] = 5           # Maximum players per trade
MAX_LINEUP_CHANGES: Final[int] = 10         # Maximum lineup changes per request

# AI Configuration
GPT4_MAX_TOKENS: Final[int] = 128000  # GPT-4 context window size

# Pagination Settings
DEFAULT_PAGINATION_LIMIT: Final[int] = 50   # Default items per page
MAX_PAGINATION_LIMIT: Final[int] = 100      # Maximum items per page