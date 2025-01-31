"""
SQLAlchemy models for comprehensive analytics tracking in the Fantasy Sports GM Assistant.
Provides models for user engagement metrics, system performance monitoring, and AI processing analytics.

Version: SQLAlchemy 1.4+
"""

from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, JSON, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID

from app.models import Base
from app.utils.enums import SportType

class UserAnalytics(Base):
    """SQLAlchemy model for comprehensive user engagement and activity tracking."""
    
    __tablename__ = 'user_analytics'

    # Primary key and relationships
    id = Column(PostgresUUID, primary_key=True, default=uuid4)
    user_id = Column(PostgresUUID, ForeignKey('users.id'), nullable=False)

    # Engagement metrics
    last_login = Column(DateTime, nullable=False)
    weekly_active_days = Column(Integer, nullable=False, default=0)
    monthly_active_days = Column(Integer, nullable=False, default=0)
    total_sessions = Column(Integer, nullable=False, default=0)
    avg_session_duration = Column(Float, nullable=False, default=0.0)

    # Feature usage metrics
    trades_analyzed = Column(Integer, nullable=False, default=0)
    simulations_run = Column(Integer, nullable=False, default=0)
    lineup_changes = Column(Integer, nullable=False, default=0)

    # Detailed tracking
    feature_usage = Column(JSON, nullable=False, default=dict)
    premium_interactions = Column(JSON, nullable=False, default=dict)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self, user_id: UUID):
        """
        Initialize a new UserAnalytics record with default values.

        Args:
            user_id (UUID): Associated user ID
        """
        self.id = uuid4()
        self.user_id = user_id
        self.last_login = datetime.utcnow()
        self.weekly_active_days = 0
        self.monthly_active_days = 0
        self.total_sessions = 0
        self.avg_session_duration = 0.0
        self.trades_analyzed = 0
        self.simulations_run = 0
        self.lineup_changes = 0
        self.feature_usage = {}
        self.premium_interactions = {}
        self.created_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def update_session(self, duration: float, features_used: dict, is_premium_session: bool) -> None:
        """
        Updates session-related metrics and engagement data.

        Args:
            duration (float): Session duration in seconds
            features_used (dict): Dictionary of features used in session
            is_premium_session (bool): Whether session used premium features
        """
        # Update session metrics
        self.last_login = datetime.utcnow()
        self.total_sessions += 1
        
        # Update average session duration
        total_duration = (self.avg_session_duration * (self.total_sessions - 1)) + duration
        self.avg_session_duration = total_duration / self.total_sessions

        # Update active days tracking
        current_date = datetime.utcnow().date()
        week_start = current_date - datetime.timedelta(days=current_date.weekday())
        month_start = current_date.replace(day=1)

        if self.last_login.date() >= week_start:
            self.weekly_active_days += 1
        if self.last_login.date() >= month_start:
            self.monthly_active_days += 1

        # Update feature usage tracking
        for feature, count in features_used.items():
            if feature not in self.feature_usage:
                self.feature_usage[feature] = 0
            self.feature_usage[feature] += count

        # Update premium interactions if applicable
        if is_premium_session:
            session_data = {
                "timestamp": datetime.utcnow().isoformat(),
                "duration": duration,
                "features_used": features_used
            }
            if "sessions" not in self.premium_interactions:
                self.premium_interactions["sessions"] = []
            self.premium_interactions["sessions"].append(session_data)

        self.updated_at = datetime.utcnow()

class PerformanceMetrics(Base):
    """SQLAlchemy model for detailed system performance monitoring."""
    
    __tablename__ = 'performance_metrics'

    # Primary key and timestamp
    id = Column(PostgresUUID, primary_key=True, default=uuid4)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Response time metrics
    api_response_time = Column(Float, nullable=False, default=0.0)
    ai_processing_time = Column(Float, nullable=False, default=0.0)

    # System metrics
    concurrent_users = Column(Integer, nullable=False, default=0)
    cpu_usage = Column(Float, nullable=False, default=0.0)
    memory_usage = Column(Float, nullable=False, default=0.0)
    api_requests = Column(Integer, nullable=False, default=0)
    error_count = Column(Integer, nullable=False, default=0)

    # Detailed metrics
    endpoint_latencies = Column(JSON, nullable=False, default=dict)
    error_distribution = Column(JSON, nullable=False, default=dict)

    # Creation timestamp
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __init__(self):
        """Initialize a new PerformanceMetrics record."""
        self.id = uuid4()
        self.timestamp = datetime.utcnow()
        self.api_response_time = 0.0
        self.ai_processing_time = 0.0
        self.concurrent_users = 0
        self.cpu_usage = 0.0
        self.memory_usage = 0.0
        self.api_requests = 0
        self.error_count = 0
        self.endpoint_latencies = {}
        self.error_distribution = {}
        self.created_at = datetime.utcnow()