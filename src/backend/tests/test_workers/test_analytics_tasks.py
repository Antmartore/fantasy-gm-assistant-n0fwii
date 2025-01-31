# Python 3.11+
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
import uuid

from app.workers.analytics_tasks import (
    process_user_analytics,
    update_performance_metrics,
    aggregate_sport_analytics,
    track_ai_metrics
)
from app.models.analytics import UserAnalytics, PerformanceMetrics, SportAnalytics, AIMetrics
from app.utils.enums import SportType
from app.core.exceptions import IntegrationError

# Test data constants
TEST_USER_ID = uuid.uuid4()
TEST_SESSION_DATA = {
    'duration': 300,  # 5 minutes
    'features_used': {
        'lineup_optimizer': 5,
        'trade_analyzer': 3,
        'simulation_center': 2
    },
    'actions_performed': 15,
    'platform': 'mobile',
    'timestamp': datetime.utcnow()
}

TEST_PERFORMANCE_DATA = {
    'response_times': [1.5, 1.8, 1.2, 2.1],
    'cpu_usage': 45.5,
    'memory_usage': 2048,
    'error_count': 2,
    'request_count': 1000
}

TEST_SPORT_DATA = {
    'sport_type': SportType.NFL,
    'player_count': 150,
    'trade_volume': 25,
    'position_distribution': {
        'QB': 15,
        'RB': 35,
        'WR': 50,
        'TE': 25,
        'K': 10,
        'DEF': 15
    }
}

TEST_AI_DATA = {
    'accuracy': 0.85,
    'recommendations': 100,
    'acceptance_rate': 0.75,
    'error_patterns': ['data_drift', 'model_bias'],
    'response_time': 1.8,
    'processing_times': [1.5, 1.8, 1.6, 2.0, 1.7]
}

@pytest.fixture
def mock_redis():
    """Fixture for mocking Redis service."""
    with patch('app.workers.analytics_tasks.redis_service') as mock:
        mock.get = AsyncMock()
        mock.set = AsyncMock()
        yield mock

@pytest.fixture
def mock_db():
    """Fixture for mocking database operations."""
    with patch('app.workers.analytics_tasks.db_session') as mock:
        mock.add = MagicMock()
        mock.commit = MagicMock()
        yield mock

@pytest.mark.asyncio
@patch('app.models.analytics.UserAnalytics')
async def test_process_user_analytics(mock_user_analytics, mock_redis, mock_db):
    """Test user analytics processing with comprehensive validation."""
    # Setup mocks
    mock_analytics = MagicMock()
    mock_user_analytics.get_or_create.return_value = mock_analytics
    mock_redis.get.return_value = None

    # Test successful analytics processing
    result = await process_user_analytics(TEST_USER_ID, TEST_SESSION_DATA)

    # Verify analytics updates
    mock_analytics.update_session.assert_called_once_with(
        duration=TEST_SESSION_DATA['duration'],
        features_used=TEST_SESSION_DATA['features_used'],
        is_premium_session=False
    )

    # Verify cache operations
    mock_redis.set.assert_called_once()
    assert result is not None
    assert 'weekly_active_days' in result
    assert 'feature_usage' in result

    # Test cache hit scenario
    mock_redis.get.return_value = {'cached': 'data'}
    cached_result = await process_user_analytics(TEST_USER_ID, TEST_SESSION_DATA)
    assert cached_result == {'cached': 'data'}

    # Test error handling
    mock_redis.get.side_effect = IntegrationError("Redis error")
    with pytest.raises(IntegrationError):
        await process_user_analytics(TEST_USER_ID, TEST_SESSION_DATA)

@pytest.mark.asyncio
@patch('app.models.analytics.PerformanceMetrics')
async def test_update_performance_metrics(mock_perf_metrics, mock_redis, mock_db):
    """Test system performance metrics collection and validation."""
    # Setup mocks
    mock_metrics = MagicMock()
    mock_perf_metrics.return_value = mock_metrics
    mock_redis.get.return_value = TEST_PERFORMANCE_DATA['response_times']

    # Test successful metrics update
    result = await update_performance_metrics()

    # Verify metrics calculations
    assert mock_metrics.cpu_usage == TEST_PERFORMANCE_DATA['cpu_usage']
    assert mock_metrics.memory_usage == TEST_PERFORMANCE_DATA['memory_usage']
    assert mock_metrics.api_requests == TEST_PERFORMANCE_DATA['request_count']

    # Verify response time calculations
    assert 'api_metrics' in result
    assert 'response_times' in result['api_metrics']
    assert result['api_metrics']['request_count'] == TEST_PERFORMANCE_DATA['request_count']

    # Test error handling
    mock_redis.get.side_effect = IntegrationError("Redis error")
    with pytest.raises(IntegrationError):
        await update_performance_metrics()

@pytest.mark.asyncio
@patch('app.models.analytics.SportAnalytics')
async def test_aggregate_sport_analytics(mock_sport_analytics, mock_redis, mock_db):
    """Test sports analytics aggregation across different sports."""
    # Setup mocks
    mock_analytics = MagicMock()
    mock_sport_analytics.return_value = mock_analytics
    mock_redis.get.return_value = None

    # Test successful analytics aggregation
    result = await aggregate_sport_analytics(
        sport_type=TEST_SPORT_DATA['sport_type'],
        analysis_params=TEST_SPORT_DATA
    )

    # Verify analytics calculations
    assert result['sport_type'] == TEST_SPORT_DATA['sport_type']
    assert 'position_distribution' in result
    assert 'team_statistics' in result
    assert 'league_trends' in result

    # Test cache operations
    mock_redis.set.assert_called_once()

    # Test error handling
    mock_redis.set.side_effect = IntegrationError("Redis error")
    with pytest.raises(IntegrationError):
        await aggregate_sport_analytics(
            sport_type=TEST_SPORT_DATA['sport_type'],
            analysis_params=TEST_SPORT_DATA
        )

@pytest.mark.asyncio
@patch('app.models.analytics.AIMetrics')
async def test_track_ai_metrics(mock_ai_metrics, mock_redis, mock_db):
    """Test AI prediction accuracy and recommendation tracking."""
    # Setup mocks
    mock_metrics = MagicMock()
    mock_ai_metrics.return_value = mock_metrics
    mock_redis.get.return_value = None

    # Test successful metrics tracking
    result = await track_ai_metrics(
        prediction_data=TEST_AI_DATA,
        model_type='gpt4'
    )

    # Verify metrics calculations
    assert result['accuracy_metrics']['accuracy'] == TEST_AI_DATA['accuracy']
    assert result['performance_metrics']['mean_processing_time'] > 0
    assert 'error_analysis' in result

    # Verify processing time calculations
    assert 'p95_processing_time' in result['performance_metrics']
    assert 'p99_processing_time' in result['performance_metrics']

    # Test cache operations
    mock_redis.set.assert_called_once()

    # Test error handling
    mock_redis.set.side_effect = IntegrationError("Redis error")
    with pytest.raises(IntegrationError):
        await track_ai_metrics(
            prediction_data=TEST_AI_DATA,
            model_type='gpt4'
        )

    # Test invalid data handling
    with pytest.raises(ValueError):
        await track_ai_metrics(
            prediction_data={'invalid': 'data'},
            model_type='gpt4'
        )