# Python 3.11+
import asyncio
import pytest
import pytest_asyncio
import fakeredis.aioredis
from typing import AsyncGenerator, Dict, Any
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch

from app.core.config import settings, API_V1_STR, TEST_DATABASE_URL
from app.core.security import create_access_token
from app.services.firebase_service import FirebaseService

# Test constants
TEST_USER_EMAIL = 'test@example.com'
TEST_USER_PASSWORD = 'testpassword123'
TEST_USER_ROLES = ['user', 'premium']
TEST_DATABASE_NAME = 'test_fantasy_gm'

@pytest.fixture(scope="session")
def event_loop():
    """
    Creates an event loop for async tests with proper cleanup.
    """
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest_asyncio.fixture(scope="function")
async def test_redis():
    """
    Creates an isolated Redis instance for testing with TTL support.
    
    Returns:
        FakeRedis instance configured for testing
    """
    redis = fakeredis.aioredis.FakeRedis(
        decode_responses=True,
        protocol_version=3
    )
    await redis.flushall()
    yield redis
    await redis.close()

@pytest_asyncio.fixture(scope="function")
async def test_firebase():
    """
    Creates a mocked Firebase service for testing with comprehensive response simulation.
    
    Returns:
        Mocked FirebaseService instance
    """
    mock_firebase = AsyncMock(spec=FirebaseService)
    
    # Configure mock responses
    mock_firebase.verify_token.return_value = {
        "uid": "test_user_id",
        "email": TEST_USER_EMAIL,
        "roles": TEST_USER_ROLES
    }
    
    mock_firebase.get_document.return_value = {
        "id": "test_doc_id",
        "data": "test_data",
        "created_at": "2024-01-01T00:00:00Z"
    }
    
    mock_firebase.set_document = AsyncMock()
    
    yield mock_firebase

@pytest_asyncio.fixture(scope="function")
async def test_db():
    """
    Creates an isolated test database session with transaction rollback.
    
    Returns:
        AsyncGenerator yielding database session
    """
    from app.db.session import get_db, engine
    
    # Create test database tables
    async with engine.begin() as conn:
        await conn.run_sync(lambda ctx: ctx.create_all())
    
    # Get database session
    async with get_db() as db:
        try:
            yield db
        finally:
            # Rollback any changes
            await db.rollback()
            
    # Drop test database tables
    async with engine.begin() as conn:
        await conn.run_sync(lambda ctx: ctx.drop_all())

@pytest.fixture(scope="function")
def test_token(request):
    """
    Generates test JWT tokens with configurable roles and expiry.
    
    Args:
        request: Pytest request object for parameterization
        
    Returns:
        str: Valid JWT token
    """
    role = getattr(request, "param", "user")
    token_data = {
        "sub": "test_user_id",
        "email": TEST_USER_EMAIL,
        "roles": [role] if isinstance(role, str) else role
    }
    return create_access_token(
        data=token_data,
        expires_delta=None
    )

@pytest_asyncio.fixture(scope="function")
async def test_client(test_db, test_redis, test_firebase):
    """
    Creates a configured test API client with authentication support.
    
    Args:
        test_db: Database session fixture
        test_redis: Redis instance fixture
        test_firebase: Firebase service fixture
        
    Returns:
        AsyncClient: Configured test HTTP client
    """
    from app.main import app
    from app.api.deps import get_db, get_redis, get_firebase
    
    # Override dependencies
    app.dependency_overrides[get_db] = lambda: test_db
    app.dependency_overrides[get_redis] = lambda: test_redis
    app.dependency_overrides[get_firebase] = lambda: test_firebase
    
    async with AsyncClient(
        app=app,
        base_url=f"http://test{API_V1_STR}",
        headers={"Content-Type": "application/json"}
    ) as client:
        yield client
        
    # Clear dependency overrides
    app.dependency_overrides.clear()

@pytest.fixture(scope="function")
def mock_sportradar():
    """
    Mocks Sportradar API responses for sports data testing.
    
    Returns:
        AsyncMock: Configured mock for Sportradar API
    """
    with patch("app.services.sportradar_service.SportradarAPI") as mock:
        mock_api = AsyncMock()
        mock_api.get_live_stats.return_value = {
            "game_id": "test_game",
            "stats": {"home_score": 10, "away_score": 7}
        }
        mock.return_value = mock_api
        yield mock_api

@pytest.fixture(scope="function")
def mock_gpt4():
    """
    Mocks GPT-4 API responses for AI analysis testing.
    
    Returns:
        AsyncMock: Configured mock for GPT-4 API
    """
    with patch("app.services.ai_service.GPT4Service") as mock:
        mock_ai = AsyncMock()
        mock_ai.analyze_trade.return_value = {
            "recommendation": "accept",
            "confidence": 0.85,
            "analysis": "Favorable trade based on player performance"
        }
        mock.return_value = mock_ai
        yield mock_ai

@pytest.fixture(scope="function")
def mock_video_gen():
    """
    Mocks video generation service responses.
    
    Returns:
        AsyncMock: Configured mock for video generation
    """
    with patch("app.services.media_service.VideoGenerator") as mock:
        mock_gen = AsyncMock()
        mock_gen.create_highlight_video.return_value = {
            "video_url": "https://test-bucket.s3.amazonaws.com/test-video.mp4",
            "duration": 30
        }
        mock.return_value = mock_gen
        yield mock_gen

@pytest.fixture(autouse=True)
def mock_settings():
    """
    Configures test settings with secure defaults.
    """
    settings.DEBUG = True
    settings.TESTING = True
    settings.DATABASE_URL = TEST_DATABASE_URL
    settings.REDIS_URL = "redis://localhost:6379/1"
    settings.AWS_S3_BUCKET = "test-fantasy-gm-bucket"
    settings.RATE_LIMIT_TEAMS = 1000  # Higher limits for testing
    settings.RATE_LIMIT_PLAYERS = 2000
    settings.RATE_LIMIT_TRADES = 500