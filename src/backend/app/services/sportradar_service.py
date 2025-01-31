# Python 3.11+
from typing import Dict, Any, Optional, List
import httpx  # httpx v0.24+
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.0+
from cachetools import TTLCache  # cachetools v5.0+
from datetime import datetime

from app.core.config import settings, SUPPORTED_SPORTS
from app.utils.enums import SportType
from app.core.exceptions import IntegrationException
from app.core.logging import get_logger

# Initialize logger
logger = get_logger(__name__)

# API base URLs for each sport
BASE_URLS = {
    SportType.NFL: 'https://api.sportradar.us/nfl/official/v7',
    SportType.NBA: 'https://api.sportradar.us/nba/official/v7',
    SportType.MLB: 'https://api.sportradar.us/mlb/official/v7'
}

# Cache TTL in seconds (15 minutes)
CACHE_TTL = 900

# Request timeout in seconds
REQUEST_TIMEOUT = 30

class SportradarService:
    """Service class for interacting with Sportradar API endpoints with built-in caching and retry mechanisms."""

    def __init__(self) -> None:
        """Initialize Sportradar service with API key, HTTP client, and caching."""
        self._api_key = settings.SPORTRADAR_API_KEY.get_secret_value()
        self._client = httpx.AsyncClient(
            timeout=REQUEST_TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
        )
        self._cache = TTLCache(maxsize=1000, ttl=CACHE_TTL)
        self._rate_limits = {sport: 0 for sport in SUPPORTED_SPORTS}

    async def get_player_stats(self, player_id: str, sport_type: SportType) -> Dict[str, Any]:
        """
        Fetches player statistics from Sportradar API with caching and retry.

        Args:
            player_id: Unique identifier for the player
            sport_type: Type of sport (NFL, NBA, MLB)

        Returns:
            Dict containing player statistics and cache metadata

        Raises:
            IntegrationException: If API request fails or returns invalid data
        """
        cache_key = f"player_stats:{sport_type.value}:{player_id}"
        
        # Check cache first
        if cache_key in self._cache:
            logger.debug(f"Cache hit for player stats: {player_id}")
            return {
                "data": self._cache[cache_key],
                "cached": True,
                "timestamp": datetime.utcnow().isoformat()
            }

        # Validate sport type
        if sport_type not in SUPPORTED_SPORTS:
            raise IntegrationException(
                message=f"Unsupported sport type: {sport_type}",
                error_code=6001,
                details={"sport_type": sport_type.value}
            )

        endpoint = f"/players/{player_id}/profile.json"
        response_data = await self._make_request(endpoint, sport_type)

        # Cache successful response
        self._cache[cache_key] = response_data

        return {
            "data": response_data,
            "cached": False,
            "timestamp": datetime.utcnow().isoformat()
        }

    async def get_game_stats(self, game_id: str, sport_type: SportType) -> Dict[str, Any]:
        """
        Fetches game statistics from Sportradar API with caching and retry.

        Args:
            game_id: Unique identifier for the game
            sport_type: Type of sport (NFL, NBA, MLB)

        Returns:
            Dict containing game statistics and cache metadata

        Raises:
            IntegrationException: If API request fails or returns invalid data
        """
        cache_key = f"game_stats:{sport_type.value}:{game_id}"
        
        # Check cache first
        if cache_key in self._cache:
            logger.debug(f"Cache hit for game stats: {game_id}")
            return {
                "data": self._cache[cache_key],
                "cached": True,
                "timestamp": datetime.utcnow().isoformat()
            }

        # Validate sport type
        if sport_type not in SUPPORTED_SPORTS:
            raise IntegrationException(
                message=f"Unsupported sport type: {sport_type}",
                error_code=6001,
                details={"sport_type": sport_type.value}
            )

        endpoint = f"/games/{game_id}/summary.json"
        response_data = await self._make_request(endpoint, sport_type)

        # Cache successful response
        self._cache[cache_key] = response_data

        return {
            "data": response_data,
            "cached": False,
            "timestamp": datetime.utcnow().isoformat()
        }

    async def get_team_roster(self, team_id: str, sport_type: SportType) -> Dict[str, Any]:
        """
        Fetches team roster information from Sportradar API with caching and retry.

        Args:
            team_id: Unique identifier for the team
            sport_type: Type of sport (NFL, NBA, MLB)

        Returns:
            Dict containing team roster and cache metadata

        Raises:
            IntegrationException: If API request fails or returns invalid data
        """
        cache_key = f"team_roster:{sport_type.value}:{team_id}"
        
        # Check cache first
        if cache_key in self._cache:
            logger.debug(f"Cache hit for team roster: {team_id}")
            return {
                "data": self._cache[cache_key],
                "cached": True,
                "timestamp": datetime.utcnow().isoformat()
            }

        # Validate sport type
        if sport_type not in SUPPORTED_SPORTS:
            raise IntegrationException(
                message=f"Unsupported sport type: {sport_type}",
                error_code=6001,
                details={"sport_type": sport_type.value}
            )

        endpoint = f"/teams/{team_id}/profile.json"
        response_data = await self._make_request(endpoint, sport_type)

        # Cache successful response
        self._cache[cache_key] = response_data

        return {
            "data": response_data,
            "cached": False,
            "timestamp": datetime.utcnow().isoformat()
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _make_request(self, endpoint: str, sport_type: SportType, params: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Makes authenticated HTTP request to Sportradar API with error handling.

        Args:
            endpoint: API endpoint path
            sport_type: Type of sport (NFL, NBA, MLB)
            params: Optional query parameters

        Returns:
            Dict containing API response data

        Raises:
            IntegrationException: If API request fails or returns invalid data
        """
        base_url = BASE_URLS[sport_type]
        url = f"{base_url}{endpoint}"
        
        # Add API key to parameters
        request_params = params or {}
        request_params['api_key'] = self._api_key

        try:
            start_time = datetime.utcnow()
            async with self._client as client:
                response = await client.get(url, params=request_params)
                duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000

            logger.info(
                f"Sportradar API request completed",
                extra={
                    'endpoint': endpoint,
                    'sport_type': sport_type.value,
                    'duration_ms': duration_ms,
                    'status_code': response.status_code
                }
            )

            response.raise_for_status()
            data = response.json()

            # Update rate limit tracking
            if 'X-Rate-Limit-Remaining' in response.headers:
                self._rate_limits[sport_type] = int(response.headers['X-Rate-Limit-Remaining'])

            return data

        except httpx.HTTPStatusError as e:
            raise IntegrationException(
                message=f"Sportradar API request failed: {str(e)}",
                error_code=6002,
                details={
                    'status_code': e.response.status_code,
                    'endpoint': endpoint,
                    'sport_type': sport_type.value
                }
            )
        except httpx.RequestError as e:
            raise IntegrationException(
                message=f"Sportradar API connection error: {str(e)}",
                error_code=6003,
                details={
                    'endpoint': endpoint,
                    'sport_type': sport_type.value
                }
            )
        except ValueError as e:
            raise IntegrationException(
                message=f"Invalid JSON response from Sportradar API: {str(e)}",
                error_code=6004,
                details={
                    'endpoint': endpoint,
                    'sport_type': sport_type.value
                }
            )