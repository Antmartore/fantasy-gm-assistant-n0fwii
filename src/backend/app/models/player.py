# Python 3.11+
from datetime import datetime
from typing import Dict, Optional, List
from uuid import UUID, uuid4

from sqlalchemy import Column, String, Integer, Float, JSON, Enum, DateTime, Index, func
from sqlalchemy.orm import validates  # v2.0+
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID

from app.utils.enums import SportType, PlayerPosition
from app.utils.validators import validate_stats_schema

class Player:
    """
    SQLAlchemy model for comprehensive player data management with support for 
    multiple sports, real-time updates, and historical tracking.
    """
    
    __tablename__ = 'players'

    # Primary Fields
    id = Column(PostgresUUID, primary_key=True, default=uuid4)
    name = Column(String(100), nullable=False)
    external_id = Column(String(50), nullable=False, unique=True)
    sport = Column(Enum(SportType), nullable=False)
    position = Column(Enum(PlayerPosition), nullable=False)
    team = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default='ACTIVE')

    # Stats and Projections
    stats = Column(JSON, nullable=False, default=dict)
    projections = Column(JSON, nullable=False, default=dict)
    historical_stats = Column(JSON, nullable=False, default=list)
    injury_history = Column(JSON, nullable=False, default=list)
    social_sentiment = Column(JSON, nullable=False, default=dict)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, default=func.now(), onupdate=func.now())
    last_game_date = Column(DateTime, nullable=True)

    # Indexes for optimized queries
    __table_args__ = (
        Index('idx_player_sport_position', 'sport', 'position'),
        Index('idx_player_team', 'team'),
        Index('idx_player_status', 'status'),
        Index('idx_player_external_id', 'external_id'),
    )

    def __init__(
        self,
        name: str,
        external_id: str,
        sport: SportType,
        position: PlayerPosition,
        team: str,
        initial_stats: Optional[Dict] = None,
        initial_projections: Optional[Dict] = None
    ):
        """
        Initialize a new Player instance with comprehensive data tracking.

        Args:
            name (str): Player's full name
            external_id (str): External platform identifier
            sport (SportType): Sport type enum value
            position (PlayerPosition): Player position enum value
            team (str): Current team name
            initial_stats (Optional[Dict]): Initial statistics
            initial_projections (Optional[Dict]): Initial projections
        """
        self.name = name
        self.external_id = external_id
        self.sport = sport
        self.position = position
        self.team = team
        self.stats = initial_stats or {}
        self.projections = initial_projections or {}
        self.historical_stats = []
        self.injury_history = []
        self.social_sentiment = {}
        self.status = 'ACTIVE'
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    @validates('position')
    def validate_position(self, key: str, position: PlayerPosition) -> PlayerPosition:
        """Validates position is appropriate for the sport."""
        valid_positions = PlayerPosition.get_positions_by_sport(self.sport)
        if position not in valid_positions:
            raise ValueError(f"Invalid position {position} for sport {self.sport}")
        return position

    @validates('stats')
    def validate_stats(self, key: str, stats: Dict) -> Dict:
        """Validates stats schema matches sport-specific requirements."""
        if not validate_stats_schema(stats, self.sport):
            raise ValueError(f"Invalid stats schema for sport {self.sport}")
        return stats

    @validates('projections')
    def validate_projections(self, key: str, projections: Dict) -> Dict:
        """Validates projections schema matches sport-specific requirements."""
        if not validate_stats_schema(projections, self.sport):
            raise ValueError(f"Invalid projections schema for sport {self.sport}")
        return projections

    def update_stats(self, new_stats: Dict, track_history: bool = True) -> bool:
        """
        Updates player statistics with new data and maintains history.

        Args:
            new_stats (Dict): New statistics to update
            track_history (bool): Whether to track in historical stats

        Returns:
            bool: Success status of the update operation
        """
        try:
            # Validate new stats
            if not validate_stats_schema(new_stats, self.sport):
                return False

            # Archive current stats if tracking history
            if track_history and self.stats:
                historical_entry = {
                    'stats': self.stats.copy(),
                    'timestamp': datetime.utcnow().isoformat(),
                    'game_date': self.last_game_date.isoformat() if self.last_game_date else None
                }
                self.historical_stats.append(historical_entry)

            # Update stats and timestamp
            self.stats.update(new_stats)
            self.updated_at = datetime.utcnow()
            return True
        except Exception:
            return False

    def update_projections(self, new_projections: Dict) -> bool:
        """
        Updates player projections with new data and validation.

        Args:
            new_projections (Dict): New projections to update

        Returns:
            bool: Success status of the update operation
        """
        try:
            # Validate new projections
            if not validate_stats_schema(new_projections, self.sport):
                return False

            # Update projections and timestamp
            self.projections.update(new_projections)
            self.updated_at = datetime.utcnow()
            return True
        except Exception:
            return False

    def get_historical_stats(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict]:
        """
        Retrieves historical statistics with filtering options.

        Args:
            start_date (Optional[datetime]): Start date for filtering
            end_date (Optional[datetime]): End date for filtering

        Returns:
            List[Dict]: List of historical stats entries
        """
        filtered_stats = self.historical_stats

        if start_date:
            filtered_stats = [
                stat for stat in filtered_stats
                if datetime.fromisoformat(stat['timestamp']) >= start_date
            ]

        if end_date:
            filtered_stats = [
                stat for stat in filtered_stats
                if datetime.fromisoformat(stat['timestamp']) <= end_date
            ]

        return filtered_stats

    def __repr__(self) -> str:
        """String representation of the Player instance."""
        return f"<Player {self.name} ({self.sport.value} - {self.position.value})>"