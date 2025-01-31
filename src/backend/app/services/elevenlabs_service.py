# Python 3.11+
import uuid
from typing import Dict, List, Optional
import httpx  # version 0.24+
from tenacity import retry, stop_after_attempt, wait_exponential  # version 8.2+

from app.core.config import settings
from app.core.logging import get_logger
from app.services.s3_service import S3Service
from app.schemas.media import VoiceGenerationRequest, VoiceGenerationResponse

# Initialize logger
logger = get_logger('elevenlabs_service')

# Service constants
ELEVEN_LABS_API_BASE = 'https://api.elevenlabs.io/v1'
DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
DEFAULT_STABILITY = 0.75
DEFAULT_SIMILARITY_BOOST = 0.75
VOICE_GENERATION_TIMEOUT = 10
MAX_RETRIES = 3
BACKOFF_MULTIPLIER = 1

def generate_voice_id(prefix: str) -> str:
    """
    Generates a unique identifier for voice files with proper prefix.
    
    Args:
        prefix: Prefix for the voice file identifier
        
    Returns:
        Unique voice file identifier formatted as prefix_uuid
    """
    sanitized_prefix = prefix.lower().replace(' ', '_')
    return f"{sanitized_prefix}_{str(uuid.uuid4())}"

class ElevenLabsService:
    """
    Service class for interacting with Eleven Labs API with enhanced resilience and monitoring.
    Handles voice synthesis requests, audio processing, and storage management.
    """

    def __init__(self) -> None:
        """Initialize Eleven Labs service with API key, S3 service, and caching."""
        # Initialize HTTP client with security headers and timeout
        self._client = httpx.AsyncClient(
            base_url=ELEVEN_LABS_API_BASE,
            timeout=VOICE_GENERATION_TIMEOUT,
            headers={
                'xi-api-key': settings.ELEVEN_LABS_API_KEY.get_secret_value(),
                'Content-Type': 'application/json'
            }
        )
        
        # Initialize S3 service for audio storage
        self._s3_service = S3Service()
        
        # Cache for voice and settings data
        self._voice_cache: Dict[str, Dict] = {}
        self._settings_cache: Dict[str, Dict] = {}
        
        logger.info("ElevenLabsService initialized successfully")

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=BACKOFF_MULTIPLIER, min=4, max=10)
    )
    async def generate_voice(self, request: VoiceGenerationRequest) -> VoiceGenerationResponse:
        """
        Generates voice content from text using Eleven Labs API with resilience.
        
        Args:
            request: Voice generation request with text and parameters
            
        Returns:
            Generated voice content response with audio URL
            
        Raises:
            IntegrationError: If voice generation fails
        """
        try:
            # Generate unique voice file ID
            voice_id = generate_voice_id('voice')
            
            # Prepare request payload with optimized settings
            payload = {
                'text': request.text,
                'voice_settings': {
                    'stability': request.stability or DEFAULT_STABILITY,
                    'similarity_boost': request.similarity_boost or DEFAULT_SIMILARITY_BOOST
                }
            }
            
            logger.debug(f"Generating voice for text: {request.text[:50]}...")
            
            # Call Eleven Labs API with retry mechanism
            async with self._client as client:
                response = await client.post(
                    f'/text-to-speech/{request.voice_id}',
                    json=payload
                )
                response.raise_for_status()
            
            # Upload audio content to S3 with metadata
            audio_data = response.content
            s3_key = f"voices/{voice_id}.mp3"
            
            metadata = {
                'voice_id': request.voice_id,
                'text_length': len(request.text),
                'stability': str(request.stability),
                'similarity_boost': str(request.similarity_boost)
            }
            
            audio_url = self._s3_service.upload_bytes(
                data=audio_data,
                key=s3_key,
                content_type='audio/mpeg',
                metadata=metadata
            )
            
            # Prepare success response
            response = VoiceGenerationResponse(
                id=uuid.uuid4(),
                filename=f"{voice_id}.mp3",
                mime_type='audio/mpeg',
                size_bytes=len(audio_data),
                s3_key=s3_key,
                audio_url=audio_url,
                status='completed',
                generation_settings=payload['voice_settings']
            )
            
            logger.info(f"Successfully generated voice: {voice_id}")
            return response
            
        except httpx.HTTPError as e:
            logger.error(f"Voice generation failed: {str(e)}")
            return VoiceGenerationResponse(
                id=uuid.uuid4(),
                filename=f"{voice_id}.mp3",
                mime_type='audio/mpeg',
                size_bytes=0,
                s3_key='',
                status='failed',
                processing_error=str(e)
            )

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=BACKOFF_MULTIPLIER, min=4, max=10)
    )
    async def get_available_voices(self) -> List[Dict]:
        """
        Retrieves list of available voices from Eleven Labs with caching.
        
        Returns:
            List of available voices and their properties
            
        Raises:
            IntegrationError: If voice retrieval fails
        """
        try:
            # Check cache first
            if self._voice_cache:
                logger.debug("Returning cached voice list")
                return list(self._voice_cache.values())
            
            # Fetch voices from API
            async with self._client as client:
                response = await client.get('/voices')
                response.raise_for_status()
                
            voices = response.json()['voices']
            
            # Update cache
            self._voice_cache = {voice['voice_id']: voice for voice in voices}
            
            logger.info(f"Retrieved {len(voices)} available voices")
            return voices
            
        except httpx.HTTPError as e:
            logger.error(f"Failed to retrieve voices: {str(e)}")
            raise

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=BACKOFF_MULTIPLIER, min=4, max=10)
    )
    async def get_voice_settings(self, voice_id: str) -> Dict:
        """
        Retrieves settings for a specific voice with caching.
        
        Args:
            voice_id: Eleven Labs voice identifier
            
        Returns:
            Voice settings including stability and similarity boost
            
        Raises:
            IntegrationError: If settings retrieval fails
        """
        try:
            # Check cache first
            if voice_id in self._settings_cache:
                logger.debug(f"Returning cached settings for voice: {voice_id}")
                return self._settings_cache[voice_id]
            
            # Fetch settings from API
            async with self._client as client:
                response = await client.get(f'/voices/{voice_id}/settings')
                response.raise_for_status()
                
            settings = response.json()
            
            # Update cache
            self._settings_cache[voice_id] = settings
            
            logger.info(f"Retrieved settings for voice: {voice_id}")
            return settings
            
        except httpx.HTTPError as e:
            logger.error(f"Failed to retrieve voice settings: {str(e)}")
            raise