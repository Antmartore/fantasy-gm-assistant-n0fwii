"""
Core module initialization file for Fantasy GM Assistant backend.
Provides centralized access to core functionality including configuration,
security, and error handling components.

Version: 1.0.0
"""

# Version information
__version__ = '1.0.0'

# Import core application settings
from app.core.config import (
    settings,
    PROJECT_NAME,
    API_V1_STR
)

# Import exception classes and error messages
from app.core.exceptions import (
    BaseAppException,
    AuthenticationError as AuthenticationException,
    AuthorizationError as AuthorizationException,
    ValidationError as ValidationException,
    RateLimitError as RateLimitException,
    SystemError as SystemException,
    IntegrationError as IntegrationException,
    ERROR_MESSAGES
)

# Import security utilities
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    verify_token
)

# Export all core components
__all__ = [
    # Version
    '__version__',
    
    # Settings
    'settings',
    'PROJECT_NAME',
    'API_V1_STR',
    
    # Exceptions
    'BaseAppException',
    'AuthenticationException',
    'AuthorizationException',
    'ValidationException',
    'RateLimitException',
    'SystemException',
    'IntegrationException',
    'ERROR_MESSAGES',
    
    # Security
    'verify_password',
    'get_password_hash', 
    'create_access_token',
    'verify_token'
]