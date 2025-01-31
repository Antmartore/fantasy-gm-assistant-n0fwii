# Python 3.11+
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram
import time
from typing import Callable

# Internal imports
from app.api.v1 import api_router as v1_router
from app.core.config import settings
from app.core.middleware import (
    AuthenticationMiddleware,
    PerformanceMiddleware,
)
from app.core.exceptions import (
    BaseAppException,
    AuthenticationError,
    ValidationError,
    RateLimitError,
    SystemError,
    IntegrationError
)
from app.core.logging import get_logger

# Initialize logger
logger = get_logger(__name__)

# Initialize Prometheus metrics
REQUEST_COUNTER = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_LATENCY = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint']
)

def create_application() -> FastAPI:
    """
    Create and configure FastAPI application with comprehensive middleware stack,
    security settings, and monitoring.
    
    Returns:
        FastAPI: Configured application instance
    """
    app = FastAPI(
        title=settings.PROJECT_NAME,
        debug=settings.DEBUG,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        version="1.0.0"
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
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

    # Add GZip compression
    app.add_middleware(
        GZipMiddleware,
        minimum_size=1000  # Only compress responses > 1KB
    )

    # Add authentication middleware
    app.add_middleware(AuthenticationMiddleware)

    # Add performance monitoring middleware
    app.add_middleware(PerformanceMiddleware)

    # Configure exception handlers
    @app.exception_handler(BaseAppException)
    async def base_exception_handler(request: Request, exc: BaseAppException) -> JSONResponse:
        logger.error(
            f"Application error: {exc.message}",
            extra={
                "error_code": exc.error_code,
                "path": request.url.path,
                "correlation_id": getattr(request.state, "correlation_id", None)
            }
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_dict()
        )

    @app.exception_handler(ValidationError)
    async def validation_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
        logger.warning(
            f"Validation error: {exc.message}",
            extra={
                "error_code": exc.error_code,
                "path": request.url.path,
                "details": exc.details
            }
        )
        return JSONResponse(
            status_code=422,
            content=exc.to_dict()
        )

    @app.exception_handler(RateLimitError)
    async def rate_limit_exception_handler(request: Request, exc: RateLimitError) -> JSONResponse:
        logger.warning(
            f"Rate limit exceeded: {exc.message}",
            extra={"path": request.url.path}
        )
        return JSONResponse(
            status_code=429,
            content=exc.to_dict(),
            headers={"Retry-After": "60"}
        )

    # Add request ID middleware
    @app.middleware("http")
    async def add_request_id(request: Request, call_next: Callable) -> Response:
        request.state.correlation_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.correlation_id
        return response

    # Add process time header middleware
    @app.middleware("http")
    async def add_process_time(request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response

    # Include API routers
    app.include_router(
        v1_router,
        prefix=settings.API_V1_STR
    )

    # Add health check endpoint
    @app.get("/health")
    async def health_check() -> dict:
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0.0"
        }

    logger.info("FastAPI application configured successfully")
    return app

# Create FastAPI application instance
app = create_application()

# Export application instance
__all__ = ["app"]