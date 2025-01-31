# Python 3.11+
from datetime import datetime
from typing import Optional, Pattern
from uuid import UUID

from pydantic import BaseModel, Field, EmailStr, validator, constr, ConfigDict

from app.utils.enums import UserRole

class UserBase(BaseModel):
    """
    Base Pydantic model for user data validation with enhanced security features.
    Implements core user attributes with comprehensive validation.
    """
    email: EmailStr = Field(
        ...,
        description="User's email address",
        examples=["user@example.com"]
    )
    name: str = Field(
        ...,
        min_length=2,
        max_length=50,
        description="User's full name",
        examples=["John Doe"]
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "name": "John Doe"
            }
        },
        validate_assignment=True,
        frozen=False
    )

    @validator('name')
    def validate_name(cls, value: str) -> str:
        """
        Validates user name format with enhanced security rules.
        
        Args:
            value (str): Name to validate
            
        Returns:
            str: Validated name
            
        Raises:
            ValueError: If name format is invalid
        """
        # Strip whitespace
        value = value.strip()
        
        # Check length after stripping
        if not 2 <= len(value) <= 50:
            raise ValueError("Name must be between 2 and 50 characters")
            
        # Validate against pattern for allowed characters
        name_pattern: Pattern = r'^[a-zA-Z\s\-\']+$'
        if not __import__('re').match(name_pattern, value):
            raise ValueError("Name can only contain letters, spaces, hyphens, and apostrophes")
            
        return value

class UserCreate(UserBase):
    """
    Schema for user creation with enhanced password validation.
    Extends UserBase with additional fields required for user creation.
    """
    password: constr(min_length=8, max_length=64) = Field(
        ...,
        description="User's password",
        examples=["StrongP@ssw0rd"]
    )

    @validator('password')
    def validate_password(cls, value: str) -> str:
        """
        Validates password strength with comprehensive security rules.
        
        Args:
            value (str): Password to validate
            
        Returns:
            str: Validated password
            
        Raises:
            ValueError: If password doesn't meet security requirements
        """
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters long")
            
        if not any(c.isupper() for c in value):
            raise ValueError("Password must contain at least one uppercase letter")
            
        if not any(c.islower() for c in value):
            raise ValueError("Password must contain at least one lowercase letter")
            
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one number")
            
        if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in value):
            raise ValueError("Password must contain at least one special character")
            
        # Check against common password patterns
        common_patterns = ['password', '123456', 'qwerty']
        if any(pattern in value.lower() for pattern in common_patterns):
            raise ValueError("Password contains common patterns")
            
        return value

class UserUpdate(UserBase):
    """
    Schema for updating user information with optional fields.
    Allows partial updates of user data.
    """
    name: Optional[str] = Field(
        None,
        min_length=2,
        max_length=50,
        description="Updated user name"
    )
    password: Optional[str] = Field(
        None,
        min_length=8,
        max_length=64,
        description="Updated password"
    )
    is_premium: Optional[bool] = Field(
        None,
        description="Premium user status"
    )

    model_config = ConfigDict(
        validate_assignment=True,
        frozen=False
    )

class UserResponse(UserBase):
    """
    Schema for user data in API responses with role-based information.
    Includes all user fields safe for client exposure.
    """
    id: UUID = Field(
        ...,
        description="Unique user identifier"
    )
    is_premium: bool = Field(
        default=False,
        description="Premium subscription status"
    )
    role: UserRole = Field(
        ...,
        description="User role for authorization"
    )
    created_at: datetime = Field(
        ...,
        description="Account creation timestamp"
    )
    last_login: Optional[datetime] = Field(
        None,
        description="Last login timestamp"
    )
    firebase_uid: Optional[str] = Field(
        None,
        description="Firebase user identifier",
        max_length=128
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "123e4567-e89b-12d3-a456-426614174000",
                "email": "user@example.com",
                "name": "John Doe",
                "is_premium": False,
                "role": "FREE_USER",
                "created_at": "2023-01-01T00:00:00Z",
                "last_login": "2023-01-02T12:00:00Z",
                "firebase_uid": "firebase123"
            }
        },
        from_attributes=True
    )