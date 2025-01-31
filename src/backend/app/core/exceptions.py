from fastapi import HTTPException, status
from datetime import datetime
import uuid
import logging
from typing import Optional, Dict, Any

# FastAPI version: 0.100+

# Error message constants for consistent error responses
ERROR_MESSAGES = {
    'AUTHENTICATION_FAILED': 'Authentication failed - Invalid or missing credentials',
    'INVALID_CREDENTIALS': 'Invalid credentials - Please check your login details',
    'TOKEN_EXPIRED': 'Token has expired - Please login again',
    'PERMISSION_DENIED': 'Permission denied - Insufficient privileges',
    'RATE_LIMIT_EXCEEDED': 'Rate limit exceeded - Please try again later',
    'VALIDATION_ERROR': 'Validation error - Please check your input',
    'NOT_FOUND': 'Resource not found - The requested item does not exist',
    'INTEGRATION_ERROR': 'External service integration error - Service temporarily unavailable',
    'SYSTEM_ERROR': 'Internal system error - Please try again later',
    'INVALID_REQUEST': 'Invalid request format - Please check your request',
    'DATABASE_ERROR': 'Database operation failed - Please try again',
    'NETWORK_ERROR': 'Network communication error - Please check your connection'
}

class BaseAppException(HTTPException):
    """
    Base exception class for all application-specific exceptions.
    Provides standardized error response formatting and logging capabilities.
    
    Error Code Ranges:
    1000-1999: Authentication errors
    2000-2999: Authorization errors
    3000-3999: Validation errors
    4000-4999: Rate limiting errors
    5000-5999: System errors
    6000-6999: Integration errors
    """

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code: int = 5000,
        details: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None
    ) -> None:
        """
        Initialize the base exception with standard error properties.

        Args:
            message: Human-readable error message
            status_code: HTTP status code for the response
            error_code: Internal error code for categorization
            details: Additional error context (will be sanitized)
            correlation_id: Unique identifier for error tracking
        """
        super().__init__(status_code=status_code, detail=message)
        
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = self._sanitize_details(details or {})
        self.correlation_id = correlation_id or str(uuid.uuid4())
        self.timestamp = datetime.utcnow().isoformat()
        
        # Log the error immediately upon creation
        self.log_error()

    def _sanitize_details(self, details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sanitize error details to remove sensitive information.
        
        Args:
            details: Raw error details dictionary
            
        Returns:
            Sanitized dictionary safe for external response
        """
        sensitive_fields = {'password', 'token', 'secret', 'key', 'credential'}
        sanitized = {}
        
        for key, value in details.items():
            if any(field in key.lower() for field in sensitive_fields):
                sanitized[key] = '[REDACTED]'
            else:
                sanitized[key] = value
                
        return sanitized

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert exception to dictionary format for API responses.
        
        Returns:
            Standardized error response dictionary
        """
        error_dict = {
            'status': 'error',
            'code': self.error_code,
            'message': self.message,
            'correlation_id': self.correlation_id,
            'timestamp': self.timestamp
        }
        
        if self.details:
            error_dict['details'] = self.details
            
        return error_dict

    def log_error(self) -> None:
        """
        Log error details to the monitoring system with context.
        """
        log_data = {
            'error_code': self.error_code,
            'status_code': self.status_code,
            'message': self.message,
            'correlation_id': self.correlation_id,
            'timestamp': self.timestamp,
            'details': self.details
        }
        
        logger = logging.getLogger('app.exceptions')
        logger.error(
            f"Error {self.error_code}: {self.message}",
            extra={
                'error_context': log_data,
                'correlation_id': self.correlation_id
            },
            exc_info=True
        )

# Authentication Exceptions (1000-1999)
class AuthenticationError(BaseAppException):
    """Base class for authentication-related exceptions."""
    def __init__(self, message: str = ERROR_MESSAGES['AUTHENTICATION_FAILED'], 
                 error_code: int = 1000, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            error_code=error_code,
            details=details
        )

# Authorization Exceptions (2000-2999)
class AuthorizationError(BaseAppException):
    """Base class for authorization-related exceptions."""
    def __init__(self, message: str = ERROR_MESSAGES['PERMISSION_DENIED'], 
                 error_code: int = 2000, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_403_FORBIDDEN,
            error_code=error_code,
            details=details
        )

# Validation Exceptions (3000-3999)
class ValidationError(BaseAppException):
    """Base class for validation-related exceptions."""
    def __init__(self, message: str = ERROR_MESSAGES['VALIDATION_ERROR'], 
                 error_code: int = 3000, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code=error_code,
            details=details
        )

# Rate Limiting Exceptions (4000-4999)
class RateLimitError(BaseAppException):
    """Base class for rate limiting-related exceptions."""
    def __init__(self, message: str = ERROR_MESSAGES['RATE_LIMIT_EXCEEDED'], 
                 error_code: int = 4000, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            error_code=error_code,
            details=details
        )

# System Exceptions (5000-5999)
class SystemError(BaseAppException):
    """Base class for system-related exceptions."""
    def __init__(self, message: str = ERROR_MESSAGES['SYSTEM_ERROR'], 
                 error_code: int = 5000, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code=error_code,
            details=details
        )

# Integration Exceptions (6000-6999)
class IntegrationError(BaseAppException):
    """Base class for integration-related exceptions."""
    def __init__(self, message: str = ERROR_MESSAGES['INTEGRATION_ERROR'], 
                 error_code: int = 6000, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=status.HTTP_502_BAD_GATEWAY,
            error_code=error_code,
            details=details
        )

# Export all exception classes and error messages
__all__ = [
    'ERROR_MESSAGES',
    'BaseAppException',
    'AuthenticationError',
    'AuthorizationError',
    'ValidationError',
    'RateLimitError',
    'SystemError',
    'IntegrationError'
]