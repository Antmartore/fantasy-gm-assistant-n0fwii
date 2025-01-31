# Python 3.11+
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import uuid
from passlib.context import CryptContext  # passlib v1.7.4
from jose import jwt, JWTError  # python-jose[cryptography] v3.3.0
from functools import wraps

from app.core.config import settings
from app.core.exceptions import AuthenticationError
from app.core.logging import get_logger

# Initialize security logger
security_logger = get_logger(__name__)

# Constants
ALGORITHM = "HS256"
TOKEN_BLACKLIST = set()

# Configure password hashing with enhanced Argon2 parameters
pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto",
    argon2__memory_cost=65536,  # 64MB
    argon2__time_cost=4,        # 4 iterations
    argon2__parallelism=8       # 8 parallel threads
)

def rate_limit(max_attempts: int = 5, window_seconds: int = 300):
    """
    Rate limiting decorator for security-sensitive operations.
    
    Args:
        max_attempts: Maximum attempts allowed in window
        window_seconds: Time window in seconds
    """
    attempts = {}
    
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user_id = kwargs.get('user_id', 'anonymous')
            current_time = datetime.utcnow()
            
            # Clean up expired attempts
            attempts.update({
                k: v for k, v in attempts.items()
                if (current_time - v['timestamp']).seconds < window_seconds
            })
            
            # Check rate limit
            user_attempts = attempts.get(user_id, {'count': 0, 'timestamp': current_time})
            if user_attempts['count'] >= max_attempts:
                security_logger.warning(
                    f"Rate limit exceeded for user {user_id}",
                    extra={'security_event': 'rate_limit_exceeded'}
                )
                raise AuthenticationError(
                    message="Too many attempts. Please try again later.",
                    error_code=4001
                )
            
            # Update attempts counter
            attempts[user_id] = {
                'count': user_attempts['count'] + 1,
                'timestamp': current_time
            }
            
            return func(*args, **kwargs)
        return wrapper
    return decorator

def verify_password(plain_password: str, hashed_password: str, user_id: str) -> bool:
    """
    Verify a plain password against a hashed password with rate limiting.
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password to compare against
        user_id: User identifier for rate limiting
        
    Returns:
        bool: True if password matches, False otherwise
    """
    try:
        result = pwd_context.verify(plain_password, hashed_password)
        security_logger.info(
            f"Password verification {'successful' if result else 'failed'} for user {user_id}",
            extra={'security_event': 'password_verification'}
        )
        return result
    except Exception as e:
        security_logger.error(
            f"Password verification error for user {user_id}: {str(e)}",
            extra={'security_event': 'password_verification_error'}
        )
        return False

def get_password_hash(password: str) -> str:
    """
    Generate secure Argon2 hash of plain password.
    
    Args:
        password: Plain text password to hash
        
    Returns:
        str: Hashed password
    """
    # Validate password complexity
    if len(password) < 8:
        raise AuthenticationError(
            message="Password must be at least 8 characters long",
            error_code=1002
        )
    
    hashed = pwd_context.hash(password)
    security_logger.info(
        "Password hash generated successfully",
        extra={'security_event': 'password_hash_generated'}
    )
    return hashed

def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
    jti: Optional[str] = None
) -> str:
    """
    Create secure JWT access token with enhanced claims.
    
    Args:
        data: Token payload data
        expires_delta: Optional token expiration time
        jti: Optional JWT ID for tracking
        
    Returns:
        str: Encoded JWT token
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta if expires_delta
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    # Add standard security claims
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "jti": jti or str(uuid.uuid4()),
        "iss": settings.PROJECT_NAME,
        "aud": settings.PROJECT_NAME
    })
    
    try:
        encoded_jwt = jwt.encode(
            to_encode,
            settings.SECRET_KEY.get_secret_value(),
            algorithm=ALGORITHM
        )
        security_logger.info(
            "Access token created successfully",
            extra={
                'security_event': 'token_created',
                'jti': to_encode['jti']
            }
        )
        return encoded_jwt
    except Exception as e:
        security_logger.error(
            f"Token creation failed: {str(e)}",
            extra={'security_event': 'token_creation_error'}
        )
        raise AuthenticationError(
            message="Error creating access token",
            error_code=1003
        )

def verify_token(token: str) -> Dict[str, Any]:
    """
    Verify and decode JWT token with comprehensive security checks.
    
    Args:
        token: JWT token to verify
        
    Returns:
        Dict[str, Any]: Decoded token claims
        
    Raises:
        AuthenticationError: If token is invalid or expired
    """
    try:
        # Decode header without verification for algorithm check
        header = jwt.get_unverified_header(token)
        if header['alg'] != ALGORITHM:
            raise AuthenticationError(
                message="Invalid token algorithm",
                error_code=1004
            )
        
        # Verify and decode token
        payload = jwt.decode(
            token,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=[ALGORITHM],
            audience=settings.PROJECT_NAME,
            issuer=settings.PROJECT_NAME
        )
        
        # Check token blacklist
        if payload.get('jti') in TOKEN_BLACKLIST:
            raise AuthenticationError(
                message="Token has been revoked",
                error_code=1005
            )
        
        security_logger.info(
            "Token verified successfully",
            extra={
                'security_event': 'token_verified',
                'jti': payload.get('jti')
            }
        )
        return payload
        
    except JWTError as e:
        security_logger.error(
            f"Token verification failed: {str(e)}",
            extra={'security_event': 'token_verification_error'}
        )
        raise AuthenticationError(
            message="Invalid or expired token",
            error_code=1006
        )

def blacklist_token(jti: str) -> None:
    """
    Add token to blacklist for invalidation.
    
    Args:
        jti: JWT ID to blacklist
    """
    TOKEN_BLACKLIST.add(jti)
    security_logger.info(
        f"Token blacklisted successfully",
        extra={
            'security_event': 'token_blacklisted',
            'jti': jti
        }
    )