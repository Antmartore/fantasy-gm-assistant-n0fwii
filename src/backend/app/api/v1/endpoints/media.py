# Python 3.11+
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID
import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from circuitbreaker import CircuitBreaker  # version: 1.4+
from prometheus_client import Counter, Histogram  # version: 0.17+
from cachetools import TTLCache, LRUCache  # version: 5.0+

from app.schemas.media import (
    VoiceGenerationRequest,
    VoiceGenerationResponse,
    VideoGenerationRequest,
    MediaBaseSchema
)
from app.core.config import settings
from app.core.logging import get_logger
from app.services.eleven_labs import ElevenLabsService
from app.services.runway_ml import RunwayMLService
from app.services.aws import S3Service
from app.db.session import get_db
from app.models.media import VoiceGeneration, VideoGeneration

# Router configuration
router = APIRouter(prefix="/media", tags=["media"])
logger = get_logger(__name__)

# Metrics configuration
MEDIA_METRICS = {
    "voice_generations": Counter(
        "media_voice_generations_total",
        "Total number of voice generation requests",
        ["status"]
    ),
    "video_generations": Counter(
        "media_video_generations_total",
        "Total number of video generation requests",
        ["status"]
    ),
    "generation_duration": Histogram(
        "media_generation_duration_seconds",
        "Time taken for media generation",
        ["type"]
    )
}

# Cache configuration
voice_cache = TTLCache(maxsize=1000, ttl=settings.CACHE_TTL_SECONDS)
video_cache = TTLCache(maxsize=500, ttl=settings.CACHE_TTL_SECONDS)

# Circuit breaker configuration
circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=60,
    name="media_generation"
)

@router.post("/voice", response_model=VoiceGenerationResponse)
async def generate_voice(
    request: VoiceGenerationRequest,
    background_tasks: BackgroundTasks,
    voice_service: ElevenLabsService = Depends(),
    s3_service: S3Service = Depends(),
    db = Depends(get_db)
) -> VoiceGenerationResponse:
    """
    Enhanced endpoint for voice content generation with background processing and monitoring.
    """
    try:
        # Check cache first
        cache_key = f"voice_{request.text}_{request.voice_id}"
        if cache_key in voice_cache:
            logger.info(f"Cache hit for voice generation: {cache_key}")
            MEDIA_METRICS["voice_generations"].labels(status="cache_hit").inc()
            return voice_cache[cache_key]

        # Create database record
        voice_gen = VoiceGeneration(
            text=request.text,
            voice_id=request.voice_id,
            stability=request.stability,
            similarity_boost=request.similarity_boost,
            status="pending"
        )
        db.add(voice_gen)
        db.commit()
        db.refresh(voice_gen)

        # Initialize response
        response = VoiceGenerationResponse(
            id=voice_gen.id,
            status="processing",
            completion_percentage=0.0
        )

        @circuit_breaker
        async def process_voice_generation():
            try:
                with MEDIA_METRICS["generation_duration"].labels(type="voice").time():
                    # Generate voice content
                    audio_data = await voice_service.generate_voice(
                        text=request.text,
                        voice_id=request.voice_id,
                        stability=request.stability,
                        similarity_boost=request.similarity_boost
                    )

                    # Upload to S3
                    s3_key = f"voice/{voice_gen.id}.mp3"
                    url = await s3_service.upload_file(
                        data=audio_data,
                        key=s3_key,
                        content_type="audio/mpeg"
                    )

                    # Update database record
                    voice_gen.status = "completed"
                    voice_gen.audio_url = url
                    voice_gen.s3_key = s3_key
                    db.commit()

                    # Update cache
                    response.audio_url = url
                    response.status = "completed"
                    response.completion_percentage = 100.0
                    voice_cache[cache_key] = response

                    MEDIA_METRICS["voice_generations"].labels(status="success").inc()

            except Exception as e:
                logger.error(f"Voice generation failed: {str(e)}")
                voice_gen.status = "failed"
                voice_gen.processing_error = str(e)
                db.commit()
                MEDIA_METRICS["voice_generations"].labels(status="failed").inc()
                raise

        # Schedule background task
        background_tasks.add_task(process_voice_generation)
        
        return response

    except Exception as e:
        logger.error(f"Voice generation request failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/video", response_model=VideoGenerationResponse)
async def generate_video(
    request: VideoGenerationRequest,
    background_tasks: BackgroundTasks,
    runway_service: RunwayMLService = Depends(),
    s3_service: S3Service = Depends(),
    db = Depends(get_db)
) -> VideoGenerationResponse:
    """
    Enhanced endpoint for video content generation with progress tracking and monitoring.
    """
    try:
        # Check cache first
        cache_key = f"video_{request.prompt}_{request.style}"
        if cache_key in video_cache:
            logger.info(f"Cache hit for video generation: {cache_key}")
            MEDIA_METRICS["video_generations"].labels(status="cache_hit").inc()
            return video_cache[cache_key]

        # Create database record
        video_gen = VideoGeneration(
            prompt=request.prompt,
            style=request.style,
            duration_seconds=request.duration_seconds,
            trade_id=request.trade_id,
            status="pending"
        )
        db.add(video_gen)
        db.commit()
        db.refresh(video_gen)

        # Initialize response
        response = VideoGenerationResponse(
            id=video_gen.id,
            status="processing",
            completion_percentage=0.0
        )

        @circuit_breaker
        async def process_video_generation():
            try:
                with MEDIA_METRICS["generation_duration"].labels(type="video").time():
                    # Generate video content
                    video_data = await runway_service.generate_video(
                        prompt=request.prompt,
                        style=request.style,
                        duration=request.duration_seconds,
                        parameters=request.parameters
                    )

                    # Upload to S3
                    s3_key = f"video/{video_gen.id}.mp4"
                    url = await s3_service.upload_file(
                        data=video_data,
                        key=s3_key,
                        content_type="video/mp4"
                    )

                    # Update database record
                    video_gen.status = "completed"
                    video_gen.video_url = url
                    video_gen.s3_key = s3_key
                    db.commit()

                    # Update cache
                    response.video_url = url
                    response.status = "completed"
                    response.completion_percentage = 100.0
                    video_cache[cache_key] = response

                    MEDIA_METRICS["video_generations"].labels(status="success").inc()

            except Exception as e:
                logger.error(f"Video generation failed: {str(e)}")
                video_gen.status = "failed"
                video_gen.processing_error = str(e)
                db.commit()
                MEDIA_METRICS["video_generations"].labels(status="failed").inc()
                raise

        # Schedule background task
        background_tasks.add_task(process_video_generation)
        
        return response

    except Exception as e:
        logger.error(f"Video generation request failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/status/{job_id}", response_model=MediaBaseSchema)
async def get_generation_status(
    job_id: UUID,
    db = Depends(get_db)
) -> MediaBaseSchema:
    """
    Get the current status of a media generation job.
    """
    try:
        # Check both voice and video generations
        media = db.query(VoiceGeneration).filter(VoiceGeneration.id == job_id).first()
        if not media:
            media = db.query(VideoGeneration).filter(VideoGeneration.id == job_id).first()
        
        if not media:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Media generation job not found"
            )

        return MediaBaseSchema(
            id=media.id,
            status=media.status,
            completion_percentage=getattr(media, "completion_percentage", 0.0),
            processing_error=media.processing_error
        )

    except Exception as e:
        logger.error(f"Error fetching generation status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.delete("/cancel/{job_id}")
async def cancel_generation(
    job_id: UUID,
    db = Depends(get_db)
) -> JSONResponse:
    """
    Cancel an in-progress media generation job.
    """
    try:
        # Check both voice and video generations
        media = db.query(VoiceGeneration).filter(VoiceGeneration.id == job_id).first()
        if not media:
            media = db.query(VideoGeneration).filter(VideoGeneration.id == job_id).first()
        
        if not media:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Media generation job not found"
            )

        if media.status not in ["pending", "processing"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel completed or failed generation"
            )

        media.status = "cancelled"
        db.commit()

        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"message": "Media generation cancelled successfully"}
        )

    except Exception as e:
        logger.error(f"Error cancelling generation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )