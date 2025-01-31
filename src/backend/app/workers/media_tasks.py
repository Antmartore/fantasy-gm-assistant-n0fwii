# Python 3.11+
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from tenacity import retry, stop_after_attempt, wait_exponential  # version 8.2.0
import structlog  # version 23.1.0
from prometheus_client import Counter, Histogram  # version 0.17.0

from app.workers.celery_app import celery_app
from app.services.elevenlabs_service import ElevenLabsService
from app.services.runwayml_service import RunwayMLService
from app.core.exceptions import IntegrationError
from app.schemas.media import (
    VoiceGenerationRequest,
    VoiceGenerationResponse,
    VideoGenerationRequest,
    VideoGenerationResponse
)

# Initialize structured logger
logger = structlog.get_logger(__name__)

# Constants for task configuration
MAX_RETRIES = 3
RETRY_DELAY = 5
TASK_QUEUE = 'media'
MEDIA_GENERATION_TIMEOUT = 300  # 5 minutes
MAX_CONTENT_SIZE = 100 * 1024 * 1024  # 100MB

# Prometheus metrics
VOICE_GENERATION_REQUESTS = Counter(
    'voice_generation_requests_total',
    'Total number of voice generation requests',
    ['status']
)
VOICE_GENERATION_DURATION = Histogram(
    'voice_generation_duration_seconds',
    'Time taken for voice generation',
    buckets=[10, 30, 60, 120, 300]
)

VIDEO_GENERATION_REQUESTS = Counter(
    'video_generation_requests_total',
    'Total number of video generation requests',
    ['status']
)
VIDEO_GENERATION_DURATION = Histogram(
    'video_generation_duration_seconds',
    'Time taken for video generation',
    buckets=[30, 60, 120, 300, 600]
)

@celery_app.task(
    queue=TASK_QUEUE,
    bind=True,
    max_retries=MAX_RETRIES,
    default_retry_delay=RETRY_DELAY
)
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10)
)
async def generate_voice_content(
    self,
    request: VoiceGenerationRequest,
    correlation_id: str
) -> VoiceGenerationResponse:
    """
    Celery task for generating voice content using Eleven Labs with comprehensive monitoring.

    Args:
        request: Voice generation request parameters
        correlation_id: Unique identifier for request tracking

    Returns:
        VoiceGenerationResponse with secure URL and metadata

    Raises:
        IntegrationError: If voice generation fails
    """
    logger.info(
        "Starting voice generation task",
        correlation_id=correlation_id,
        task_id=self.request.id
    )

    try:
        with VOICE_GENERATION_DURATION.time():
            # Initialize Eleven Labs service
            eleven_labs = ElevenLabsService()

            # Generate voice content
            response = await eleven_labs.generate_voice(request)

            if response.status == 'completed':
                VOICE_GENERATION_REQUESTS.labels(status='success').inc()
                logger.info(
                    "Voice generation completed successfully",
                    correlation_id=correlation_id,
                    duration_seconds=response.duration_seconds
                )
            else:
                VOICE_GENERATION_REQUESTS.labels(status='error').inc()
                logger.error(
                    "Voice generation failed",
                    correlation_id=correlation_id,
                    error=response.processing_error
                )

            return response

    except Exception as e:
        VOICE_GENERATION_REQUESTS.labels(status='error').inc()
        logger.error(
            "Voice generation task failed",
            correlation_id=correlation_id,
            error=str(e),
            exc_info=True
        )
        raise IntegrationError(
            message="Voice generation failed",
            error_code=6020,
            details={'error': str(e)},
            correlation_id=correlation_id
        )

@celery_app.task(
    queue=TASK_QUEUE,
    bind=True,
    max_retries=MAX_RETRIES,
    default_retry_delay=RETRY_DELAY
)
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10)
)
async def generate_video_content(
    self,
    request: VideoGenerationRequest,
    correlation_id: str
) -> VideoGenerationResponse:
    """
    Celery task for generating video content using RunwayML with progress tracking.

    Args:
        request: Video generation request parameters
        correlation_id: Unique identifier for request tracking

    Returns:
        VideoGenerationResponse with secure URL and metadata

    Raises:
        IntegrationError: If video generation fails
    """
    logger.info(
        "Starting video generation task",
        correlation_id=correlation_id,
        task_id=self.request.id,
        trade_id=request.trade_id
    )

    try:
        with VIDEO_GENERATION_DURATION.time():
            # Initialize RunwayML service
            runway = RunwayMLService()

            # Generate video with progress tracking
            response = await runway.generate_video(request)

            if response.status == 'completed':
                VIDEO_GENERATION_REQUESTS.labels(status='success').inc()
                logger.info(
                    "Video generation completed successfully",
                    correlation_id=correlation_id,
                    duration_seconds=response.duration_seconds,
                    trade_id=request.trade_id
                )
            else:
                VIDEO_GENERATION_REQUESTS.labels(status='error').inc()
                logger.error(
                    "Video generation failed",
                    correlation_id=correlation_id,
                    error=response.processing_error,
                    trade_id=request.trade_id
                )

            return response

    except Exception as e:
        VIDEO_GENERATION_REQUESTS.labels(status='error').inc()
        logger.error(
            "Video generation task failed",
            correlation_id=correlation_id,
            error=str(e),
            trade_id=request.trade_id,
            exc_info=True
        )
        raise IntegrationError(
            message="Video generation failed",
            error_code=6021,
            details={
                'error': str(e),
                'trade_id': str(request.trade_id)
            },
            correlation_id=correlation_id
        )