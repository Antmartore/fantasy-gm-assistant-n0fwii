"""
Enhanced Pydantic schemas for lineup data validation and serialization with comprehensive
sport-specific rules and validations for the Fantasy GM Assistant backend.
"""

# Python 3.11+
from datetime import datetime
from typing import Dict, List, Optional, Any
from uuid import UUID

from pydantic import BaseModel, Field, validator, root_validator

from app.utils.enums import SportType, PlayerPosition
from app.utils.validators import SportValidator

# Initialize validator with default cache TTL
sport_validator = SportValidator()

class LineupBase(BaseModel):
    """
    Enhanced base Pydantic model for lineup data validation with comprehensive
    sport-specific rules and position validations.
    """
    team_id: UUID = Field(..., description="Unique identifier of the team")
    sport: SportType = Field(..., description="Sport type (NFL, NBA, MLB)")
    week: int = Field(..., ge=1, le=53, description="Week number for the lineup")
    slots: Dict[PlayerPosition, UUID] = Field(
        ..., 
        description="Mapping of lineup positions to player IDs"
    )
    bench: List[UUID] = Field(
        default=[],
        max_items=15,
        description="List of benched player IDs"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional lineup metadata like weather conditions, injuries etc."
    )

    @validator("sport")
    def validate_sport(cls, v: SportType) -> SportType:
        """
        Enhanced sport type validation with detailed error messages.
        
        Args:
            v (SportType): Sport type to validate
            
        Returns:
            SportType: Validated sport type
            
        Raises:
            ValueError: If sport type is invalid
        """
        is_valid, error_msg = sport_validator.validate_sport(v)
        if not is_valid:
            raise ValueError(error_msg)
        return v

    @validator("slots")
    def validate_slots(cls, v: Dict[PlayerPosition, UUID], values: dict) -> Dict[PlayerPosition, UUID]:
        """
        Enhanced lineup slot validation with comprehensive sport-specific rules.
        
        Args:
            v (Dict[PlayerPosition, UUID]): Position to player mappings
            values (dict): Previously validated values
            
        Returns:
            Dict[PlayerPosition, UUID]: Validated slot assignments
            
        Raises:
            ValueError: If slot assignments are invalid
        """
        if "sport" not in values:
            raise ValueError("Sport type must be provided before validating slots")

        sport = values["sport"]
        required_positions = {
            SportType.NFL: [
                PlayerPosition.QB,
                PlayerPosition.RB,
                PlayerPosition.WR,
                PlayerPosition.TE
            ],
            SportType.NBA: [
                PlayerPosition.PG,
                PlayerPosition.SG,
                PlayerPosition.SF,
                PlayerPosition.PF,
                PlayerPosition.C
            ],
            SportType.MLB: [
                PlayerPosition.P,
                PlayerPosition.C1B,
                PlayerPosition.C2B,
                PlayerPosition.C3B,
                PlayerPosition.SS,
                PlayerPosition.OF
            ]
        }

        # Validate required positions
        missing_positions = set(required_positions[sport]) - set(v.keys())
        if missing_positions:
            raise ValueError(f"Missing required positions: {missing_positions}")

        # Validate position eligibility
        for position, player_id in v.items():
            is_valid, error_msg = sport_validator.validate_position(sport, position)
            if not is_valid:
                raise ValueError(error_msg)

        # Validate roster size limits
        max_players = {
            SportType.NFL: 9,  # QB, 2RB, 2WR, TE, K, DEF, FLEX
            SportType.NBA: 5,  # PG, SG, SF, PF, C
            SportType.MLB: 9   # P, C1B, C2B, C3B, SS, 3OF, DH
        }
        if len(v) > max_players[sport]:
            raise ValueError(f"Exceeded maximum players ({max_players[sport]}) for {sport}")

        return v

    @validator("bench")
    def validate_bench(cls, v: List[UUID], values: dict) -> List[UUID]:
        """
        Enhanced validation for bench players with sport-specific limits.
        
        Args:
            v (List[UUID]): List of benched player IDs
            values (dict): Previously validated values
            
        Returns:
            List[UUID]: Validated bench players
            
        Raises:
            ValueError: If bench validation fails
        """
        if "sport" not in values:
            raise ValueError("Sport type must be provided before validating bench")

        max_bench = {
            SportType.NFL: 7,
            SportType.NBA: 5,
            SportType.MLB: 5
        }

        if len(v) > max_bench[values["sport"]]:
            raise ValueError(f"Exceeded maximum bench players ({max_bench[values['sport']]}) for {values['sport']}")

        # Check for duplicates
        if len(v) != len(set(v)):
            raise ValueError("Duplicate players found on bench")

        return v

    class Config:
        """Pydantic model configuration."""
        json_encoders = {
            UUID: str
        }
        schema_extra = {
            "example": {
                "team_id": "123e4567-e89b-12d3-a456-426614174000",
                "sport": "NFL",
                "week": 1,
                "slots": {
                    "QB": "123e4567-e89b-12d3-a456-426614174001",
                    "RB": "123e4567-e89b-12d3-a456-426614174002"
                },
                "bench": ["123e4567-e89b-12d3-a456-426614174003"],
                "metadata": {
                    "weather": "Clear",
                    "temperature": 72
                }
            }
        }

class LineupCreate(LineupBase):
    """
    Schema for creating new lineup with enhanced validation and optional settings.
    """
    settings: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional lineup creation settings"
    )

class LineupUpdate(BaseModel):
    """
    Schema for updating existing lineup with partial updates support.
    """
    slots: Optional[Dict[PlayerPosition, UUID]] = None
    bench: Optional[List[UUID]] = None
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        """Pydantic model configuration."""
        json_encoders = {
            UUID: str
        }

class LineupResponse(LineupBase):
    """
    Enhanced schema for lineup API responses with comprehensive statistics
    and optimization results.
    """
    id: UUID = Field(..., description="Unique lineup identifier")
    total_points: float = Field(
        default=0.0,
        ge=0.0,
        description="Total points scored by lineup"
    )
    projected_points: float = Field(
        default=0.0,
        ge=0.0,
        description="Projected points for lineup"
    )
    position_scores: Dict[str, float] = Field(
        default_factory=dict,
        description="Breakdown of points by position"
    )
    optimization_results: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Results from lineup optimization"
    )
    created_at: datetime = Field(..., description="Lineup creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")