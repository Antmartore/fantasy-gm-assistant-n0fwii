# Python 3.11+
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, validator, HttpUrl  # v2.0+
from app.utils.enums import TradeStatus, Platform as PlatformType

class TradeBase(BaseModel):
    """
    Base Pydantic model for trade data validation with platform-specific validation rules.
    """
    team_from_id: UUID
    team_to_id: UUID
    players_offered: List[UUID]
    players_requested: List[UUID]
    platform: PlatformType
    metadata: Optional[Dict] = None

    @validator('players_offered', 'players_requested')
    def validate_players(cls, players: List[UUID], values: Dict) -> List[UUID]:
        """
        Validates that players exist and belong to respective teams with platform-specific logic.
        """
        if not players:
            raise ValueError("Player list cannot be empty")

        # Platform-specific validation for player counts
        platform = values.get('platform')
        if platform == PlatformType.ESPN:
            if len(players) > 5:  # ESPN max trade players
                raise ValueError("ESPN platform allows maximum 5 players per side in trade")
        elif platform == PlatformType.SLEEPER:
            if len(players) > 10:  # Sleeper max trade players
                raise ValueError("Sleeper platform allows maximum 10 players per side in trade")

        # Ensure no duplicate players
        if len(set(players)) != len(players):
            raise ValueError("Duplicate players are not allowed in trade")

        return players

    @validator('platform')
    def validate_platform(cls, platform: PlatformType) -> PlatformType:
        """
        Validates platform-specific trade rules and constraints.
        """
        if platform not in [PlatformType.ESPN, PlatformType.SLEEPER]:
            raise ValueError("Unsupported platform for trade")
        return platform

    @validator('team_from_id', 'team_to_id')
    def validate_teams(cls, team_id: UUID, values: Dict) -> UUID:
        """
        Validates that teams are different and exist in the same league.
        """
        if 'team_from_id' in values and values['team_from_id'] == team_id:
            raise ValueError("Cannot trade with the same team")
        return team_id

class TradeCreate(TradeBase):
    """
    Pydantic model for trade creation requests with enhanced validation.
    """
    expires_at: Optional[datetime] = None
    trade_notes: Optional[Dict] = None
    counter_offers_allowed: Optional[bool] = True
    status: TradeStatus = TradeStatus.PROPOSED

    @validator('expires_at')
    def validate_expiration(cls, expires_at: Optional[datetime]) -> Optional[datetime]:
        """
        Validates trade expiration time constraints.
        """
        if expires_at:
            now = datetime.utcnow()
            if expires_at <= now:
                raise ValueError("Expiration time must be in the future")
            
            # Maximum 7 days expiration
            max_expiration = now + datetime.timedelta(days=7)
            if expires_at > max_expiration:
                raise ValueError("Trade expiration cannot exceed 7 days")

        return expires_at

    @validator('status')
    def validate_status(cls, status: TradeStatus) -> TradeStatus:
        """
        Validates initial trade status.
        """
        if status != TradeStatus.PROPOSED:
            raise ValueError("New trades must have PROPOSED status")
        return status

class TradeAnalysis(BaseModel):
    """
    Pydantic model for comprehensive trade analysis results.
    """
    risk_score: float
    analysis_summary: str
    value_comparison: Dict
    projected_impact: Dict
    video_url: Optional[HttpUrl] = None
    player_analysis: Dict
    team_impact: Dict
    key_factors: List[str]
    historical_context: Optional[Dict] = None

    @validator('risk_score')
    def validate_risk_score(cls, risk_score: float) -> float:
        """
        Validates risk score is within acceptable range.
        """
        if not 0.0 <= risk_score <= 1.0:
            raise ValueError("Risk score must be between 0.0 and 1.0")
        return round(risk_score, 3)  # Standardize precision

    @validator('video_url')
    def validate_video_url(cls, video_url: Optional[HttpUrl]) -> Optional[HttpUrl]:
        """
        Validates video URL format and accessibility.
        """
        if video_url:
            allowed_domains = ['s3.amazonaws.com', 'fantasy-gm-videos.s3.amazonaws.com']
            if not any(domain in str(video_url) for domain in allowed_domains):
                raise ValueError("Video URL must be from approved storage domains")
        return video_url

    @validator('key_factors')
    def validate_key_factors(cls, factors: List[str]) -> List[str]:
        """
        Validates key factors list constraints.
        """
        if not 1 <= len(factors) <= 5:
            raise ValueError("Must provide between 1 and 5 key factors")
        return factors

    @validator('analysis_summary')
    def validate_summary(cls, summary: str) -> str:
        """
        Validates analysis summary constraints.
        """
        if len(summary) < 50 or len(summary) > 500:
            raise ValueError("Analysis summary must be between 50 and 500 characters")
        return summary