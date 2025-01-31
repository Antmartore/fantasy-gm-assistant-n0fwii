# Python 3.11+
from datetime import datetime
from typing import Dict, Optional
from uuid import UUID
from pydantic import BaseModel, Field, validator  # v2.0+

from app.utils.enums import SportType, PlayerPosition

class PlayerBase(BaseModel):
    """
    Enhanced base Pydantic model for player data validation with comprehensive stats tracking.
    Supports NFL, NBA, and MLB player data structures with extensive validation.
    """
    name: str = Field(..., min_length=2, max_length=100)
    sport: SportType
    position: PlayerPosition
    team: str = Field(..., min_length=2, max_length=50)
    status: str = Field(
        default="ACTIVE",
        regex="^(ACTIVE|INJURED|SUSPENDED|INACTIVE|PRACTICE_SQUAD)$"
    )
    stats: Dict[str, float] = Field(default_factory=dict)
    projections: Dict[str, float] = Field(default_factory=dict)
    metadata: Dict[str, str] = Field(default_factory=dict)

    @validator('position')
    def validate_sport_position(cls, position: PlayerPosition, values: Dict) -> PlayerPosition:
        """
        Enhanced validation for sport-specific positions with detailed error messages.
        """
        if 'sport' not in values:
            raise ValueError("Sport must be specified before position validation")

        valid_positions = PlayerPosition.get_positions_by_sport(values['sport'])
        if position not in valid_positions:
            raise ValueError(
                f"Invalid position '{position.value}' for sport '{values['sport'].value}'. "
                f"Valid positions are: {[pos.value for pos in valid_positions]}"
            )
        return position

    @validator('stats')
    def validate_stats(cls, stats: Dict[str, float], values: Dict) -> Dict[str, float]:
        """
        Validates stats dictionary structure for sport-specific metrics.
        """
        if 'sport' not in values:
            return stats

        required_stats = {
            SportType.NFL: {'passing_yards', 'rushing_yards', 'touchdowns'},
            SportType.NBA: {'points', 'rebounds', 'assists'},
            SportType.MLB: {'batting_avg', 'home_runs', 'rbis'}
        }

        sport = values['sport']
        missing_stats = required_stats[sport] - set(stats.keys())
        if missing_stats:
            raise ValueError(
                f"Missing required stats for {sport.value}: {missing_stats}"
            )

        # Validate stat value ranges
        for key, value in stats.items():
            if not isinstance(value, (int, float)):
                raise ValueError(f"Stat value for {key} must be numeric")
            if value < 0:
                raise ValueError(f"Stat value for {key} cannot be negative")

        return stats

class PlayerCreate(PlayerBase):
    """
    Schema for creating new player records with external platform integration.
    """
    external_id: str = Field(..., min_length=1, max_length=100)
    platform_metadata: Dict[str, str] = Field(default_factory=dict)

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Patrick Mahomes",
                "sport": "NFL",
                "position": "QB",
                "team": "Kansas City Chiefs",
                "external_id": "PM15_ESPN",
                "platform_metadata": {
                    "espn_id": "12345",
                    "sleeper_id": "67890"
                }
            }
        }

class PlayerUpdate(BaseModel):
    """
    Enhanced schema for updating existing player records with partial updates.
    """
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    team: Optional[str] = Field(None, min_length=2, max_length=50)
    status: Optional[str] = Field(
        None,
        regex="^(ACTIVE|INJURED|SUSPENDED|INACTIVE|PRACTICE_SQUAD)$"
    )
    stats: Optional[Dict[str, float]] = None
    projections: Optional[Dict[str, float]] = None
    metadata: Optional[Dict[str, str]] = None

    class Config:
        json_schema_extra = {
            "example": {
                "status": "INJURED",
                "stats": {
                    "passing_yards": 4839,
                    "touchdowns": 37
                }
            }
        }

class PlayerInDB(PlayerBase):
    """
    Enhanced schema for player records as stored in database with tracking fields.
    """
    id: UUID
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_stats_update: datetime = Field(default_factory=datetime.utcnow)
    last_projection_update: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "name": "Patrick Mahomes",
                "sport": "NFL",
                "position": "QB",
                "team": "Kansas City Chiefs",
                "stats": {
                    "passing_yards": 4839,
                    "rushing_yards": 381,
                    "touchdowns": 37
                },
                "created_at": "2023-01-01T00:00:00Z",
                "updated_at": "2023-01-01T12:00:00Z",
                "last_stats_update": "2023-01-01T12:00:00Z",
                "last_projection_update": "2023-01-01T12:00:00Z"
            }
        }