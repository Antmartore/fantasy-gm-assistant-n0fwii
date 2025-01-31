# Python 3.11+
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
import time
import httpx
from typing import Dict, Any

from app.services.elevenlabs_service import (
    ElevenLabsService,
    DEFAULT_VOICE_ID,
    DEFAULT_STABILITY,
    DEFAULT_SIMILARITY_BOOST,
    VOICE_GENERATION_TIMEOUT
)
from app.schemas.media import VoiceGenerationRequest, VoiceGenerationResponse
from app.core.exceptions import IntegrationError, RateLimitError

# Test constants
TEST_VOICE_TEXT = "This is a test voice generation request"
TEST_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"
MOCK_AUDIO_CONTENT = b'mock audio bytes'
PERFORMANCE_THRESHOLD = 2.0  # 2 seconds max for voice generation
RETRY_COUNT = 3
MOCK_RATE_LIMIT_RESPONSE = {
    'detail': 'Rate limit exceeded',
    'status_code': 429
}

@pytest.fixture
def mock_s3_service():
    """
    Fixture providing mocked S3 service with enhanced capabilities.
    """
    with patch('app.services.s3_service.S3Service') as mock:
        s3_service = AsyncMock()
        
        # Configure upload_bytes with metadata validation
        async def mock_upload_bytes(data: bytes, key: str, content_type: str, metadata: Dict[str, str]) -> str:
            assert data == MOCK_AUDIO_CONTENT
            assert content_type == 'audio/mpeg'
            assert all(k in metadata for k in ['voice_id', 'text_length', 'stability', 'similarity_boost'])
            return f"https://test-bucket.s3.amazonaws.com/{key}"
            
        s3_service.upload_bytes = mock_upload_bytes
        mock.return_value = s3_service
        yield s3_service

@pytest.fixture
def mock_httpx_client():
    """
    Fixture providing mocked HTTPX client with comprehensive response simulation.
    """
    with patch('httpx.AsyncClient') as mock:
        client = AsyncMock()
        
        # Configure successful response
        success_response = AsyncMock()
        success_response.content = MOCK_AUDIO_CONTENT
        success_response.raise_for_status = AsyncMock()
        
        # Configure rate limit response
        rate_limit_response = AsyncMock()
        rate_limit_response.raise_for_status.side_effect = httpx.HTTPError(MOCK_RATE_LIMIT_RESPONSE)
        
        client.post = AsyncMock(return_value=success_response)
        client.get = AsyncMock(return_value=success_response)
        
        # Add context manager simulation
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=None)
        
        mock.return_value = client
        yield client

@pytest.mark.asyncio
class TestElevenLabsService:
    """
    Comprehensive test suite for ElevenLabs voice generation service.
    """
    
    @pytest.mark.asyncio
    async def test_generate_voice_success(self, mock_s3_service, mock_httpx_client):
        """Tests successful voice generation with performance validation."""
        service = ElevenLabsService()
        
        # Create test request
        request = VoiceGenerationRequest(
            text=TEST_VOICE_TEXT,
            voice_id=TEST_VOICE_ID,
            stability=DEFAULT_STABILITY,
            similarity_boost=DEFAULT_SIMILARITY_BOOST
        )
        
        # Measure performance
        start_time = time.time()
        response = await service.generate_voice(request)
        generation_time = time.time() - start_time
        
        # Verify response structure
        assert isinstance(response, VoiceGenerationResponse)
        assert response.status == 'completed'
        assert response.mime_type == 'audio/mpeg'
        assert response.audio_url is not None
        assert response.size_bytes == len(MOCK_AUDIO_CONTENT)
        
        # Verify S3 upload
        mock_s3_service.upload_bytes.assert_called_once()
        
        # Verify performance
        assert generation_time < PERFORMANCE_THRESHOLD
        
        # Verify API call
        mock_httpx_client.post.assert_called_once_with(
            f'/text-to-speech/{TEST_VOICE_ID}',
            json={
                'text': TEST_VOICE_TEXT,
                'voice_settings': {
                    'stability': DEFAULT_STABILITY,
                    'similarity_boost': DEFAULT_SIMILARITY_BOOST
                }
            }
        )

    @pytest.mark.asyncio
    async def test_generate_voice_with_retries(self, mock_httpx_client):
        """Tests voice generation with retry mechanism on temporary failures."""
        service = ElevenLabsService()
        
        # Configure client to fail twice then succeed
        fail_response = AsyncMock()
        fail_response.raise_for_status.side_effect = httpx.HTTPError("Temporary error")
        
        success_response = AsyncMock()
        success_response.content = MOCK_AUDIO_CONTENT
        success_response.raise_for_status = AsyncMock()
        
        mock_httpx_client.post.side_effect = [
            fail_response,
            fail_response,
            success_response
        ]
        
        request = VoiceGenerationRequest(
            text=TEST_VOICE_TEXT,
            voice_id=TEST_VOICE_ID
        )
        
        response = await service.generate_voice(request)
        
        # Verify retries and final success
        assert mock_httpx_client.post.call_count == 3
        assert response.status == 'completed'
        assert response.processing_error is None

    @pytest.mark.asyncio
    async def test_rate_limit_handling(self, mock_httpx_client):
        """Tests proper handling of API rate limits."""
        service = ElevenLabsService()
        
        # Configure rate limit response
        rate_limit_response = AsyncMock()
        rate_limit_response.raise_for_status.side_effect = httpx.HTTPError(
            "Rate limit exceeded",
            response=AsyncMock(status_code=429)
        )
        mock_httpx_client.post.return_value = rate_limit_response
        
        request = VoiceGenerationRequest(
            text=TEST_VOICE_TEXT,
            voice_id=TEST_VOICE_ID
        )
        
        # Verify rate limit handling
        with pytest.raises(httpx.HTTPError) as exc_info:
            await service.generate_voice(request)
        
        assert "429" in str(exc_info.value)
        assert mock_httpx_client.post.call_count == RETRY_COUNT

    @pytest.mark.asyncio
    async def test_get_available_voices(self, mock_httpx_client):
        """Tests retrieval of available voices with caching."""
        service = ElevenLabsService()
        
        mock_voices = {
            'voices': [
                {'voice_id': TEST_VOICE_ID, 'name': 'Test Voice'}
            ]
        }
        
        response = AsyncMock()
        response.json.return_value = mock_voices
        response.raise_for_status = AsyncMock()
        mock_httpx_client.get.return_value = response
        
        # First call - should hit API
        voices = await service.get_available_voices()
        assert len(voices) == 1
        assert voices[0]['voice_id'] == TEST_VOICE_ID
        
        # Second call - should use cache
        voices = await service.get_available_voices()
        assert len(voices) == 1
        assert mock_httpx_client.get.call_count == 1

    @pytest.mark.asyncio
    async def test_get_voice_settings(self, mock_httpx_client):
        """Tests retrieval of voice settings with validation."""
        service = ElevenLabsService()
        
        mock_settings = {
            'stability': DEFAULT_STABILITY,
            'similarity_boost': DEFAULT_SIMILARITY_BOOST
        }
        
        response = AsyncMock()
        response.json.return_value = mock_settings
        response.raise_for_status = AsyncMock()
        mock_httpx_client.get.return_value = response
        
        settings = await service.get_voice_settings(TEST_VOICE_ID)
        
        assert settings == mock_settings
        mock_httpx_client.get.assert_called_once_with(
            f'/voices/{TEST_VOICE_ID}/settings'
        )