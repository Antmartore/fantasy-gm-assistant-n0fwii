# Python 3.11+
from typing import Dict, Any
from fastapi import APIRouter, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter
import redis.asyncio as redis
import time
from datetime import timedelta

# Internal imports
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.teams import router as teams_router
from app.core.config import settings
from app.core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ValidationError,
    RateLimitError,
    SystemError,
    IntegrationError
)
from app.core.logging import get_logger

# Initialize logger
logger = get_logger(__name__)

# Initialize main API router
api_router = APIRouter(
    prefix="/api/v1",
    tags=["v1"],
    responses={404: {"description": "Not found"}}
)

# Rate limiting configuration
rate_limit_config = {
    "default": {"calls": 100, "period": 60},  # 100 calls per minute
    "premium": {"calls": 1000, "period": 60},  # 1000 calls per minute
    "auth": {"calls": 5, "period": 300},       # 5 calls per 5 minutes
    "simulation": {"calls": 20, "period": 60}   # 20 calls per minute
}

# CORS configuration
cors_config = {
    "allow_origins": ["*"],  # Will be overridden in production
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
    "expose_headers": ["X-Rate-Limit-Limit", "X-Rate-Limit-Remaining", "X-Rate-Limit-Reset"]
}

async def configure_rate_limits(user_tier: str, endpoint_type: str) -> RateLimiter:
    """
    Configure rate limiting based on user tier and endpoint type.
    
    Args:
        user_tier: User subscription tier (free/premium)
        endpoint_type: Type of endpoint being accessed
        
    Returns:
        Configured rate limiter instance
    """
    # Get base rate limits
    base_limits = rate_limit_config.get(
        endpoint_type,
        rate_limit_config["default"]
    )
    
    # Apply tier multiplier for premium users
    if user_tier == "premium":
        base_limits = rate_limit_config["premium"]
    
    return RateLimiter(
        calls=base_limits["calls"],
        period=base_limits["period"],
        callback=lambda req: {"X-Rate-Limit-Reset": int(time.time() + base_limits["period"])}
    )

async def configure_routes() -> APIRouter:
    """
    Configure and include all API route modules with security, caching,
    and performance optimizations.
    
    Returns:
        Fully configured router with all endpoints and middleware
    """
    try:
        # Initialize Redis connection for caching and rate limiting
        redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )
        
        # Configure FastAPI Cache with Redis backend
        FastAPICache.init(
            RedisBackend(redis_client),
            prefix="fastapi-cache:",
            expire=timedelta(seconds=settings.CACHE_TTL_SECONDS)
        )
        
        # Initialize rate limiter
        await FastAPILimiter.init(redis_client)
        
        # Add CORS middleware
        api_router.add_middleware(
            CORSMiddleware,
            **cors_config
        )
        
        # Add compression middleware
        api_router.add_middleware(
            GZipMiddleware,
            minimum_size=1000  # Only compress responses > 1KB
        )
        
        # Add performance monitoring middleware
        @api_router.middleware("http")
        async def add_performance_headers(request: Request, call_next) -> Response:
            start_time = time.time()
            response = await call_next(request)
            process_time = time.time() - start_time
            response.headers["X-Process-Time"] = str(process_time)
            return response
        
        # Include routers with appropriate middleware
        api_router.include_router(
            auth_router,
            prefix="/auth",
            tags=["Authentication"]
        )
        
        api_router.include_router(
            teams_router,
            prefix="/teams",
            tags=["Teams"]
        )
        
        # Add global exception handlers
        @api_router.exception_handler(AuthenticationError)
        async def auth_exception_handler(request: Request, exc: AuthenticationError) -> Response:
            logger.error(f"Authentication error: {exc.message}", extra=exc.to_dict())
            return Response(
                status_code=401,
                content=exc.to_dict(),
                media_type="application/json"
            )
        
        @api_router.exception_handler(RateLimitError)
        async def ratelimit_exception_handler(request: Request, exc: RateLimitError) -> Response:
            logger.warning(f"Rate limit exceeded: {exc.message}", extra=exc.to_dict())
            return Response(
                status_code=429,
                content=exc.to_dict(),
                headers={"Retry-After": str(exc.details.get("period", 60))},
                media_type="application/json"
            )
        
        # Configure request timeout handling
        @api_router.middleware("http")
        async def timeout_middleware(request: Request, call_next) -> Response:
            try:
                return await call_next(request)
            except TimeoutError:
                logger.error("Request timeout", extra={"path": request.url.path})
                return Response(
                    status_code=504,
                    content={"detail": "Request timeout"},
                    media_type="application/json"
                )
        
        logger.info("API router configured successfully")
        return api_router
        
    except Exception as e:
        logger.error(f"Failed to configure API router: {str(e)}")
        raise SystemError(
            message="API initialization failed",
            error_code=5001,
            details={"error": str(e)}
        )

# Export configured router
__all__ = ["api_router"]