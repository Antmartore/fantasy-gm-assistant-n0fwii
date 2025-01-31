# Python 3.11+
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import Column, String, Boolean, DateTime, Enum, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base
import re

from app.utils.enums import UserRole
from app.core.security import get_password_hash
from app.core.exceptions import ValidationError

# Initialize SQLAlchemy declarative base
Base = declarative_base()

@Index('idx_user_email', 'email', unique=True)
class User(Base):
    """
    SQLAlchemy model for secure user data persistence and authentication with audit trails.
    Implements role-based access control and GDPR compliance features.
    """
    __tablename__ = 'users'

    # Primary Fields
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(50), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    
    # Access Control
    is_premium = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.FREE_USER)
    
    # Audit Trail
    created_at = Column(DateTime(timezone=True), nullable=False)
    last_login = Column(DateTime(timezone=True))
    deleted_at = Column(DateTime(timezone=True))

    def __init__(self, email: str, name: str, password: str) -> None:
        """
        Initialize user model with secure defaults and validation.

        Args:
            email: User's email address
            name: User's display name
            password: Plain text password for hashing

        Raises:
            ValidationError: If email or password format is invalid
        """
        # Validate email format
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email):
            raise ValidationError(
                message="Invalid email format",
                error_code=3001,
                details={"field": "email"}
            )

        # Validate password complexity
        if len(password) < 8:
            raise ValidationError(
                message="Password must be at least 8 characters long",
                error_code=3002,
                details={"field": "password"}
            )

        # Initialize primary fields
        self.id = uuid4()
        self.email = email.lower()
        self.name = name
        self.hashed_password = get_password_hash(password)

        # Set access control defaults
        self.is_premium = False
        self.is_active = True
        self.role = UserRole.FREE_USER

        # Initialize audit timestamps
        self.created_at = datetime.now(timezone.utc)
        self.last_login = None
        self.deleted_at = None

    def update_last_login(self) -> None:
        """
        Update user's last login timestamp with timezone awareness.
        Used for audit trail and security monitoring.
        """
        self.last_login = datetime.now(timezone.utc)

    def upgrade_to_premium(self) -> None:
        """
        Upgrade user to premium status with role update.
        Validates user state before upgrade.

        Raises:
            ValidationError: If user is not active
        """
        if not self.is_active:
            raise ValidationError(
                message="Cannot upgrade inactive user",
                error_code=3003,
                details={"user_id": str(self.id)}
            )

        self.is_premium = True
        self.role = UserRole.PREMIUM_USER

    def soft_delete(self) -> None:
        """
        Soft delete user record for GDPR compliance.
        Anonymizes personal data while maintaining audit trail.
        """
        self.deleted_at = datetime.now(timezone.utc)
        self.is_active = False
        
        # Anonymize personal data
        self.email = f"deleted_{self.id}@redacted.com"
        self.name = "Deleted User"
        self.hashed_password = get_password_hash(str(uuid4()))

    def __repr__(self) -> str:
        """
        String representation of User model.
        Excludes sensitive information.
        """
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"