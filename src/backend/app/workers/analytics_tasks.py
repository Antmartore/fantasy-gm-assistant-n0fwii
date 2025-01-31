# Python 3.11+
from datetime import datetime, timedelta
import json
import numpy as np  # v1.24+
import psutil  # v5.9+
from typing import Dict, List, Optional
from uuid import UUID

from app.workers.celery_app import celery_app
from app.models.analytics import UserAnalytics, PerformanceMetrics
from app.services.redis_service import RedisService, CACHE_TTL
from app.core.exceptions import IntegrationError
from app.core.logging import get_logger

# Initialize logger
logger = get_logger(__name__)

# Initialize Redis service
redis_service = RedisService()

# Constants for analytics processing
ANALYTICS_BATCH_SIZE = 100
METRICS_INTERVAL = 300  # 5 minutes

# Cache key templates
CACHE_KEYS = {
    'USER_ANALYTICS': 'user_analytics_{user_id}',
    'PERFORMANCE_METRICS': 'performance_metrics',
    'SPORT_ANALYTICS': 'sport_analytics_{sport_type}',
    'AI_METRICS': 'ai_metrics_{model_type}'
}

# Error handling thresholds
ERROR_THRESHOLDS = {
    'MAX_RETRIES': 3,
    'BACKOFF_FACTOR': 2,
    'MAX_DELAY': 300
}

@celery_app.task(queue='analytics', retry_backoff=True)
async def process_user_analytics(
    user_id: UUID,
    session_data: Dict,
    force_refresh: bool = False
) -> Dict:
    """
    Process and store user engagement analytics with enhanced error handling and caching.

    Args:
        user_id: User identifier
        session_data: Session activity data
        force_refresh: Force cache refresh

    Returns:
        Dict: Processed analytics data
    """
    try:
        cache_key = CACHE_KEYS['USER_ANALYTICS'].format(user_id=user_id)
        
        # Check cache unless force refresh
        if not force_refresh:
            cached_data = await redis_service.get(cache_key)
            if cached_data:
                return cached_data

        # Get or create analytics record
        analytics = UserAnalytics.get_or_create(user_id=user_id)
        
        # Process session data
        session_duration = session_data.get('duration', 0)
        features_used = session_data.get('features_used', {})
        is_premium = session_data.get('is_premium', False)
        
        # Update analytics
        analytics.update_session(
            duration=session_duration,
            features_used=features_used,
            is_premium_session=is_premium
        )
        
        # Calculate engagement score
        engagement_metrics = {
            'weekly_active_days': analytics.weekly_active_days,
            'monthly_active_days': analytics.monthly_active_days,
            'avg_session_duration': analytics.avg_session_duration,
            'feature_usage': analytics.feature_usage
        }
        
        # Cache results
        await redis_service.set(
            key=cache_key,
            value=engagement_metrics,
            ttl=CACHE_TTL['USER_ANALYTICS']
        )
        
        return engagement_metrics

    except Exception as e:
        logger.error(f"Error processing user analytics: {str(e)}")
        raise IntegrationError(f"Analytics processing failed: {str(e)}")

@celery_app.task(queue='analytics')
@celery_app.periodic_task(run_every=METRICS_INTERVAL)
async def update_performance_metrics() -> Dict:
    """
    Collect and store comprehensive system performance metrics.

    Returns:
        Dict: System performance metrics
    """
    try:
        metrics = PerformanceMetrics()
        
        # Collect system metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Update metrics
        metrics.cpu_usage = cpu_percent
        metrics.memory_usage = memory.percent
        metrics.api_requests = await redis_service.get('api_request_count') or 0
        
        # Calculate response times
        api_latencies = await redis_service.get('api_latencies') or []
        if api_latencies:
            metrics.api_response_time = np.mean(api_latencies)
            metrics.endpoint_latencies = {
                'p50': np.percentile(api_latencies, 50),
                'p95': np.percentile(api_latencies, 95),
                'p99': np.percentile(api_latencies, 99)
            }
        
        # Store metrics
        metrics_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'cpu_usage': metrics.cpu_usage,
            'memory_usage': metrics.memory_usage,
            'disk_usage': disk.percent,
            'api_metrics': {
                'request_count': metrics.api_requests,
                'response_times': metrics.endpoint_latencies
            }
        }
        
        # Cache metrics
        await redis_service.set(
            key=CACHE_KEYS['PERFORMANCE_METRICS'],
            value=metrics_data,
            ttl=CACHE_TTL['PERFORMANCE_METRICS']
        )
        
        return metrics_data

    except Exception as e:
        logger.error(f"Error updating performance metrics: {str(e)}")
        raise IntegrationError(f"Performance metrics update failed: {str(e)}")

@celery_app.task(queue='analytics', retry_backoff=True)
async def aggregate_sport_analytics(
    sport_type: str,
    analysis_params: Dict
) -> Dict:
    """
    Aggregate and analyze comprehensive sport-specific statistics.

    Args:
        sport_type: Sport identifier
        analysis_params: Analysis configuration parameters

    Returns:
        Dict: Aggregated sport analytics
    """
    try:
        cache_key = CACHE_KEYS['SPORT_ANALYTICS'].format(sport_type=sport_type)
        
        # Process team statistics
        team_stats = await process_team_stats(sport_type, analysis_params)
        
        # Analyze league trends
        league_trends = await analyze_league_trends(sport_type, analysis_params)
        
        # Calculate position distributions
        position_stats = await calculate_position_stats(sport_type)
        
        # Aggregate results
        analytics_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'sport_type': sport_type,
            'team_statistics': team_stats,
            'league_trends': league_trends,
            'position_distribution': position_stats
        }
        
        # Cache results
        await redis_service.set(
            key=cache_key,
            value=analytics_data,
            ttl=CACHE_TTL['SPORT_ANALYTICS']
        )
        
        return analytics_data

    except Exception as e:
        logger.error(f"Error aggregating sport analytics: {str(e)}")
        raise IntegrationError(f"Sport analytics aggregation failed: {str(e)}")

@celery_app.task(queue='analytics', retry_backoff=True)
async def track_ai_metrics(
    prediction_data: Dict,
    model_type: str
) -> Dict:
    """
    Track and analyze AI recommendation performance with detailed error analysis.

    Args:
        prediction_data: Prediction results and metadata
        model_type: AI model identifier

    Returns:
        Dict: AI performance metrics
    """
    try:
        cache_key = CACHE_KEYS['AI_METRICS'].format(model_type=model_type)
        
        # Calculate prediction accuracy
        accuracy_metrics = calculate_prediction_accuracy(prediction_data)
        
        # Track processing times
        processing_times = prediction_data.get('processing_times', [])
        performance_metrics = {
            'mean_processing_time': np.mean(processing_times),
            'p95_processing_time': np.percentile(processing_times, 95),
            'p99_processing_time': np.percentile(processing_times, 99)
        }
        
        # Analyze error patterns
        error_analysis = analyze_prediction_errors(prediction_data)
        
        # Aggregate metrics
        ai_metrics = {
            'timestamp': datetime.utcnow().isoformat(),
            'model_type': model_type,
            'accuracy_metrics': accuracy_metrics,
            'performance_metrics': performance_metrics,
            'error_analysis': error_analysis
        }
        
        # Cache results
        await redis_service.set(
            key=cache_key,
            value=ai_metrics,
            ttl=CACHE_TTL['AI_METRICS']
        )
        
        return ai_metrics

    except Exception as e:
        logger.error(f"Error tracking AI metrics: {str(e)}")
        raise IntegrationError(f"AI metrics tracking failed: {str(e)}")