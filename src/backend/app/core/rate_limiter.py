# Python 3.11+
import time
import asyncio
import random
from typing import Callable, Dict, Optional, Union
from functools import wraps
from prometheus_client import Counter, Histogram  # prometheus-client v0.16+

from app.core.config import settings
from app.core.exceptions import RateLimitError
from app.services.redis_service import RedisService

# Global constants
RATE_LIMIT_WINDOW = 60  # Window size in seconds
RATE_LIMIT_KEY_PREFIX = 'rate_limit:'
BURST_MULTIPLIER = 1.5  # Allow 50% burst capacity
JITTER_RANGE = 0.1  # 10% jitter for token replenishment
CIRCUIT_BREAKER_THRESHOLD = 0.95  # 95% rejection rate triggers circuit breaker

# Prometheus metrics
RATE_LIMIT_COUNTER = Counter(
    'rate_limit_requests_total',
    'Total number of rate limited requests',
    ['endpoint', 'status']
)
RATE_LIMIT_LATENCY = Histogram(
    'rate_limit_check_duration_seconds',
    'Time spent checking rate limits',
    ['endpoint']
)

class RateLimiter:
    """
    Advanced token bucket implementation with Redis backing store, circuit breaker pattern,
    and comprehensive monitoring capabilities.
    """

    def __init__(self) -> None:
        """Initialize rate limiter with Redis service and circuit breakers."""
        self._redis_service = RedisService()
        
        # Configure endpoint-specific rate limits
        self._rate_limits = {
            'teams': settings.RATE_LIMIT_TEAMS,
            'players': settings.RATE_LIMIT_PLAYERS,
            'trades': settings.RATE_LIMIT_TRADES,
            'simulations': settings.RATE_LIMIT_SIMULATIONS,
            'lineups': settings.RATE_LIMIT_LINEUPS
        }
        
        # Initialize circuit breaker state for each endpoint
        self._circuit_breakers = {
            endpoint: 0.0 for endpoint in self._rate_limits.keys()
        }
        
        # Initialize endpoint-specific locks for concurrency control
        self._endpoint_locks = {
            endpoint: asyncio.Lock() for endpoint in self._rate_limits.keys()
        }

    async def check_rate_limit(self, user_id: str, endpoint: str) -> bool:
        """
        Check if request is within rate limit using token bucket algorithm.
        
        Args:
            user_id: User identifier
            endpoint: API endpoint name
            
        Returns:
            bool: True if request is allowed, False if rate limited
            
        Raises:
            RateLimitError: If rate limit is exceeded
        """
        # Check circuit breaker status
        if self._circuit_breakers.get(endpoint, 0.0) >= CIRCUIT_BREAKER_THRESHOLD:
            RATE_LIMIT_COUNTER.labels(endpoint=endpoint, status='circuit_breaker').inc()
            raise RateLimitError(f"Circuit breaker open for endpoint: {endpoint}")

        rate_limit = self._rate_limits.get(endpoint)
        if not rate_limit:
            raise ValueError(f"Unknown endpoint: {endpoint}")

        # Generate Redis key for user+endpoint combination
        bucket_key = f"{RATE_LIMIT_KEY_PREFIX}{user_id}:{endpoint}"
        
        async with self._endpoint_locks[endpoint]:
            try:
                # Get current token count with pipelining
                pipeline = await self._redis_service.pipeline()
                current_tokens = await self._redis_service.get(bucket_key, use_pipeline=True)
                
                now = time.time()
                if current_tokens is None:
                    # Initialize new token bucket
                    current_tokens = {
                        'tokens': rate_limit,
                        'last_update': now
                    }
                else:
                    # Calculate token replenishment with jitter
                    time_passed = now - current_tokens['last_update']
                    jitter = random.uniform(-JITTER_RANGE, JITTER_RANGE)
                    replenishment = (time_passed / RATE_LIMIT_WINDOW) * rate_limit * (1 + jitter)
                    
                    # Apply burst allowance
                    max_tokens = rate_limit * BURST_MULTIPLIER
                    current_tokens['tokens'] = min(
                        max_tokens,
                        current_tokens['tokens'] + replenishment
                    )
                    current_tokens['last_update'] = now

                # Check if we have enough tokens
                if current_tokens['tokens'] >= 1:
                    current_tokens['tokens'] -= 1
                    await self._redis_service.set(
                        bucket_key,
                        current_tokens,
                        ttl=RATE_LIMIT_WINDOW * 2,
                        use_pipeline=True
                    )
                    await pipeline.execute()
                    
                    RATE_LIMIT_COUNTER.labels(endpoint=endpoint, status='allowed').inc()
                    return True
                else:
                    RATE_LIMIT_COUNTER.labels(endpoint=endpoint, status='limited').inc()
                    return False

            except Exception as e:
                RATE_LIMIT_COUNTER.labels(endpoint=endpoint, status='error').inc()
                raise RateLimitError(f"Rate limit check failed: {str(e)}")

    def rate_limit_decorator(self, endpoint_name: str) -> Callable:
        """
        Decorator for applying rate limiting to endpoints with circuit breaker pattern.
        
        Args:
            endpoint_name: Name of the endpoint being rate limited
            
        Returns:
            Callable: Decorated function with rate limiting
        """
        def decorator(func: Callable) -> Callable:
            @wraps(func)
            async def wrapper(*args, **kwargs) -> Any:
                # Extract user_id from request context
                request = kwargs.get('request')
                if not request or not hasattr(request, 'user_id'):
                    raise ValueError("Request must contain user_id")
                
                user_id = request.user_id
                
                with RATE_LIMIT_LATENCY.labels(endpoint=endpoint_name).time():
                    try:
                        # Check rate limit
                        allowed = await self.check_rate_limit(user_id, endpoint_name)
                        if not allowed:
                            self.update_circuit_breaker(endpoint_name, False)
                            raise RateLimitError(
                                f"Rate limit exceeded for endpoint: {endpoint_name}"
                            )
                        
                        # Execute endpoint function
                        result = await func(*args, **kwargs)
                        self.update_circuit_breaker(endpoint_name, True)
                        return result
                        
                    except RateLimitError:
                        self.update_circuit_breaker(endpoint_name, False)
                        raise
                    except Exception as e:
                        self.update_circuit_breaker(endpoint_name, False)
                        raise RateLimitError(f"Rate limit check failed: {str(e)}")
                        
            return wrapper
        return decorator

    def update_circuit_breaker(self, endpoint: str, success: bool) -> None:
        """
        Update circuit breaker state based on rate limit rejections.
        
        Args:
            endpoint: API endpoint name
            success: Whether the request was successful
        """
        # Update rejection rate with exponential decay
        current_rate = self._circuit_breakers.get(endpoint, 0.0)
        decay_factor = 0.95  # 5% decay per update
        
        if success:
            new_rate = current_rate * decay_factor
        else:
            new_rate = current_rate * decay_factor + (1 - decay_factor)
        
        self._circuit_breakers[endpoint] = new_rate
        
        # Record circuit breaker metrics
        if new_rate >= CIRCUIT_BREAKER_THRESHOLD:
            RATE_LIMIT_COUNTER.labels(
                endpoint=endpoint,
                status='circuit_breaker_triggered'
            ).inc()