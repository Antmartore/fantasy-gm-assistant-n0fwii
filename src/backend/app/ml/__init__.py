"""
Machine Learning Package Initialization Module
Version: 1.0.0

This module serves as the central hub for AI-powered fantasy sports analysis capabilities,
providing high-performance ML operations including Monte Carlo simulations, predictive
analytics, and trade analysis with sub-2-second response times.
"""

# Python 3.11+
from typing import Dict, Any

# Internal imports with version tracking
from app.ml.monte_carlo import MonteCarloSimulator
from app.ml.predictive_models import (
    PlayerPerformancePredictor,
    TradeAnalyzer
)

# Package version
ML_PACKAGE_VERSION = '1.0.0'

# Export core ML components with proper type hints
__all__ = [
    'MonteCarloSimulator',
    'PlayerPerformancePredictor',
    'TradeAnalyzer',
    'ML_PACKAGE_VERSION'
]

# Initialize default configurations
DEFAULT_CONFIG: Dict[str, Any] = {
    'monte_carlo': {
        'n_simulations': 10000,
        'confidence_interval': 0.95,
        'max_parallel_processes': 4
    },
    'predictive_models': {
        'cache_ttl': 900,  # 15 minutes
        'min_samples': 1000,
        'validation_threshold': 0.85
    },
    'trade_analysis': {
        'risk_threshold': 0.7,
        'value_weight': 0.6,
        'risk_weight': 0.4
    }
}

def get_version() -> str:
    """Returns the current version of the ML package."""
    return ML_PACKAGE_VERSION

def validate_config(config: Dict[str, Any]) -> bool:
    """
    Validates ML package configuration.

    Args:
        config: Configuration dictionary to validate

    Returns:
        bool: True if configuration is valid
    """
    required_keys = {'monte_carlo', 'predictive_models', 'trade_analysis'}
    return all(key in config for key in required_keys)

# Module initialization
def initialize_ml_components(config: Dict[str, Any] = DEFAULT_CONFIG) -> None:
    """
    Initializes ML components with provided configuration.

    Args:
        config: Configuration dictionary for ML components
    """
    if not validate_config(config):
        raise ValueError("Invalid ML configuration provided")

    # Pre-initialize commonly used models for better performance
    MonteCarloSimulator(
        n_processes=config['monte_carlo']['max_parallel_processes']
    )
    PlayerPerformancePredictor(
        model_version=ML_PACKAGE_VERSION
    )
    TradeAnalyzer()

# Version compatibility check
def check_compatibility() -> bool:
    """
    Checks compatibility of all ML components.

    Returns:
        bool: True if all components are compatible
    """
    try:
        # Verify Monte Carlo simulator
        monte_carlo = MonteCarloSimulator()
        
        # Verify predictive models
        predictor = PlayerPerformancePredictor()
        
        # Verify trade analyzer
        analyzer = TradeAnalyzer()
        
        return True
    except Exception:
        return False

# Performance monitoring
def get_performance_metrics() -> Dict[str, Any]:
    """
    Returns performance metrics for ML components.

    Returns:
        Dict containing performance metrics
    """
    return {
        'version': ML_PACKAGE_VERSION,
        'components': {
            'monte_carlo': MonteCarloSimulator.get_metrics(),
            'predictive_models': PlayerPerformancePredictor.get_metrics(),
            'trade_analysis': TradeAnalyzer.get_metrics()
        }
    }