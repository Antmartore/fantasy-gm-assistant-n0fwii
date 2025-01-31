# Python 3.11+
import pytest
import pytest_asyncio  # v0.21+
from unittest.mock import AsyncMock, patch
import time
from typing import Dict, Any

from app.services.espn_service import ESPNService, ESPNAPIError
from app.utils.enums import SportType

# Test constants
TEST_TEAM_ID = "123456"
TEST_PLAYER_ID = "789012"
TEST_LEAGUE_ID = "345678"
RESPONSE_TIME_THRESHOLD = 2.0  # 2 seconds threshold

# Mock response data
MOCK_TEAM_DATA = {
    "team": {
        "id": TEST_TEAM_ID,
        "name": "Test Team",
        "roster": [],
        "stats": {},
        "sport_type": "NFL"
    }
}

MOCK_PLAYER_DATA = {
    "stats": {
        "id": TEST_PLAYER_ID,
        "name": "Test Player",
        "position": "QB",
        "stats": {},
        "team_id": TEST_TEAM_ID
    }
}

MOCK_LEAGUE_DATA = {
    "settings": {
        "id": TEST_LEAGUE_ID,
        "name": "Test League",
        "settings": {},
        "teams": [],
        "sport_type": "NFL"
    }
}

@pytest.fixture
async def espn_service():
    """
    Fixture providing a mocked ESPN service instance with performance tracking.
    
    Returns:
        ESPNService: Configured service instance with mocked responses
    """
    with patch('httpx.AsyncClient') as mock_client:
        service = ESPNService()
        
        # Configure mock responses
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = AsyncMock()
        
        # Setup response data based on endpoint
        async def mock_get(endpoint, **kwargs):
            if "teams" in endpoint:
                mock_response.json = AsyncMock(return_value=MOCK_TEAM_DATA)
            elif "players" in endpoint:
                mock_response.json = AsyncMock(return_value=MOCK_PLAYER_DATA)
            elif "leagues" in endpoint:
                mock_response.json = AsyncMock(return_value=MOCK_LEAGUE_DATA)
            return mock_response
            
        mock_client.return_value.get = mock_get
        mock_client.return_value.__aenter__.return_value = mock_client.return_value
        mock_client.return_value.__aexit__.return_value = None
        
        return service

@pytest.mark.asyncio
async def test_get_team_data_success(espn_service):
    """
    Tests successful team data retrieval with response validation.
    """
    start_time = time.time()
    response = await espn_service.get_team_data(TEST_TEAM_ID, SportType.NFL)
    response_time = time.time() - start_time
    
    # Validate response time
    assert response_time < RESPONSE_TIME_THRESHOLD, f"Response time {response_time}s exceeded threshold"
    
    # Validate response structure
    assert "team" in response
    assert response["team"]["id"] == TEST_TEAM_ID
    assert response["team"]["name"] == "Test Team"

@pytest.mark.asyncio
async def test_get_player_stats_success(espn_service):
    """
    Tests successful player statistics retrieval with response validation.
    """
    start_time = time.time()
    response = await espn_service.get_player_stats(TEST_PLAYER_ID, SportType.NFL)
    response_time = time.time() - start_time
    
    # Validate response time
    assert response_time < RESPONSE_TIME_THRESHOLD, f"Response time {response_time}s exceeded threshold"
    
    # Validate response structure
    assert "stats" in response
    assert response["stats"]["id"] == TEST_PLAYER_ID
    assert response["stats"]["position"] == "QB"

@pytest.mark.asyncio
async def test_get_league_data_success(espn_service):
    """
    Tests successful league data retrieval with response validation.
    """
    start_time = time.time()
    response = await espn_service.get_league_data(TEST_LEAGUE_ID, SportType.NFL)
    response_time = time.time() - start_time
    
    # Validate response time
    assert response_time < RESPONSE_TIME_THRESHOLD, f"Response time {response_time}s exceeded threshold"
    
    # Validate response structure
    assert "settings" in response
    assert response["settings"]["id"] == TEST_LEAGUE_ID
    assert response["settings"]["name"] == "Test League"

@pytest.mark.asyncio
async def test_caching_behavior(espn_service):
    """
    Tests caching functionality and performance improvements.
    """
    # First request - should hit API
    start_time = time.time()
    first_response = await espn_service.get_team_data(TEST_TEAM_ID, SportType.NFL)
    first_request_time = time.time() - start_time
    
    # Second request - should hit cache
    start_time = time.time()
    second_response = await espn_service.get_team_data(TEST_TEAM_ID, SportType.NFL)
    second_request_time = time.time() - start_time
    
    # Validate cache performance
    assert second_request_time < first_request_time, "Cached response not faster than API request"
    assert first_response == second_response, "Cache returned inconsistent data"

@pytest.mark.asyncio
async def test_error_handling(espn_service):
    """
    Tests error handling and retry mechanism.
    """
    with patch('httpx.AsyncClient.get', side_effect=ESPNAPIError("Test error")):
        with pytest.raises(ESPNAPIError) as exc_info:
            await espn_service.get_team_data(TEST_TEAM_ID, SportType.NFL)
        assert "Test error" in str(exc_info.value)

@pytest.mark.asyncio
async def test_cache_invalidation(espn_service):
    """
    Tests cache clearing functionality.
    """
    # Populate cache
    await espn_service.get_team_data(TEST_TEAM_ID, SportType.NFL)
    
    # Clear cache
    await espn_service.clear_cache()
    
    # Verify cache is cleared by checking response time of next request
    start_time = time.time()
    await espn_service.get_team_data(TEST_TEAM_ID, SportType.NFL)
    response_time = time.time() - start_time
    
    assert response_time < RESPONSE_TIME_THRESHOLD, "Response time after cache clear exceeded threshold"

@pytest.mark.asyncio
async def test_performance_requirements(espn_service):
    """
    Tests performance requirements across multiple requests.
    """
    request_times = []
    
    # Execute batch of requests
    for _ in range(10):
        start_time = time.time()
        await espn_service.get_team_data(TEST_TEAM_ID, SportType.NFL)
        request_times.append(time.time() - start_time)
    
    # Calculate 95th percentile response time
    request_times.sort()
    percentile_95 = request_times[int(len(request_times) * 0.95)]
    
    assert percentile_95 < RESPONSE_TIME_THRESHOLD, f"95th percentile response time {percentile_95}s exceeded threshold"

@pytest.mark.asyncio
async def test_multi_sport_support(espn_service):
    """
    Tests support for multiple sport types.
    """
    for sport_type in [SportType.NFL, SportType.NBA, SportType.MLB]:
        start_time = time.time()
        response = await espn_service.get_team_data(TEST_TEAM_ID, sport_type)
        response_time = time.time() - start_time
        
        assert response_time < RESPONSE_TIME_THRESHOLD, f"Response time for {sport_type.value} exceeded threshold"
        assert "team" in response, f"Invalid response structure for {sport_type.value}"