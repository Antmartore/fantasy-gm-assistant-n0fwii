# Python 3.11+
from typing import Dict, List, Optional, Any
import httpx  # httpx v0.24+
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.0+
from cachetools import TTLCache  # cachetools v5.0+
import json
import time
from datetime import datetime

from app.core.config import settings
from app.utils.enums import SportType
from app.core.exceptions import IntegrationError
from app.core.logging import get_logger

# Global constants
SLEEPER_API_BASE_URL = "https://api.sleeper.app/v1"
CACHE_TTL = 300  # 5 minutes cache TTL
MAX_RETRIES = 3
REQUEST_TIMEOUT = 5.0  # seconds
BATCH_SIZE = 100

class SleeperService:
    """
    Service class for interacting with Sleeper fantasy sports platform API with advanced 
    caching and retry mechanisms.
    """
    
    def __init__(self) -> None:
        """Initialize Sleeper service with configured API client, cache, and monitoring."""
        # Initialize HTTP client with optimized settings
        self._client = httpx.AsyncClient(
            base_url=SLEEPER_API_BASE_URL,
            timeout=REQUEST_TIMEOUT,
            verify=True,
            headers={
                "Authorization": f"Bearer {settings.SLEEPER_API_KEY.get_secret_value()}",
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "User-Agent": f"{settings.PROJECT_NAME}/1.0"
            }
        )
        
        # Initialize logger
        self._logger = get_logger(__name__)
        
        # Initialize cache with size limit
        self._cache = TTLCache(maxsize=1000, ttl=CACHE_TTL)
        
        # Initialize metrics collection
        self._metrics = {
            "requests": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "errors": 0,
            "avg_response_time": 0
        }

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup."""
        await self._client.aclose()

    def _generate_cache_key(self, *args, **kwargs) -> str:
        """
        Generate consistent cache key from arguments.
        
        Args:
            *args: Positional arguments
            **kwargs: Keyword arguments
            
        Returns:
            str: Generated cache key
        """
        key_parts = [str(arg) for arg in args]
        key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))
        return ":".join(key_parts)

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        reraise=True
    )
    async def get_user_leagues(
        self,
        user_id: str,
        sport: SportType,
        season: Optional[int] = None
    ) -> List[Dict]:
        """
        Retrieve user's leagues from Sleeper with caching and retry support.
        
        Args:
            user_id: Sleeper user ID
            sport: Sport type (NFL, NBA)
            season: Optional season year
            
        Returns:
            List of user's leagues with detailed metadata
            
        Raises:
            IntegrationError: If API request fails after retries
        """
        # Generate cache key
        cache_key = self._generate_cache_key("leagues", user_id, sport.value, season)
        
        # Check cache first
        if cache_key in self._cache:
            self._metrics["cache_hits"] += 1
            return self._cache[cache_key]
        
        self._metrics["cache_misses"] += 1
        start_time = time.time()
        
        try:
            # Construct API endpoint
            endpoint = f"/user/{user_id}/leagues/{sport.value.lower()}"
            if season:
                endpoint += f"/{season}"
                
            # Make API request
            self._metrics["requests"] += 1
            async with self._client as client:
                response = await client.get(endpoint)
                
            # Update response time metrics
            response_time = time.time() - start_time
            self._metrics["avg_response_time"] = (
                (self._metrics["avg_response_time"] * (self._metrics["requests"] - 1) + response_time)
                / self._metrics["requests"]
            )
            
            # Handle error responses
            if response.status_code != 200:
                raise IntegrationError(
                    message=f"Sleeper API error: {response.text}",
                    error_code=6001,
                    details={
                        "status_code": response.status_code,
                        "endpoint": endpoint,
                        "sport": sport.value
                    }
                )
                
            # Parse and validate response
            leagues = response.json()
            if not isinstance(leagues, list):
                raise IntegrationError(
                    message="Invalid response format from Sleeper API",
                    error_code=6002,
                    details={"endpoint": endpoint}
                )
                
            # Cache successful response
            self._cache[cache_key] = leagues
            
            return leagues
            
        except httpx.RequestError as e:
            self._metrics["errors"] += 1
            raise IntegrationError(
                message=f"Failed to connect to Sleeper API: {str(e)}",
                error_code=6003,
                details={"error_type": e.__class__.__name__}
            )
        except Exception as e:
            self._metrics["errors"] += 1
            self._logger.error(
                f"Unexpected error in get_user_leagues: {str(e)}",
                extra={"user_id": user_id, "sport": sport.value}
            )
            raise

    async def get_league_rosters(self, league_id: str) -> List[Dict]:
        """
        Retrieve rosters for a specific league with caching.
        
        Args:
            league_id: Sleeper league ID
            
        Returns:
            List of league rosters with player details
        """
        cache_key = self._generate_cache_key("rosters", league_id)
        
        if cache_key in self._cache:
            self._metrics["cache_hits"] += 1
            return self._cache[cache_key]
            
        self._metrics["cache_misses"] += 1
        
        try:
            async with self._client as client:
                response = await client.get(f"/league/{league_id}/rosters")
                
            if response.status_code != 200:
                raise IntegrationError(
                    message=f"Failed to get league rosters: {response.text}",
                    error_code=6004,
                    details={"league_id": league_id}
                )
                
            rosters = response.json()
            self._cache[cache_key] = rosters
            return rosters
            
        except Exception as e:
            self._metrics["errors"] += 1
            raise IntegrationError(
                message=f"Error retrieving league rosters: {str(e)}",
                error_code=6005,
                details={"league_id": league_id}
            )

    def clear_cache(self) -> None:
        """Clear the service cache."""
        self._cache.clear()

    def get_metrics(self) -> Dict[str, Any]:
        """
        Get service performance metrics.
        
        Returns:
            Dictionary of service metrics
        """
        return {
            **self._metrics,
            "cache_size": len(self._cache),
            "last_updated": datetime.utcnow().isoformat()
        }