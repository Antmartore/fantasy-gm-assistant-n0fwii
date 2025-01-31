# Python 3.11+
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis import Redis  # redis v4.5+
from prometheus_client import start_http_server  # prometheus-client v0.16+
import structlog  # structlog v23.1+
import signal
import sys
from typing import Any, Dict

# Internal imports
from app.core.config import (
    settings,
    PROJECT_NAME,
    DEBUG,
    REDIS_URL,
    ALLOWED_ORIGINS
)
from app.api.v1 import api_router
from app.core.middleware import (
    AuthenticationMiddleware,
    PerformanceMiddleware
)

# Initialize global variables
app: FastAPI = FastAPI(
    title=PROJECT_NAME,
    debug=DEBUG,
    docs_url='/api/docs',
    redoc_url='/api/redoc',
    openapi_url='/api/openapi.json'
)

# Initialize Redis client with connection pooling
redis_client = Redis.from_url(
    url=REDIS_URL,
    decode_responses=True,
    socket_timeout=5,
    socket_keepalive=True,
    health_check_interval=30
)

# Configure structured logging
logger = structlog.get_logger()
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    wrapper_class=structlog.BoundLogger,
    cache_logger_on_first_use=True,
)

def init_app() -> FastAPI:
    """
    Initialize and configure the FastAPI application with comprehensive middleware
    stack, security headers, monitoring, and core services.

    Returns:
        FastAPI: Configured FastAPI application instance
    """
    # Configure CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "X-Process-Time",
            "X-Rate-Limit-Limit",
            "X-Rate-Limit-Remaining",
            "X-Rate-Limit-Reset"
        ]
    )

    # Add security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Any, call_next: Any) -> Any:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response

    # Add authentication middleware
    app.add_middleware(AuthenticationMiddleware)

    # Add performance monitoring middleware
    app.add_middleware(PerformanceMiddleware)

    # Mount API router
    app.include_router(
        api_router,
        prefix="/api/v1"
    )

    # Configure error handlers
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Any, exc: Exception) -> Dict[str, Any]:
        logger.error(
            "Unhandled exception",
            exc_info=exc,
            request_path=request.url.path,
            correlation_id=request.state.correlation_id
        )
        return {
            "detail": "Internal server error",
            "correlation_id": request.state.correlation_id
        }

    # Start Prometheus metrics server
    if not DEBUG:
        start_http_server(port=9090)

    # Configure graceful shutdown
    def shutdown_handler(signum: int, frame: Any) -> None:
        logger.info("Shutting down application gracefully...")
        try:
            redis_client.close()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error("Error closing Redis connection", exc_info=e)
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown_handler)
    signal.signal(signal.SIGINT, shutdown_handler)

    logger.info(
        "Application initialized successfully",
        debug_mode=DEBUG,
        allowed_origins=ALLOWED_ORIGINS
    )

    return app

# Initialize application
app = init_app()

# Export configured instances
__all__ = ["app", "redis_client"]