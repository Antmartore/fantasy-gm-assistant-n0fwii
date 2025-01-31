# Python 3.11+
import pytest
import time
from unittest.mock import AsyncMock
from typing import Dict, Any

from app import create_app
from app.models.player import Player
from app.schemas.player import PlayerBase
from app.utils.enums import SportType

# Test data for different sports
TEST_PLAYER_DATA = {
    'NFL': {
        'name': 'Test NFL Player',
        'external_id': 'NFL123',
        'sport': 'NFL',
        'position': 'QB',
        'team': 'Test Team',
        'stats': {
            'passing_yards': 300,
            'touchdowns': 3,
            'interceptions': 1
        },
        'projections': {
            'projected_points': 25.5
        }
    },
    'NBA': {
        'name': 'Test NBA Player',
        'external_id': 'NBA123',
        'sport': 'NBA',
        'position': 'PG',
        'team': 'Test Team',
        'stats': {
            'points': 22,
            'assists': 8,
            'rebounds': 5
        },
        'projections': {
            'projected_points': 35.5
        }
    },
    'MLB': {
        'name': 'Test MLB Player',
        'external_id': 'MLB123',
        'sport': 'MLB',
        'position': 'P',
        'team': 'Test Team',
        'stats': {
            'era': 2.85,
            'strikeouts': 95,
            'wins': 12
        },
        'projections': {
            'projected_points': 18.5
        }
    }
}

@pytest.fixture
def mock_sportradar():
    """Mock Sportradar API responses for player stats."""
    mock = AsyncMock()
    mock.get_player_stats.return_value = {
        'NFL': {
            'passing_yards': 350,
            'touchdowns': 4,
            'interceptions': 0
        },
        'NBA': {
            'points': 28,
            'assists': 10,
            'rebounds': 6
        },
        'MLB': {
            'era': 2.65,
            'strikeouts': 98,
            'wins': 13
        }
    }
    return mock

@pytest.fixture
async def test_player(db_session):
    """Create test player instances for each sport."""
    players = {}
    for sport, data in TEST_PLAYER_DATA.items():
        player = Player(
            name=data['name'],
            external_id=data['external_id'],
            sport=SportType[sport],
            position=data['position'],
            team=data['team'],
            initial_stats=data['stats'],
            initial_projections=data['projections']
        )
        db_session.add(player)
        players[sport] = player
    await db_session.commit()
    return players

@pytest.mark.asyncio
@pytest.mark.parametrize('sport_type', ['NFL', 'NBA', 'MLB'])
async def test_create_player(client, auth_headers, sport_type):
    """
    Test player creation endpoint with sport-specific validation.
    
    Args:
        client: Test client fixture
        auth_headers: Authentication headers fixture
        sport_type: Sport type being tested
    """
    # Get test data for sport
    player_data = TEST_PLAYER_DATA[sport_type]
    
    # Measure request start time
    start_time = time.time()
    
    # Send create player request
    response = await client.post(
        "/api/v1/players/",
        json=player_data,
        headers=auth_headers
    )
    
    # Verify response time
    assert time.time() - start_time < 2.0, "Request exceeded 2 second SLA"
    
    # Verify response
    assert response.status_code == 201
    created_player = response.json()
    
    # Verify required fields
    assert created_player['name'] == player_data['name']
    assert created_player['sport'] == sport_type
    assert created_player['position'] == player_data['position']
    assert created_player['team'] == player_data['team']
    
    # Verify sport-specific stats validation
    assert all(
        key in created_player['stats'] 
        for key in player_data['stats'].keys()
    )
    
    # Verify database entry
    db_player = await Player.get_by_id(created_player['id'])
    assert db_player is not None
    assert db_player.external_id == player_data['external_id']
    
    # Verify cache entry
    cache_key = f"player:{created_player['id']}"
    cached_player = await client.app.redis_client.get(cache_key)
    assert cached_player is not None

@pytest.mark.asyncio
async def test_get_player(client, auth_headers, test_player):
    """
    Test player retrieval endpoint with caching verification.
    
    Args:
        client: Test client fixture
        auth_headers: Authentication headers fixture
        test_player: Test player fixture
    """
    player_id = test_player['NFL'].id
    
    # First request - should hit database
    start_time = time.time()
    response = await client.get(
        f"/api/v1/players/{player_id}",
        headers=auth_headers
    )
    first_request_time = time.time() - start_time
    
    # Verify response
    assert response.status_code == 200
    player_data = response.json()
    assert player_data['id'] == str(player_id)
    assert player_data['name'] == test_player['NFL'].name
    
    # Second request - should hit cache
    start_time = time.time()
    cached_response = await client.get(
        f"/api/v1/players/{player_id}",
        headers=auth_headers
    )
    cached_request_time = time.time() - start_time
    
    # Verify cache hit
    assert cached_response.status_code == 200
    assert cached_response.headers.get('X-Cache-Hit') == 'true'
    assert cached_request_time < first_request_time

@pytest.mark.asyncio
async def test_update_player_stats(client, auth_headers, test_player, mock_sportradar):
    """
    Test player stats update endpoint with external API integration.
    
    Args:
        client: Test client fixture
        auth_headers: Authentication headers fixture
        test_player: Test player fixture
        mock_sportradar: Mocked Sportradar API
    """
    player = test_player['NFL']
    
    # Update stats
    new_stats = mock_sportradar.get_player_stats.return_value['NFL']
    response = await client.put(
        f"/api/v1/players/{player.id}/stats",
        json=new_stats,
        headers=auth_headers
    )
    
    # Verify response
    assert response.status_code == 200
    updated_player = response.json()
    assert updated_player['stats'] == new_stats
    
    # Verify historical stats tracking
    assert len(updated_player['historical_stats']) > 0
    assert updated_player['historical_stats'][-1]['stats'] == player.stats

@pytest.mark.asyncio
async def test_player_search(client, auth_headers, test_player):
    """
    Test player search endpoint with filtering and pagination.
    
    Args:
        client: Test client fixture
        auth_headers: Authentication headers fixture
        test_player: Test player fixture
    """
    # Search by name
    response = await client.get(
        "/api/v1/players/search",
        params={"name": "Test", "sport": "NFL"},
        headers=auth_headers
    )
    
    # Verify response
    assert response.status_code == 200
    results = response.json()
    assert len(results) > 0
    assert results[0]['name'].startswith('Test')
    
    # Verify pagination
    response = await client.get(
        "/api/v1/players/search",
        params={"limit": 1, "offset": 0},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert len(response.json()) == 1

@pytest.mark.asyncio
async def test_bulk_stats_update(client, auth_headers, test_player, mock_sportradar):
    """
    Test bulk player stats update endpoint performance.
    
    Args:
        client: Test client fixture
        auth_headers: Authentication headers fixture
        test_player: Test player fixture
        mock_sportradar: Mocked Sportradar API
    """
    player_ids = [str(p.id) for p in test_player.values()]
    
    # Measure bulk update performance
    start_time = time.time()
    response = await client.post(
        "/api/v1/players/bulk-update",
        json={"player_ids": player_ids},
        headers=auth_headers
    )
    
    # Verify response time meets SLA
    assert time.time() - start_time < 2.0
    
    # Verify response
    assert response.status_code == 200
    results = response.json()
    assert len(results['updated']) == len(player_ids)
    assert len(results['failed']) == 0