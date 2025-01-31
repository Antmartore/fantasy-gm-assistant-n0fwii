# Python 3.11+
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4
import time
from datetime import datetime, timedelta

# Internal imports
from app.utils.enums import TradeStatus
from tests.conftest import (
    app,
    client,
    auth_headers,
    mock_firebase,
    mock_gpt,
    mock_video
)

# Test constants
TRADES_URL = "/api/v1/trades"

TEST_TRADE_DATA = {
    "team_from_id": str(uuid4()),
    "team_to_id": str(uuid4()),
    "players_offered": [str(uuid4()), str(uuid4())],
    "players_requested": [str(uuid4()), str(uuid4())],
    "expires_at": (datetime.utcnow() + timedelta(days=1)).isoformat(),
    "risk_threshold": 0.8,
    "generate_video": True
}

MOCK_ANALYSIS_RESPONSE = {
    "risk_score": 0.75,
    "win_probability_change": 0.15,
    "recommendations": [
        "Trade offers fair value based on player performance metrics",
        "Slight advantage in long-term value for receiving team",
        "Consider injury history of players involved"
    ],
    "video_url": "https://storage.googleapis.com/fantasy-gm/trades/analysis-123.mp4"
}

@pytest.mark.asyncio
async def test_create_trade(client, auth_headers, mock_firebase):
    """
    Tests trade creation endpoint with validation of required fields and response structure.
    """
    # Mock Firebase document creation
    mock_firebase.set_document.return_value = None
    
    # Send trade creation request
    response = await client.post(
        f"{TRADES_URL}/create",
        json=TEST_TRADE_DATA,
        headers=auth_headers
    )
    
    # Assert response
    assert response.status_code == 201
    data = response.json()
    
    # Validate response structure
    assert "trade_id" in data
    assert UUID(data["trade_id"])  # Validate UUID format
    assert data["status"] == TradeStatus.PROPOSED.value
    assert data["team_from_id"] == TEST_TRADE_DATA["team_from_id"]
    assert data["team_to_id"] == TEST_TRADE_DATA["team_to_id"]
    assert len(data["players_offered"]) == len(TEST_TRADE_DATA["players_offered"])
    assert len(data["players_requested"]) == len(TEST_TRADE_DATA["players_requested"])
    
    # Verify Firebase interaction
    mock_firebase.set_document.assert_called_once()
    call_args = mock_firebase.set_document.call_args[0]
    assert call_args[0] == "trades"
    assert UUID(call_args[1])  # Validate trade_id

@pytest.mark.asyncio
async def test_analyze_trade(client, auth_headers, mock_gpt, mock_video):
    """
    Tests trade analysis endpoint with performance validation and service mocking.
    """
    # Mock GPT and video service responses
    mock_gpt.analyze_trade.return_value = MOCK_ANALYSIS_RESPONSE
    mock_video.generate_analysis_video.return_value = MOCK_ANALYSIS_RESPONSE["video_url"]
    
    # Start performance timer
    start_time = time.time()
    
    # Send trade analysis request
    response = await client.post(
        f"{TRADES_URL}/analyze",
        json={
            "trade_id": str(uuid4()),
            "generate_video": True
        },
        headers=auth_headers
    )
    
    # Calculate response time
    response_time = time.time() - start_time
    
    # Assert performance requirement (2 second max)
    assert response_time < 2.0, f"Response time {response_time}s exceeded 2s limit"
    
    # Assert response
    assert response.status_code == 200
    data = response.json()
    
    # Validate analysis response structure
    assert "risk_score" in data
    assert isinstance(data["risk_score"], float)
    assert 0 <= data["risk_score"] <= 1
    
    assert "win_probability_change" in data
    assert isinstance(data["win_probability_change"], float)
    
    assert "recommendations" in data
    assert isinstance(data["recommendations"], list)
    assert len(data["recommendations"]) > 0
    
    # Validate video generation if requested
    assert "video_url" in data
    assert data["video_url"].startswith("https://")
    
    # Verify service interactions
    mock_gpt.analyze_trade.assert_called_once()
    mock_video.generate_analysis_video.assert_called_once()

@pytest.mark.asyncio
async def test_analyze_trade_error(client, auth_headers, mock_gpt):
    """
    Tests error handling in trade analysis endpoint.
    """
    # Mock GPT service error
    mock_gpt.analyze_trade.side_effect = Exception("GPT service unavailable")
    
    # Send trade analysis request
    response = await client.post(
        f"{TRADES_URL}/analyze",
        json={
            "trade_id": str(uuid4()),
            "generate_video": False
        },
        headers=auth_headers
    )
    
    # Assert error response
    assert response.status_code == 502  # Bad Gateway for integration error
    data = response.json()
    
    # Validate error response structure
    assert "status" in data and data["status"] == "error"
    assert "code" in data and 6000 <= data["code"] < 7000  # Integration error code range
    assert "message" in data
    assert "correlation_id" in data
    assert "timestamp" in data

@pytest.mark.asyncio
async def test_invalid_trade_data(client, auth_headers):
    """
    Tests validation of trade request data.
    """
    # Test with missing required fields
    invalid_data = {
        "team_from_id": str(uuid4())
        # Missing other required fields
    }
    
    response = await client.post(
        f"{TRADES_URL}/create",
        json=invalid_data,
        headers=auth_headers
    )
    
    assert response.status_code == 422  # Unprocessable Entity
    data = response.json()
    assert "status" in data and data["status"] == "error"
    assert "code" in data and 3000 <= data["code"] < 4000  # Validation error code range

@pytest.mark.asyncio
async def test_trade_status_update(client, auth_headers, mock_firebase):
    """
    Tests trade status update endpoint.
    """
    trade_id = str(uuid4())
    
    # Mock Firebase document update
    mock_firebase.set_document.return_value = None
    
    # Test status update to ACCEPTED
    response = await client.put(
        f"{TRADES_URL}/{trade_id}/status",
        json={"status": TradeStatus.ACCEPTED.value},
        headers=auth_headers
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == TradeStatus.ACCEPTED.value
    
    # Verify Firebase update
    mock_firebase.set_document.assert_called_with(
        "trades",
        trade_id,
        {"status": TradeStatus.ACCEPTED.value, "updated_at": pytest.approx(datetime.utcnow().isoformat(), abs=timedelta(seconds=5))},
        merge=True
    )