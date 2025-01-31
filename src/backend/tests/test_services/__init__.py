# Python 3.11+
import os
import asyncio
import pytest
import pytest_asyncio
from typing import Dict, Any, Optional, AsyncGenerator
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
import json
import aiohttp
from functools import wraps

# Internal imports
from app.core.config import settings
from app.core.logging import get_logger
from app.core.exceptions import (
    AuthenticationError,
    IntegrationError,
    ValidationError,
    RateLimitError
)

# Initialize logger
logger = get_logger(__name__)

# Test configuration constants
TEST_TIMEOUT = 30  # Maximum test execution time in seconds
TEST_CACHE_TTL = 300  # Cache TTL for test data in seconds
MAX_PARALLEL_TESTS = 4  # Maximum number of parallel test executions
MOCK_DATA_PATH = "tests/mock_data"  # Path to mock data files

# Mock data for external services
MOCK_SPORT_DATA = {
    "NFL": {"source": "ESPN", "update_frequency": "5m"},
    "NBA": {"source": "Sleeper", "update_frequency": "1m"},
    "MLB": {"source": "Sportradar", "update_frequency": "1m"}
}

async def setup_test_environment(env_type: str, config: Dict[str, Any]) -> None:
    """
    Configures test environment with proper isolation and resource management.
    
    Args:
        env_type: Type of test environment (unit/integration)
        config: Environment configuration parameters
        
    Raises:
        ValueError: If invalid environment type provided
    """
    try:
        # Set environment variables
        os.environ["TESTING"] = "1"
        os.environ["TEST_ENV"] = env_type
        
        # Configure test timeouts
        if env_type == "unit":
            pytest.timeout = TEST_TIMEOUT
        else:
            pytest.timeout = TEST_TIMEOUT * 2
            
        # Initialize mock data directory
        os.makedirs(MOCK_DATA_PATH, exist_ok=True)
        
        # Configure async test settings
        asyncio.get_event_loop_policy().new_event_loop()
        
        # Set test-specific settings
        settings.TESTING = True
        settings.DEBUG = True
        
        logger.info(
            f"Test environment setup complete",
            extra={
                "env_type": env_type,
                "config": config
            }
        )
        
    except Exception as e:
        logger.error(f"Test environment setup failed: {str(e)}")
        raise

async def cleanup_test_resources() -> None:
    """
    Ensures proper cleanup of test resources and mocks.
    
    This includes:
    - Closing async connections
    - Clearing mock data
    - Resetting environment variables
    - Removing temporary files
    """
    try:
        # Reset environment variables
        os.environ.pop("TESTING", None)
        os.environ.pop("TEST_ENV", None)
        
        # Clear mock data directory
        if os.path.exists(MOCK_DATA_PATH):
            for file in os.listdir(MOCK_DATA_PATH):
                os.remove(os.path.join(MOCK_DATA_PATH, file))
            os.rmdir(MOCK_DATA_PATH)
            
        # Reset settings
        settings.TESTING = False
        settings.DEBUG = False
        
        logger.info("Test resources cleaned up successfully")
        
    except Exception as e:
        logger.error(f"Test resource cleanup failed: {str(e)}")
        raise

def mock_external_service(service_name: str):
    """
    Decorator for mocking external service calls in tests.
    
    Args:
        service_name: Name of the service to mock
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with patch(f"app.services.{service_name}_service.{service_name.capitalize()}Service") as mock:
                mock_service = AsyncMock()
                mock.return_value = mock_service
                return await func(*args, mock_service, **kwargs)
        return wrapper
    return decorator

@pytest.fixture(scope="session")
def event_loop():
    """
    Creates an event loop for async tests with proper cleanup.
    
    Returns:
        AsyncGenerator yielding event loop
    """
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(autouse=True)
async def test_setup_teardown():
    """
    Automatic fixture for test setup and teardown.
    Ensures proper resource management for all tests.
    """
    # Setup test environment
    await setup_test_environment(
        env_type="unit",
        config={"parallel": MAX_PARALLEL_TESTS}
    )
    
    yield
    
    # Cleanup test resources
    await cleanup_test_resources()

# Export test utilities and fixtures
__all__ = [
    "pytest",
    "pytest_asyncio",
    "AsyncMock",
    "patch",
    "MagicMock",
    "mock_external_service",
    "setup_test_environment",
    "cleanup_test_resources",
    "TEST_TIMEOUT",
    "TEST_CACHE_TTL",
    "MAX_PARALLEL_TESTS",
    "MOCK_DATA_PATH",
    "MOCK_SPORT_DATA"
]