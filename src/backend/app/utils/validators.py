"""
Enhanced validation utilities module providing comprehensive validation functions, decorators, 
and Pydantic models for data validation across the Fantasy GM Assistant backend.
"""

# Python 3.11+
import re
import logging
from typing import Dict, List, Set, Tuple, Optional
from dataclasses import dataclass
from datetime import datetime
from cachetools import TTLCache, cached  # v5.0+
from pydantic import BaseModel, Field, validator  # v2.0+

from app.utils.enums import SportType, PlayerPosition
from app.utils.constants import MAX_TRADE_PLAYERS, MAX_LINEUP_CHANGES

# Configure logging
logger = logging.getLogger(__name__)

# Global regex patterns for validation
EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
USERNAME_REGEX = r'^[a-zA-Z0-9_-]{3,20}$'
PASSWORD_REGEX = r'^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$'

# Cache configuration
VALIDATION_CACHE_TTL = 300  # 5 minutes

@cached(cache=TTLCache(maxsize=1000, ttl=VALIDATION_CACHE_TTL))
def validate_email(email: str) -> Tuple[bool, str]:
    """
    Validates email format using regex pattern with enhanced error handling.
    
    Args:
        email (str): Email address to validate
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    try:
        email = email.strip().lower()
        if not email:
            return False, "Email cannot be empty"
            
        if not re.match(EMAIL_REGEX, email):
            return False, "Invalid email format"
            
        return True, ""
    except Exception as e:
        logger.error(f"Email validation error: {str(e)}")
        return False, "Email validation failed"

@cached(cache=TTLCache(maxsize=1000, ttl=VALIDATION_CACHE_TTL))
def validate_username(username: str) -> Tuple[bool, str]:
    """
    Validates username format using regex pattern with enhanced error handling.
    
    Args:
        username (str): Username to validate
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    try:
        username = username.strip()
        if not username:
            return False, "Username cannot be empty"
            
        if not re.match(USERNAME_REGEX, username):
            return False, "Username must be 3-20 characters and contain only letters, numbers, underscores, and hyphens"
            
        return True, ""
    except Exception as e:
        logger.error(f"Username validation error: {str(e)}")
        return False, "Username validation failed"

def validate_trade_players(player_ids: List[str], sport_type: SportType) -> Tuple[bool, str]:
    """
    Validates trade proposal players with enhanced checks.
    
    Args:
        player_ids (List[str]): List of player IDs involved in trade
        sport_type (SportType): Sport type for validation rules
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    try:
        if not player_ids:
            return False, "No players specified in trade"
            
        if len(player_ids) > MAX_TRADE_PLAYERS:
            return False, f"Maximum {MAX_TRADE_PLAYERS} players allowed per trade"
            
        # Validate player IDs format
        for player_id in player_ids:
            if not isinstance(player_id, str) or not player_id.strip():
                return False, "Invalid player ID format"
                
        # Sport-specific validation
        if sport_type not in SportType:
            return False, f"Unsupported sport type: {sport_type}"
            
        return True, ""
    except Exception as e:
        logger.error(f"Trade players validation error: {str(e)}")
        return False, "Trade players validation failed"

@dataclass
class SportValidator:
    """
    Enhanced validator class for sport-related data validation with caching.
    """
    
    def __init__(self, cache_ttl: int = VALIDATION_CACHE_TTL):
        """
        Initialize sport validator with caching support.
        
        Args:
            cache_ttl (int): Cache TTL in seconds
        """
        self._valid_positions: Dict[SportType, Set[PlayerPosition]] = {
            SportType.NFL: {
                PlayerPosition.QB, PlayerPosition.RB, PlayerPosition.WR,
                PlayerPosition.TE, PlayerPosition.K, PlayerPosition.DEF
            },
            SportType.NBA: {
                PlayerPosition.PG, PlayerPosition.SG, PlayerPosition.SF,
                PlayerPosition.PF, PlayerPosition.C
            },
            SportType.MLB: {
                PlayerPosition.P, PlayerPosition.C1B, PlayerPosition.C2B,
                PlayerPosition.C3B, PlayerPosition.SS, PlayerPosition.OF,
                PlayerPosition.DH
            }
        }
        self._validation_cache = TTLCache(maxsize=1000, ttl=cache_ttl)

    def validate_sport(self, sport_type: SportType) -> Tuple[bool, str]:
        """
        Validates sport type with enhanced error handling.
        
        Args:
            sport_type (SportType): Sport type to validate
            
        Returns:
            Tuple[bool, str]: (is_valid, error_message)
        """
        cache_key = f"sport_{sport_type}"
        if cache_key in self._validation_cache:
            return self._validation_cache[cache_key]
            
        try:
            if sport_type not in SportType:
                result = (False, f"Unsupported sport type: {sport_type}")
            else:
                result = (True, "")
                
            self._validation_cache[cache_key] = result
            return result
        except Exception as e:
            logger.error(f"Sport validation error: {str(e)}")
            return False, "Sport validation failed"

    def validate_position(self, sport_type: SportType, position: PlayerPosition) -> Tuple[bool, str]:
        """
        Enhanced position validation with sport-specific rules.
        
        Args:
            sport_type (SportType): Sport type for position validation
            position (PlayerPosition): Position to validate
            
        Returns:
            Tuple[bool, str]: (is_valid, error_message)
        """
        cache_key = f"position_{sport_type}_{position}"
        if cache_key in self._validation_cache:
            return self._validation_cache[cache_key]
            
        try:
            # Validate sport type first
            sport_valid, sport_error = self.validate_sport(sport_type)
            if not sport_valid:
                return False, sport_error
                
            # Validate position for sport
            if position not in self._valid_positions[sport_type]:
                result = (False, f"Invalid position {position} for sport {sport_type}")
            else:
                result = (True, "")
                
            self._validation_cache[cache_key] = result
            return result
        except Exception as e:
            logger.error(f"Position validation error: {str(e)}")
            return False, "Position validation failed"

# Pydantic models for request/response validation
class BaseValidationModel(BaseModel):
    """Base model with common validation settings."""
    class Config:
        arbitrary_types_allowed = True
        validate_assignment = True
        extra = "forbid"

class PlayerValidationModel(BaseValidationModel):
    """Player data validation model."""
    id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    position: PlayerPosition
    sport_type: SportType

    @validator("id")
    def validate_player_id(cls, v):
        if not v.strip():
            raise ValueError("Player ID cannot be empty")
        return v.strip()

class TradeValidationModel(BaseValidationModel):
    """Trade data validation model."""
    players_offered: List[str] = Field(..., max_items=MAX_TRADE_PLAYERS)
    players_requested: List[str] = Field(..., max_items=MAX_TRADE_PLAYERS)
    sport_type: SportType

    @validator("players_offered", "players_requested")
    def validate_player_lists(cls, v):
        if not v:
            raise ValueError("Player list cannot be empty")
        return v