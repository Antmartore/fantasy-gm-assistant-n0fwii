# Python 3.11+
from typing import Dict, Any, Optional, List, Tuple
import numpy as np  # numpy v1.24+
import pandas as pd  # pandas v2.0+
from sklearn.preprocessing import StandardScaler, RobustScaler  # scikit-learn v1.2+
import redis  # redis v4.5+
import logging
from datetime import datetime

from app.services.sportradar_service import SportradarService
from app.utils.enums import SportType
from app.core.exceptions import ValidationError, IntegrationError
from app.core.logging import get_logger

# Initialize logger
logger = get_logger(__name__)

# Global constants
DATA_CACHE_PREFIX = 'preprocessed_data:'
DATA_CACHE_TTL = 3600  # 1 hour cache TTL
MISSING_VALUE_THRESHOLD = 0.3  # 30% missing values threshold
OUTLIER_THRESHOLD = 3.0  # 3 standard deviations for outlier detection

# Sport-specific validation rules
VALIDATION_RULES = {
    'NFL': {'min_games': 1, 'max_age': 45},
    'NBA': {'min_games': 1, 'max_age': 45},
    'MLB': {'min_games': 1, 'max_age': 45}
}

# Feature scaling ranges by sport
FEATURE_SCALING_RANGES = {
    'NFL': {'yards': [0, 1000], 'touchdowns': [0, 50]},
    'NBA': {'points': [0, 100], 'rebounds': [0, 30]},
    'MLB': {'batting_avg': [0, 1], 'era': [0, 10]}
}

def handle_missing_values(data_df: pd.DataFrame, threshold: float = MISSING_VALUE_THRESHOLD, 
                        strategy: str = 'ffill') -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Enhanced missing value handling with multiple imputation strategies and validation.
    
    Args:
        data_df: Input DataFrame with potential missing values
        threshold: Maximum allowed missing value percentage
        strategy: Imputation strategy ('ffill', 'bfill', 'mean', 'median')
        
    Returns:
        Tuple containing cleaned DataFrame and quality metrics
        
    Raises:
        ValidationError: If data quality thresholds are not met
    """
    if not isinstance(data_df, pd.DataFrame):
        raise ValidationError("Input must be a pandas DataFrame", error_code=3001)
        
    # Calculate missing value metrics
    missing_stats = {
        'initial_missing': data_df.isnull().sum().to_dict(),
        'missing_percentages': (data_df.isnull().sum() / len(data_df)).to_dict()
    }
    
    # Drop columns exceeding threshold
    cols_to_drop = [col for col, pct in missing_stats['missing_percentages'].items() 
                   if pct > threshold]
    if cols_to_drop:
        data_df = data_df.drop(columns=cols_to_drop)
        logger.warning(f"Dropped columns exceeding missing threshold: {cols_to_drop}")
    
    # Apply imputation strategy
    if strategy == 'ffill':
        data_df = data_df.fillna(method='ffill').fillna(method='bfill')
    elif strategy in ['mean', 'median']:
        for col in data_df.select_dtypes(include=[np.number]).columns:
            fill_value = getattr(data_df[col], strategy)()
            data_df[col] = data_df[col].fillna(fill_value)
    
    # Validate results
    remaining_missing = data_df.isnull().sum().sum()
    if remaining_missing > 0:
        raise ValidationError(
            "Unable to handle all missing values",
            error_code=3002,
            details={'remaining_missing': remaining_missing}
        )
    
    # Update quality metrics
    missing_stats['final_missing'] = data_df.isnull().sum().to_dict()
    missing_stats['dropped_columns'] = cols_to_drop
    
    return data_df, missing_stats

def normalize_player_stats(stats_df: pd.DataFrame, sport_type: SportType,
                         handle_outliers: bool = True) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Normalize player statistics with robust scaling and outlier handling.
    
    Args:
        stats_df: DataFrame containing player statistics
        sport_type: Type of sport for specific scaling rules
        handle_outliers: Whether to apply outlier detection and handling
        
    Returns:
        Tuple containing normalized DataFrame and scaling metrics
        
    Raises:
        ValidationError: If validation fails
    """
    if not isinstance(stats_df, pd.DataFrame):
        raise ValidationError("Input must be a pandas DataFrame", error_code=3003)
        
    scaling_metrics = {'outliers': {}, 'scaling_ranges': {}}
    numeric_cols = stats_df.select_dtypes(include=[np.number]).columns
    
    # Initialize scalers
    robust_scaler = RobustScaler(quantile_range=(25.0, 75.0))
    standard_scaler = StandardScaler()
    
    # Handle outliers if requested
    if handle_outliers:
        for col in numeric_cols:
            z_scores = np.abs((stats_df[col] - stats_df[col].mean()) / stats_df[col].std())
            outliers = z_scores > OUTLIER_THRESHOLD
            scaling_metrics['outliers'][col] = outliers.sum()
            
            if outliers.any():
                # Cap outliers at threshold values
                stats_df.loc[outliers, col] = stats_df[col].mean() + (
                    OUTLIER_THRESHOLD * stats_df[col].std() * np.sign(stats_df.loc[outliers, col] - stats_df[col].mean())
                )
    
    # Apply sport-specific scaling
    sport_ranges = FEATURE_SCALING_RANGES.get(sport_type.value, {})
    for col, (min_val, max_val) in sport_ranges.items():
        if col in stats_df.columns:
            stats_df[col] = (stats_df[col] - min_val) / (max_val - min_val)
            scaling_metrics['scaling_ranges'][col] = [min_val, max_val]
    
    # Apply robust scaling to remaining numeric columns
    remaining_cols = [col for col in numeric_cols if col not in sport_ranges]
    if remaining_cols:
        stats_df[remaining_cols] = robust_scaler.fit_transform(stats_df[remaining_cols])
    
    return stats_df, scaling_metrics

class DataPreprocessor:
    """
    Enhanced class for preprocessing sports data with validation and monitoring.
    """
    
    def __init__(self, config: Dict[str, Any], cache_client: redis.Redis) -> None:
        """
        Initialize preprocessing components with enhanced validation.
        
        Args:
            config: Configuration dictionary
            cache_client: Redis cache client
            
        Raises:
            ValidationError: If configuration is invalid
        """
        self._sportradar_service = SportradarService()
        self._scaler = StandardScaler()
        self._robust_scaler = RobustScaler()
        self._cache = cache_client
        self._logger = get_logger(__name__)
        self._validation_rules = VALIDATION_RULES
        
        # Validate configuration
        if not isinstance(config, dict):
            raise ValidationError("Invalid configuration format", error_code=3004)
    
    async def preprocess_player_data(self, player_id: str, sport_type: SportType,
                                   force_refresh: bool = False) -> Dict[str, Any]:
        """
        Preprocess player data with enhanced validation and caching.
        
        Args:
            player_id: Unique player identifier
            sport_type: Type of sport
            force_refresh: Whether to bypass cache
            
        Returns:
            Dictionary containing preprocessed data and quality metrics
            
        Raises:
            ValidationError: If data validation fails
            IntegrationError: If data fetching fails
        """
        cache_key = f"{DATA_CACHE_PREFIX}{sport_type.value}:{player_id}"
        
        # Check cache unless force refresh requested
        if not force_refresh:
            cached_data = self._cache.get(cache_key)
            if cached_data:
                self._logger.debug(f"Cache hit for player {player_id}")
                return {'data': cached_data, 'cached': True}
        
        try:
            # Fetch raw data
            raw_data = await self._sportradar_service.get_player_stats(player_id, sport_type)
            
            # Convert to DataFrame
            stats_df = pd.DataFrame(raw_data['data'])
            
            # Apply validation rules
            sport_rules = self._validation_rules[sport_type.value]
            if len(stats_df) < sport_rules['min_games']:
                raise ValidationError(
                    "Insufficient game data",
                    error_code=3005,
                    details={'min_games': sport_rules['min_games']}
                )
            
            # Handle missing values
            cleaned_df, missing_metrics = handle_missing_values(stats_df)
            
            # Normalize statistics
            normalized_df, scaling_metrics = normalize_player_stats(cleaned_df, sport_type)
            
            # Prepare result
            result = {
                'data': normalized_df.to_dict(orient='records'),
                'metrics': {
                    'missing_data': missing_metrics,
                    'scaling': scaling_metrics,
                    'timestamp': datetime.utcnow().isoformat()
                },
                'cached': False
            }
            
            # Update cache
            self._cache.setex(
                cache_key,
                DATA_CACHE_TTL,
                str(result)
            )
            
            return result
            
        except Exception as e:
            self._logger.error(f"Error preprocessing player data: {str(e)}")
            raise IntegrationError(
                message="Failed to preprocess player data",
                error_code=6005,
                details={'player_id': player_id, 'sport_type': sport_type.value}
            )