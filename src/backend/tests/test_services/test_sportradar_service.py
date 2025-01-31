# Python 3.11+
import pytest
import pytest_asyncio  # v0.21+
from unittest.mock import AsyncMock, patch  # Python 3.11+
import httpx  # v0.24+
import time
from datetime import datetime

from app.services.sportradar_service import SportradarService
from app.utils.enums import SportType
from app.core.exceptions import IntegrationException

# Test constants
TEST_PLAYER_ID = 'test-player-123'
TEST_GAME_ID = 'test-game-456'
TEST_TEAM_ID = 'test-team-789'

MOCK_PLAYER_RESPONSE = {
    'id': TEST_PLAYER_ID,
    'name': 'Test Player',
    'position': 'QB',
    'stats': {
        'passing_yards': 300,
        'touchdowns': 3,
        'interceptions': 1
    }
}

MOCK_GAME_RESPONSE = {
    'id': TEST_GAME_ID,
    'home_team': 'Team A',
    'away_team': 'Team B',
    'stats': {
        'score': {'home': 28, 'away': 21},
        'quarter': 4,
        'time_remaining': '2:30'
    }
}

MOCK_ROSTER_RESPONSE = {
    'id': TEST_TEAM_ID,
    'name': 'Test Team',
    'players': [
        {'id': 'p1', 'name': 'Player 1', 'position': 'QB'},
        {'id': 'p2', 'name': 'Player 2', 'position': 'RB'}
    ]
}

@pytest.fixture
async def sportradar_service():
    """
    Fixture providing a SportradarService instance with mocked HTTP client.
    """
    service = SportradarService()
    
    # Mock HTTP client
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_response = AsyncMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.headers = {'X-Rate-Limit-Remaining': '100'}
    mock_response.raise_for_status = AsyncMock()
    
    # Configure mock client
    service._client = mock_client
    service._client.get.return_value = mock_response
    
    yield service
    
    # Clear cache after each test
    service._cache.clear()

@pytest.mark.asyncio
async def test_get_player_stats_success(sportradar_service):
    """
    Test successful player statistics retrieval with performance validation.
    """
    # Setup mock response
    mock_response = sportradar_service._client.get.return_value
    mock_response.json.return_value = MOCK_PLAYER_RESPONSE
    
    # Record start time
    start_time = time.time()
    
    # Make API call
    result = await sportradar_service.get_player_stats(
        TEST_PLAYER_ID,
        SportType.NFL
    )
    
    # Verify response time
    response_time = time.time() - start_time
    assert response_time < 2.0, "Response time exceeded 2 seconds"
    
    # Verify response data
    assert result['data'] == MOCK_PLAYER_RESPONSE
    assert not result['cached']
    assert 'timestamp' in result
    
    # Verify cache update
    cached_result = await sportradar_service.get_player_stats(
        TEST_PLAYER_ID,
        SportType.NFL
    )
    assert cached_result['cached']
    assert cached_result['data'] == MOCK_PLAYER_RESPONSE

@pytest.mark.asyncio
async def test_get_game_stats_success(sportradar_service):
    """
    Test successful game statistics retrieval with cache verification.
    """
    # Setup mock response
    mock_response = sportradar_service._client.get.return_value
    mock_response.json.return_value = MOCK_GAME_RESPONSE
    
    # Record start time
    start_time = time.time()
    
    # Make API call
    result = await sportradar_service.get_game_stats(
        TEST_GAME_ID,
        SportType.NFL
    )
    
    # Verify response time
    response_time = time.time() - start_time
    assert response_time < 2.0, "Response time exceeded 2 seconds"
    
    # Verify response data
    assert result['data'] == MOCK_GAME_RESPONSE
    assert not result['cached']
    
    # Verify cache behavior
    cached_result = await sportradar_service.get_game_stats(
        TEST_GAME_ID,
        SportType.NFL
    )
    assert cached_result['cached']
    assert cached_result['data'] == MOCK_GAME_RESPONSE

@pytest.mark.asyncio
async def test_get_team_roster_success(sportradar_service):
    """
    Test successful team roster retrieval across different sports.
    """
    # Setup mock responses for different sports
    mock_response = sportradar_service._client.get.return_value
    mock_response.json.return_value = MOCK_ROSTER_RESPONSE
    
    for sport_type in [SportType.NFL, SportType.NBA, SportType.MLB]:
        # Record start time
        start_time = time.time()
        
        # Make API call
        result = await sportradar_service.get_team_roster(
            TEST_TEAM_ID,
            sport_type
        )
        
        # Verify response time
        response_time = time.time() - start_time
        assert response_time < 2.0, f"Response time exceeded 2 seconds for {sport_type}"
        
        # Verify response data
        assert result['data'] == MOCK_ROSTER_RESPONSE
        assert not result['cached']
        assert 'timestamp' in result

@pytest.mark.asyncio
async def test_api_error_handling(sportradar_service):
    """
    Test comprehensive error handling for API failures.
    """
    # Test rate limit exceeded
    mock_response = sportradar_service._client.get.return_value
    mock_response.status_code = 429
    mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
        "Rate limit exceeded",
        request=AsyncMock(),
        response=mock_response
    )
    
    with pytest.raises(IntegrationException) as exc_info:
        await sportradar_service.get_player_stats(TEST_PLAYER_ID, SportType.NFL)
    assert exc_info.value.error_code == 6002
    
    # Test network timeout
    sportradar_service._client.get.side_effect = httpx.RequestError("Connection timeout")
    
    with pytest.raises(IntegrationException) as exc_info:
        await sportradar_service.get_game_stats(TEST_GAME_ID, SportType.NBA)
    assert exc_info.value.error_code == 6003
    
    # Test invalid response format
    mock_response.status_code = 200
    mock_response.raise_for_status.side_effect = None
    mock_response.json.side_effect = ValueError("Invalid JSON")
    
    with pytest.raises(IntegrationException) as exc_info:
        await sportradar_service.get_team_roster(TEST_TEAM_ID, SportType.MLB)
    assert exc_info.value.error_code == 6004

@pytest.mark.asyncio
async def test_cache_functionality(sportradar_service):
    """
    Test detailed caching behavior and performance.
    """
    # Setup mock response
    mock_response = sportradar_service._client.get.return_value
    mock_response.json.return_value = MOCK_PLAYER_RESPONSE
    
    # Initial call - should miss cache
    result1 = await sportradar_service.get_player_stats(
        TEST_PLAYER_ID,
        SportType.NFL
    )
    assert not result1['cached']
    
    # Verify API call was made
    sportradar_service._client.get.assert_called_once()
    
    # Second call - should hit cache
    result2 = await sportradar_service.get_player_stats(
        TEST_PLAYER_ID,
        SportType.NFL
    )
    assert result2['cached']
    
    # Verify no additional API call
    assert sportradar_service._client.get.call_count == 1
    
    # Verify cache data consistency
    assert result1['data'] == result2['data']
    
    # Clear cache and verify behavior
    sportradar_service._cache.clear()
    result3 = await sportradar_service.get_player_stats(
        TEST_PLAYER_ID,
        SportType.NFL
    )
    assert not result3['cached']
    assert sportradar_service._client.get.call_count == 2