# Python 3.11+
from datetime import datetime, timedelta
import uuid
from typing import Optional, Dict, Any

from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.orm import declarative_base, validates
from sqlalchemy.dialects.postgresql import UUID

# SQLAlchemy v2.0+
Base = declarative_base()

# Global constants for media validation and processing
MEDIA_STATUS_CHOICES = ['pending', 'processing', 'completed', 'failed', 'expired']
SUPPORTED_VIDEO_FORMATS = ['.mp4', '.mov', '.avi', '.webm']
SUPPORTED_AUDIO_FORMATS = ['.mp3', '.wav', '.m4a', '.ogg']
MAX_VIDEO_DURATION_SECONDS = 300  # 5 minutes
MAX_AUDIO_DURATION_SECONDS = 180  # 3 minutes

class MediaBase(Base):
    """
    Enhanced abstract base model for all media entities with secure URL generation 
    and lifecycle management.
    """
    __abstract__ = True

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    s3_key = Column(String, nullable=False, unique=True)
    url = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    status = Column(String, nullable=False, default='pending')
    is_deleted = Column(Boolean, default=False, nullable=False)
    last_accessed = Column(DateTime, default=datetime.utcnow, nullable=False)

    @validates('mime_type')
    def validate_mime_type(self, key: str, value: str) -> str:
        """Validates mime type against supported formats."""
        if any(value.endswith(fmt) for fmt in SUPPORTED_VIDEO_FORMATS + SUPPORTED_AUDIO_FORMATS):
            return value
        raise ValueError(f"Unsupported mime type: {value}")

    @validates('size_bytes')
    def validate_size(self, key: str, value: int) -> int:
        """Validates file size against configured maximum."""
        if value <= 0 or value > MAX_FILE_SIZE_BYTES:
            raise ValueError(f"Invalid file size: {value} bytes")
        return value

    @validates('status')
    def validate_status(self, key: str, value: str) -> str:
        """Validates media status against allowed choices."""
        if value not in MEDIA_STATUS_CHOICES:
            raise ValueError(f"Invalid status: {value}")
        return value

    def generate_secure_url(self, expiration_minutes: int = 30) -> Optional[str]:
        """
        Generates secure, time-limited URL for media access.
        
        Args:
            expiration_minutes: URL validity duration in minutes
            
        Returns:
            Optional[str]: Secure URL with expiration or None if invalid/expired
        """
        if self.status != 'completed' or self.is_deleted:
            return None
            
        if self.expires_at and datetime.utcnow() > self.expires_at:
            self.status = 'expired'
            return None

        # Update last accessed timestamp
        self.last_accessed = datetime.utcnow()
        
        # Generate signed S3 URL with expiration
        return f"https://{self.s3_key}?expires={expiration_minutes}"

class VoiceGeneration(MediaBase):
    """Enhanced model for voice synthesis content with validation and processing status."""
    __tablename__ = 'voice_generations'

    text = Column(String, nullable=False)
    voice_id = Column(String, nullable=False)
    stability = Column(Float, nullable=False)
    similarity_boost = Column(Float, nullable=False)
    duration_seconds = Column(Integer)
    audio_url = Column(String)
    voice_settings = Column(JSON, default={})
    processing_error = Column(String)

    @validates('stability', 'similarity_boost')
    def validate_voice_parameters(self, key: str, value: float) -> float:
        """Validates voice generation parameters are within allowed ranges."""
        if not 0.0 <= value <= 1.0:
            raise ValueError(f"Invalid {key}: {value}. Must be between 0.0 and 1.0")
        return value

    @validates('duration_seconds')
    def validate_duration(self, key: str, value: int) -> int:
        """Validates audio duration against maximum allowed length."""
        if value > MAX_AUDIO_DURATION_SECONDS:
            raise ValueError(f"Audio duration exceeds maximum allowed: {value}s > {MAX_AUDIO_DURATION_SECONDS}s")
        return value

class VideoGeneration(MediaBase):
    """Enhanced model for video content with trade analysis integration."""
    __tablename__ = 'video_generations'

    prompt = Column(String, nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    style = Column(String, nullable=False)
    parameters = Column(JSON, default={})
    video_url = Column(String)
    trade_id = Column(UUID(as_uuid=True), ForeignKey('trades.id'), nullable=True)
    generation_settings = Column(JSON, default={})
    processing_error = Column(String)
    completion_percentage = Column(Float, default=0.0)

    @validates('duration_seconds')
    def validate_duration(self, key: str, value: int) -> int:
        """Validates video duration against maximum allowed length."""
        if value > MAX_VIDEO_DURATION_SECONDS:
            raise ValueError(f"Video duration exceeds maximum allowed: {value}s > {MAX_VIDEO_DURATION_SECONDS}s")
        return value

    @validates('completion_percentage')
    def validate_completion(self, key: str, value: float) -> float:
        """Validates completion percentage is within valid range."""
        if not 0.0 <= value <= 100.0:
            raise ValueError(f"Invalid completion percentage: {value}")
        return value

    @validates('parameters')
    def validate_parameters(self, key: str, value: Dict[str, Any]) -> Dict[str, Any]:
        """Validates video generation parameters structure."""
        required_keys = {'resolution', 'fps', 'quality'}
        if not all(k in value for k in required_keys):
            raise ValueError(f"Missing required parameters: {required_keys - value.keys()}")
        return value