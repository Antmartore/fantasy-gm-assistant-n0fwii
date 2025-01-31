# Python 3.11+
import time
import uuid
from typing import Dict, Any, Callable, Optional
from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import Response
from prometheus_client import Counter, Histogram

from app.core.config import settings, DEBUG, SECURITY_HEADERS
from app.core.rate_limiter import RateLimiter
from app.core.logging import get_logger
from app.core.security import verify_token
from app.core.exceptions import AuthenticationError

# Initialize logger
logger = get_logger(__name__)

# Define public paths that don't require authentication
PUBLIC_PATHS = ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/health']

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
AUTH_FAILURES = Counter(
    'auth_failures_total',
    'Total authentication failures',
    ['reason']
)

class AuthenticationMiddleware:
    """
    Enhanced middleware for JWT token authentication, validation, and security headers.
    Implements comprehensive security measures and monitoring.
    """

    def __init__(self, app: FastAPI) -> None:
        """
        Initialize authentication middleware with enhanced features.

        Args:
            app: FastAPI application instance
        """
        self.app = app
        self.logger = get_logger(__name__)
        self.security_headers = SECURITY_HEADERS
        self.rate_limiter = RateLimiter()

    async def authenticate(self, request: Request) -> Dict[str, Any]:
        """
        Authenticate request using JWT token with enhanced validation.

        Args:
            request: Incoming request object

        Returns:
            Dict[str, Any]: Validated user claims

        Raises:
            AuthenticationError: If authentication fails
        """
        try:
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                AUTH_FAILURES.labels(reason='missing_token').inc()
                raise AuthenticationError(
                    message="Missing or invalid authorization header",
                    error_code=1001
                )

            token = auth_header.split(' ')[1]
            claims = verify_token(token)

            # Apply rate limiting based on user claims
            endpoint = request.url.path.split('/')[-1]
            await self.rate_limiter.check_rate_limit(claims['sub'], endpoint)

            return claims

        except AuthenticationError as e:
            self.logger.warning(
                "Authentication failed",
                extra={
                    'error': str(e),
                    'path': request.url.path,
                    'correlation_id': request.state.correlation_id
                }
            )
            raise

    async def __call__(self, request: Request, call_next: Callable) -> Response:
        """
        Process request through enhanced authentication middleware.

        Args:
            request: Incoming request object
            call_next: Next middleware in chain

        Returns:
            Response: Processed response with security headers
        """
        # Generate correlation ID for request tracking
        correlation_id = str(uuid.uuid4())
        request.state.correlation_id = correlation_id

        # Skip authentication for public paths
        path = request.url.path
        if path in PUBLIC_PATHS:
            response = await call_next(request)
            return self._add_security_headers(response)

        try:
            # Authenticate request
            claims = await self.authenticate(request)
            request.state.user = claims

            # Process request
            response = await call_next(request)
            
            # Add security headers
            return self._add_security_headers(response)

        except Exception as e:
            self.logger.error(
                "Request processing failed",
                extra={
                    'error': str(e),
                    'path': path,
                    'correlation_id': correlation_id
                }
            )
            raise

    def _add_security_headers(self, response: Response) -> Response:
        """Add security headers to response."""
        for header, value in self.security_headers.items():
            response.headers[header] = value
        return response

class PerformanceMiddleware:
    """
    Enhanced middleware for comprehensive request performance monitoring.
    Implements detailed metrics collection and latency tracking.
    """

    def __init__(self, app: FastAPI) -> None:
        """
        Initialize performance middleware with enhanced monitoring.

        Args:
            app: FastAPI application instance
        """
        self.app = app
        self.logger = get_logger(__name__)

    async def __call__(self, request: Request, call_next: Callable) -> Response:
        """
        Process request through enhanced performance middleware.

        Args:
            request: Incoming request object
            call_next: Next middleware in chain

        Returns:
            Response: Processed response with performance metrics
        """
        start_time = time.perf_counter()
        method = request.method
        path = request.url.path
        correlation_id = request.state.correlation_id

        try:
            # Process request and track metrics
            response = await call_next(request)
            
            # Calculate request duration
            duration = time.perf_counter() - start_time
            
            # Update Prometheus metrics
            REQUEST_COUNTER.labels(
                method=method,
                endpoint=path,
                status=response.status_code
            ).inc()
            
            REQUEST_LATENCY.labels(
                method=method,
                endpoint=path
            ).observe(duration)

            # Log request details
            self.logger.info(
                f"Request processed successfully",
                extra={
                    'method': method,
                    'path': path,
                    'status_code': response.status_code,
                    'duration_ms': duration * 1000,
                    'correlation_id': correlation_id
                }
            )

            # Add performance headers
            response.headers['X-Response-Time'] = f"{duration:.3f}s"
            response.headers['X-Correlation-ID'] = correlation_id
            
            return response

        except Exception as e:
            # Track failed requests
            REQUEST_COUNTER.labels(
                method=method,
                endpoint=path,
                status=500
            ).inc()
            
            self.logger.error(
                "Request processing failed",
                extra={
                    'error': str(e),
                    'method': method,
                    'path': path,
                    'duration_ms': (time.perf_counter() - start_time) * 1000,
                    'correlation_id': correlation_id
                }
            )
            raise