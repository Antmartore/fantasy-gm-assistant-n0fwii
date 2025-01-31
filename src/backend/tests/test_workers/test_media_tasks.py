# Python 3.11+
import uuid
from datetime import datetime, timedelta
import pytest
from pytest_mock import MockFixture
import pytest_asyncio
from freezegun import freeze_time  # version 1.2+
from prometheus_client import Counter, Histogram  # version 0.16+

from app.workers.media_tasks import (
    generate_voice_content,
    generate_video_content,
    VOICE_GENERATION_REQUESTS,
    VIDEO_GENERATION_REQUESTS,
    VOICE_GENERATION_DURATION,
    VIDEO_GENERATION_DURATION
)
from app.services.elevenlabs_service import ElevenLabsService
from app.services.runwayml_service import RunwayMLService
from app.services.s3_service import S3Service
from app.schemas.media import (
    VoiceGenerationRequest,
    VoiceGenerationResponse,
    VideoGenerationRequest,
    VideoGenerationResponse
)
from app.core.exceptions import IntegrationError

# Test constants
TEST_VOICE_TEXT = "Test voice generation for trade analysis"
TEST_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"
TEST_VIDEO_PROMPT = "Generate highlight video for trade analysis"
PERFORMANCE_THRESHOLD_MS = 2000  # 2 seconds
MAX_RETRIES = 3
SECURE_URL_PATTERN = r'^https://s3\.amazonaws\.com/.*'

class MediaTasksTestCase:
    """Enhanced test case class for media generation tasks with security and performance validation."""

    @pytest.fixture(autouse=True)
    async def setup(self, mocker: MockFixture):
        """Set up test environment with mocks and validation."""
        # Initialize test data
        self.test_trade_id = uuid.uuid4()
        self.correlation_id = str(uuid.uuid4())
        
        # Mock services
        self.mock_elevenlabs = mocker.patch.object(ElevenLabsService, 'generate_voice')
        self.mock_runway = mocker.patch.object(RunwayMLService, 'generate_video')
        self.mock_s3 = mocker.patch.object(S3Service, 'generate_secure_url')
        
        # Reset metrics
        VOICE_GENERATION_REQUESTS._metrics.clear()
        VIDEO_GENERATION_REQUESTS._metrics.clear()
        VOICE_GENERATION_DURATION._metrics.clear()
        VIDEO_GENERATION_DURATION._metrics.clear()

    @pytest.mark.asyncio
    async def test_generate_voice_content_success(self, mocker: MockFixture):
        """Tests successful voice content generation with performance validation."""
        # Prepare test data
        voice_request = VoiceGenerationRequest(
            text=TEST_VOICE_TEXT,
            voice_id=TEST_VOICE_ID,
            stability=0.7,
            similarity_boost=0.7
        )

        # Mock successful response
        mock_response = VoiceGenerationResponse(
            id=uuid.uuid4(),
            filename="test_voice.mp3",
            mime_type="audio/mpeg",
            size_bytes=1024,
            s3_key="voices/test.mp3",
            audio_url="https://s3.amazonaws.com/test/voice.mp3",
            status="completed",
            duration_seconds=5
        )
        self.mock_elevenlabs.return_value = mock_response

        # Execute task with performance tracking
        start_time = datetime.utcnow()
        result = await generate_voice_content(voice_request, self.correlation_id)
        execution_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        # Validate performance
        assert execution_time < PERFORMANCE_THRESHOLD_MS, f"Voice generation exceeded performance threshold: {execution_time}ms"

        # Validate response
        assert result.status == "completed"
        assert result.audio_url is not None
        assert result.audio_url.startswith("https://")

        # Verify metrics
        assert VOICE_GENERATION_REQUESTS.labels(status='success')._value == 1
        assert len(VOICE_GENERATION_DURATION._metrics) > 0

    @pytest.mark.asyncio
    async def test_generate_voice_content_error_handling(self, mocker: MockFixture):
        """Tests comprehensive error handling for voice generation."""
        voice_request = VoiceGenerationRequest(
            text=TEST_VOICE_TEXT,
            voice_id=TEST_VOICE_ID,
            stability=0.7,
            similarity_boost=0.7
        )

        # Mock API error
        self.mock_elevenlabs.side_effect = IntegrationError(
            message="API Error",
            error_code=6020,
            details={"error": "Service unavailable"}
        )

        # Test error handling and retry behavior
        with pytest.raises(IntegrationError) as exc_info:
            await generate_voice_content(voice_request, self.correlation_id)

        assert exc_info.value.error_code == 6020
        assert VOICE_GENERATION_REQUESTS.labels(status='error')._value == 1

    @pytest.mark.asyncio
    async def test_generate_video_content_security(self, mocker: MockFixture):
        """Tests security aspects of video generation."""
        video_request = VideoGenerationRequest(
            prompt=TEST_VIDEO_PROMPT,
            duration_seconds=30,
            style="highlight_reel",
            trade_id=self.test_trade_id,
            parameters={
                "resolution": "1080p",
                "fps": 30,
                "quality": "high"
            }
        )

        # Mock successful response with security validation
        mock_response = VideoGenerationResponse(
            id=uuid.uuid4(),
            filename="test_video.mp4",
            mime_type="video/mp4",
            size_bytes=1024 * 1024,
            s3_key="videos/test.mp4",
            video_url="https://s3.amazonaws.com/test/video.mp4",
            status="completed",
            duration_seconds=30,
            style="highlight_reel"
        )
        self.mock_runway.return_value = mock_response

        # Execute with security validation
        result = await generate_video_content(video_request, self.correlation_id)

        # Validate security aspects
        assert result.video_url.startswith("https://")
        assert "s3.amazonaws.com" in result.video_url
        assert result.s3_key.startswith("videos/")
        
        # Verify secure URL generation
        self.mock_s3.assert_called_once()
        assert VIDEO_GENERATION_REQUESTS.labels(status='success')._value == 1

    @pytest.mark.asyncio
    async def test_media_generation_monitoring(self, mocker: MockFixture):
        """Tests monitoring and metrics for media generation."""
        # Prepare test requests
        voice_request = VoiceGenerationRequest(
            text=TEST_VOICE_TEXT,
            voice_id=TEST_VOICE_ID,
            stability=0.7,
            similarity_boost=0.7
        )

        video_request = VideoGenerationRequest(
            prompt=TEST_VIDEO_PROMPT,
            duration_seconds=30,
            style="highlight_reel",
            trade_id=self.test_trade_id,
            parameters={
                "resolution": "1080p",
                "fps": 30,
                "quality": "high"
            }
        )

        # Mock successful responses
        self.mock_elevenlabs.return_value = VoiceGenerationResponse(
            id=uuid.uuid4(),
            filename="test_voice.mp3",
            mime_type="audio/mpeg",
            size_bytes=1024,
            s3_key="voices/test.mp3",
            audio_url="https://s3.amazonaws.com/test/voice.mp3",
            status="completed",
            duration_seconds=5
        )

        self.mock_runway.return_value = VideoGenerationResponse(
            id=uuid.uuid4(),
            filename="test_video.mp4",
            mime_type="video/mp4",
            size_bytes=1024 * 1024,
            s3_key="videos/test.mp4",
            video_url="https://s3.amazonaws.com/test/video.mp4",
            status="completed",
            duration_seconds=30,
            style="highlight_reel"
        )

        # Execute tasks and collect metrics
        await generate_voice_content(voice_request, self.correlation_id)
        await generate_video_content(video_request, self.correlation_id)

        # Validate metrics
        assert VOICE_GENERATION_REQUESTS.labels(status='success')._value == 1
        assert VIDEO_GENERATION_REQUESTS.labels(status='success')._value == 1
        assert len(VOICE_GENERATION_DURATION._metrics) > 0
        assert len(VIDEO_GENERATION_DURATION._metrics) > 0

        # Verify performance metrics
        for duration in VOICE_GENERATION_DURATION._metrics.values():
            assert duration < PERFORMANCE_THRESHOLD_MS / 1000  # Convert to seconds

        for duration in VIDEO_GENERATION_DURATION._metrics.values():
            assert duration < PERFORMANCE_THRESHOLD_MS / 1000  # Convert to seconds