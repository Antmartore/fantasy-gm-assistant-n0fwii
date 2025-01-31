# Python 3.11+
from typing import Dict, List, Optional, Any, Tuple
import numpy as np  # numpy v1.24+
import pandas as pd  # pandas v2.0+
from sklearn.preprocessing import PolynomialFeatures  # scikit-learn v1.2+
from sklearn.feature_selection import SelectKBest, mutual_info_regression  # scikit-learn v1.2+
import joblib  # joblib v1.3+
import redis  # redis v4.5+
import logging
from functools import wraps
from datetime import datetime
import json

from app.ml.data_preprocessing import DataPreprocessor
from app.services.sportradar_service import SportradarService
from app.utils.enums import SportType
from app.core.exceptions import ValidationError, IntegrationError

# Global constants
FEATURE_CACHE_PREFIX = 'engineered_features:'
FEATURE_CACHE_TTL = 3600  # 1 hour cache TTL
MIN_HISTORICAL_GAMES = 10
ROLLING_WINDOW_SIZES = [3, 5, 10]
MAX_POLYNOMIAL_DEGREE = 3
CORRELATION_THRESHOLD = 0.95
FEATURE_VERSION = '2.0.0'
MAX_FEATURES_SELECTED = 50

# Initialize logger
logger = logging.getLogger(__name__)

def validate_input_data(func):
    """Decorator for input data validation with comprehensive checks."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        data = args[1] if len(args) > 1 else kwargs.get('data')
        if not isinstance(data, pd.DataFrame):
            raise ValidationError("Input must be a pandas DataFrame", error_code=3001)
        if data.empty:
            raise ValidationError("Input DataFrame is empty", error_code=3002)
        if data.isnull().sum().sum() > 0:
            raise ValidationError("Input contains missing values", error_code=3003)
        return func(*args, **kwargs)
    return wrapper

def cache_computation(func):
    """Decorator for caching feature computation results."""
    @wraps(func)
    def wrapper(self, *args, **kwargs):
        cache_key = f"{FEATURE_CACHE_PREFIX}{func.__name__}:{hash(str(args))}"
        
        # Try to get from cache
        if hasattr(self, '_cache'):
            cached_result = self._cache.get(cache_key)
            if cached_result:
                return pd.DataFrame(json.loads(cached_result))
        
        # Compute result
        result = func(self, *args, **kwargs)
        
        # Cache result
        if hasattr(self, '_cache'):
            self._cache.setex(
                cache_key,
                FEATURE_CACHE_TTL,
                json.dumps(result.to_dict(orient='records'))
            )
        
        return result
    return wrapper

def feature_version_control(cls):
    """Class decorator for feature version tracking."""
    cls._feature_version = FEATURE_VERSION
    return cls

@feature_version_control
class FeatureEngineer:
    """Advanced feature engineering class with caching, monitoring, and parallel processing."""
    
    def __init__(self, config: Optional[Dict] = None) -> None:
        """Initialize feature engineering components with monitoring."""
        self._preprocessor = DataPreprocessor()
        self._sportradar_service = SportradarService()
        self._poly_features = PolynomialFeatures(degree=MAX_POLYNOMIAL_DEGREE, include_bias=False)
        self._feature_selector = SelectKBest(score_func=mutual_info_regression, k=MAX_FEATURES_SELECTED)
        self._cache = redis.Redis.from_url(config.get('redis_url') if config else "redis://localhost:6379")
        self._logger = logging.getLogger(__name__)
        
        # Load sport-specific feature rules
        self._sport_specific_rules = {
            SportType.NFL: {
                'key_stats': ['passing_yards', 'rushing_yards', 'touchdowns'],
                'interaction_features': ['yards_per_attempt', 'completion_percentage']
            },
            SportType.NBA: {
                'key_stats': ['points', 'rebounds', 'assists'],
                'interaction_features': ['field_goal_percentage', 'minutes_played']
            },
            SportType.MLB: {
                'key_stats': ['batting_average', 'home_runs', 'rbi'],
                'interaction_features': ['on_base_percentage', 'slugging_percentage']
            }
        }

    async def engineer_player_features(self, player_id: str, sport_type: SportType) -> pd.DataFrame:
        """Engineer player features with parallel processing and caching."""
        start_time = datetime.utcnow()
        
        try:
            # Get preprocessed data
            raw_data = await self._sportradar_service.get_player_stats(player_id, sport_type)
            preprocessed_data = await self._preprocessor.preprocess_player_data(raw_data)
            
            if len(preprocessed_data) < MIN_HISTORICAL_GAMES:
                raise ValidationError(
                    f"Insufficient historical data. Minimum required: {MIN_HISTORICAL_GAMES}",
                    error_code=3004
                )
            
            # Parallel feature generation
            with joblib.Parallel(n_jobs=-1) as parallel:
                # Create rolling features
                rolling_features = parallel(
                    joblib.delayed(self._create_rolling_features)(
                        preprocessed_data,
                        window_size,
                        self._sport_specific_rules[sport_type]['key_stats']
                    )
                    for window_size in ROLLING_WINDOW_SIZES
                )
                
                # Merge rolling features
                feature_df = pd.concat([preprocessed_data] + rolling_features, axis=1)
                
                # Create interaction features
                interaction_features = self._create_interaction_features(
                    feature_df,
                    self._sport_specific_rules[sport_type]['interaction_features']
                )
                
                feature_df = pd.concat([feature_df, interaction_features], axis=1)
            
            # Log performance metrics
            duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
            self._logger.info(
                f"Feature engineering completed for player {player_id}",
                extra={
                    'duration_ms': duration_ms,
                    'feature_count': len(feature_df.columns),
                    'sport_type': sport_type.value
                }
            )
            
            return feature_df
            
        except Exception as e:
            self._logger.error(f"Feature engineering failed: {str(e)}")
            raise IntegrationError(
                message="Failed to engineer features",
                error_code=6001,
                details={'player_id': player_id, 'sport_type': sport_type.value}
            )

    @validate_input_data
    @cache_computation
    def _create_rolling_features(self, data: pd.DataFrame, window_size: int,
                               stat_columns: List[str]) -> pd.DataFrame:
        """Create rolling statistical features with validation."""
        rolling_features = pd.DataFrame(index=data.index)
        
        for col in stat_columns:
            if col in data.columns:
                # Calculate rolling statistics
                rolling_features[f"{col}_rolling_mean_{window_size}"] = (
                    data[col].rolling(window=window_size, min_periods=1).mean()
                )
                rolling_features[f"{col}_rolling_std_{window_size}"] = (
                    data[col].rolling(window=window_size, min_periods=1).std()
                )
                rolling_features[f"{col}_rolling_max_{window_size}"] = (
                    data[col].rolling(window=window_size, min_periods=1).max()
                )
                
                # Add exponential weighted features
                rolling_features[f"{col}_ewm_{window_size}"] = (
                    data[col].ewm(span=window_size, min_periods=1).mean()
                )
        
        return rolling_features

    @validate_input_data
    @cache_computation
    def _create_interaction_features(self, data: pd.DataFrame,
                                   interaction_columns: List[str]) -> pd.DataFrame:
        """Create advanced interaction features with polynomial terms."""
        interaction_features = pd.DataFrame(index=data.index)
        
        # Select columns for interaction
        feature_cols = [col for col in data.columns if col in interaction_columns]
        if not feature_cols:
            return interaction_features
            
        # Generate polynomial features
        poly_features = self._poly_features.fit_transform(data[feature_cols])
        feature_names = self._poly_features.get_feature_names_out(feature_cols)
        
        # Create DataFrame with polynomial features
        poly_df = pd.DataFrame(
            poly_features,
            columns=feature_names,
            index=data.index
        )
        
        # Remove highly correlated features
        correlation_matrix = poly_df.corr().abs()
        upper_triangle = correlation_matrix.where(
            np.triu(np.ones(correlation_matrix.shape), k=1).astype(bool)
        )
        to_drop = [
            column for column in upper_triangle.columns
            if any(upper_triangle[column] > CORRELATION_THRESHOLD)
        ]
        
        return poly_df.drop(columns=to_drop)

    def select_important_features(self, features: pd.DataFrame,
                                target: np.ndarray) -> pd.DataFrame:
        """Select features using importance scoring and correlation analysis."""
        # Calculate feature importance scores
        self._feature_selector.fit(features, target)
        
        # Get selected feature mask and scores
        selected_mask = self._feature_selector.get_support()
        importance_scores = self._feature_selector.scores_
        
        # Create DataFrame with feature importance
        feature_importance = pd.DataFrame({
            'feature': features.columns,
            'importance': importance_scores
        })
        feature_importance = feature_importance.sort_values('importance', ascending=False)
        
        # Select top features
        selected_features = features.iloc[:, selected_mask]
        
        self._logger.info(
            "Feature selection completed",
            extra={
                'selected_feature_count': len(selected_features.columns),
                'top_features': feature_importance.head().to_dict()
            }
        )
        
        return selected_features

# Export functions and classes
__all__ = ['FeatureEngineer', 'create_rolling_features', 'create_interaction_features']