# Python 3.11+
import pytest
import time
from unittest.mock import AsyncMock, patch
from uuid import UUID
import json

from app.services.runwayml_service import RunwayMLService
from app.schemas.media import VideoGenerationRequest
from app.core.exceptions import IntegrationError
from app.core.security import verify_token

# Test constants
TEST_VIDEO_PROMPT = "Generate highlight video for trade analysis between Tom Brady and Patrick Mahomes with dynamic transitions"
TEST_JOB_ID = "test-job-123"
TEST_VIDEO_URL = "https://storage.runwayml.com/v1/videos/test-video.mp4"
PERFORMANCE_THRESHOLD_MS = 2000  # 2 seconds max response time
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2

@pytest.fixture
async def mock_runwayml_service():
    """
    Pytest fixture providing mocked RunwayML service with security context.
    """
    with patch('app.services.runwayml_service.RunwayMLService') as mock_service:
        service = AsyncMock(spec=RunwayMLService)
        
        # Configure base mock responses
        service.generate_video.return_value = {
            'job_id': TEST_JOB_ID,
            'status': 'completed',
            'video_url': TEST_VIDEO_URL
        }
        
        service.check_generation_status.return_value = {
            'status': 'completed',
            'progress': 100.0
        }
        
        # Add security context
        service.security_context = {
            'api_key': 'test_key',
            'allowed_domains': ['storage.runwayml.com'],
            'max_file_size': 1024 * 1024 * 100  # 100MB
        }
        
        yield service

@pytest.mark.asyncio
async def test_generate_video_success(mock_runwayml_service):
    """
    Tests successful video generation flow with security validation and performance monitoring.
    """
    # Setup test request
    request = VideoGenerationRequest(
        prompt=TEST_VIDEO_PROMPT,
        duration_seconds=30,
        style="cinematic",
        trade_id=UUID('123e4567-e89b-12d3-a456-426614174000'),
        generation_settings={
            "resolution": "1080p",
            "fps": 30,
            "quality": "high"
        }
    )

    # Start performance timer
    start_time = time.time()

    # Execute video generation
    response = await mock_runwayml_service.generate_video(request)

    # Validate performance
    execution_time = (time.time() - start_time) * 1000
    assert execution_time < PERFORMANCE_THRESHOLD_MS, f"Video generation took too long: {execution_time}ms"

    # Verify response structure
    assert response['job_id'] == TEST_JOB_ID
    assert response['status'] == 'completed'
    assert response['video_url'].startswith('https://storage.runwayml.com')

    # Validate URL security
    assert response['video_url'] in mock_runwayml_service.security_context['allowed_domains']
    assert len(response['video_url']) < 2048  # URL length check

@pytest.mark.asyncio
async def test_generate_video_failure(mock_runwayml_service):
    """
    Tests video generation failure handling with security context preservation.
    """
    # Configure mock to simulate failure
    mock_runwayml_service.generate_video.side_effect = IntegrationError(
        message="Video generation failed",
        error_code=6013,
        details={'error': 'API timeout'}
    )

    request = VideoGenerationRequest(
        prompt=TEST_VIDEO_PROMPT,
        duration_seconds=30,
        style="cinematic",
        trade_id=UUID('123e4567-e89b-12d3-a456-426614174000')
    )

    # Verify error handling
    with pytest.raises(IntegrationError) as exc_info:
        await mock_runwayml_service.generate_video(request)

    assert exc_info.value.error_code == 6013
    assert 'API timeout' in str(exc_info.value.details)
    assert exc_info.value.correlation_id is not None

@pytest.mark.asyncio
async def test_check_generation_status(mock_runwayml_service):
    """
    Tests video generation status checking with performance monitoring.
    """
    start_time = time.time()

    # Configure progressive status updates
    mock_runwayml_service.check_generation_status.side_effect = [
        {'status': 'processing', 'progress': 25.0},
        {'status': 'processing', 'progress': 50.0},
        {'status': 'processing', 'progress': 75.0},
        {'status': 'completed', 'progress': 100.0}
    ]

    # Check status multiple times
    for expected_progress in [25.0, 50.0, 75.0, 100.0]:
        status = await mock_runwayml_service.check_generation_status(TEST_JOB_ID)
        assert status['progress'] == expected_progress

        # Verify performance
        current_time = time.time()
        assert (current_time - start_time) * 1000 < PERFORMANCE_THRESHOLD_MS

@pytest.mark.asyncio
async def test_retry_mechanism(mock_runwayml_service):
    """
    Tests retry mechanism for API failures with exponential backoff.
    """
    # Configure mock to fail twice then succeed
    mock_runwayml_service.generate_video.side_effect = [
        IntegrationError(message="API timeout", error_code=6013),
        IntegrationError(message="API timeout", error_code=6013),
        {
            'job_id': TEST_JOB_ID,
            'status': 'completed',
            'video_url': TEST_VIDEO_URL
        }
    ]

    request = VideoGenerationRequest(
        prompt=TEST_VIDEO_PROMPT,
        duration_seconds=30,
        style="cinematic",
        trade_id=UUID('123e4567-e89b-12d3-a456-426614174000')
    )

    start_time = time.time()
    response = await mock_runwayml_service.generate_video(request)

    # Verify retry behavior
    assert mock_runwayml_service.generate_video.call_count == 3
    assert response['status'] == 'completed'

    # Validate backoff timing
    execution_time = time.time() - start_time
    min_expected_time = sum(RETRY_BACKOFF_BASE ** i for i in range(2))
    assert execution_time >= min_expected_time

@pytest.mark.asyncio
async def test_url_security_validation(mock_runwayml_service):
    """
    Tests security validation of generated video URLs.
    """
    # Test URL validation
    test_urls = [
        "https://storage.runwayml.com/valid/path/video.mp4",  # Valid
        "http://storage.runwayml.com/insecure/video.mp4",     # Invalid - not HTTPS
        "https://malicious-site.com/video.mp4",               # Invalid - wrong domain
        "https://storage.runwayml.com/path/../../../video.mp4"  # Invalid - path traversal
    ]

    for url in test_urls:
        is_valid = url.startswith('https://') and \
                  any(domain in url for domain in mock_runwayml_service.security_context['allowed_domains']) and \
                  '../' not in url

        if is_valid:
            assert mock_runwayml_service.validate_video_url(url)
        else:
            with pytest.raises(IntegrationError):
                mock_runwayml_service.validate_video_url(url)

    # Test URL expiration
    url_with_token = f"{TEST_VIDEO_URL}?token=test_token&expires=3600"
    token_data = verify_token(url_with_token.split('token=')[1].split('&')[0])
    assert 'exp' in token_data
    assert token_data['exp'] > time.time()