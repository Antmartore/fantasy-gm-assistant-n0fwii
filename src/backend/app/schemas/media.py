# Python 3.11+
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from uuid import UUID
from pydantic import BaseModel, Field  # pydantic v2.0+

# Global constants for media validation and security
MEDIA_STATUS_CHOICES = ['pending', 'processing', 'completed', 'failed', 'expired', 'deleted']
SUPPORTED_VIDEO_FORMATS = ['.mp4', '.mov', '.avi']
SUPPORTED_AUDIO_FORMATS = ['.mp3', '.wav', '.m4a']
MAX_FILE_SIZE_BYTES = 1073741824  # 1GB
MAX_MEDIA_DURATION_SECONDS = 300  # 5 minutes
URL_EXPIRATION_HOURS = 24

class MediaBaseSchema(BaseModel):
    """Enhanced base Pydantic schema for media entities with security and monitoring."""
    id: UUID = Field(..., description="Unique identifier for media entity")
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., description="Media file MIME type")
    size_bytes: int = Field(..., gt=0, le=MAX_FILE_SIZE_BYTES)
    s3_key: str = Field(..., description="S3 storage key")
    url: Optional[str] = Field(None, description="Secure access URL")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime = Field(
        default_factory=lambda: datetime.utcnow() + timedelta(hours=URL_EXPIRATION_HOURS)
    )
    last_accessed: Optional[datetime] = None
    is_deleted: bool = Field(default=False)
    processing_error: Optional[str] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }

class VoiceGenerationRequest(BaseModel):
    """Enhanced schema for voice generation request with validation."""
    text: str = Field(..., min_length=1, max_length=5000)
    voice_id: str = Field(..., description="Eleven Labs voice identifier")
    stability: float = Field(default=0.5, ge=0.0, le=1.0)
    similarity_boost: float = Field(default=0.5, ge=0.0, le=1.0)
    format: str = Field(
        default=".mp3",
        description="Audio format",
        regex=f"({'|'.join(SUPPORTED_AUDIO_FORMATS)})"
    )
    generation_settings: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional voice generation parameters"
    )

class VoiceGenerationResponse(MediaBaseSchema):
    """Enhanced schema for voice generation response with monitoring."""
    audio_url: Optional[str] = Field(None, description="Secure audio access URL")
    status: str = Field(..., regex=f"({'|'.join(MEDIA_STATUS_CHOICES)})")
    duration_seconds: Optional[int] = Field(None, le=MAX_MEDIA_DURATION_SECONDS)
    completion_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    generation_settings: Dict[str, Any] = Field(default_factory=dict)
    processing_error: Optional[str] = None

class VideoGenerationRequest(BaseModel):
    """Enhanced schema for video generation request with validation."""
    prompt: str = Field(..., min_length=10, max_length=1000)
    duration_seconds: int = Field(..., gt=0, le=MAX_MEDIA_DURATION_SECONDS)
    style: str = Field(..., description="RunwayML video style identifier")
    parameters: Dict[str, Any] = Field(
        default_factory=lambda: {
            "resolution": "1080p",
            "fps": 30,
            "quality": "high"
        }
    )
    format: str = Field(
        default=".mp4",
        description="Video format",
        regex=f"({'|'.join(SUPPORTED_VIDEO_FORMATS)})"
    )
    trade_id: Optional[UUID] = Field(None, description="Associated trade analysis ID")
    generation_settings: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional video generation parameters"
    )

class VideoGenerationResponse(MediaBaseSchema):
    """Enhanced schema for video generation response with monitoring."""
    video_url: Optional[str] = Field(None, description="Secure video access URL")
    status: str = Field(..., regex=f"({'|'.join(MEDIA_STATUS_CHOICES)})")
    duration_seconds: int = Field(..., le=MAX_MEDIA_DURATION_SECONDS)
    style: str = Field(..., description="Applied video style")
    completion_percentage: float = Field(default=0.0, ge=0.0, le=100.0)
    generation_settings: Dict[str, Any] = Field(default_factory=dict)
    processing_error: Optional[str] = None