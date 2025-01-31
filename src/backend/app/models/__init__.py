"""
Initializes and exports SQLAlchemy models for the Fantasy GM Assistant backend.
Provides thread-safe model initialization and proper relationship management.
Ensures proper metadata configuration and type safety across the application.

Version: SQLAlchemy 2.0+
"""

from typing import Dict, Any

from sqlalchemy import MetaData
from sqlalchemy.orm import declarative_base  # v2.0+

from app.models.team import Team
from app.models.player import Player
from app.models.simulation import Simulation

# Configure naming convention for database constraints and indexes
# This ensures consistent naming across migrations and database operations
NAMING_CONVENTION: Dict[str, Any] = {
    "ix": "ix_%(column_0_label)s",  # Index
    "uq": "uq_%(table_name)s_%(column_0_name)s",  # Unique constraint
    "ck": "ck_%(table_name)s_%(constraint_name)s",  # Check constraint
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",  # Foreign key
    "pk": "pk_%(table_name)s"  # Primary key
}

# Initialize SQLAlchemy metadata with naming convention
metadata = MetaData(naming_convention=NAMING_CONVENTION)

# Create the declarative base class with configured metadata
# This provides thread-safe model initialization and consistent naming
Base = declarative_base(metadata=metadata)

# Export models for use throughout the application
__all__ = [
    'Base',
    'Team',
    'Player',
    'Simulation'
]