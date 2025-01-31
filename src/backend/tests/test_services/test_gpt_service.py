import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch
import time
import jsonschema
from typing import Dict, List

from app.services.gpt_service import GPTService
from app.core.exceptions import IntegrationError

# Test data constants
MOCK_PLAYERS_OFFERED = [
    {
        "name": "Patrick Mahomes",
        "position": "QB",
        "team": "KC",
        "stats": {
            "passing_yards": 4839,
            "touchdowns": 41,
            "interceptions": 12,
            "qb_rating": 105.2
        },
        "recent_performance": "Last 3 games: 300+ yards each",
        "injury_status": "Healthy"
    }
]

MOCK_PLAYERS_REQUESTED = [
    {
        "name": "Justin Jefferson",
        "position": "WR", 
        "team": "MIN",
        "stats": {
            "receiving_yards": 1809,
            "receptions": 128,
            "targets": 184,
            "touchdowns": 8,
            "yards_per_catch": 14.1
        },
        "recent_performance": "Last 3 games: 100+ yards each",
        "injury_status": "Questionable - Hamstring"
    }
]

MOCK_TEAM_CONTEXT = {
    "record": "8-4",
    "position": "2nd in division",
    "strengths": ["Strong QB play", "Deep WR corps"],
    "weaknesses": ["Inconsistent RB production"],
    "roster_composition": "QB heavy, WR depth"
}

# Performance threshold from technical spec
PERFORMANCE_THRESHOLD = 2.0  # seconds

# Response schema for validation
TRADE_ANALYSIS_SCHEMA = {
    "type": "object",
    "required": ["analysis", "confidence_score", "processing_time_ms", "model_version"],
    "properties": {
        "analysis": {"type": "object"},
        "confidence_score": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
        },
        "processing_time_ms": {"type": "number"},
        "model_version": {"type": "string"}
    }
}

@pytest.mark.asyncio
@patch('app.services.gpt_service.openai')
async def test_analyze_trade_success(mock_gpt: AsyncMock):
    """Tests successful trade analysis with GPT service including performance timing and response validation."""
    # Configure mock GPT response
    mock_response = AsyncMock()
    mock_response.choices = [
        AsyncMock(
            message=AsyncMock(
                content='{"value_assessment": "Fair trade", "risk_score": 65}'
            )
        )
    ]
    mock_response.usage = AsyncMock(total_tokens=2048)
    mock_response.response_ms = 1500
    mock_gpt.ChatCompletion.acreate.return_value = mock_response

    # Initialize service
    service = GPTService()
    
    # Measure performance
    start_time = time.time()
    
    # Execute trade analysis
    result = await service.analyze_trade(
        players_offered=MOCK_PLAYERS_OFFERED,
        players_requested=MOCK_PLAYERS_REQUESTED,
        team_context=MOCK_TEAM_CONTEXT,
        correlation_id="test-123"
    )
    
    # Calculate response time
    response_time = time.time() - start_time
    
    # Verify performance meets requirements
    assert response_time < PERFORMANCE_THRESHOLD, f"Response time {response_time}s exceeded threshold of {PERFORMANCE_THRESHOLD}s"
    
    # Validate response schema
    jsonschema.validate(instance=result, schema=TRADE_ANALYSIS_SCHEMA)
    
    # Verify GPT API was called correctly
    mock_gpt.ChatCompletion.acreate.assert_called_once()
    call_args = mock_gpt.ChatCompletion.acreate.call_args[1]
    assert call_args["model"] == "gpt-4-turbo-preview"
    assert call_args["max_tokens"] == 4096
    assert len(call_args["messages"]) == 2
    
    # Verify token usage within limits
    assert mock_response.usage.total_tokens <= 4096
    
    # Verify confidence score calculation
    assert 0 <= result["confidence_score"] <= 1
    
    # Verify processing time tracking
    assert result["processing_time_ms"] == 1500

@pytest.mark.asyncio
@patch('app.services.gpt_service.openai')
async def test_analyze_trade_api_error(mock_gpt: AsyncMock):
    """Tests error handling and retry mechanism for GPT API failures."""
    # Configure mock to raise exception
    mock_gpt.ChatCompletion.acreate.side_effect = Exception("API Error")
    
    service = GPTService()
    
    # Verify exception handling
    with pytest.raises(IntegrationError) as exc_info:
        await service.analyze_trade(
            players_offered=MOCK_PLAYERS_OFFERED,
            players_requested=MOCK_PLAYERS_REQUESTED,
            team_context=MOCK_TEAM_CONTEXT,
            correlation_id="test-456"
        )
    
    # Verify error details
    assert exc_info.value.message == "Failed to analyze trade with GPT-4"
    assert exc_info.value.error_code == 6000
    assert "API Error" in str(exc_info.value.details)
    
    # Verify retry attempts (3 attempts as per MAX_RETRIES)
    assert mock_gpt.ChatCompletion.acreate.call_count == 3

@pytest.mark.asyncio
@patch('app.services.gpt_service.openai')
async def test_generate_lineup_insights(mock_gpt: AsyncMock):
    """Tests lineup optimization insights generation with performance benchmarking."""
    # Configure mock response
    mock_response = AsyncMock()
    mock_response.choices = [
        AsyncMock(
            message=AsyncMock(
                content='{"lineup_recommendations": [], "projected_points": 120.5}'
            )
        )
    ]
    mock_response.usage = AsyncMock(total_tokens=1024)
    mock_response.response_ms = 800
    mock_gpt.ChatCompletion.acreate.return_value = mock_response

    service = GPTService()
    
    # Test lineup insights generation
    start_time = time.time()
    result = await service.generate_lineup_insights(
        team_context=MOCK_TEAM_CONTEXT,
        correlation_id="test-789"
    )
    response_time = time.time() - start_time
    
    # Verify performance
    assert response_time < PERFORMANCE_THRESHOLD
    assert result["processing_time_ms"] < 2000
    
    # Verify response structure
    assert "lineup_recommendations" in result["analysis"]
    assert "projected_points" in result["analysis"]
    
    # Verify token usage
    assert mock_response.usage.total_tokens <= 4096

@pytest.mark.asyncio
@patch('app.services.gpt_service.openai')
async def test_generate_trade_narrative(mock_gpt: AsyncMock):
    """Tests natural language trade narrative generation with content validation."""
    # Configure mock response
    mock_response = AsyncMock()
    mock_response.choices = [
        AsyncMock(
            message=AsyncMock(
                content='{"narrative": "Compelling trade opportunity...", "key_points": []}'
            )
        )
    ]
    mock_response.usage = AsyncMock(total_tokens=1536)
    mock_response.response_ms = 1200
    mock_gpt.ChatCompletion.acreate.return_value = mock_response

    service = GPTService()
    
    # Test narrative generation
    start_time = time.time()
    result = await service.generate_trade_narrative(
        players_offered=MOCK_PLAYERS_OFFERED,
        players_requested=MOCK_PLAYERS_REQUESTED,
        analysis_result={"value_assessment": "Fair trade", "risk_score": 65},
        correlation_id="test-012"
    )
    response_time = time.time() - start_time
    
    # Verify performance
    assert response_time < PERFORMANCE_THRESHOLD
    assert result["processing_time_ms"] < 2000
    
    # Verify narrative content
    assert "narrative" in result["analysis"]
    assert "key_points" in result["analysis"]
    
    # Verify narrative quality metrics
    narrative = result["analysis"]["narrative"]
    assert len(narrative) > 100  # Minimum length check
    assert "..." not in narrative  # No placeholder content
    
    # Verify token usage efficiency
    assert mock_response.usage.total_tokens <= 4096