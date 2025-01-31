# Python 3.11+
from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID
from pydantic import BaseModel, Field, validator, root_validator  # v2.0+
import re

from app.utils.enums import SportType, Platform

class TeamBase(BaseModel):
    """Base Pydantic schema for team data validation with enhanced security checks."""
    
    name: str = Field(
        min_length=3,
        max_length=50,
        description="Team name (3-50 characters)"
    )
    sport: SportType = Field(description="Sport type (NFL, NBA, MLB)")
    platform: Platform = Field(description="Fantasy platform (ESPN, SLEEPER)")
    settings: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Platform-specific team settings"
    )

    @validator('name')
    def validate_name(cls, name: str) -> str:
        """Validates team name with enhanced security checks."""
        # Strip whitespace
        name = name.strip()
        
        # Validate length
        if len(name) < 3:
            raise ValueError("Team name must be at least 3 characters long")
        if len(name) > 50:
            raise ValueError("Team name cannot exceed 50 characters")
            
        # Validate characters (alphanumeric, spaces, and basic punctuation)
        pattern = r'^[a-zA-Z0-9\s\'\-\.]+$'
        if not re.match(pattern, name):
            raise ValueError("Team name contains invalid characters")
            
        # Check for malicious content
        malicious_patterns = [
            r'<[^>]*>',  # HTML tags
            r'javascript:',  # JavaScript injection
            r'data:',  # Data URLs
            r'%[0-9A-Fa-f]{2}'  # URL encoding
        ]
        for pattern in malicious_patterns:
            if re.search(pattern, name, re.IGNORECASE):
                raise ValueError("Team name contains potentially malicious content")
                
        return name

    @root_validator
    def validate_settings(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """Validates team settings structure and content."""
        settings = values.get('settings')
        platform = values.get('platform')
        sport = values.get('sport')

        if not settings:
            return values

        # Platform-specific setting validations
        if platform == Platform.ESPN:
            required_fields = ['leagueId', 'seasonId']
            for field in required_fields:
                if field not in settings:
                    raise ValueError(f"ESPN teams require {field} in settings")
                    
            # Validate ESPN league ID format
            if not str(settings['leagueId']).isdigit():
                raise ValueError("ESPN league ID must be numeric")

        elif platform == Platform.SLEEPER:
            if 'leagueId' not in settings:
                raise ValueError("Sleeper teams require leagueId in settings")
                
            # Validate Sleeper league ID format
            if not isinstance(settings['leagueId'], str):
                raise ValueError("Sleeper league ID must be a string")

        # Remove any sensitive information
        sensitive_fields = ['apiKey', 'secret', 'password', 'token']
        for field in sensitive_fields:
            settings.pop(field, None)

        # Sport-specific setting validations
        if sport == SportType.NFL:
            if 'scoringType' in settings:
                valid_scoring = ['standard', 'ppr', 'half_ppr']
                if settings['scoringType'] not in valid_scoring:
                    raise ValueError("Invalid NFL scoring type")

        return values

class TeamCreate(TeamBase):
    """Schema for team creation with enhanced validation."""
    
    user_id: UUID = Field(description="ID of the team owner")
    platform_credentials: Optional[Dict[str, str]] = Field(
        default=None,
        description="Platform-specific authentication credentials"
    )

    @validator('platform_credentials')
    def validate_credentials(cls, credentials: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
        """Validates platform credentials securely."""
        if not credentials:
            return None

        required_fields = {
            Platform.ESPN: ['swid', 'espnS2'],
            Platform.SLEEPER: ['token']
        }

        platform = getattr(cls, 'platform', None)
        if not platform:
            raise ValueError("Platform must be specified before credentials")

        # Validate required fields
        for field in required_fields[platform]:
            if field not in credentials:
                raise ValueError(f"Missing required credential: {field}")

        # Validate credential formats
        if platform == Platform.ESPN:
            if not re.match(r'^{.*}$', credentials['swid']):
                raise ValueError("Invalid ESPN SWID format")
            if len(credentials['espnS2']) < 32:
                raise ValueError("Invalid ESPN S2 token length")

        return credentials

class TeamUpdate(BaseModel):
    """Schema for secure team updates."""
    
    name: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    platform_credentials: Optional[Dict[str, str]] = None

    @root_validator
    def validate_update(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        """Validates update payload."""
        if not any(values.values()):
            raise ValueError("At least one field must be provided for update")

        # Validate name if provided
        if values.get('name'):
            TeamBase.validate_name(None, values['name'])

        # Validate settings if provided
        if values.get('settings'):
            TeamBase.validate_settings(None, {
                'settings': values['settings'],
                'platform': getattr(cls, 'platform', None),
                'sport': getattr(cls, 'sport', None)
            })

        # Validate credentials if provided
        if values.get('platform_credentials'):
            TeamCreate.validate_credentials(None, values['platform_credentials'])

        return values

class TeamResponse(TeamBase):
    """Schema for secure team API responses with performance metrics."""
    
    id: UUID = Field(description="Unique team identifier")
    user_id: UUID = Field(description="Team owner identifier")
    created_at: datetime = Field(description="Team creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")
    total_points: float = Field(
        default=0.0,
        ge=0.0,
        description="Total team points"
    )
    win_probability: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Calculated win probability"
    )
    performance_metrics: Dict[str, Any] = Field(
        default_factory=dict,
        description="Team performance metrics"
    )

    class Config:
        """Pydantic model configuration."""
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            UUID: lambda v: str(v)
        }