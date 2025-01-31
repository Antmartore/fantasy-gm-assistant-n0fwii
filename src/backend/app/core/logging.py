# Python 3.11+
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import json
from pythonjsonlogger import jsonlogger  # python-json-logger v2.0+
import watchtower  # watchtower v3.0+
from contextvars import ContextVar
import boto3  # boto3 v1.26+

from app.core.config import settings
from app.core.exceptions import BaseAppException

# Global constants
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
JSON_LOG_FORMAT = '%(timestamp)s %(level)s %(name)s %(correlation_id)s %(message)s'
CORRELATION_ID_CTX_VAR = ContextVar('correlation_id', default=None)

class CustomJSONFormatter(jsonlogger.JsonFormatter):
    """
    Custom JSON formatter with enhanced context, security, and performance tracking.
    Supports distributed tracing and PII protection.
    """
    def __init__(self) -> None:
        super().__init__(fmt=JSON_LOG_FORMAT)
        self.project_name = settings.PROJECT_NAME
        self.environment = "development" if settings.DEBUG else "production"

    def format(self, record: logging.LogRecord) -> str:
        """
        Formats log record with comprehensive context and tracking.
        
        Args:
            record: Log record to format
            
        Returns:
            Enhanced JSON formatted log entry
        """
        # Get base formatted record
        json_record = super().format(record)
        record_dict = json.loads(json_record)
        
        # Add standard context
        record_dict.update({
            "project": self.project_name,
            "environment": self.environment,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "correlation_id": CORRELATION_ID_CTX_VAR.get(),
            "logger": record.name
        })

        # Add performance metrics if available
        if hasattr(record, 'duration_ms'):
            record_dict['duration_ms'] = record.duration_ms
        
        # Add security context
        if hasattr(record, 'security_context'):
            record_dict['security_context'] = record.security_context
            
        # Sanitize PII and sensitive data
        self._sanitize_sensitive_data(record_dict)
        
        return json.dumps(record_dict)
    
    def _sanitize_sensitive_data(self, record_dict: Dict[str, Any]) -> None:
        """
        Sanitizes sensitive information from log records.
        
        Args:
            record_dict: Dictionary containing log record data
        """
        sensitive_fields = {
            'password', 'token', 'secret', 'key', 'auth',
            'credential', 'ssn', 'email', 'phone'
        }
        
        def sanitize_value(key: str, value: Any) -> Any:
            if any(field in key.lower() for field in sensitive_fields):
                return '[REDACTED]'
            return value

        for key, value in record_dict.items():
            if isinstance(value, dict):
                record_dict[key] = {
                    k: sanitize_value(k, v) for k, v in value.items()
                }
            else:
                record_dict[key] = sanitize_value(key, value)

def setup_logging() -> None:
    """
    Configures application-wide logging with JSON formatting, CloudWatch integration,
    and enhanced security features.
    """
    # Create root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # Configure JSON formatter
    json_formatter = CustomJSONFormatter()
    
    # Console handler setup
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(json_formatter)
    root_logger.addHandler(console_handler)
    
    # CloudWatch handler setup
    if not settings.DEBUG:
        cloudwatch_handler = watchtower.CloudWatchLogHandler(
            log_group=settings.AWS_LOG_GROUP,
            stream_name=datetime.now().strftime("%Y/%m/%d"),
            boto3_client=boto3.client(
                'logs',
                region_name=settings.AWS_REGION,
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID.get_secret_value(),
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY.get_secret_value()
            ),
            retention_days=settings.LOG_RETENTION_DAYS
        )
        cloudwatch_handler.setFormatter(json_formatter)
        root_logger.addHandler(cloudwatch_handler)

def get_logger(name: str) -> logging.Logger:
    """
    Creates and returns a logger instance with enhanced context and performance tracking.
    
    Args:
        name: Logger name (typically module name)
        
    Returns:
        Configured logger instance with context support
    """
    logger = logging.getLogger(name)
    
    # Inherit settings from root logger
    logger.parent = logging.getLogger()
    logger.propagate = True
    
    return logger

def log_exception(
    logger: logging.Logger,
    exc: Exception,
    level: str = 'error'
) -> None:
    """
    Logs exception details with enhanced stack traces and security context.
    
    Args:
        logger: Logger instance to use
        exc: Exception to log
        level: Log level to use (default: error)
    """
    # Extract exception details
    exc_info = {
        'type': exc.__class__.__name__,
        'message': str(exc),
        'correlation_id': CORRELATION_ID_CTX_VAR.get()
    }
    
    # Add additional context for application exceptions
    if isinstance(exc, BaseAppException):
        exc_info.update(exc.to_dict())
    
    # Get logging method based on level
    log_method = getattr(logger, level.lower(), logger.error)
    
    # Log with full context
    log_method(
        f"Exception occurred: {exc}",
        extra={
            'exc_info': exc_info,
            'correlation_id': CORRELATION_ID_CTX_VAR.get()
        },
        exc_info=True
    )