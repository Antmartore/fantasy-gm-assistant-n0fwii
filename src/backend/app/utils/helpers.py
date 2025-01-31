"""
Utility helper functions providing common functionality across the Fantasy GM Assistant backend
including data formatting, validation, conversion, and common calculations.
"""

from datetime import datetime
import hashlib
import json
import logging
from typing import Dict, List, Any, Optional, Callable
import numpy as np

from app.utils.constants import (
    CACHE_TTL_PLAYER_STATS,
    CACHE_TTL_WEATHER,
    CACHE_TTL_TRADE_ANALYSIS,
    CACHE_TTL_VIDEO
)
from app.utils.enums import SportType, PlayerPosition, TradeStatus, Platform

# Global position mappings for different sports
POSITION_MAPPINGS = {
    SportType.NFL: {'QB': PlayerPosition.QB, 'RB': PlayerPosition.RB},
    SportType.NBA: {'PG': PlayerPosition.PG, 'SG': PlayerPosition.SG},
    SportType.MLB: {'P': PlayerPosition.P, '1B': PlayerPosition.C1B}
}

# Configure logging
LOGGER = logging.getLogger(__name__)

def generate_cache_key(prefix: str, params: Dict[str, Any]) -> str:
    """
    Generates a secure and unique cache key for storing data.
    
    Args:
        prefix: String prefix for the cache key
        params: Dictionary of parameters to include in key generation
    
    Returns:
        Unique cache key string
    """
    try:
        # Sort parameters for consistency
        sorted_params = dict(sorted(params.items()))
        
        # Convert parameters to string format
        param_str = json.dumps(sorted_params, sort_keys=True)
        
        # Generate SHA-256 hash
        hash_obj = hashlib.sha256(param_str.encode())
        hash_str = hash_obj.hexdigest()
        
        # Combine prefix with hash
        cache_key = f"{prefix}:{hash_str}"
        
        LOGGER.debug(f"Generated cache key: {cache_key}")
        return cache_key
    
    except Exception as e:
        LOGGER.error(f"Error generating cache key: {str(e)}")
        raise

def format_player_stats(raw_stats: Dict[str, Any], sport_type: SportType) -> Dict[str, Any]:
    """
    Formats and validates raw player statistics into standardized format with derived metrics.
    
    Args:
        raw_stats: Dictionary containing raw player statistics
        sport_type: SportType enum indicating the sport
    
    Returns:
        Dictionary containing formatted player statistics with derived metrics
    """
    try:
        # Validate required fields
        required_fields = ['player_id', 'name', 'position']
        if not all(field in raw_stats for field in required_fields):
            raise ValueError("Missing required fields in raw stats")

        # Initialize formatted stats
        formatted_stats = {
            'player_id': raw_stats['player_id'],
            'name': raw_stats['name'],
            'position': POSITION_MAPPINGS[sport_type].get(raw_stats['position'], raw_stats['position']),
            'timestamp': datetime.utcnow().isoformat(),
            'metrics': {}
        }

        # Sport-specific stat formatting
        if sport_type == SportType.NFL:
            formatted_stats['metrics'] = _format_nfl_stats(raw_stats)
        elif sport_type == SportType.NBA:
            formatted_stats['metrics'] = _format_nba_stats(raw_stats)
        elif sport_type == SportType.MLB:
            formatted_stats['metrics'] = _format_mlb_stats(raw_stats)
        
        LOGGER.debug(f"Formatted stats for player {formatted_stats['player_id']}")
        return formatted_stats

    except Exception as e:
        LOGGER.error(f"Error formatting player stats: {str(e)}")
        raise

def calculate_trade_risk(players_offered: List[Dict], players_requested: List[Dict]) -> float:
    """
    Calculates comprehensive risk score for a proposed trade using multiple factors.
    
    Args:
        players_offered: List of player dictionaries being offered
        players_requested: List of player dictionaries being requested
    
    Returns:
        Float between 0 and 1 representing trade risk
    """
    try:
        risk_factors = {
            'injury_history': 0.3,
            'performance_volatility': 0.25,
            'age_factor': 0.15,
            'position_scarcity': 0.2,
            'schedule_difficulty': 0.1
        }
        
        total_risk = 0.0
        
        # Calculate risk for each factor
        for players in [players_offered, players_requested]:
            for player in players:
                # Injury risk calculation
                injury_risk = _calculate_injury_risk(player)
                
                # Performance volatility
                volatility = _calculate_performance_volatility(player)
                
                # Age-based risk
                age_risk = _calculate_age_risk(player)
                
                # Position scarcity
                scarcity_risk = _calculate_position_scarcity(player)
                
                # Schedule difficulty
                schedule_risk = _calculate_schedule_risk(player)
                
                # Weighted risk calculation
                player_risk = (
                    injury_risk * risk_factors['injury_history'] +
                    volatility * risk_factors['performance_volatility'] +
                    age_risk * risk_factors['age_factor'] +
                    scarcity_risk * risk_factors['position_scarcity'] +
                    schedule_risk * risk_factors['schedule_difficulty']
                )
                
                total_risk += player_risk

        # Normalize final risk score between 0 and 1
        final_risk = min(1.0, total_risk / len(players_offered + players_requested))
        
        LOGGER.debug(f"Calculated trade risk: {final_risk}")
        return final_risk

    except Exception as e:
        LOGGER.error(f"Error calculating trade risk: {str(e)}")
        raise

class StatisticsCalculator:
    """
    Advanced statistics calculator with sport-specific implementations and caching.
    """
    
    def __init__(self, cache_ttl: Optional[int] = None):
        """
        Initialize calculator with optional cache TTL.
        
        Args:
            cache_ttl: Optional cache time-to-live in seconds
        """
        self._calculators: Dict[SportType, Dict[str, Callable]] = {}
        self._cache: Dict[str, Any] = {}
        self._cache_ttl = cache_ttl or CACHE_TTL_PLAYER_STATS
        
        # Register sport-specific calculators
        self._register_calculators()
    
    def calculate_advanced_metrics(self, base_stats: Dict[str, Any], sport_type: SportType) -> Dict[str, float]:
        """
        Calculates advanced metrics with caching and validation.
        
        Args:
            base_stats: Dictionary of base statistics
            sport_type: SportType enum indicating the sport
        
        Returns:
            Dictionary of calculated advanced metrics
        """
        try:
            # Generate cache key
            cache_key = generate_cache_key('advanced_metrics', {
                'stats': base_stats,
                'sport': sport_type.value
            })
            
            # Check cache
            if cache_key in self._cache:
                return self._cache[cache_key]
            
            # Get sport-specific calculators
            sport_calculators = self._calculators.get(sport_type, {})
            
            # Calculate metrics
            advanced_metrics = {}
            for metric_name, calculator in sport_calculators.items():
                advanced_metrics[metric_name] = calculator(base_stats)
            
            # Calculate confidence intervals
            confidence_intervals = self._calculate_confidence_intervals(advanced_metrics)
            advanced_metrics['confidence_intervals'] = confidence_intervals
            
            # Cache results
            self._cache[cache_key] = advanced_metrics
            
            LOGGER.debug(f"Calculated advanced metrics for sport {sport_type}")
            return advanced_metrics

        except Exception as e:
            LOGGER.error(f"Error calculating advanced metrics: {str(e)}")
            raise

    def _register_calculators(self):
        """Register sport-specific statistical calculators."""
        # NFL Calculators
        self._calculators[SportType.NFL] = {
            'qbr': self._calculate_qbr,
            'yards_per_attempt': self._calculate_yards_per_attempt,
            'touchdown_rate': self._calculate_touchdown_rate
        }
        
        # NBA Calculators
        self._calculators[SportType.NBA] = {
            'per': self._calculate_per,
            'true_shooting': self._calculate_true_shooting,
            'usage_rate': self._calculate_usage_rate
        }
        
        # MLB Calculators
        self._calculators[SportType.MLB] = {
            'ops': self._calculate_ops,
            'whip': self._calculate_whip,
            'war': self._calculate_war
        }

    def _calculate_confidence_intervals(self, metrics: Dict[str, float]) -> Dict[str, Dict[str, float]]:
        """Calculate confidence intervals for metrics using bootstrapping."""
        confidence_intervals = {}
        for metric, value in metrics.items():
            if isinstance(value, (int, float)):
                # Generate bootstrap samples
                samples = np.random.normal(value, value * 0.1, 1000)
                confidence_intervals[metric] = {
                    'lower': np.percentile(samples, 2.5),
                    'upper': np.percentile(samples, 97.5)
                }
        return confidence_intervals

# Helper functions for format_player_stats
def _format_nfl_stats(stats: Dict[str, Any]) -> Dict[str, Any]:
    """Format NFL-specific statistics."""
    return {
        'passing_yards': stats.get('passing_yards', 0),
        'rushing_yards': stats.get('rushing_yards', 0),
        'touchdowns': stats.get('touchdowns', 0),
        'interceptions': stats.get('interceptions', 0),
        'completion_percentage': stats.get('completion_percentage', 0.0)
    }

def _format_nba_stats(stats: Dict[str, Any]) -> Dict[str, Any]:
    """Format NBA-specific statistics."""
    return {
        'points': stats.get('points', 0),
        'rebounds': stats.get('rebounds', 0),
        'assists': stats.get('assists', 0),
        'steals': stats.get('steals', 0),
        'blocks': stats.get('blocks', 0)
    }

def _format_mlb_stats(stats: Dict[str, Any]) -> Dict[str, Any]:
    """Format MLB-specific statistics."""
    return {
        'batting_average': stats.get('batting_average', 0.0),
        'home_runs': stats.get('home_runs', 0),
        'rbis': stats.get('rbis', 0),
        'stolen_bases': stats.get('stolen_bases', 0),
        'era': stats.get('era', 0.0)
    }

# Helper functions for calculate_trade_risk
def _calculate_injury_risk(player: Dict) -> float:
    """Calculate injury risk based on player history."""
    injury_history = player.get('injury_history', [])
    recent_injuries = [i for i in injury_history if i['date'] > datetime.now().year - 2]
    return min(1.0, len(recent_injuries) * 0.2)

def _calculate_performance_volatility(player: Dict) -> float:
    """Calculate performance volatility using standard deviation."""
    performances = player.get('recent_performances', [])
    if not performances:
        return 0.5
    return min(1.0, np.std(performances) / 100)

def _calculate_age_risk(player: Dict) -> float:
    """Calculate age-based risk factor."""
    age = player.get('age', 25)
    return min(1.0, max(0.0, (age - 26) * 0.1))

def _calculate_position_scarcity(player: Dict) -> float:
    """Calculate risk based on position scarcity."""
    position_scarcity_map = {
        PlayerPosition.QB: 0.8,
        PlayerPosition.RB: 0.7,
        PlayerPosition.WR: 0.5,
        PlayerPosition.TE: 0.6
    }
    return position_scarcity_map.get(player.get('position'), 0.5)

def _calculate_schedule_risk(player: Dict) -> float:
    """Calculate risk based on upcoming schedule difficulty."""
    schedule_difficulty = player.get('schedule_difficulty', 0.5)
    return min(1.0, schedule_difficulty)