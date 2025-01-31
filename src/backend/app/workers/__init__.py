"""
Main entry point for the Celery workers package that initializes and exposes all asynchronous tasks
with enhanced performance monitoring and task routing.

Version: Python 3.11+
"""

from datetime import datetime
from typing import Any, Dict, Optional
import structlog

from app.workers.celery_app import celery_app, Task
from app.workers.simulation_tasks import (
    simulate_lineup_task,
    analyze_trade_task,
    simulate_season_task
)
from app.workers.media_tasks import (
    generate_voice_content,
    generate_video_content,
    check_video_status
)
from app.workers.analytics_tasks import (
    process_user_analytics,
    update_performance_metrics,
    aggregate_sport_analytics,
    track_ai_metrics
)

# Initialize structured logger
logger = structlog.get_logger(__name__)

# Package version
VERSION = '1.0.0'

# Task module configuration
TASK_MODULES = [
    'simulation_tasks',
    'media_tasks',
    'analytics_tasks'
]

# Task priority configuration
TASK_PRIORITIES = {
    'simulation': 'high',
    'media': 'medium',
    'analytics': 'low'
}

# Task routing configuration
TASK_ROUTES = {
    'app.workers.simulation_tasks.*': {'queue': 'simulation'},
    'app.workers.media_tasks.*': {'queue': 'media'},
    'app.workers.analytics_tasks.*': {'queue': 'analytics'}
}

class MonitoredTask(Task):
    """Enhanced base task class with performance monitoring and error handling."""

    def __init__(self) -> None:
        """Initialize task monitoring properties."""
        super().__init__()
        self.metrics = {
            'success_count': 0,
            'failure_count': 0,
            'processing_times': [],
            'last_error': None,
            'last_success': None
        }

    def on_success(self, retval: Any, task_id: str, args: Dict, kwargs: Dict) -> None:
        """
        Handle successful task completion and record metrics.

        Args:
            retval: Task return value
            task_id: Unique task identifier
            args: Task positional arguments
            kwargs: Task keyword arguments
        """
        try:
            # Update success metrics
            self.metrics['success_count'] += 1
            self.metrics['last_success'] = datetime.utcnow().isoformat()

            # Log success with context
            logger.info(
                "Task completed successfully",
                task_id=task_id,
                task_name=self.name,
                execution_time=self.request.duration,
                correlation_id=kwargs.get('correlation_id')
            )

        except Exception as e:
            logger.error(
                "Error recording task success metrics",
                task_id=task_id,
                error=str(e)
            )

    def on_failure(self, exc: Exception, task_id: str, args: Dict, kwargs: Dict, einfo: Dict) -> None:
        """
        Handle task failure and record error metrics.

        Args:
            exc: Exception that occurred
            task_id: Unique task identifier
            args: Task positional arguments
            kwargs: Task keyword arguments
            einfo: Error information dictionary
        """
        try:
            # Update failure metrics
            self.metrics['failure_count'] += 1
            self.metrics['last_error'] = {
                'timestamp': datetime.utcnow().isoformat(),
                'error': str(exc),
                'task_id': task_id
            }

            # Log failure with context
            logger.error(
                "Task execution failed",
                task_id=task_id,
                task_name=self.name,
                error=str(exc),
                correlation_id=kwargs.get('correlation_id'),
                exc_info=True
            )

            # Trigger retry if applicable
            if not self.request.retries >= self.max_retries:
                self.retry(exc=exc, countdown=self.default_retry_delay)

        except Exception as e:
            logger.error(
                "Error recording task failure metrics",
                task_id=task_id,
                error=str(e)
            )

# Configure Celery application with monitoring
celery_app.Task = MonitoredTask

# Export package components
__all__ = [
    'celery_app',
    'MonitoredTask',
    # Simulation tasks
    'simulate_lineup_task',
    'analyze_trade_task',
    'simulate_season_task',
    # Media tasks
    'generate_voice_content',
    'generate_video_content',
    'check_video_status',
    # Analytics tasks
    'process_user_analytics',
    'update_performance_metrics',
    'aggregate_sport_analytics',
    'track_ai_metrics'
]