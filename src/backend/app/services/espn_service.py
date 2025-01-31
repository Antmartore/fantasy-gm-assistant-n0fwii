# Python 3.11+
from typing import Dict, Any, Optional
import logging
import asyncio
from functools import cache
import backoff  # v2.2.1
import httpx    # v0.24.0
from app.core.config import settings
from app.utils.enums import SportType

# Constants
BASE_URL = "https://fantasy.espn.com/apis/v3"
CACHE_TTL = settings.CACHE_TTL_SECONDS
MAX_RETRIES = settings.MAX_RETRIES
REQUEST_TIMEOUT = settings.API_TIMEOUT_SECONDS

# Configure logging
logger = logging.getLogger(__name__)

class ESPNAPIError(Exception):
    """Custom exception for ESPN API related errors"""
    pass

class ESPNService:
    """
    Enhanced service class for interacting with ESPN's Fantasy Sports API with caching and retry support.
    Implements performance optimizations and reliable error handling.
    """

    def __init__(self):
        """Initialize ESPN service with configured API client and caching"""
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            timeout=REQUEST_TIMEOUT,
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
        )
        self._api_key = settings.ESPN_API_KEY.get_secret_value()
        self._headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "application/json",
            "X-Fantasy-Source": "GM-Assistant"
        }
        self._cache: Dict[str, Any] = {}
        
        logger.info("ESPNService initialized with configured client and caching")

    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with proper cleanup"""
        await self._client.aclose()

    def _get_cache_key(self, endpoint: str, params: Dict[str, Any]) -> str:
        """Generate unique cache key for requests"""
        return f"espn:{endpoint}:{str(sorted(params.items()))}"

    @backoff.on_exception(
        backoff.expo,
        (httpx.HTTPError, ESPNAPIError),
        max_tries=MAX_RETRIES
    )
    async def get_team_data(self, team_id: str, sport_type: SportType) -> Dict[str, Any]:
        """
        Retrieves team data from ESPN API with caching and retry support.

        Args:
            team_id (str): ESPN team identifier
            sport_type (SportType): Sport type enum value

        Returns:
            Dict[str, Any]: Team data including roster and statistics

        Raises:
            ESPNAPIError: If API request fails after retries
        """
        endpoint = f"/teams/{sport_type.value.lower()}/{team_id}"
        cache_key = self._get_cache_key(endpoint, {"sport": sport_type.value})

        # Check cache first
        if cache_key in self._cache:
            logger.debug(f"Cache hit for team data: {team_id}")
            return self._cache[cache_key]

        try:
            async with self._client as client:
                response = await client.get(
                    endpoint,
                    headers=self._headers,
                    params={"view": "mRoster"}
                )
                response.raise_for_status()
                data = response.json()

                # Validate response structure
                if not isinstance(data, dict) or "team" not in data:
                    raise ESPNAPIError("Invalid team data structure received")

                # Cache the response
                self._cache[cache_key] = data
                logger.info(f"Successfully retrieved team data for {team_id}")
                return data

        except httpx.HTTPError as e:
            logger.error(f"HTTP error retrieving team data: {str(e)}")
            raise ESPNAPIError(f"Failed to retrieve team data: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error in get_team_data: {str(e)}")
            raise ESPNAPIError(f"Unexpected error: {str(e)}")

    @backoff.on_exception(
        backoff.expo,
        (httpx.HTTPError, ESPNAPIError),
        max_tries=MAX_RETRIES
    )
    async def get_player_stats(self, player_id: str, sport_type: SportType) -> Dict[str, Any]:
        """
        Fetches player statistics from ESPN API with caching and retry support.

        Args:
            player_id (str): ESPN player identifier
            sport_type (SportType): Sport type enum value

        Returns:
            Dict[str, Any]: Player statistics and projections

        Raises:
            ESPNAPIError: If API request fails after retries
        """
        endpoint = f"/players/{sport_type.value.lower()}/{player_id}/stats"
        cache_key = self._get_cache_key(endpoint, {"sport": sport_type.value})

        # Check cache first
        if cache_key in self._cache:
            logger.debug(f"Cache hit for player stats: {player_id}")
            return self._cache[cache_key]

        try:
            async with self._client as client:
                response = await client.get(
                    endpoint,
                    headers=self._headers,
                    params={"view": "stats"}
                )
                response.raise_for_status()
                data = response.json()

                # Validate response structure
                if not isinstance(data, dict) or "stats" not in data:
                    raise ESPNAPIError("Invalid player stats structure received")

                # Cache the response
                self._cache[cache_key] = data
                logger.info(f"Successfully retrieved stats for player {player_id}")
                return data

        except httpx.HTTPError as e:
            logger.error(f"HTTP error retrieving player stats: {str(e)}")
            raise ESPNAPIError(f"Failed to retrieve player stats: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error in get_player_stats: {str(e)}")
            raise ESPNAPIError(f"Unexpected error: {str(e)}")

    @backoff.on_exception(
        backoff.expo,
        (httpx.HTTPError, ESPNAPIError),
        max_tries=MAX_RETRIES
    )
    async def get_league_data(self, league_id: str, sport_type: SportType) -> Dict[str, Any]:
        """
        Retrieves league information and settings with caching and retry support.

        Args:
            league_id (str): ESPN league identifier
            sport_type (SportType): Sport type enum value

        Returns:
            Dict[str, Any]: League settings and metadata

        Raises:
            ESPNAPIError: If API request fails after retries
        """
        endpoint = f"/leagues/{sport_type.value.lower()}/{league_id}"
        cache_key = self._get_cache_key(endpoint, {"sport": sport_type.value})

        # Check cache first
        if cache_key in self._cache:
            logger.debug(f"Cache hit for league data: {league_id}")
            return self._cache[cache_key]

        try:
            async with self._client as client:
                response = await client.get(
                    endpoint,
                    headers=self._headers,
                    params={"view": "mSettings"}
                )
                response.raise_for_status()
                data = response.json()

                # Validate response structure
                if not isinstance(data, dict) or "settings" not in data:
                    raise ESPNAPIError("Invalid league data structure received")

                # Cache the response
                self._cache[cache_key] = data
                logger.info(f"Successfully retrieved league data for {league_id}")
                return data

        except httpx.HTTPError as e:
            logger.error(f"HTTP error retrieving league data: {str(e)}")
            raise ESPNAPIError(f"Failed to retrieve league data: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error in get_league_data: {str(e)}")
            raise ESPNAPIError(f"Unexpected error: {str(e)}")

    async def clear_cache(self, endpoint: Optional[str] = None) -> None:
        """
        Clears the service cache, optionally for a specific endpoint.

        Args:
            endpoint (Optional[str]): Specific endpoint to clear cache for
        """
        if endpoint:
            keys_to_clear = [k for k in self._cache.keys() if k.startswith(f"espn:{endpoint}")]
            for key in keys_to_clear:
                del self._cache[key]
            logger.info(f"Cleared cache for endpoint: {endpoint}")
        else:
            self._cache.clear()
            logger.info("Cleared entire ESPN service cache")