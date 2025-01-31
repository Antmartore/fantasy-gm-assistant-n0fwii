"""
Initialization module for Fantasy GM Assistant backend services.
Provides centralized access to external integrations, AI processing, and data management services.
Version: 1.0.0
"""

# Python 3.11+
import logging
from typing import Dict, Optional

# Internal service imports
from app.services.espn_service import ESPNService
from app.services.gpt_service import GPTService
from app.services.firebase_service import FirebaseService

# Initialize logger
logger = logging.getLogger(__name__)

# Service instances
_espn_service: Optional[ESPNService] = None
_gpt_service: Optional[GPTService] = None
_firebase_service: Optional[FirebaseService] = None

async def initialize_services() -> bool:
    """
    Initializes all backend services in the correct order with health checks.
    Ensures proper startup sequence and dependency management.

    Returns:
        bool: True if all services initialized successfully, False otherwise
    """
    global _espn_service, _gpt_service, _firebase_service
    
    try:
        # Initialize Firebase first as it's a core dependency
        logger.info("Initializing Firebase service...")
        _firebase_service = FirebaseService()
        
        # Initialize ESPN service for fantasy sports data
        logger.info("Initializing ESPN service...")
        _espn_service = ESPNService()
        
        # Initialize GPT service for AI analysis
        logger.info("Initializing GPT service...")
        _gpt_service = GPTService()
        
        logger.info("All services initialized successfully")
        return True
        
    except Exception as e:
        logger.error(f"Service initialization failed: {str(e)}", exc_info=True)
        # Attempt cleanup of any partially initialized services
        await cleanup_services()
        return False

async def cleanup_services() -> None:
    """
    Performs graceful cleanup of all initialized services.
    Ensures proper resource release and connection closure.
    """
    global _espn_service, _gpt_service, _firebase_service
    
    try:
        # Cleanup Firebase service
        if _firebase_service:
            await _firebase_service.close()
            _firebase_service = None
            
        # Cleanup ESPN service
        if _espn_service:
            await _espn_service.__aexit__(None, None, None)
            _espn_service = None
            
        # Cleanup GPT service
        if _gpt_service:
            await _gpt_service.__aexit__(None, None, None)
            _gpt_service = None
            
        logger.info("All services cleaned up successfully")
        
    except Exception as e:
        logger.error(f"Service cleanup failed: {str(e)}", exc_info=True)
        raise

def get_firebase_service() -> FirebaseService:
    """
    Returns the initialized Firebase service instance.

    Returns:
        FirebaseService: Initialized Firebase service

    Raises:
        RuntimeError: If service not initialized
    """
    if not _firebase_service:
        raise RuntimeError("Firebase service not initialized")
    return _firebase_service

def get_espn_service() -> ESPNService:
    """
    Returns the initialized ESPN service instance.

    Returns:
        ESPNService: Initialized ESPN service

    Raises:
        RuntimeError: If service not initialized
    """
    if not _espn_service:
        raise RuntimeError("ESPN service not initialized")
    return _espn_service

def get_gpt_service() -> GPTService:
    """
    Returns the initialized GPT service instance.

    Returns:
        GPTService: Initialized GPT service

    Raises:
        RuntimeError: If service not initialized
    """
    if not _gpt_service:
        raise RuntimeError("GPT service not initialized")
    return _gpt_service

# Export service classes and initialization function
__all__ = [
    'ESPNService',
    'GPTService', 
    'FirebaseService',
    'initialize_services',
    'cleanup_services',
    'get_firebase_service',
    'get_espn_service',
    'get_gpt_service'
]