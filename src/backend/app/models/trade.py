"""
SQLAlchemy model for trade management in the Fantasy GM Assistant backend.
Handles trade proposals, analysis, and status tracking between fantasy teams.
"""

# Python 3.11+
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy import Column, ForeignKey, Index, DateTime, Float, String, Boolean
from sqlalchemy.dialects.postgresql import UUID as PGUUID, ARRAY
from sqlalchemy.orm import relationship, validates
from sqlalchemy import Enum

from app.utils.enums import TradeStatus
from app.models.team import Base, Team

class Trade(Base):
    """
    SQLAlchemy model for trade management between fantasy teams with enhanced validation 
    and relationship tracking.
    """
    __tablename__ = 'trades'

    # Primary columns
    id = Column(PGUUID, primary_key=True)
    team_from_id = Column(PGUUID, ForeignKey('teams.id'), nullable=False)
    team_to_id = Column(PGUUID, ForeignKey('teams.id'), nullable=False)
    players_offered = Column(ARRAY(PGUUID), nullable=False)
    players_requested = Column(ARRAY(PGUUID), nullable=False)
    status = Column(Enum(TradeStatus), nullable=False, default=TradeStatus.PROPOSED)
    risk_score = Column(Float, nullable=True)
    analysis_summary = Column(String(1000), nullable=True)
    video_url = Column(String(500), nullable=True)
    
    # Timestamps and status
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    is_deleted = Column(Boolean, nullable=False, default=False)

    # Relationships
    team_from = relationship("Team", foreign_keys=[team_from_id], backref="trades_offered")
    team_to = relationship("Team", foreign_keys=[team_to_id], backref="trades_received")

    # Indexes for performance optimization
    __table_args__ = (
        Index('idx_trade_teams', team_from_id, team_to_id),
        Index('idx_trade_status', status),
        Index('idx_trade_expires', expires_at),
        Index('idx_trade_active', is_deleted)
    )

    def __init__(
        self,
        team_from_id: UUID,
        team_to_id: UUID,
        players_offered: List[UUID],
        players_requested: List[UUID],
        expires_at: Optional[datetime] = None
    ):
        """
        Initialize a new trade instance with enhanced validation.

        Args:
            team_from_id (UUID): ID of team initiating trade
            team_to_id (UUID): ID of team receiving trade
            players_offered (List[UUID]): List of player IDs being offered
            players_requested (List[UUID]): List of player IDs being requested
            expires_at (Optional[datetime]): Trade expiration timestamp
        
        Raises:
            ValueError: If validation fails
        """
        if team_from_id == team_to_id:
            raise ValueError("Cannot create trade between same team")
        
        if not players_offered or not players_requested:
            raise ValueError("Both players_offered and players_requested must not be empty")

        self.team_from_id = team_from_id
        self.team_to_id = team_to_id
        self.players_offered = players_offered
        self.players_requested = players_requested
        self.status = TradeStatus.PROPOSED
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        self.expires_at = expires_at or (datetime.utcnow() + timedelta(hours=24))
        self.is_deleted = False

    @validates('status')
    def validate_status(self, key: str, status: TradeStatus) -> TradeStatus:
        """Validate trade status transitions."""
        if hasattr(self, 'status'):
            current = self.status
            if current.is_final_state():
                raise ValueError(f"Cannot change status from final state: {current}")
        return status

    def update_status(self, new_status: TradeStatus) -> None:
        """
        Updates trade status with validation and audit logging.

        Args:
            new_status (TradeStatus): New trade status

        Raises:
            ValueError: If status transition is invalid
        """
        if self.is_deleted:
            raise ValueError("Cannot update status of deleted trade")

        self.status = new_status
        self.updated_at = datetime.utcnow()

    def update_analysis(
        self,
        risk_score: float,
        analysis_summary: str,
        video_url: Optional[str] = None
    ) -> None:
        """
        Updates trade analysis results with enhanced validation.

        Args:
            risk_score (float): Trade risk assessment score (0.0 to 1.0)
            analysis_summary (str): AI-generated analysis summary
            video_url (Optional[str]): URL to generated analysis video

        Raises:
            ValueError: If validation fails
        """
        if not 0.0 <= risk_score <= 1.0:
            raise ValueError("Risk score must be between 0.0 and 1.0")
        
        if not analysis_summary:
            raise ValueError("Analysis summary cannot be empty")

        if video_url and not video_url.startswith(('http://', 'https://')):
            raise ValueError("Invalid video URL format")

        self.risk_score = risk_score
        self.analysis_summary = analysis_summary
        if video_url:
            self.video_url = video_url
        self.updated_at = datetime.utcnow()

    def soft_delete(self) -> None:
        """
        Marks trade as deleted without removing from database.
        Updates the is_deleted flag and timestamp.
        """
        self.is_deleted = True
        self.updated_at = datetime.utcnow()

    def __repr__(self) -> str:
        """String representation of Trade instance."""
        return (
            f"<Trade(id={self.id}, "
            f"from={self.team_from_id}, "
            f"to={self.team_to_id}, "
            f"status={self.status})>"
        )