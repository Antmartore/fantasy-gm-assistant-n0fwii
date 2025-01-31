# Python 3.11+
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field, validator  # version: 2.0+

from app.utils.enums import SportType

class UserAnalytics(BaseModel):
    """Schema for user engagement and activity analytics data."""
    id: UUID = Field(..., description="Unique identifier for analytics record")
    user_id: UUID = Field(..., description="User identifier")
    last_login: datetime = Field(..., description="User's last login timestamp")
    login_count: int = Field(ge=0, description="Total number of user logins")
    trades_analyzed: int = Field(ge=0, description="Number of trades analyzed")
    simulations_run: int = Field(ge=0, description="Number of simulations executed")
    lineup_changes: int = Field(ge=0, description="Number of lineup changes made")
    avg_session_duration: float = Field(..., description="Average session duration in minutes")
    feature_usage: Dict[str, int] = Field(default_factory=dict, description="Usage count per feature")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Record creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Record last update timestamp")

    @validator('avg_session_duration')
    def validate_session_duration(cls, value: float) -> float:
        """Validates that average session duration is positive."""
        if value <= 0:
            raise ValueError("Average session duration must be positive")
        return value

class PerformanceMetrics(BaseModel):
    """Schema for system performance monitoring metrics."""
    id: UUID = Field(..., description="Unique identifier for metrics record")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Metrics collection timestamp")
    api_response_time: float = Field(..., description="Average API response time in seconds")
    ai_processing_time: float = Field(..., description="Average AI processing time in seconds")
    active_users: int = Field(ge=0, description="Number of currently active users")
    cpu_usage: float = Field(..., description="CPU usage percentage")
    memory_usage: float = Field(..., description="Memory usage percentage")
    error_count: int = Field(ge=0, description="Number of system errors")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Record creation timestamp")

    @validator('api_response_time', 'cpu_usage', 'memory_usage')
    def validate_metrics(cls, value: float) -> float:
        """Validates that performance metrics are within acceptable ranges."""
        if not 0 <= value <= 100:
            raise ValueError("Metric value must be between 0 and 100")
        return value

class SportAnalytics(BaseModel):
    """Schema for sport-specific analytics data."""
    id: UUID = Field(..., description="Unique identifier for sport analytics")
    sport_type: SportType = Field(..., description="Type of sport")
    total_teams: int = Field(ge=0, description="Total number of teams")
    active_leagues: int = Field(ge=0, description="Number of active leagues")
    position_distribution: Dict[str, int] = Field(
        default_factory=dict,
        description="Distribution of players across positions"
    )
    trade_patterns: Dict[str, float] = Field(
        default_factory=dict,
        description="Analysis of trading patterns and frequencies"
    )
    avg_points_per_team: float = Field(ge=0.0, description="Average points scored per team")
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Record creation timestamp")
    updated_at: datetime = Field(default_factory=datetime.utcnow, description="Record last update timestamp")

class AIMetrics(BaseModel):
    """Schema for AI recommendation and prediction metrics."""
    id: UUID = Field(..., description="Unique identifier for AI metrics")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Metrics collection timestamp")
    prediction_accuracy: float = Field(..., description="Overall prediction accuracy rate")
    recommendations_made: int = Field(ge=0, description="Total number of recommendations made")
    user_acceptance_rate: float = Field(..., description="Rate of user acceptance of recommendations")
    model_performance: Dict[str, float] = Field(
        default_factory=dict,
        description="Performance metrics for different AI models"
    )
    error_distribution: Dict[str, int] = Field(
        default_factory=dict,
        description="Distribution of AI prediction errors by type"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow, description="Record creation timestamp")

    @validator('prediction_accuracy', 'user_acceptance_rate')
    def validate_rates(cls, value: float) -> float:
        """Validates that rates are between 0 and 1."""
        if not 0 <= value <= 1:
            raise ValueError("Rate must be between 0 and 1")
        return value