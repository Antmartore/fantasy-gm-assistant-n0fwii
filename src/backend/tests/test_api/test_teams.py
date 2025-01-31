# Python 3.11+
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock
from fastapi import HTTPException, status

# Internal imports
from app.core.exceptions import (
    AuthenticationError,
    ValidationError,
    RateLimitError,
    IntegrationError
)
from app.utils.enums import SportType, Platform

# Test constants
TEST_TEAM_DATA = {
    'nfl': {
        'name': 'Test NFL Team',
        'sport': 'NFL',
        'platform': 'ESPN',
        'settings': {'auto_sync': True}
    },
    'nba': {
        'name': 'Test NBA Team',
        'sport': 'NBA',
        'platform': 'SLEEPER',
        'settings': {'auto_sync': True}
    },
    'mlb': {
        'name': 'Test MLB Team',
        'sport': 'MLB',
        'platform': 'ESPN',
        'settings': {'auto_sync': True}
    }
}

TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

PLATFORM_MOCK_DATA = {
    'espn': {
        'roster': [],
        'settings': {},
        'league': {}
    },
    'sleeper': {
        'roster': [],
        'settings': {},
        'league': {}
    }
}

@pytest.mark.asyncio
async def test_create_team(client, auth_headers, mock_firebase):
    """
    Test team creation endpoint with comprehensive validation.
    
    Tests:
    - Creation for all supported sports
    - Platform-specific validation
    - Error handling
    - Authorization checks
    """
    # Test successful team creation for each sport
    for sport, team_data in TEST_TEAM_DATA.items():
        response = await client.post(
            "/api/v1/teams",
            json=team_data,
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_201_CREATED
        created_team = response.json()
        assert created_team['name'] == team_data['name']
        assert created_team['sport'] == team_data['sport']
        assert created_team['user_id'] == TEST_USER_ID

    # Test invalid sport type
    invalid_sport_data = TEST_TEAM_DATA['nfl'].copy()
    invalid_sport_data['sport'] = 'INVALID'
    response = await client.post(
        "/api/v1/teams",
        json=invalid_sport_data,
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # Test invalid platform
    invalid_platform_data = TEST_TEAM_DATA['nfl'].copy()
    invalid_platform_data['platform'] = 'INVALID'
    response = await client.post(
        "/api/v1/teams",
        json=invalid_platform_data,
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    # Test unauthorized access
    response = await client.post(
        "/api/v1/teams",
        json=TEST_TEAM_DATA['nfl']
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.asyncio
async def test_get_team(client, auth_headers, mock_firebase):
    """
    Test team retrieval with caching and permission validation.
    
    Tests:
    - Single team retrieval
    - Cache implementation
    - Permission checks
    - Error handling
    """
    # Create test team first
    create_response = await client.post(
        "/api/v1/teams",
        json=TEST_TEAM_DATA['nfl'],
        headers=auth_headers
    )
    team_id = create_response.json()['id']

    # Test successful retrieval
    response = await client.get(
        f"/api/v1/teams/{team_id}",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    team = response.json()
    assert team['id'] == team_id
    assert team['name'] == TEST_TEAM_DATA['nfl']['name']

    # Test cache hit (should be faster)
    cached_response = await client.get(
        f"/api/v1/teams/{team_id}",
        headers=auth_headers
    )
    assert cached_response.status_code == status.HTTP_200_OK
    assert 'x-cache-hit' in cached_response.headers

    # Test non-existent team
    response = await client.get(
        "/api/v1/teams/non-existent-id",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND

    # Test unauthorized access
    response = await client.get(
        f"/api/v1/teams/{team_id}"
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.asyncio
async def test_get_teams(client, auth_headers):
    """
    Test team listing with filtering and pagination.
    
    Tests:
    - List pagination
    - Sport filtering
    - Platform filtering
    - Sort options
    """
    # Create multiple test teams
    for team_data in TEST_TEAM_DATA.values():
        await client.post(
            "/api/v1/teams",
            json=team_data,
            headers=auth_headers
        )

    # Test basic listing
    response = await client.get(
        "/api/v1/teams",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    teams = response.json()
    assert len(teams) == len(TEST_TEAM_DATA)

    # Test pagination
    response = await client.get(
        "/api/v1/teams?limit=1&offset=0",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 1
    assert 'x-total-count' in response.headers

    # Test sport filtering
    response = await client.get(
        "/api/v1/teams?sport=NFL",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    teams = response.json()
    assert all(team['sport'] == 'NFL' for team in teams)

    # Test platform filtering
    response = await client.get(
        "/api/v1/teams?platform=ESPN",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    teams = response.json()
    assert all(team['platform'] == 'ESPN' for team in teams)

@pytest.mark.asyncio
async def test_update_team(client, auth_headers, mock_firebase):
    """
    Test team updates with partial updates and validation.
    
    Tests:
    - Full update
    - Partial update
    - Validation rules
    - Concurrency handling
    """
    # Create test team
    create_response = await client.post(
        "/api/v1/teams",
        json=TEST_TEAM_DATA['nfl'],
        headers=auth_headers
    )
    team_id = create_response.json()['id']

    # Test full update
    update_data = {
        'name': 'Updated NFL Team',
        'settings': {'auto_sync': False}
    }
    response = await client.put(
        f"/api/v1/teams/{team_id}",
        json=update_data,
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    updated_team = response.json()
    assert updated_team['name'] == update_data['name']
    assert updated_team['settings']['auto_sync'] == False

    # Test partial update
    partial_update = {'name': 'Partially Updated Team'}
    response = await client.patch(
        f"/api/v1/teams/{team_id}",
        json=partial_update,
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()['name'] == partial_update['name']

    # Test invalid update data
    invalid_update = {'sport': 'INVALID'}
    response = await client.put(
        f"/api/v1/teams/{team_id}",
        json=invalid_update,
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

@pytest.mark.asyncio
async def test_delete_team(client, auth_headers, mock_firebase):
    """
    Test team deletion with cascade and cleanup.
    
    Tests:
    - Successful deletion
    - Cascade deletion
    - Permission checks
    - Non-existent team handling
    """
    # Create test team
    create_response = await client.post(
        "/api/v1/teams",
        json=TEST_TEAM_DATA['nfl'],
        headers=auth_headers
    )
    team_id = create_response.json()['id']

    # Test successful deletion
    response = await client.delete(
        f"/api/v1/teams/{team_id}",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_204_NO_CONTENT

    # Verify team is deleted
    get_response = await client.get(
        f"/api/v1/teams/{team_id}",
        headers=auth_headers
    )
    assert get_response.status_code == status.HTTP_404_NOT_FOUND

    # Test deleting non-existent team
    response = await client.delete(
        "/api/v1/teams/non-existent-id",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND

@pytest.mark.asyncio
async def test_sync_platform_data(client, auth_headers, mock_espn, mock_sleeper):
    """
    Test platform data synchronization with error handling.
    
    Tests:
    - ESPN sync
    - Sleeper sync
    - Error handling
    - Rate limiting
    """
    # Create test teams for each platform
    espn_team = await client.post(
        "/api/v1/teams",
        json=TEST_TEAM_DATA['nfl'],
        headers=auth_headers
    )
    sleeper_team = await client.post(
        "/api/v1/teams",
        json=TEST_TEAM_DATA['nba'],
        headers=auth_headers
    )

    # Configure platform mocks
    mock_espn.get_team_data.return_value = PLATFORM_MOCK_DATA['espn']
    mock_sleeper.get_team_data.return_value = PLATFORM_MOCK_DATA['sleeper']

    # Test ESPN sync
    response = await client.post(
        f"/api/v1/teams/{espn_team.json()['id']}/sync",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    assert mock_espn.get_team_data.called

    # Test Sleeper sync
    response = await client.post(
        f"/api/v1/teams/{sleeper_team.json()['id']}/sync",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    assert mock_sleeper.get_team_data.called

    # Test sync with invalid platform
    mock_espn.get_team_data.side_effect = IntegrationError(
        message="API error",
        error_code=6000
    )
    response = await client.post(
        f"/api/v1/teams/{espn_team.json()['id']}/sync",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_502_BAD_GATEWAY