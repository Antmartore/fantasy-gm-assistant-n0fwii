# Python 3.11+
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.authentication import AuthenticationMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi_limiter import FastAPILimiter
from ddtrace.middleware.asgi import DatadogMiddleware
from firebase_admin import initialize_app
import redis.asyncio as redis

from app.core.config import settings
from app.api.v1 import api_router
from app.core.exceptions import (
    AuthenticationError,
    ValidationError,
    RateLimitError,
    SystemError,
    IntegrationError
)
from app.core.logging import setup_logging, get_logger

# Initialize logging
setup_logging()
logger = get_logger(__name__)

# Initialize Redis client
redis_client = redis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application startup and shutdown events.
    Handles initialization and cleanup of services.
    """
    try:
        # Initialize Firebase Admin SDK
        firebase_creds = settings.get_firebase_credentials()
        initialize_app(firebase_creds)
        logger.info("Firebase Admin SDK initialized successfully")

        # Initialize rate limiter
        await FastAPILimiter.init(redis_client)
        logger.info("Rate limiter initialized successfully")

        # Initialize Datadog APM if enabled
        if settings.ENABLE_TELEMETRY:
            from ddtrace import patch_all
            patch_all()
            logger.info("Datadog APM initialized successfully")

        yield

    except Exception as e:
        logger.error(f"Startup error: {str(e)}")
        raise
    finally:
        # Cleanup
        await redis_client.close()
        logger.info("Application shutdown complete")

# Initialize FastAPI application
app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    debug=settings.DEBUG,
    lifespan=lifespan
)

def configure_cors() -> None:
    """Configure CORS middleware with security headers."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.ALLOWED_HOSTS],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Request-ID",
            "X-Real-IP",
            "X-Forwarded-For"
        ],
        expose_headers=[
            "X-Process-Time",
            "X-Rate-Limit-Limit",
            "X-Rate-Limit-Remaining",
            "X-Rate-Limit-Reset"
        ],
        max_age=600  # 10 minutes
    )

def configure_middleware() -> None:
    """Configure all required middleware for production deployment."""
    # Security middleware
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)
    app.add_middleware(AuthenticationMiddleware)
    
    # Performance middleware
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    
    # Monitoring middleware
    if settings.ENABLE_TELEMETRY:
        app.add_middleware(DatadogMiddleware)
    
    # Request ID middleware
    @app.middleware("http")
    async def add_request_id(request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    
    # Performance tracking middleware
    @app.middleware("http")
    async def add_process_time(request: Request, call_next) -> Response:
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response

def configure_error_handlers() -> None:
    """Configure global error handlers for different exception types."""
    
    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError) -> Response:
        logger.warning(f"Validation error: {exc.message}", extra=exc.to_dict())
        return Response(
            status_code=422,
            content=exc.to_dict(),
            media_type="application/json"
        )
    
    @app.exception_handler(AuthenticationError)
    async def auth_error_handler(request: Request, exc: AuthenticationError) -> Response:
        logger.error(f"Authentication error: {exc.message}", extra=exc.to_dict())
        return Response(
            status_code=401,
            content=exc.to_dict(),
            media_type="application/json"
        )
    
    @app.exception_handler(RateLimitError)
    async def rate_limit_handler(request: Request, exc: RateLimitError) -> Response:
        logger.warning(f"Rate limit exceeded: {exc.message}", extra=exc.to_dict())
        return Response(
            status_code=429,
            content=exc.to_dict(),
            headers={"Retry-After": "60"},
            media_type="application/json"
        )
    
    @app.exception_handler(IntegrationError)
    async def integration_error_handler(request: Request, exc: IntegrationError) -> Response:
        logger.error(f"Integration error: {exc.message}", extra=exc.to_dict())
        return Response(
            status_code=502,
            content=exc.to_dict(),
            media_type="application/json"
        )
    
    @app.exception_handler(SystemError)
    async def system_error_handler(request: Request, exc: SystemError) -> Response:
        logger.error(f"System error: {exc.message}", extra=exc.to_dict())
        return Response(
            status_code=500,
            content=exc.to_dict(),
            media_type="application/json"
        )

# Configure application
configure_cors()
configure_middleware()
configure_error_handlers()

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Export application instance
__all__ = ["app"]