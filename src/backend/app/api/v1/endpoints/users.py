# Python 3.11+
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi_cache import Cache
from fastapi_cache.decorator import cache

from app.schemas.user import UserBase, UserCreate, UserUpdate, UserResponse
from app.models.user import User
from app.core.security import verify_password, create_access_token
from app.core.middleware import rate_limit, monitor_response_time
from app.core.logging import logger
from app.core.exceptions import AuthenticationError, ValidationError
from app.core.config import settings

# Initialize router with prefix and tags
router = APIRouter(prefix='/users', tags=['users'])

# Constants
RATE_LIMIT_PER_MINUTE = 100
CACHE_TTL_SECONDS = 300

@router.post('/', response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@rate_limit(limit=RATE_LIMIT_PER_MINUTE)
@monitor_response_time
async def register_user(
    request: Request,
    user_data: UserCreate,
    db: Session
) -> UserResponse:
    """
    Register a new user with enhanced security validation.
    
    Args:
        request: FastAPI request object
        user_data: User registration data
        db: Database session
        
    Returns:
        UserResponse: Created user data
        
    Raises:
        ValidationError: If user data is invalid
        AuthenticationError: If registration fails
    """
    logger.info(
        "User registration attempt",
        extra={
            'email': user_data.email,
            'ip_address': request.client.host,
            'correlation_id': request.state.correlation_id
        }
    )

    # Check if email already exists
    if db.query(User).filter(User.email == user_data.email.lower()).first():
        raise ValidationError(
            message="Email already registered",
            error_code=3001,
            details={'field': 'email'}
        )

    try:
        # Create new user instance
        new_user = User(
            email=user_data.email,
            name=user_data.name,
            password=user_data.password
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        logger.info(
            "User registered successfully",
            extra={
                'user_id': str(new_user.id),
                'correlation_id': request.state.correlation_id
            }
        )

        return UserResponse.from_orm(new_user)

    except Exception as e:
        db.rollback()
        logger.error(
            "User registration failed",
            extra={
                'error': str(e),
                'correlation_id': request.state.correlation_id
            }
        )
        raise AuthenticationError(
            message="Registration failed",
            error_code=1001,
            details={'error': str(e)}
        )

@router.post('/login', response_model=dict)
@rate_limit(limit=RATE_LIMIT_PER_MINUTE)
@monitor_response_time
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends()
) -> dict:
    """
    Authenticate user and generate JWT token.
    
    Args:
        request: FastAPI request object
        form_data: OAuth2 form data
        db: Database session
        
    Returns:
        dict: Access token and type
        
    Raises:
        AuthenticationError: If login fails
    """
    user = db.query(User).filter(User.email == form_data.username.lower()).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password, str(user.id)):
        logger.warning(
            "Login failed - invalid credentials",
            extra={
                'email': form_data.username,
                'ip_address': request.client.host,
                'correlation_id': request.state.correlation_id
            }
        )
        raise AuthenticationError(
            message="Invalid credentials",
            error_code=1002
        )

    # Update last login timestamp
    user.update_last_login()
    db.commit()

    # Generate access token
    access_token = create_access_token(
        data={'sub': str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    logger.info(
        "User logged in successfully",
        extra={
            'user_id': str(user.id),
            'correlation_id': request.state.correlation_id
        }
    )

    return {
        'access_token': access_token,
        'token_type': 'bearer'
    }

@router.get('/me', response_model=UserResponse)
@cache(expire=CACHE_TTL_SECONDS)
@monitor_response_time
async def get_current_user(
    request: Request,
    user_id: UUID,
    db: Session = Depends()
) -> UserResponse:
    """
    Get current user profile with caching.
    
    Args:
        request: FastAPI request object
        user_id: Current user ID
        db: Database session
        
    Returns:
        UserResponse: User profile data
        
    Raises:
        HTTPException: If user not found
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return UserResponse.from_orm(user)

@router.put('/me', response_model=UserResponse)
@monitor_response_time
async def update_user(
    request: Request,
    user_data: UserUpdate,
    user_id: UUID,
    db: Session = Depends()
) -> UserResponse:
    """
    Update current user profile.
    
    Args:
        request: FastAPI request object
        user_data: Updated user data
        user_id: Current user ID
        db: Database session
        
    Returns:
        UserResponse: Updated user data
        
    Raises:
        HTTPException: If user not found
        ValidationError: If update data is invalid
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    try:
        # Update user fields
        if user_data.name:
            user.name = user_data.name
        if user_data.password:
            user.hashed_password = user.get_password_hash(user_data.password)

        db.commit()
        db.refresh(user)

        logger.info(
            "User profile updated",
            extra={
                'user_id': str(user.id),
                'correlation_id': request.state.correlation_id
            }
        )

        return UserResponse.from_orm(user)

    except Exception as e:
        db.rollback()
        logger.error(
            "User update failed",
            extra={
                'error': str(e),
                'user_id': str(user_id),
                'correlation_id': request.state.correlation_id
            }
        )
        raise ValidationError(
            message="Update failed",
            error_code=3002,
            details={'error': str(e)}
        )

@router.post('/premium', response_model=UserResponse)
@monitor_response_time
async def upgrade_to_premium(
    request: Request,
    user_id: UUID,
    db: Session = Depends()
) -> UserResponse:
    """
    Upgrade user to premium status.
    
    Args:
        request: FastAPI request object
        user_id: Current user ID
        db: Database session
        
    Returns:
        UserResponse: Updated user data
        
    Raises:
        HTTPException: If user not found
        ValidationError: If upgrade fails
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    try:
        user.upgrade_to_premium()
        db.commit()
        db.refresh(user)

        logger.info(
            "User upgraded to premium",
            extra={
                'user_id': str(user.id),
                'correlation_id': request.state.correlation_id
            }
        )

        return UserResponse.from_orm(user)

    except Exception as e:
        db.rollback()
        logger.error(
            "Premium upgrade failed",
            extra={
                'error': str(e),
                'user_id': str(user_id),
                'correlation_id': request.state.correlation_id
            }
        )
        raise ValidationError(
            message="Upgrade failed",
            error_code=3003,
            details={'error': str(e)}
        )