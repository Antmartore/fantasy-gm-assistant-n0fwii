# Python 3.11+
from typing import Dict, List
from pydantic import BaseSettings, Field, SecretStr, validator  # pydantic v2.0+
from app.utils.enums import SportType

# Global constants
PROJECT_NAME = "Fantasy GM Assistant"
DEBUG = False
API_V1_STR = "/api/v1"
ENV_PREFIX = "FANTASY_GM_"

class Settings(BaseSettings):
    """
    Main configuration settings class with enhanced security, validation, and monitoring capabilities.
    Uses Pydantic for automatic environment variable loading and validation.
    """
    # Core Application Settings
    PROJECT_NAME: str = PROJECT_NAME
    DEBUG: bool = DEBUG
    API_V1_STR: str = API_V1_STR
    SECRET_KEY: SecretStr = Field(..., description="JWT secret key for token signing")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60 * 24, description="JWT token expiration time in minutes")

    # Firebase Authentication
    FIREBASE_PROJECT_ID: SecretStr = Field(..., description="Firebase project identifier")
    FIREBASE_PRIVATE_KEY: SecretStr = Field(..., description="Firebase service account private key")
    FIREBASE_CLIENT_EMAIL: SecretStr = Field(..., description="Firebase service account email")

    # External API Keys
    OPENAI_API_KEY: SecretStr = Field(..., description="OpenAI GPT-4 API key")
    ELEVEN_LABS_API_KEY: SecretStr = Field(..., description="Eleven Labs voice synthesis API key")
    RUNWAY_ML_API_KEY: SecretStr = Field(..., description="RunwayML video generation API key")
    ESPN_API_KEY: SecretStr = Field(..., description="ESPN fantasy sports API key")
    SLEEPER_API_KEY: SecretStr = Field(..., description="Sleeper fantasy sports API key")
    SPORTRADAR_API_KEY: SecretStr = Field(..., description="Sportradar live statistics API key")

    # Infrastructure Settings
    REDIS_URL: str = Field(..., description="Redis cache connection URL")
    AWS_ACCESS_KEY_ID: SecretStr = Field(..., description="AWS access key ID")
    AWS_SECRET_ACCESS_KEY: SecretStr = Field(..., description="AWS secret access key")
    AWS_S3_BUCKET: str = Field(..., description="AWS S3 bucket name for media storage")
    AWS_REGION: str = Field(default="us-east-1", description="AWS region for services")

    # Application Configuration
    SUPPORTED_SPORTS: List[SportType] = Field(
        default=[SportType.NFL, SportType.NBA, SportType.MLB],
        description="List of supported sports leagues"
    )

    # Rate Limiting Settings
    RATE_LIMIT_TEAMS: int = Field(default=100, description="Rate limit for team endpoints per minute")
    RATE_LIMIT_PLAYERS: int = Field(default=200, description="Rate limit for player endpoints per minute")
    RATE_LIMIT_TRADES: int = Field(default=50, description="Rate limit for trade endpoints per minute")
    RATE_LIMIT_SIMULATIONS: int = Field(default=20, description="Rate limit for simulation endpoints per minute")
    RATE_LIMIT_LINEUPS: int = Field(default=100, description="Rate limit for lineup endpoints per minute")

    # Performance Settings
    CACHE_TTL_SECONDS: int = Field(default=900, description="Default cache TTL in seconds (15 minutes)")
    API_TIMEOUT_SECONDS: int = Field(default=30, description="External API request timeout in seconds")
    MAX_RETRIES: int = Field(default=3, description="Maximum retry attempts for external API calls")

    # Monitoring Settings
    LOG_LEVEL: str = Field(default="INFO", description="Application logging level")
    ENABLE_TELEMETRY: bool = Field(default=True, description="Enable application telemetry and monitoring")

    class Config:
        env_prefix = ENV_PREFIX
        case_sensitive = True
        env_file = ".env"
        env_file_encoding = "utf-8"

    @validator("REDIS_URL")
    def validate_redis_url(cls, v: str) -> str:
        """
        Validates Redis URL format and connectivity.
        
        Args:
            v (str): Redis URL to validate
            
        Returns:
            str: Validated Redis URL
            
        Raises:
            ValueError: If URL format is invalid
        """
        if not v.startswith(("redis://", "rediss://")):
            raise ValueError("Redis URL must start with redis:// or rediss://")
        return v

    @validator("AWS_S3_BUCKET")
    def validate_s3_bucket(cls, v: str) -> str:
        """
        Validates S3 bucket name format.
        
        Args:
            v (str): Bucket name to validate
            
        Returns:
            str: Validated bucket name
            
        Raises:
            ValueError: If bucket name format is invalid
        """
        if not v.islower() or not v.replace("-", "").isalnum():
            raise ValueError("S3 bucket name must be lowercase alphanumeric or hyphenated")
        return v

    @validator("*_API_KEY")
    def validate_api_key(cls, v: SecretStr, field: str) -> SecretStr:
        """
        Validates API key format and presence.
        
        Args:
            v (SecretStr): API key to validate
            field (str): Field name being validated
            
        Returns:
            SecretStr: Validated API key
            
        Raises:
            ValueError: If API key is invalid or missing
        """
        key_value = v.get_secret_value()
        if not key_value or len(key_value) < 16:
            raise ValueError(f"{field} must be at least 16 characters long")
        return v

    def get_firebase_credentials(self) -> Dict[str, str]:
        """
        Returns formatted Firebase credentials dictionary with secure handling.
        
        Returns:
            Dict[str, str]: Firebase service account credentials
        """
        return {
            "type": "service_account",
            "project_id": self.FIREBASE_PROJECT_ID.get_secret_value(),
            "private_key": self.FIREBASE_PRIVATE_KEY.get_secret_value(),
            "client_email": self.FIREBASE_CLIENT_EMAIL.get_secret_value(),
        }

# Create settings instance
settings = Settings()