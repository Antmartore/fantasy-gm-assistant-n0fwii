# Python 3.11+
import pytest
import pytest_asyncio  # pytest-asyncio v0.21+
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

# Import shared test fixtures and utilities
from tests.conftest import (
    event_loop,
    test_redis,
    test_firebase,
    test_db,
    test_token,
    test_client,
    mock_sportradar,
    mock_gpt4,
    mock_video_gen
)

# API test configuration constants
TEST_API_VERSION = "v1"
TEST_API_PREFIX = "/api/v1"
TEST_RATE_LIMIT = 100  # Default rate limit per minute
TEST_RATE_LIMIT_PERIOD = 60  # Rate limit window in seconds
TEST_JWT_EXPIRY = 3600  # JWT token expiry in seconds

# Test categories for pytest marks
API_TEST_CATEGORIES = [
    "authentication",
    "authorization",
    "rate_limiting",
    "input_validation",
    "integration",
    "performance"
]

@pytest.fixture(scope="session")
def configure_test_environment() -> None:
    """
    Configures the test environment with necessary settings and markers.
    Sets up pytest async markers, rate limiting, JWT configuration,
    and test database connections.
    """
    # Register custom markers for test categorization
    for category in API_TEST_CATEGORIES:
        pytest.mark.register(
            getattr(pytest.mark, category),
            description=f"Mark test as {category} test"
        )

    # Configure async test settings
    pytest_asyncio.main(
        forbid_global_loop=True,
        loop_factory=event_loop
    )

    # Configure rate limiting test parameters
    pytest.rate_limit = {
        "teams": TEST_RATE_LIMIT,
        "players": TEST_RATE_LIMIT * 2,  # 200/min for player endpoints
        "trades": TEST_RATE_LIMIT // 2,  # 50/min for trade endpoints
        "simulations": TEST_RATE_LIMIT // 5,  # 20/min for simulation endpoints
        "lineups": TEST_RATE_LIMIT  # 100/min for lineup endpoints
    }

    # Configure JWT test settings
    pytest.jwt_settings = {
        "expiry": TEST_JWT_EXPIRY,
        "algorithm": "HS256",
        "token_type": "Bearer"
    }

    # Configure test logging
    pytest.logging_config = {
        "level": "DEBUG",
        "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        "correlation_id_header": "X-Correlation-ID"
    }

    # Configure CORS test settings
    pytest.cors_settings = {
        "allow_origins": ["http://localhost:3000"],
        "allow_methods": ["GET", "POST", "PUT", "DELETE"],
        "allow_headers": ["Authorization", "Content-Type", "X-Correlation-ID"],
        "max_age": 3600
    }

    # Configure input validation test settings
    pytest.validation_settings = {
        "max_players_per_request": 50,
        "max_trades_per_request": 10,
        "max_simulations_per_request": 5,
        "max_lineup_changes_per_request": 20
    }

    # Configure performance test thresholds
    pytest.performance_thresholds = {
        "api_response_ms": 200,  # Maximum API response time
        "db_query_ms": 100,      # Maximum database query time
        "cache_query_ms": 10,    # Maximum cache query time
        "auth_check_ms": 50      # Maximum auth verification time
    }

# Export test configuration constants and fixtures
__all__ = [
    "TEST_API_VERSION",
    "TEST_API_PREFIX",
    "TEST_RATE_LIMIT",
    "TEST_RATE_LIMIT_PERIOD",
    "TEST_JWT_EXPIRY",
    "configure_test_environment",
    # Re-export shared fixtures
    "event_loop",
    "test_redis",
    "test_firebase",
    "test_db",
    "test_token",
    "test_client",
    "mock_sportradar",
    "mock_gpt4",
    "mock_video_gen"
]