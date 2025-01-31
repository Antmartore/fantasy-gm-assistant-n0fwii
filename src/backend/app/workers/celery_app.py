# Python 3.11+
from celery import Celery  # celery v5.3+
from kombu.utils.url import maybe_sanitize_url  # kombu v5.3+
from kombu.connection import RetryingConnection  # kombu v5.3+
from app.core.config import REDIS_URL, PROJECT_NAME, settings

# Define task queues with priorities and rate limits
CELERY_TASK_QUEUES = {
    'simulation': {
        'queue': 'simulation',
        'priority': 10,  # Highest priority for Monte Carlo simulations
        'rate_limit': '100/m',
        'routing_key': 'simulation.*',
        'dead_letter_exchange': 'simulation.dlx'
    },
    'media': {
        'queue': 'media',
        'priority': 5,  # Medium priority for video/audio generation
        'rate_limit': '50/m',
        'routing_key': 'media.*',
        'dead_letter_exchange': 'media.dlx'
    },
    'analytics': {
        'queue': 'analytics',
        'priority': 3,  # Lower priority for background analytics
        'rate_limit': '200/m',
        'routing_key': 'analytics.*',
        'dead_letter_exchange': 'analytics.dlx'
    }
}

# Task routing configuration
CELERY_TASK_ROUTES = {
    'app.workers.simulation_tasks.*': {'queue': 'simulation'},
    'app.workers.media_tasks.*': {'queue': 'media'},
    'app.workers.analytics_tasks.*': {'queue': 'analytics'}
}

def create_celery() -> Celery:
    """
    Factory function to create and configure Celery application instance with enhanced
    monitoring, fault tolerance, and performance settings.

    Returns:
        Celery: Configured Celery application instance with optimized settings
    """
    # Create Celery app with secure broker URL
    app = Celery(
        PROJECT_NAME,
        broker=maybe_sanitize_url(REDIS_URL),
        backend=maybe_sanitize_url(REDIS_URL)
    )

    # Configure Redis connection with circuit breaker pattern
    app.conf.broker_transport_options = {
        'connection_class': RetryingConnection,
        'max_retries': settings.MAX_RETRIES,
        'interval_start': 0,
        'interval_step': 1,
        'interval_max': 5
    }

    # Result backend configuration
    app.conf.result_backend_transport_options = {
        'retry_policy': {
            'max_retries': settings.MAX_RETRIES
        }
    }
    app.conf.result_expires = 60 * 60 * 24  # Results expire after 24 hours

    # Task queue configuration
    app.conf.task_queues = CELERY_TASK_QUEUES
    app.conf.task_routes = CELERY_TASK_ROUTES
    app.conf.task_default_queue = 'analytics'  # Default queue for unspecified tasks
    
    # Task execution settings
    app.conf.task_serializer = 'json'
    app.conf.result_serializer = 'json'
    app.conf.accept_content = ['json']
    app.conf.task_compression = 'gzip'
    app.conf.result_compression = 'gzip'
    
    # Task time limits
    app.conf.task_soft_time_limit = 30  # Soft limit: 30 seconds
    app.conf.task_time_limit = 60       # Hard limit: 60 seconds

    # Worker configuration
    app.conf.worker_prefetch_multiplier = 1  # Prevent worker starvation
    app.conf.worker_max_tasks_per_child = 1000  # Prevent memory leaks
    app.conf.worker_max_memory_per_child = 150000  # 150MB memory limit
    
    # Task retry settings
    app.conf.task_acks_late = True  # Only acknowledge after task completion
    app.conf.task_reject_on_worker_lost = True  # Requeue if worker dies
    app.conf.task_default_retry_delay = 3  # Wait 3 seconds between retries
    app.conf.task_max_retries = settings.MAX_RETRIES

    # Enable task events for monitoring
    app.conf.worker_send_task_events = True
    app.conf.task_send_sent_event = True
    
    # Dead letter queue configuration
    app.conf.task_reject_on_worker_lost = True
    app.conf.task_routes = CELERY_TASK_ROUTES

    # Graceful shutdown configuration
    app.conf.worker_shutdown_timeout = 10  # Wait 10 seconds for tasks to complete

    return app

# Create the Celery application instance
celery_app = create_celery()

# Enable task revocation support
celery_app.conf.task_track_started = True

# Configure logging and monitoring
celery_app.conf.worker_log_format = '[%(asctime)s: %(levelname)s/%(processName)s] %(message)s'
celery_app.conf.worker_task_log_format = (
    '[%(asctime)s: %(levelname)s/%(processName)s] '
    '[%(task_name)s(%(task_id)s)] %(message)s'
)

# Export the Celery application instance
__all__ = ['celery_app']