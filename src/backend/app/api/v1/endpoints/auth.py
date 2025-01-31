# Python 3.11+
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, status, Security, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm, SecurityScopes
from fastapi_limiter import RateLimiter

from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    validate_token,
    blacklist_token
)
from app.schemas.user import (
    UserCreate,
    UserResponse,
    UserUpdate,
    TokenResponse,
    PasswordReset
)
from app.services.firebase_service import FirebaseService
from app.core.logging import AuditLogger
from app.core.exceptions import AuthenticationError, ValidationError

# Initialize router with prefix and tags
router = APIRouter(prefix='/auth', tags=['Authentication'])

# Initialize OAuth2 scheme with scopes
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl='auth/login',
    scopes={
        'free': 'Free user access',
        'premium': 'Premium user access',
        'admin': 'Admin access'
    }
)

# Initialize services
firebase_service = FirebaseService()
audit_logger = AuditLogger()

# Rate limiters
register_limiter = RateLimiter(calls=5, period=300)  # 5 calls per 5 minutes
login_limiter = RateLimiter(calls=10, period=60)     # 10 calls per minute
refresh_limiter = RateLimiter(calls=20, period=60)   # 20 calls per minute

@router.post('/register', response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@register_limiter
async def register(user_data: UserCreate, request: Request) -> UserResponse:
    """
    Register a new user with secure password hashing and Firebase integration.
    
    Args:
        user_data: User registration data
        request: FastAPI request object
        
    Returns:
        UserResponse: Created user data with access token
        
    Raises:
        ValidationError: If registration data is invalid
        AuthenticationError: If registration fails
    """
    try:
        # Validate email uniqueness
        existing_user = await firebase_service.get_document(
            collection='users',
            doc_id=user_data.email
        )
        if existing_user:
            raise ValidationError(
                message="Email already registered",
                error_code=3001
            )

        # Hash password with Argon2
        hashed_password = get_password_hash(user_data.password)
        
        # Create user in Firebase
        firebase_user = await firebase_service.create_user({
            'email': user_data.email,
            'password': hashed_password,
            'display_name': user_data.name,
            'disabled': False,
            'custom_claims': {'role': 'free'}
        })

        # Store user data in Firestore
        user_doc = {
            'email': user_data.email,
            'name': user_data.name,
            'firebase_uid': firebase_user.uid,
            'role': 'free',
            'is_premium': False,
            'created_at': datetime.utcnow().isoformat(),
            'last_login': None
        }
        
        await firebase_service.set_document(
            collection='users',
            doc_id=str(uuid4()),
            data=user_doc
        )

        # Generate access token
        access_token = create_access_token(
            data={
                'sub': user_doc['firebase_uid'],
                'email': user_doc['email'],
                'role': user_doc['role']
            }
        )

        # Log security event
        await audit_logger.log_security_event(
            event_type='user_registration',
            user_id=user_doc['firebase_uid'],
            ip_address=request.client.host,
            metadata={'email': user_data.email}
        )

        return UserResponse(
            **user_doc,
            access_token=access_token,
            token_type='bearer'
        )

    except Exception as e:
        await audit_logger.log_security_event(
            event_type='registration_failed',
            ip_address=request.client.host,
            metadata={'error': str(e)}
        )
        raise

@router.post('/login', response_model=TokenResponse)
@login_limiter
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request = None
) -> TokenResponse:
    """
    Authenticate user and return JWT access token with role claims.
    
    Args:
        form_data: OAuth2 form with username (email) and password
        request: FastAPI request object
        
    Returns:
        TokenResponse: Access token with type and expiry
        
    Raises:
        AuthenticationError: If login fails
    """
    try:
        # Get user from Firebase
        user_doc = await firebase_service.get_document(
            collection='users',
            doc_id=form_data.username
        )
        
        if not user_doc:
            raise AuthenticationError(
                message="Invalid credentials",
                error_code=1001
            )

        # Verify password
        if not verify_password(form_data.password, user_doc['password_hash']):
            raise AuthenticationError(
                message="Invalid credentials",
                error_code=1001
            )

        # Update last login
        await firebase_service.set_document(
            collection='users',
            doc_id=form_data.username,
            data={'last_login': datetime.utcnow().isoformat()},
            merge=True
        )

        # Generate access token with role
        access_token = create_access_token(
            data={
                'sub': user_doc['firebase_uid'],
                'email': user_doc['email'],
                'role': user_doc['role'],
                'scopes': [user_doc['role']]
            }
        )

        # Log successful login
        await audit_logger.log_security_event(
            event_type='user_login',
            user_id=user_doc['firebase_uid'],
            ip_address=request.client.host,
            metadata={'email': form_data.username}
        )

        return TokenResponse(
            access_token=access_token,
            token_type='bearer',
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

    except Exception as e:
        await audit_logger.log_security_event(
            event_type='login_failed',
            ip_address=request.client.host,
            metadata={'error': str(e)}
        )
        raise

@router.post('/refresh', response_model=TokenResponse)
@refresh_limiter
async def refresh_token(
    current_token: str = Depends(oauth2_scheme),
    request: Request = None
) -> TokenResponse:
    """
    Refresh access token with validation and blacklisting.
    
    Args:
        current_token: Current valid access token
        request: FastAPI request object
        
    Returns:
        TokenResponse: New access token
        
    Raises:
        AuthenticationError: If token refresh fails
    """
    try:
        # Verify current token
        token_data = validate_token(current_token)
        
        # Check if token is blacklisted
        if token_data.get('jti') in blacklist_token:
            raise AuthenticationError(
                message="Token has been revoked",
                error_code=1002
            )

        # Generate new token
        new_token = create_access_token(
            data={
                'sub': token_data['sub'],
                'email': token_data['email'],
                'role': token_data['role'],
                'scopes': token_data.get('scopes', [])
            }
        )

        # Blacklist old token
        blacklist_token(token_data['jti'])

        # Log token refresh
        await audit_logger.log_security_event(
            event_type='token_refresh',
            user_id=token_data['sub'],
            ip_address=request.client.host,
            metadata={'old_jti': token_data['jti']}
        )

        return TokenResponse(
            access_token=new_token,
            token_type='bearer',
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

    except Exception as e:
        await audit_logger.log_security_event(
            event_type='token_refresh_failed',
            ip_address=request.client.host,
            metadata={'error': str(e)}
        )
        raise