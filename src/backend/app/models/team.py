"""
SQLAlchemy model for fantasy sports teams with enhanced validation and performance optimizations.
Provides database schema and relationships for team management across multiple platforms and sports.
"""

# Python 3.11+
from datetime import datetime
from uuid import UUID
from sqlalchemy import Column, String, Integer, Float, JSON, ForeignKey, DateTime, Enum, Index
from sqlalchemy.orm import relationship, validates, DeclarativeBase
from app.utils.enums import SportType, Platform
from app.utils.validators import validate_settings_schema

class Base(DeclarativeBase):
    """Base class for SQLAlchemy models."""
    pass

class Team(Base):
    """
    SQLAlchemy model representing a fantasy sports team with enhanced validation 
    and performance optimizations.
    """
    __tablename__ = 'teams'

    # Primary columns
    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, ForeignKey('users.id'), nullable=False)
    name = Column(String(100), nullable=False)
    sport = Column(Enum(SportType), nullable=False)
    platform = Column(Enum(Platform), nullable=False)
    settings = Column(JSON, nullable=False, default={})
    
    # Performance metrics
    total_points = Column(Float, nullable=False, default=0.0)
    win_probability = Column(Float, nullable=False, default=0.0)
    
    # Timestamps and status
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    is_active = Column(Boolean, nullable=False, default=True)

    # Relationships
    user = relationship("User", back_populates="teams")
    players = relationship("Player", back_populates="team")
    simulations = relationship("Simulation", back_populates="team")

    # Indexes for performance optimization
    __table_args__ = (
        Index('idx_team_user_sport', user_id, sport),
        Index('idx_team_platform', platform),
        Index('idx_team_active', is_active)
    )

    def __init__(self, name: str, sport: SportType, platform: Platform, settings: dict = None):
        """
        Initialize a new Team instance with validation and default values.

        Args:
            name (str): Team name
            sport (SportType): Sport type (NFL, NBA, MLB)
            platform (Platform): Fantasy platform (ESPN, SLEEPER)
            settings (dict, optional): Team-specific settings
        """
        self.name = name
        self.sport = sport
        self.platform = platform
        self.settings = settings or {}
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        self.total_points = 0.0
        self.win_probability = 0.0
        self.is_active = True

    @validates('sport')
    def validate_sport(self, key: str, sport: SportType) -> SportType:
        """Validate sport type against supported leagues."""
        if sport not in [SportType.NFL, SportType.NBA, SportType.MLB]:
            raise ValueError(f"Unsupported sport type: {sport}")
        return sport

    @validates('platform')
    def validate_platform(self, key: str, platform: Platform) -> Platform:
        """Validate platform against supported platforms."""
        if platform not in [Platform.ESPN, Platform.SLEEPER]:
            raise ValueError(f"Unsupported platform: {platform}")
        return platform

    @validates('settings')
    def validate_settings(self, key: str, settings: dict) -> dict:
        """Validate settings JSON schema."""
        if not validate_settings_schema(settings):
            raise ValueError("Invalid team settings schema")
        return settings

    def update_metrics(self, points: float, probability: float) -> None:
        """
        Update team performance metrics with validation.

        Args:
            points (float): Total points scored
            probability (float): Win probability

        Raises:
            ValueError: If metrics are invalid
        """
        if points < 0:
            raise ValueError("Points cannot be negative")
        if not 0 <= probability <= 1:
            raise ValueError("Probability must be between 0 and 1")

        self.total_points = points
        self.win_probability = probability
        self.updated_at = datetime.utcnow()

    def soft_delete(self) -> None:
        """
        Mark team as inactive instead of physical deletion.
        Updates the is_active status and timestamp.
        """
        self.is_active = False
        self.updated_at = datetime.utcnow()

    def __repr__(self) -> str:
        """String representation of Team instance."""
        return f"<Team(id={self.id}, name='{self.name}', sport={self.sport}, platform={self.platform})>"