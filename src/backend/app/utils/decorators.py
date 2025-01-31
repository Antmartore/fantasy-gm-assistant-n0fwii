# Python 3.11+
import functools
import time
import asyncio
import datadog  # datadog v0.44.0
from typing import Any, Callable, Dict, Optional
from fastapi import Depends, HTTPException, Request
from redis import Redis, RedisError
from contextlib import asynccontextmanager

from app.core.rate_limiter import RateLimiter, CircuitBreaker
from app.core.security import check_permissions, get_current_user, verify_token_blacklist
from app.core.logging import get_logger, log_metric

# Initialize logger
logger = get_logger(__name__)

# Cache prefixes
CACHE_PREFIX = 'fantasy_gm:'
RATE_LIMIT_PREFIX = 'rate_limit:'

# Initialize DataDog metrics
datadog.initialize()
METRICS = {
    'api.requests': datadog.Counter('api.requests'),
    'api.latency': datadog.Histogram('api.latency'),
    'api.errors': datadog.Counter('api.errors'),
    'cache.hits': datadog.Counter('cache.hits'),
    'cache.misses': datadog.Counter('cache.misses'),
    'auth.attempts': datadog.Counter('auth.attempts'),
    'auth.failures': datadog.Counter('auth.failures')
}

def require_auth(func: Callable) -> Callable:
    """
    Enhanced decorator that requires valid JWT authentication with token blacklist checking.
    
    Args:
        func: Function to wrap
        
    Returns:
        Wrapped function requiring authentication
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        request = kwargs.get('request')
        if not request:
            raise HTTPException(status_code=400, detail="Request object required")

        try:
            METRICS['auth.attempts'].increment()
            
            # Get and verify current user
            user = await get_current_user(request)
            if not user:
                METRICS['auth.failures'].increment()
                raise HTTPException(status_code=401, detail="Authentication required")

            # Check token blacklist
            await verify_token_blacklist(request.auth.credentials)

            # Inject user into request state
            request.state.user = user
            
            # Log authentication success
            logger.info(
                "Authentication successful",
                extra={
                    'user_id': user.id,
                    'endpoint': request.url.path
                }
            )

            return await func(*args, **kwargs)

        except Exception as e:
            METRICS['auth.failures'].increment()
            logger.error(
                f"Authentication failed: {str(e)}",
                extra={'error': str(e)}
            )
            raise HTTPException(status_code=401, detail=str(e))

    return wrapper

def require_premium(func: Callable) -> Callable:
    """
    Enhanced decorator that requires premium user role with subscription validation.
    
    Args:
        func: Function to wrap
        
    Returns:
        Wrapped function requiring premium access
    """
    @functools.wraps(func)
    @require_auth
    async def wrapper(*args, **kwargs):
        request = kwargs.get('request')
        user = request.state.user

        try:
            # Validate premium subscription
            if not user.is_premium:
                raise HTTPException(status_code=403, detail="Premium subscription required")

            # Check subscription expiry
            if user.premium_expires and user.premium_expires < time.time():
                raise HTTPException(status_code=403, detail="Premium subscription expired")

            # Log premium feature access
            logger.info(
                "Premium feature accessed",
                extra={
                    'user_id': user.id,
                    'endpoint': request.url.path,
                    'feature': func.__name__
                }
            )

            # Track premium usage metrics
            log_metric(
                'premium_feature_usage',
                1,
                tags=[f'feature:{func.__name__}', f'user:{user.id}']
            )

            return await func(*args, **kwargs)

        except Exception as e:
            logger.error(
                f"Premium access failed: {str(e)}",
                extra={
                    'user_id': user.id,
                    'error': str(e)
                }
            )
            raise

    return wrapper

def cache_response(ttl_seconds: int = 900, vary_by_user: bool = False):
    """
    Enhanced decorator that implements distributed caching with Redis.
    
    Args:
        ttl_seconds: Cache TTL in seconds
        vary_by_user: Whether to include user ID in cache key
        
    Returns:
        Wrapped function with response caching
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            request = kwargs.get('request')
            redis_client = request.app.state.redis

            # Generate cache key
            cache_key_parts = [CACHE_PREFIX, request.url.path]
            if vary_by_user and hasattr(request.state, 'user'):
                cache_key_parts.append(str(request.state.user.id))
            cache_key = ':'.join(cache_key_parts)

            try:
                # Check cache with stampede prevention
                async with asynccontextmanager(redis_client.lock)(f"{cache_key}:lock"):
                    cached_response = await redis_client.get(cache_key)
                    
                    if cached_response:
                        METRICS['cache.hits'].increment()
                        logger.debug(f"Cache hit for key: {cache_key}")
                        return cached_response

                    # Execute function and cache result
                    METRICS['cache.misses'].increment()
                    response = await func(*args, **kwargs)
                    
                    await redis_client.set(
                        cache_key,
                        response,
                        expire=ttl_seconds
                    )
                    
                    return response

            except RedisError as e:
                logger.error(
                    f"Cache operation failed: {str(e)}",
                    extra={'cache_key': cache_key}
                )
                # Fallback to uncached response
                return await func(*args, **kwargs)

        return wrapper
    return decorator

def log_execution(include_args: bool = False):
    """
    Enhanced decorator that provides comprehensive execution logging and metrics.
    
    Args:
        include_args: Whether to log function arguments
        
    Returns:
        Wrapped function with execution logging
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            correlation_id = kwargs.get('correlation_id', str(time.time_ns()))

            try:
                # Log function entry
                log_data = {
                    'correlation_id': correlation_id,
                    'function': func.__name__,
                    'module': func.__module__
                }
                
                if include_args:
                    log_data['args'] = str(args)
                    log_data['kwargs'] = str({k:v for k,v in kwargs.items() if k != 'password'})

                logger.info(
                    f"Executing {func.__name__}",
                    extra=log_data
                )

                # Execute function
                result = await func(*args, **kwargs)

                # Calculate and log execution metrics
                duration_ms = (time.perf_counter() - start_time) * 1000
                METRICS['api.latency'].histogram(duration_ms)

                logger.info(
                    f"Completed {func.__name__}",
                    extra={
                        **log_data,
                        'duration_ms': duration_ms,
                        'status': 'success'
                    }
                )

                return result

            except Exception as e:
                METRICS['api.errors'].increment()
                duration_ms = (time.perf_counter() - start_time) * 1000
                
                logger.error(
                    f"Error in {func.__name__}: {str(e)}",
                    extra={
                        **log_data,
                        'duration_ms': duration_ms,
                        'error': str(e),
                        'status': 'error'
                    },
                    exc_info=True
                )
                raise

        return wrapper
    return decorator

class AsyncRateLimiter:
    """
    Enhanced async rate limiter with circuit breaker and distributed locking.
    """
    def __init__(
        self,
        rate_limit: int,
        window_seconds: int,
        circuit_breaker_config: Optional[Dict] = None
    ):
        """
        Initialize async rate limiter with enhanced configuration.
        
        Args:
            rate_limit: Maximum requests per window
            window_seconds: Time window in seconds
            circuit_breaker_config: Circuit breaker configuration
        """
        self.redis_client = Redis()
        self.rate_limit = rate_limit
        self.window_seconds = window_seconds
        self.circuit_breaker = CircuitBreaker(**(circuit_breaker_config or {}))

    async def check_rate_limit(self, key: str) -> bool:
        """
        Check if request should be rate limited with circuit breaker.
        
        Args:
            key: Rate limit key
            
        Returns:
            bool: True if rate limited
        """
        try:
            # Check circuit breaker status
            if not self.circuit_breaker.is_closed():
                return False

            async with asynccontextmanager(self.redis_client.lock)(f"{key}:lock"):
                current = await self.redis_client.get(key) or 0
                
                if int(current) >= self.rate_limit:
                    return False
                
                pipeline = self.redis_client.pipeline()
                pipeline.incr(key)
                pipeline.expire(key, self.window_seconds)
                await pipeline.execute()
                
                return True

        except RedisError as e:
            logger.error(f"Rate limit check failed: {str(e)}")
            self.circuit_breaker.record_failure()
            return False

    def rate_limit(self, func: Callable) -> Callable:
        """
        Enhanced async rate limit decorator with comprehensive error handling.
        
        Args:
            func: Function to wrap
            
        Returns:
            Rate limited function
        """
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            request = kwargs.get('request')
            if not request:
                raise ValueError("Request object required")

            rate_limit_key = f"{RATE_LIMIT_PREFIX}:{request.url.path}:{request.client.host}"

            try:
                if not await self.check_rate_limit(rate_limit_key):
                    raise HTTPException(
                        status_code=429,
                        detail="Rate limit exceeded"
                    )

                self.circuit_breaker.record_success()
                return await func(*args, **kwargs)

            except Exception as e:
                self.circuit_breaker.record_failure()
                raise

        return wrapper