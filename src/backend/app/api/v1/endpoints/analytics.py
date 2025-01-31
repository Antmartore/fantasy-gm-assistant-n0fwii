# Python 3.11+
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from redis import Redis  # version: 4.0+
from prometheus_client import Counter, Histogram, Gauge  # version: 0.16+

from app.schemas.analytics import (
    UserAnalytics, PerformanceMetrics, SportAnalytics, 
    AIMetrics, RealTimeMetrics
)
from app.core.security import SecurityAuditor
from app.core.config import settings
from app.core.exceptions import AuthorizationError, RateLimitError
from app.core.logging import get_logger

# Initialize router
router = APIRouter(prefix="/analytics", tags=["analytics"])

# Initialize logger
logger = get_logger(__name__)

# Initialize Redis client
redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)

# Initialize Prometheus metrics
ANALYTICS_REQUESTS = Counter(
    'analytics_requests_total',
    'Total analytics API requests',
    ['endpoint', 'status']
)
ANALYTICS_LATENCY = Histogram(
    'analytics_request_latency_seconds',
    'Analytics request latency in seconds',
    ['endpoint']
)
ACTIVE_USERS_GAUGE = Gauge(
    'active_users_total',
    'Total number of currently active users'
)

@router.get("/real-time", response_model=RealTimeMetrics)
async def get_real_time_metrics(
    background_tasks: BackgroundTasks,
    auditor: SecurityAuditor = Depends()
) -> RealTimeMetrics:
    """
    Retrieve real-time system metrics with caching and security validation.
    
    Args:
        background_tasks: FastAPI background tasks handler
        auditor: Security auditor dependency
        
    Returns:
        RealTimeMetrics: Current system performance and user metrics
        
    Raises:
        AuthorizationError: If user lacks required permissions
        RateLimitError: If request exceeds rate limits
    """
    with ANALYTICS_LATENCY.labels(endpoint="real_time").time():
        try:
            # Verify analytics access permissions
            await auditor.audit_analytics_access()
            
            # Check Redis cache first
            cache_key = "real_time_metrics"
            cached_metrics = redis_client.get(cache_key)
            
            if cached_metrics:
                ANALYTICS_REQUESTS.labels(
                    endpoint="real_time",
                    status="cache_hit"
                ).inc()
                return RealTimeMetrics.parse_raw(cached_metrics)
            
            # Generate new metrics if cache miss
            current_metrics = {
                "timestamp": datetime.utcnow().isoformat(),
                "active_users": ACTIVE_USERS_GAUGE._value.get(),
                "api_response_time": ANALYTICS_LATENCY.observe(),
                "error_count": ANALYTICS_REQUESTS.labels(
                    endpoint="real_time",
                    status="error"
                )._value.get(),
                "cpu_usage": 0.0,  # Placeholder for actual metrics
                "memory_usage": 0.0,  # Placeholder for actual metrics
            }
            
            # Update cache in background
            background_tasks.add_task(
                redis_client.setex,
                cache_key,
                settings.CACHE_TTL_SECONDS,
                RealTimeMetrics(**current_metrics).json()
            )
            
            ANALYTICS_REQUESTS.labels(
                endpoint="real_time",
                status="success"
            ).inc()
            
            return RealTimeMetrics(**current_metrics)
            
        except AuthorizationError as e:
            ANALYTICS_REQUESTS.labels(
                endpoint="real_time",
                status="error"
            ).inc()
            logger.error(f"Authorization error: {str(e)}")
            raise
        except Exception as e:
            ANALYTICS_REQUESTS.labels(
                endpoint="real_time",
                status="error"
            ).inc()
            logger.error(f"Error retrieving real-time metrics: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error retrieving real-time metrics"
            )

@router.put("/{user_id}", response_model=UserAnalytics)
async def update_user_analytics(
    user_id: UUID,
    analytics_data: UserAnalytics,
    background_tasks: BackgroundTasks,
    auditor: SecurityAuditor = Depends()
) -> UserAnalytics:
    """
    Update user analytics data with validation and background processing.
    
    Args:
        user_id: User identifier
        analytics_data: Updated analytics data
        background_tasks: FastAPI background tasks handler
        auditor: Security auditor dependency
        
    Returns:
        UserAnalytics: Updated user analytics data
        
    Raises:
        AuthorizationError: If user lacks required permissions
        ValidationError: If analytics data is invalid
        RateLimitError: If request exceeds rate limits
    """
    with ANALYTICS_LATENCY.labels(endpoint="update_user").time():
        try:
            # Verify analytics update permissions
            await auditor.audit_analytics_access()
            
            # Validate analytics data
            analytics_data.validate_session_duration()
            
            # Cache key for user analytics
            cache_key = f"user_analytics:{user_id}"
            
            # Update Redis cache
            background_tasks.add_task(
                redis_client.setex,
                cache_key,
                settings.CACHE_TTL_SECONDS,
                analytics_data.json()
            )
            
            # Update Prometheus metrics
            ACTIVE_USERS_GAUGE.set(analytics_data.login_count)
            
            ANALYTICS_REQUESTS.labels(
                endpoint="update_user",
                status="success"
            ).inc()
            
            return analytics_data
            
        except AuthorizationError as e:
            ANALYTICS_REQUESTS.labels(
                endpoint="update_user",
                status="error"
            ).inc()
            logger.error(f"Authorization error: {str(e)}")
            raise
        except Exception as e:
            ANALYTICS_REQUESTS.labels(
                endpoint="update_user",
                status="error"
            ).inc()
            logger.error(f"Error updating user analytics: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error updating user analytics"
            )

@router.get("/performance", response_model=PerformanceMetrics)
async def get_performance_metrics(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    auditor: SecurityAuditor = Depends()
) -> PerformanceMetrics:
    """
    Retrieve system performance metrics within a specified time range.
    
    Args:
        start_time: Start of metrics period
        end_time: End of metrics period
        auditor: Security auditor dependency
        
    Returns:
        PerformanceMetrics: System performance metrics
        
    Raises:
        AuthorizationError: If user lacks required permissions
        ValidationError: If time range is invalid
    """
    with ANALYTICS_LATENCY.labels(endpoint="performance").time():
        try:
            # Verify analytics access permissions
            await auditor.audit_analytics_access()
            
            # Default to last 24 hours if no range specified
            end_time = end_time or datetime.utcnow()
            start_time = start_time or (end_time - timedelta(days=1))
            
            # Validate time range
            if start_time > end_time:
                raise ValueError("Start time must be before end time")
            
            # Generate performance metrics
            metrics = {
                "id": UUID(int=0),  # Placeholder for actual ID
                "timestamp": datetime.utcnow(),
                "api_response_time": ANALYTICS_LATENCY.observe(),
                "ai_processing_time": 0.0,  # Placeholder for actual metrics
                "active_users": ACTIVE_USERS_GAUGE._value.get(),
                "cpu_usage": 0.0,  # Placeholder for actual metrics
                "memory_usage": 0.0,  # Placeholder for actual metrics
                "error_count": ANALYTICS_REQUESTS.labels(
                    endpoint="performance",
                    status="error"
                )._value.get()
            }
            
            ANALYTICS_REQUESTS.labels(
                endpoint="performance",
                status="success"
            ).inc()
            
            return PerformanceMetrics(**metrics)
            
        except AuthorizationError as e:
            ANALYTICS_REQUESTS.labels(
                endpoint="performance",
                status="error"
            ).inc()
            logger.error(f"Authorization error: {str(e)}")
            raise
        except Exception as e:
            ANALYTICS_REQUESTS.labels(
                endpoint="performance",
                status="error"
            ).inc()
            logger.error(f"Error retrieving performance metrics: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error retrieving performance metrics"
            )