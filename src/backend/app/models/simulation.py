# Python 3.11+
from datetime import datetime
from uuid import UUID
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import DeclarativeBase, relationship

from app.utils.enums import SportType

# Simulation status constants
SIMULATION_STATUS = {
    'PENDING': 'pending',
    'RUNNING': 'running',
    'COMPLETED': 'completed',
    'FAILED': 'failed'
}

class Base(DeclarativeBase):
    pass

class Simulation(Base):
    """
    SQLAlchemy model for Monte Carlo simulation data with comprehensive performance tracking.
    Handles storage and retrieval of simulation data for lineup optimization, season predictions,
    and trade analysis with flexible parameter and result storage.
    """
    __tablename__ = 'simulations'

    # Primary key and relationships
    id = Column(String(36), primary_key=True, default=lambda: str(UUID()))
    team_id = Column(String(36), ForeignKey('teams.id'), nullable=False)
    team = relationship("Team", back_populates="simulations")

    # Simulation configuration
    sport_type = Column(String(10), nullable=False)
    weeks_to_simulate = Column(Integer, nullable=False)
    include_injuries = Column(Boolean, default=False)
    include_weather = Column(Boolean, default=False)
    include_matchups = Column(Boolean, default=False)
    include_trades = Column(Boolean, default=False)

    # Flexible storage for additional parameters and results
    parameters = Column(JSON, nullable=False, default=dict)
    results = Column(JSON, nullable=True)

    # Status tracking
    status = Column(String(20), nullable=False, default=SIMULATION_STATUS['PENDING'])
    error_message = Column(String(500), nullable=True)

    # Performance monitoring
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Float, nullable=True)

    def __init__(self):
        """
        Initialize simulation model with default values and timestamp tracking.
        """
        self.status = SIMULATION_STATUS['PENDING']
        self.created_at = datetime.utcnow()
        self.duration_seconds = None
        self.include_injuries = False
        self.include_weather = False
        self.include_matchups = False
        self.include_trades = False
        self.parameters = {}
        self.results = {}
        self.error_message = None

    def to_dict(self) -> dict:
        """
        Convert simulation model to dictionary representation with formatted timestamps.

        Returns:
            dict: Dictionary containing all simulation data with ISO formatted timestamps
        """
        result = {
            'id': str(self.id),
            'team_id': str(self.team_id),
            'sport_type': self.sport_type,
            'weeks_to_simulate': self.weeks_to_simulate,
            'include_injuries': self.include_injuries,
            'include_weather': self.include_weather,
            'include_matchups': self.include_matchups,
            'include_trades': self.include_trades,
            'parameters': self.parameters,
            'results': self.results,
            'status': self.status,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'duration_seconds': round(self.duration_seconds, 3) if self.duration_seconds else None
        }
        
        # Include team data if relationship is loaded
        if hasattr(self, 'team') and self.team:
            result['team'] = self.team.to_dict()
            
        return result

    def update_status(self, new_status: str, error_message: str = None) -> None:
        """
        Update simulation status with validation and performance tracking.

        Args:
            new_status (str): New status to set (must be in SIMULATION_STATUS)
            error_message (str, optional): Error message if simulation failed

        Raises:
            ValueError: If invalid status provided or invalid status transition attempted
        """
        if new_status not in SIMULATION_STATUS.values():
            raise ValueError(f"Invalid status: {new_status}")

        # Validate status transitions
        if self.status == SIMULATION_STATUS['COMPLETED'] and new_status != SIMULATION_STATUS['FAILED']:
            raise ValueError("Cannot update status of completed simulation")
        
        if self.status == SIMULATION_STATUS['FAILED']:
            raise ValueError("Cannot update status of failed simulation")

        self.status = new_status

        # Update completion tracking
        if new_status in [SIMULATION_STATUS['COMPLETED'], SIMULATION_STATUS['FAILED']]:
            self.completed_at = datetime.utcnow()
            if self.created_at:
                self.duration_seconds = (self.completed_at - self.created_at).total_seconds()

        # Update error message if provided
        if error_message:
            self.error_message = error_message[:500]  # Truncate to column length