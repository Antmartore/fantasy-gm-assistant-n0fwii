# Python 3.11+
import pytest
import pytest_asyncio  # pytest-asyncio v0.21+
from unittest.mock import AsyncMock, patch
import httpx  # httpx v0.24+
from freezegun import freeze_time  # freezegun v1.2+
import time
from datetime import datetime, timedelta

from app.services.sleeper_service import SleeperService
from app.utils.enums import SportType
from app.core.exceptions import IntegrationError

# Test constants
TEST_USER_ID = "12345"
TEST_LEAGUE_ID = "67890"
CORRELATION_ID = "test-correlation-id"
PERFORMANCE_THRESHOLD = 2.0  # seconds

# Mock response data
MOCK_LEAGUES_RESPONSE = [
    {
        "league_id": "67890",
        "name": "Test League",
        "sport": "nfl",
        "metadata": {"scoring_type": "ppr"}
    }
]

MOCK_ROSTERS_RESPONSE = [
    {
        "roster_id": 1,
        "owner_id": "12345",
        "players": ["123", "456"],
        "starters": ["123"],
        "reserve": ["456"]
    }
]

MOCK_PLAYERS_RESPONSE = {
    "123": {
        "full_name": "Test Player",
        "position": "QB",
        "team": "SF",
        "injury_status": "NA"
    },
    "456": {
        "full_name": "Test Player 2",
        "position": "RB",
        "team": "DAL",
        "injury_status": "Q"
    }
}

MOCK_TRANSACTIONS_RESPONSE = [
    {
        "transaction_id": "1",
        "type": "trade",
        "status": "complete",
        "adds": {"123": "1"},
        "drops": {"456": "1"},
        "draft_picks": []
    }
]

@pytest.fixture
async def sleeper_service():
    """
    Fixture that provides a configured SleeperService instance with mocked HTTP client.
    """
    # Initialize mock HTTP client
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.headers = {"X-Correlation-ID": CORRELATION_ID}
    
    # Create service instance with mock client
    service = SleeperService()
    service._client = mock_client
    
    # Clear cache before each test
    service.clear_cache()
    
    return service

@pytest.mark.asyncio
async def test_get_user_leagues_success(sleeper_service):
    """Test successful retrieval of user leagues with performance validation."""
    # Mock successful response
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_LEAGUES_RESPONSE
    sleeper_service._client.get.return_value = mock_response

    # Record start time for performance check
    start_time = time.time()
    
    # Execute request
    leagues = await sleeper_service.get_user_leagues(
        user_id=TEST_USER_ID,
        sport=SportType.NFL
    )
    
    # Verify performance
    execution_time = time.time() - start_time
    assert execution_time < PERFORMANCE_THRESHOLD, f"Request took {execution_time}s, exceeding {PERFORMANCE_THRESHOLD}s threshold"
    
    # Verify response structure
    assert isinstance(leagues, list)
    assert len(leagues) == 1
    assert leagues[0]["league_id"] == TEST_LEAGUE_ID
    assert leagues[0]["sport"] == SportType.NFL.value.lower()
    
    # Verify API call
    sleeper_service._client.get.assert_called_once_with(
        f"/user/{TEST_USER_ID}/leagues/nfl"
    )

@pytest.mark.asyncio
@freeze_time("2024-01-01")
async def test_cache_performance(sleeper_service):
    """Test cache hit performance and data freshness."""
    # Mock response for initial call
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_LEAGUES_RESPONSE
    sleeper_service._client.get.return_value = mock_response
    
    # Initial API call
    start_time = time.time()
    await sleeper_service.get_user_leagues(TEST_USER_ID, SportType.NFL)
    first_call_time = time.time() - start_time
    
    # Cached call
    start_time = time.time()
    cached_leagues = await sleeper_service.get_user_leagues(TEST_USER_ID, SportType.NFL)
    cached_call_time = time.time() - start_time
    
    # Verify cache performance
    assert cached_call_time < first_call_time, "Cached call should be faster than initial call"
    assert sleeper_service._metrics["cache_hits"] == 1
    assert sleeper_service._client.get.call_count == 1
    
    # Verify cache data
    assert cached_leagues == MOCK_LEAGUES_RESPONSE
    
    # Test cache expiration
    with freeze_time(datetime.now() + timedelta(minutes=6)):
        await sleeper_service.get_user_leagues(TEST_USER_ID, SportType.NFL)
        assert sleeper_service._client.get.call_count == 2, "Should make new API call after cache expiration"

@pytest.mark.asyncio
async def test_error_handling_with_retry(sleeper_service):
    """Test error handling with retry mechanism."""
    # Mock failed response
    mock_response = AsyncMock()
    mock_response.status_code = 503
    mock_response.text = "Service Unavailable"
    sleeper_service._client.get.return_value = mock_response
    
    # Test error handling
    with pytest.raises(IntegrationError) as exc_info:
        await sleeper_service.get_user_leagues(TEST_USER_ID, SportType.NFL)
    
    # Verify error details
    assert exc_info.value.error_code == 6001
    assert "Sleeper API error" in str(exc_info.value)
    assert exc_info.value.details["status_code"] == 503
    
    # Verify retry attempts
    assert sleeper_service._client.get.call_count == 3, "Should retry 3 times before failing"
    assert sleeper_service._metrics["errors"] == 1

@pytest.mark.asyncio
async def test_get_league_rosters_success(sleeper_service):
    """Test successful retrieval of league rosters."""
    # Mock response
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_ROSTERS_RESPONSE
    sleeper_service._client.get.return_value = mock_response
    
    # Execute request
    rosters = await sleeper_service.get_league_rosters(TEST_LEAGUE_ID)
    
    # Verify response
    assert isinstance(rosters, list)
    assert len(rosters) == 1
    assert rosters[0]["roster_id"] == 1
    assert rosters[0]["owner_id"] == TEST_USER_ID
    
    # Verify API call
    sleeper_service._client.get.assert_called_once_with(
        f"/league/{TEST_LEAGUE_ID}/rosters"
    )

@pytest.mark.asyncio
async def test_metrics_tracking(sleeper_service):
    """Test service metrics tracking functionality."""
    # Mock successful response
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_LEAGUES_RESPONSE
    sleeper_service._client.get.return_value = mock_response
    
    # Execute multiple requests
    await sleeper_service.get_user_leagues(TEST_USER_ID, SportType.NFL)
    await sleeper_service.get_user_leagues(TEST_USER_ID, SportType.NFL)  # Should hit cache
    
    # Verify metrics
    metrics = sleeper_service.get_metrics()
    assert metrics["requests"] == 1
    assert metrics["cache_hits"] == 1
    assert metrics["cache_misses"] == 1
    assert metrics["errors"] == 0
    assert isinstance(metrics["avg_response_time"], float)

@pytest.mark.asyncio
async def test_concurrent_requests(sleeper_service):
    """Test handling of concurrent requests."""
    # Mock response
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_LEAGUES_RESPONSE
    sleeper_service._client.get.return_value = mock_response
    
    # Execute concurrent requests
    import asyncio
    requests = [
        sleeper_service.get_user_leagues(TEST_USER_ID, SportType.NFL),
        sleeper_service.get_user_leagues(TEST_USER_ID, SportType.NBA)
    ]
    results = await asyncio.gather(*requests)
    
    # Verify results
    assert len(results) == 2
    assert all(isinstance(result, list) for result in results)
    assert sleeper_service._client.get.call_count == 2