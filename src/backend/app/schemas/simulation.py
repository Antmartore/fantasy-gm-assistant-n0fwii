# Python 3.11+
from datetime import datetime
from typing import List, Dict, Optional, Any, Literal
from uuid import UUID
from pydantic import BaseModel, Field, validator, ConfigDict  # v2.0+

from app.utils.enums import SportType
from app.schemas.team import TeamResponse

class SimulationBase(BaseModel):
    """Base Pydantic schema for simulation data validation with enhanced performance."""
    
    model_config = ConfigDict(
        frozen=True,  # Immutable for thread safety
        validate_assignment=True,  # Validate on attribute assignment
        extra='forbid'  # Prevent additional fields
    )

    team_id: UUID = Field(
        description="Unique identifier of the team to simulate"
    )
    weeks_to_simulate: int = Field(
        gt=0,
        description="Number of weeks to simulate"
    )
    include_injuries: bool = Field(
        default=True,
        description="Include injury probability in simulation"
    )
    include_weather: bool = Field(
        default=True,
        description="Include weather impact in simulation"
    )
    include_matchups: bool = Field(
        default=True,
        description="Include matchup analysis in simulation"
    )
    include_trades: bool = Field(
        default=False,
        description="Include trade impact in simulation"
    )
    parameters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional simulation parameters"
    )
    sport_type: SportType = Field(
        description="Sport type for simulation validation"
    )

    @validator('weeks_to_simulate')
    def validate_weeks(cls, weeks_to_simulate: int, values: Dict[str, Any]) -> int:
        """Validates number of weeks to simulate based on sport type."""
        sport_type = values.get('sport_type')
        if not sport_type:
            raise ValueError("Sport type must be specified")

        max_weeks = {
            SportType.NFL: 17,
            SportType.NBA: 82,
            SportType.MLB: 26
        }

        if weeks_to_simulate > max_weeks.get(sport_type, 0):
            raise ValueError(
                f"Maximum weeks for {sport_type.value} is {max_weeks[sport_type]}"
            )

        return weeks_to_simulate

class SimulationResult(BaseModel):
    """Schema for individual simulation result with extended metrics."""
    
    model_config = ConfigDict(
        frozen=True,
        validate_assignment=True
    )

    playoff_odds: float = Field(
        ge=0.0,
        le=1.0,
        description="Probability of making playoffs"
    )
    final_record: str = Field(
        regex=r'^\d{1,2}-\d{1,2}(-\d{1,2})?$',
        description="Projected final record (W-L-T format)"
    )
    points_per_week: float = Field(
        ge=0.0,
        description="Average projected points per week"
    )
    weekly_projections: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Week-by-week point projections"
    )
    player_contributions: Dict[str, float] = Field(
        default_factory=dict,
        description="Individual player contribution percentages"
    )
    confidence_intervals: Dict[str, float] = Field(
        default_factory=dict,
        description="Statistical confidence intervals for projections"
    )
    trend_analysis: Dict[str, List[float]] = Field(
        default_factory=dict,
        description="Historical trend analysis data"
    )
    risk_factors: Dict[str, Any] = Field(
        default_factory=dict,
        description="Identified risk factors and their impacts"
    )

class SimulationResponse(BaseModel):
    """Schema for simulation API responses with enhanced tracking."""
    
    model_config = ConfigDict(
        frozen=True,
        validate_assignment=True,
        json_encoders={
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }
    )

    id: UUID = Field(description="Unique simulation identifier")
    team_id: UUID = Field(description="Team identifier")
    created_at: datetime = Field(description="Simulation start timestamp")
    completed_at: Optional[datetime] = Field(
        default=None,
        description="Simulation completion timestamp"
    )
    status: Literal["pending", "running", "completed", "failed"] = Field(
        default="pending",
        description="Current simulation status"
    )
    results: Optional[SimulationResult] = Field(
        default=None,
        description="Simulation results when completed"
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Error message if simulation failed"
    )
    performance_metrics: Optional[Dict[str, float]] = Field(
        default_factory=dict,
        description="Simulation performance tracking metrics"
    )
    debug_info: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Debug information for troubleshooting"
    )

    def __init__(self, **data):
        """Initializes response with tracking fields."""
        super().__init__(**data)
        if not self.created_at:
            self.created_at = datetime.utcnow()
        if not self.performance_metrics:
            self.performance_metrics = {
                "execution_time_ms": 0.0,
                "memory_usage_mb": 0.0,
                "iterations_count": 0
            }