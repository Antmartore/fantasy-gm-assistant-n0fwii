"""Fantasy GM Assistant Schema Models

This module provides centralized access to all Pydantic schema models used for data validation
and serialization throughout the Fantasy GM Assistant backend.

Example:
    from app.schemas import TeamCreate, PlayerUpdate, TradeAnalysis

    # Create a new team
    team_data = TeamCreate(name='Thunder Cats', sport='NFL', platform='ESPN')

    # Update player stats
    player_update = PlayerUpdate(stats={'rushing_yards': 120.5})

    # Analyze trade
    trade_analysis = TradeAnalysis(risk_score=0.85)
"""

# Version 2.0+ of Pydantic
from app.schemas.team import (
    TeamBase,
    TeamCreate,
    TeamUpdate,
    TeamResponse
)

from app.schemas.player import (
    PlayerBase,
    PlayerCreate,
    PlayerUpdate,
    PlayerInDB
)

from app.schemas.trade import (
    TradeBase,
    TradeCreate,
    TradeAnalysis
)

__all__ = [
    # Team schemas
    "TeamBase",
    "TeamCreate", 
    "TeamUpdate",
    "TeamResponse",
    
    # Player schemas
    "PlayerBase",
    "PlayerCreate",
    "PlayerUpdate",
    "PlayerInDB",
    
    # Trade schemas
    "TradeBase",
    "TradeCreate",
    "TradeAnalysis"
]