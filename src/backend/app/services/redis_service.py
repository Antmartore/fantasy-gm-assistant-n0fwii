# Python 3.11+
import redis  # redis v4.5+
import json
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential  # tenacity v8.0+
from typing import Any, Optional, Callable
from functools import wraps
import time

from app.core.config import settings
from app.core.exceptions import IntegrationError
from app.core.logging import get_logger

# Initialize logger
logger = get_logger('redis_service')

# Cache TTL constants (in seconds)
CACHE_TTL = {
    'PLAYER_STATS': 900,  # 15 minutes
    'WEATHER_DATA': 3600,  # 1 hour
    'TRADE_ANALYSIS': 86400,  # 24 hours
    'VIDEO_CONTENT': 604800  # 7 days
}

# Redis retry configuration
REDIS_RETRY_OPTIONS = {
    'max_attempts': 3,
    'delay': 1,
    'backoff': 2
}

def monitor(func):
    """Decorator for monitoring Redis operations with metrics and logging."""
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        start_time = time.perf_counter()
        operation = func.__name__
        try:
            result = func(self, *args, **kwargs)
            duration_ms = (time.perf_counter() - start_time) * 1000
            self._metrics[operation]['success'] += 1
            self._metrics[operation]['latency'].append(duration_ms)
            logger.debug(f"Redis operation {operation} completed in {duration_ms:.2f}ms")
            return result
        except Exception as e:
            self._metrics[operation]['errors'] += 1
            logger.error(f"Redis operation {operation} failed: {str(e)}")
            raise
    return wrapper

class RedisService:
    """Service class for Redis operations with comprehensive error handling and monitoring."""

    def __init__(self, pool_size: int = 10, socket_timeout: int = 5, ssl_enabled: bool = True):
        """Initialize Redis service with connection pool and monitoring.
        
        Args:
            pool_size: Maximum number of connections in pool
            socket_timeout: Socket timeout in seconds
            ssl_enabled: Whether to use SSL for Redis connection
        """
        try:
            self._pool = redis.ConnectionPool(
                url=settings.REDIS_URL,
                max_connections=pool_size,
                socket_timeout=socket_timeout,
                ssl=ssl_enabled,
                decode_responses=True
            )
            
            self._client = redis.Redis(connection_pool=self._pool)
            self._pubsub = self._client.pubsub()
            
            # Initialize metrics tracking
            self._metrics = {
                'get': {'success': 0, 'errors': 0, 'latency': []},
                'set': {'success': 0, 'errors': 0, 'latency': []},
                'delete': {'success': 0, 'errors': 0, 'latency': []},
                'publish': {'success': 0, 'errors': 0, 'latency': []},
                'subscribe': {'success': 0, 'errors': 0, 'latency': []}
            }
            
            self._healthy = True
            logger.info("Redis service initialized successfully")
            
        except redis.RedisError as e:
            self._healthy = False
            logger.error(f"Failed to initialize Redis service: {str(e)}")
            raise IntegrationError(f"Redis initialization failed: {str(e)}")

    @retry(
        stop=stop_after_attempt(REDIS_RETRY_OPTIONS['max_attempts']),
        wait=wait_exponential(multiplier=REDIS_RETRY_OPTIONS['delay'], min=1, max=10)
    )
    @monitor
    async def get(self, key: str, use_pipeline: bool = False) -> Optional[Any]:
        """Retrieve cached data by key with monitoring and error handling.
        
        Args:
            key: Cache key to retrieve
            use_pipeline: Whether to use Redis pipeline
            
        Returns:
            Cached data if exists, None otherwise
            
        Raises:
            IntegrationError: If Redis operation fails
        """
        try:
            if not self._healthy:
                raise IntegrationError("Redis service is unhealthy")

            if use_pipeline:
                with self._client.pipeline() as pipe:
                    result = pipe.get(key).execute()[0]
            else:
                result = self._client.get(key)

            if result:
                return json.loads(result)
            return None

        except redis.RedisError as e:
            self._healthy = False
            logger.error(f"Redis get operation failed for key {key}: {str(e)}")
            raise IntegrationError(f"Redis get operation failed: {str(e)}")

    @retry(
        stop=stop_after_attempt(REDIS_RETRY_OPTIONS['max_attempts']),
        wait=wait_exponential(multiplier=REDIS_RETRY_OPTIONS['delay'], min=1, max=10)
    )
    @monitor
    async def set(self, key: str, value: Any, ttl: int, use_pipeline: bool = False) -> bool:
        """Cache data with specified TTL and monitoring.
        
        Args:
            key: Cache key
            value: Data to cache
            ttl: Time-to-live in seconds
            use_pipeline: Whether to use Redis pipeline
            
        Returns:
            Success status
            
        Raises:
            IntegrationError: If Redis operation fails
        """
        try:
            if not self._healthy:
                raise IntegrationError("Redis service is unhealthy")

            serialized_value = json.dumps(value)
            
            if use_pipeline:
                with self._client.pipeline() as pipe:
                    pipe.setex(key, ttl, serialized_value)
                    pipe.execute()
            else:
                self._client.setex(key, ttl, serialized_value)

            return True

        except redis.RedisError as e:
            self._healthy = False
            logger.error(f"Redis set operation failed for key {key}: {str(e)}")
            raise IntegrationError(f"Redis set operation failed: {str(e)}")

    @retry(
        stop=stop_after_attempt(REDIS_RETRY_OPTIONS['max_attempts']),
        wait=wait_exponential(multiplier=REDIS_RETRY_OPTIONS['delay'], min=1, max=10)
    )
    @monitor
    async def delete(self, key: str, use_pipeline: bool = False) -> bool:
        """Remove cached data by key with monitoring.
        
        Args:
            key: Cache key to delete
            use_pipeline: Whether to use Redis pipeline
            
        Returns:
            Success status
            
        Raises:
            IntegrationError: If Redis operation fails
        """
        try:
            if not self._healthy:
                raise IntegrationError("Redis service is unhealthy")

            if use_pipeline:
                with self._client.pipeline() as pipe:
                    pipe.delete(key)
                    pipe.execute()
            else:
                self._client.delete(key)

            return True

        except redis.RedisError as e:
            self._healthy = False
            logger.error(f"Redis delete operation failed for key {key}: {str(e)}")
            raise IntegrationError(f"Redis delete operation failed: {str(e)}")

    @retry(
        stop=stop_after_attempt(REDIS_RETRY_OPTIONS['max_attempts']),
        wait=wait_exponential(multiplier=REDIS_RETRY_OPTIONS['delay'], min=1, max=10)
    )
    @monitor
    async def publish(self, channel: str, message: Any) -> bool:
        """Publish message to Redis channel with monitoring.
        
        Args:
            channel: Channel name
            message: Message to publish
            
        Returns:
            Success status
            
        Raises:
            IntegrationError: If Redis operation fails
        """
        try:
            if not self._healthy:
                raise IntegrationError("Redis service is unhealthy")

            serialized_message = json.dumps(message)
            self._client.publish(channel, serialized_message)
            return True

        except redis.RedisError as e:
            self._healthy = False
            logger.error(f"Redis publish operation failed for channel {channel}: {str(e)}")
            raise IntegrationError(f"Redis publish operation failed: {str(e)}")

    @monitor
    async def subscribe(self, channel: str, callback: Callable, timeout: int = 0) -> None:
        """Subscribe to Redis channel for updates with automatic reconnection.
        
        Args:
            channel: Channel name to subscribe to
            callback: Callback function for messages
            timeout: Subscription timeout (0 for no timeout)
            
        Raises:
            IntegrationError: If Redis operation fails
        """
        try:
            if not self._healthy:
                raise IntegrationError("Redis service is unhealthy")

            self._pubsub.subscribe(channel)
            logger.info(f"Subscribed to channel: {channel}")

            while True:
                try:
                    message = self._pubsub.get_message(timeout=timeout)
                    if message and message['type'] == 'message':
                        data = json.loads(message['data'])
                        await callback(data)
                except redis.RedisError as e:
                    logger.error(f"Redis subscription error: {str(e)}")
                    await asyncio.sleep(REDIS_RETRY_OPTIONS['delay'])
                    self._pubsub = self._client.pubsub()
                    self._pubsub.subscribe(channel)

        except Exception as e:
            self._healthy = False
            logger.error(f"Redis subscribe operation failed for channel {channel}: {str(e)}")
            raise IntegrationError(f"Redis subscribe operation failed: {str(e)}")