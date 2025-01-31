"""
Package initializer for backend utility scripts that handle administrative tasks.
Provides a centralized interface for development and administrative operations
with proper access control and logging.

Version: 1.0.0
"""

# Python 3.11+
from typing import List

# Internal imports
from scripts.create_superuser import create_superuser
from scripts.generate_openapi import generate_openapi_spec

# Version tracking
__version__ = "1.0.0"

# Export public interface
__all__: List[str] = [
    "create_superuser",
    "generate_openapi_spec"
]

# Package metadata
PACKAGE_NAME = "fantasy-gm-scripts"
PACKAGE_DESCRIPTION = "Administrative and development utility scripts for Fantasy GM Assistant"
MINIMUM_PYTHON_VERSION = "3.11"

# Script categories for organization
SCRIPT_CATEGORIES = {
    "user_management": [
        "create_superuser"  # For admin user creation with secure password handling
    ],
    "documentation": [
        "generate_openapi_spec"  # For API documentation generation
    ],
    "database": [
        "migrations",  # For database schema migrations
        "seeding"     # For test data generation
    ],
    "maintenance": [
        "backup",     # For database backups
        "cleanup"     # For data cleanup operations
    ]
}

# Access control levels
ACCESS_LEVELS = {
    "create_superuser": "admin",      # Restricted to admin users
    "generate_openapi": "developer",  # Available to development team
    "run_migrations": "admin",        # Restricted to admin users
    "seed_data": "developer"         # Available to development team
}

def get_script_info(script_name: str) -> dict:
    """
    Get metadata about a specific utility script.
    
    Args:
        script_name: Name of the script to get info for
        
    Returns:
        Dictionary containing script metadata
    """
    for category, scripts in SCRIPT_CATEGORIES.items():
        if script_name in scripts:
            return {
                "name": script_name,
                "category": category,
                "access_level": ACCESS_LEVELS.get(script_name, "admin"),
                "description": f"Utility script for {script_name.replace('_', ' ')}"
            }
    return {}

def validate_environment() -> bool:
    """
    Validate the Python environment meets minimum requirements.
    
    Returns:
        bool: True if environment is valid
    """
    import sys
    return sys.version_info >= tuple(map(int, MINIMUM_PYTHON_VERSION.split('.')))

# Perform environment validation on import
if not validate_environment():
    raise RuntimeError(
        f"Python {MINIMUM_PYTHON_VERSION} or higher is required "
        f"(current: {sys.version.split()[0]})"
    )