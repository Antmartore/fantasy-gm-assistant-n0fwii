"""
Test package initialization module for Fantasy GM Assistant backend test suite.
Configures pytest settings, async support, and shared test configurations.

Version: 1.0.0
"""

# pytest v7.0+
import pytest
# pytest-asyncio v0.20+
import pytest_asyncio

from app.core.config import settings

# Base URL for test API endpoints
TEST_BASE_URL = f'http://test{settings.API_V1_STR}'

# Configure pytest plugins and shared fixtures
pytest_plugins = [
    'pytest_asyncio',  # Enable async test support
    'tests.fixtures.auth',  # Authentication fixtures
    'tests.fixtures.db',  # Database fixtures
]

# Configure pytest-asyncio for async test support
def pytest_configure(config):
    """
    Configure pytest settings for the test suite.
    
    Args:
        config: pytest config object
    """
    # Enable async test support
    config.addinivalue_line(
        "markers",
        "asyncio: mark test as async"
    )
    
    # Configure test isolation
    config.option.asyncio_mode = "auto"

def pytest_collection_modifyitems(items):
    """
    Modify test items to ensure proper async handling and test isolation.
    
    Args:
        items: List of collected test items
    """
    for item in items:
        # Add async marker to coroutine tests
        if inspect.iscoroutinefunction(item.function):
            item.add_marker(pytest.mark.asyncio)

@pytest.fixture(scope="session", autouse=True)
def configure_test_env():
    """
    Configure test environment settings for the entire test session.
    """
    # Override settings for test environment
    settings.DEBUG = True
    settings.ENABLE_TELEMETRY = False
    settings.LOG_LEVEL = "DEBUG"
    
    # Use test-specific Redis database
    settings.REDIS_URL = settings.REDIS_URL.replace("redis://", "redis://test_")
    
    # Use test AWS S3 bucket
    settings.AWS_S3_BUCKET = f"test-{settings.AWS_S3_BUCKET}"
    
    yield
    
    # Cleanup after all tests complete
    # Note: Specific cleanup handled by individual fixture modules

@pytest.fixture(autouse=True)
def disable_external_calls(monkeypatch):
    """
    Disable external API calls during testing to ensure isolation.
    """
    def mock_request(*args, **kwargs):
        raise RuntimeError(
            "External API calls are disabled during testing. "
            "Use appropriate test fixtures instead."
        )
    
    # Patch common HTTP clients
    monkeypatch.setattr("httpx.AsyncClient.request", mock_request)
    monkeypatch.setattr("aiohttp.ClientSession.request", mock_request)
    monkeypatch.setattr("requests.Session.request", mock_request)

@pytest.fixture
def test_app():
    """
    Provide test FastAPI application instance with test configuration.
    """
    from app.main import app
    app.dependency_overrides = {}  # Reset any existing overrides
    return app

@pytest.fixture
def test_client():
    """
    Provide test HTTP client for making test requests.
    """
    from httpx import AsyncClient
    return AsyncClient(base_url=TEST_BASE_URL, follow_redirects=True)