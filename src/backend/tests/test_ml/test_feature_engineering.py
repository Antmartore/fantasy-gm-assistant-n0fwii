# Python 3.11+
import pytest
import numpy as np  # numpy v1.24+
import pandas as pd  # pandas v2.0+
from datetime import datetime
from typing import Dict, Any

from app.ml.feature_engineering import FeatureEngineer
from app.utils.enums import SportType

# Test data constants
TEST_PLAYER_DATA = {
    'NFL': {
        'player_id': 'nfl_123',
        'stats': {
            'passing_yards': [300, 250, 275],
            'rushing_yards': [50, 45, 60],
            'touchdowns': [2, 1, 3],
            'completion_percentage': [65.5, 62.3, 68.9],
            'yards_per_attempt': [7.8, 7.2, 8.1]
        }
    },
    'NBA': {
        'player_id': 'nba_456',
        'stats': {
            'points': [20, 25, 18],
            'rebounds': [8, 10, 6],
            'assists': [5, 4, 7],
            'field_goal_percentage': [48.5, 52.1, 45.8],
            'minutes_played': [32, 35, 28]
        }
    },
    'MLB': {
        'player_id': 'mlb_789',
        'stats': {
            'batting_average': [0.300, 0.275, 0.325],
            'home_runs': [1, 0, 2],
            'rbi': [3, 2, 4],
            'on_base_percentage': [0.380, 0.350, 0.400],
            'slugging_percentage': [0.520, 0.480, 0.550]
        }
    }
}

# Performance thresholds
PERFORMANCE_THRESHOLDS = {
    'feature_computation_time': 2.0,  # seconds
    'memory_usage_mb': 512,
    'cache_hit_ratio': 0.8
}

@pytest.mark.usefixtures('mock_services')
class TestFeatureEngineering:
    """Comprehensive test suite for feature engineering module."""

    def setup_method(self):
        """Initialize test environment with monitoring."""
        self._feature_engineer = FeatureEngineer()
        self._cache = {}
        self.start_time = datetime.utcnow()

    @pytest.mark.asyncio
    async def test_engineer_player_features(self, mocker):
        """Test player feature engineering with performance monitoring."""
        for sport_type in SportType:
            # Prepare test data
            player_data = TEST_PLAYER_DATA[sport_type.value]
            mock_stats = pd.DataFrame(player_data['stats'])
            
            # Mock external service calls
            mocker.patch('app.services.sportradar_service.SportradarService.get_player_stats',
                        return_value=mock_stats)

            # Execute feature engineering
            start_time = datetime.utcnow()
            features_df = await self._feature_engineer.engineer_player_features(
                player_data['player_id'],
                sport_type
            )
            duration = (datetime.utcnow() - start_time).total_seconds()

            # Validate performance
            assert duration < PERFORMANCE_THRESHOLDS['feature_computation_time'], \
                f"Feature computation exceeded time threshold for {sport_type}"

            # Validate feature creation
            assert not features_df.empty, f"No features generated for {sport_type}"
            assert features_df.isnull().sum().sum() == 0, f"Missing values in features for {sport_type}"
            
            # Validate memory usage
            memory_usage = features_df.memory_usage().sum() / 1024 / 1024  # Convert to MB
            assert memory_usage < PERFORMANCE_THRESHOLDS['memory_usage_mb'], \
                f"Memory usage exceeded threshold for {sport_type}"

    @pytest.mark.asyncio
    @pytest.mark.parametrize('sport_type', [SportType.NFL, SportType.NBA, SportType.MLB])
    async def test_sport_specific_features(self, sport_type: SportType):
        """Test sport-specific feature generation and validation."""
        # Prepare test data
        player_data = TEST_PLAYER_DATA[sport_type.value]
        test_df = pd.DataFrame(player_data['stats'])

        # Generate features
        features = await self._feature_engineer._create_rolling_features(
            test_df,
            window_size=3,
            stat_columns=self._feature_engineer._sport_specific_rules[sport_type]['key_stats']
        )

        # Validate sport-specific features
        expected_features = {
            SportType.NFL: ['passing_yards', 'rushing_yards', 'touchdowns'],
            SportType.NBA: ['points', 'rebounds', 'assists'],
            SportType.MLB: ['batting_average', 'home_runs', 'rbi']
        }

        for stat in expected_features[sport_type]:
            assert any(stat in col for col in features.columns), \
                f"Missing expected feature {stat} for {sport_type}"

        # Validate feature ranges
        for col in features.columns:
            assert features[col].notna().all(), f"Missing values in {col}"
            if 'percentage' in col.lower():
                assert features[col].between(0, 100).all(), \
                    f"Invalid percentage range in {col}"

    @pytest.mark.asyncio
    @pytest.mark.benchmark
    async def test_create_rolling_features_parallel(self, mocker):
        """Test parallel feature creation with performance monitoring."""
        # Create large test dataset
        large_df = pd.DataFrame(
            np.random.randn(10000, 5),
            columns=['stat1', 'stat2', 'stat3', 'stat4', 'stat5']
        )

        # Mock monitoring service
        mock_monitor = mocker.patch('app.core.monitoring.MonitoringService.record_metric')

        # Execute parallel feature creation
        start_time = datetime.utcnow()
        features = await self._feature_engineer._create_rolling_features(
            large_df,
            window_size=5,
            stat_columns=['stat1', 'stat2', 'stat3']
        )
        duration = (datetime.utcnow() - start_time).total_seconds()

        # Validate performance
        assert duration < PERFORMANCE_THRESHOLDS['feature_computation_time'], \
            "Parallel computation exceeded time threshold"
        assert mock_monitor.called, "Monitoring metrics not recorded"

        # Validate feature quality
        assert features.shape[1] >= 9, "Insufficient features generated"  # 3 stats * 3 rolling features
        assert features.isnull().sum().sum() == 0, "Missing values in parallel features"

    async def test_feature_quality(self):
        """Test feature quality and selection criteria."""
        for sport_type in SportType:
            # Prepare test data
            player_data = TEST_PLAYER_DATA[sport_type.value]
            test_df = pd.DataFrame(player_data['stats'])

            # Generate interaction features
            interaction_features = await self._feature_engineer._create_interaction_features(
                test_df,
                self._feature_engineer._sport_specific_rules[sport_type]['interaction_features']
            )

            # Validate feature quality
            assert not interaction_features.empty, f"No interaction features for {sport_type}"
            assert interaction_features.isnull().sum().sum() == 0, \
                f"Missing values in interaction features for {sport_type}"

            # Check correlation threshold
            if not interaction_features.empty:
                correlation_matrix = interaction_features.corr().abs()
                high_correlation = (correlation_matrix > 0.95).sum().sum()
                assert high_correlation == len(interaction_features.columns), \
                    f"High correlation features not properly filtered for {sport_type}"

            # Validate feature ranges
            for col in interaction_features.columns:
                assert interaction_features[col].notna().all(), \
                    f"Missing values in {col} for {sport_type}"
                if 'percentage' in col.lower():
                    assert interaction_features[col].between(0, 100).all(), \
                        f"Invalid percentage range in {col} for {sport_type}"