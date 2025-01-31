# Python 3.11+
import asyncio
import hashlib
from typing import Optional, Dict, Any
from uuid import UUID

import httpx  # version 0.24+
import tenacity  # version 8.2+
import aiofiles  # version 23.1+
from prometheus_client import Counter, Histogram  # version 0.17+

from app.core.config import settings
from app.services.s3_service import S3Service
from app.schemas.media import VideoGenerationRequest, VideoGenerationResponse
from app.core.logging import get_logger
from app.core.exceptions import IntegrationError

# Initialize logger
logger = get_logger('runwayml_service')

# Constants
RUNWAY_API_BASE_URL = 'https://api.runwayml.com/v1'
RETRY_MULTIPLIER = 1.5
MAX_CONTENT_SIZE = 1024 * 1024 * 100  # 100MB
VALID_VIDEO_FORMATS = ['mp4', 'mov']

# Metrics
VIDEO_GENERATION_REQUESTS = Counter(
    'video_generation_requests_total',
    'Total number of video generation requests',
    ['status']
)
VIDEO_GENERATION_DURATION = Histogram(
    'video_generation_duration_seconds',
    'Time taken for video generation',
    buckets=[10, 30, 60, 120, 300]
)

class RunwayMLService:
    """Enhanced service class for secure video generation using RunwayML API with monitoring and validation."""

    def __init__(self) -> None:
        """Initialize RunwayML service with enhanced configuration."""
        # Configure HTTP client with security and timeout settings
        self._client = httpx.AsyncClient(
            base_url=RUNWAY_API_BASE_URL,
            timeout=60.0,
            verify=True,
            headers={
                'Authorization': f'Bearer {settings.RUNWAY_ML_API_KEY.get_secret_value()}',
                'Content-Type': 'application/json',
                'User-Agent': 'FantasyGM/1.0'
            }
        )
        
        # Initialize S3 service for secure storage
        self._s3_service = S3Service()
        
        logger.info("RunwayML service initialized with secure configuration")

    async def generate_video(self, request: VideoGenerationRequest) -> VideoGenerationResponse:
        """
        Generates and validates video content using RunwayML with enhanced security and monitoring.
        
        Args:
            request: Validated video generation request
            
        Returns:
            VideoGenerationResponse with secure URL and status
            
        Raises:
            IntegrationError: If video generation or validation fails
        """
        correlation_id = str(UUID.uuid4())
        logger.info(f"Starting video generation request {correlation_id}", extra={'correlation_id': correlation_id})

        try:
            with VIDEO_GENERATION_DURATION.time():
                # Prepare generation payload with security parameters
                payload = {
                    'prompt': request.prompt,
                    'duration': request.duration_seconds,
                    'style': request.style_preset,
                    'parameters': {
                        'resolution': '1080p',
                        'fps': 30,
                        'quality': 'high',
                        'format': 'mp4',
                        **request.generation_settings
                    }
                }

                # Submit generation job
                async with self._client as client:
                    response = await client.post('/videos/generate', json=payload)
                    
                    if response.status_code != 202:
                        raise IntegrationError(
                            message="Failed to initiate video generation",
                            error_code=6010,
                            details={'status_code': response.status_code}
                        )

                    job_data = response.json()
                    job_id = job_data['id']

                # Track generation progress
                progress = 0.0
                while progress < 100.0:
                    progress = await self.track_generation_progress(job_id)
                    await asyncio.sleep(5)

                # Retrieve generated video
                video_response = await client.get(f'/videos/{job_id}/download')
                
                if video_response.status_code != 200:
                    raise IntegrationError(
                        message="Failed to download generated video",
                        error_code=6011,
                        details={'job_id': job_id}
                    )

                # Validate video content
                video_content = video_response.content
                if not await self.validate_video_content(video_content):
                    raise IntegrationError(
                        message="Generated video failed validation",
                        error_code=6012,
                        details={'job_id': job_id}
                    )

                # Generate secure filename and upload to S3
                content_hash = hashlib.sha256(video_content).hexdigest()[:12]
                s3_key = f"videos/trades/{request.trade_id}/{content_hash}.mp4"
                
                # Upload with encryption and metadata
                video_url = await self._s3_service.upload_bytes(
                    data=video_content,
                    key=s3_key,
                    content_type='video/mp4',
                    metadata={
                        'trade_id': str(request.trade_id),
                        'prompt': request.prompt,
                        'correlation_id': correlation_id
                    }
                )

                VIDEO_GENERATION_REQUESTS.labels(status='success').inc()
                
                return VideoGenerationResponse(
                    video_url=video_url,
                    status='completed',
                    progress=100.0,
                    duration_seconds=request.duration_seconds
                )

        except Exception as e:
            VIDEO_GENERATION_REQUESTS.labels(status='error').inc()
            logger.error(
                f"Video generation failed: {str(e)}",
                extra={'correlation_id': correlation_id},
                exc_info=True
            )
            raise IntegrationError(
                message="Video generation failed",
                error_code=6013,
                details={'error': str(e)},
                correlation_id=correlation_id
            )

    async def validate_video_content(self, content: bytes) -> bool:
        """
        Validates generated video content for security and integrity.
        
        Args:
            content: Video content bytes
            
        Returns:
            bool indicating validation success
        """
        try:
            # Check file size
            if len(content) > MAX_CONTENT_SIZE:
                logger.error(f"Video content exceeds maximum size: {len(content)} bytes")
                return False

            # Verify video format (basic header check)
            if not any(content.startswith(b.encode()) for b in VALID_VIDEO_FORMATS):
                logger.error("Invalid video format detected")
                return False

            # Additional validation could include:
            # - Frame rate verification
            # - Resolution check
            # - Content safety scanning
            # - Metadata validation

            return True

        except Exception as e:
            logger.error(f"Video content validation failed: {str(e)}", exc_info=True)
            return False

    @tenacity.retry(
        stop=tenacity.stop_after_attempt(settings.RUNWAY_ML_MAX_RETRIES),
        wait=tenacity.wait_exponential(multiplier=RETRY_MULTIPLIER)
    )
    async def track_generation_progress(self, job_id: str) -> float:
        """
        Tracks and reports video generation progress with retry mechanism.
        
        Args:
            job_id: RunwayML job identifier
            
        Returns:
            float: Progress percentage
            
        Raises:
            IntegrationError: If progress tracking fails
        """
        try:
            async with self._client as client:
                response = await client.get(f'/videos/{job_id}/progress')
                
                if response.status_code != 200:
                    raise IntegrationError(
                        message="Failed to fetch generation progress",
                        error_code=6014,
                        details={'job_id': job_id}
                    )

                progress_data = response.json()
                progress = float(progress_data.get('progress', 0.0))
                
                logger.debug(f"Generation progress for job {job_id}: {progress}%")
                return progress

        except Exception as e:
            logger.error(f"Progress tracking failed for job {job_id}: {str(e)}", exc_info=True)
            raise IntegrationError(
                message="Progress tracking failed",
                error_code=6015,
                details={'job_id': job_id, 'error': str(e)}
            )