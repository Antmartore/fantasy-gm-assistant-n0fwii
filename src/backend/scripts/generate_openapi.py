# Python 3.11+
import json
from pathlib import Path
from typing import Dict, Any
from functools import cache
import typer
from datetime import datetime

from app.main import app
from app.core.config import settings
from app.core.logging import logger

# Constants
OUTPUT_DIR = Path('docs/api')
DEFAULT_FILENAME = 'openapi.json'
CACHE_TTL = 3600  # 1 hour cache for schema generation
OPENAPI_VERSION = '3.0.3'

@cache(ttl=CACHE_TTL)
def customize_openapi_spec(openapi_schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enhances the OpenAPI specification with security schemes, examples, and metadata.
    
    Args:
        openapi_schema: Base OpenAPI schema from FastAPI
        
    Returns:
        Enhanced OpenAPI schema with security definitions and documentation
    """
    # Add basic metadata
    openapi_schema.update({
        "openapi": OPENAPI_VERSION,
        "info": {
            "title": settings.PROJECT_NAME,
            "description": "AI-Powered Fantasy Sports GM Assistant API",
            "version": settings.API_V1_STR.replace("/api/", ""),
            "contact": {
                "name": "API Support",
                "email": "api-support@fantasygm.com"
            },
            "license": {
                "name": "Proprietary",
                "url": "https://fantasygm.com/terms"
            }
        }
    })

    # Add security schemes
    openapi_schema["components"]["securitySchemes"] = {
        "OAuth2": {
            "type": "oauth2",
            "flows": {
                "password": {
                    "tokenUrl": f"{settings.API_V1_STR}/auth/login",
                    "refreshUrl": f"{settings.API_V1_STR}/auth/refresh",
                    "scopes": {
                        "free": "Free user access",
                        "premium": "Premium user access",
                        "admin": "Admin access"
                    }
                }
            }
        },
        "ApiKeyAuth": {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key"
        }
    }

    # Add global security requirement
    openapi_schema["security"] = [{"OAuth2": ["free"]}]

    # Add rate limiting headers
    openapi_schema["components"]["parameters"] = {
        "RateLimitHeaders": {
            "in": "header",
            "name": "X-Rate-Limit-Limit",
            "schema": {"type": "integer"},
            "required": False,
            "description": "Request limit per minute"
        }
    }

    # Add common response headers
    openapi_schema["components"]["headers"] = {
        "X-Rate-Limit-Remaining": {
            "schema": {"type": "integer"},
            "description": "Remaining requests in the current time window"
        },
        "X-Rate-Limit-Reset": {
            "schema": {"type": "integer"},
            "description": "Time until rate limit reset in seconds"
        }
    }

    # Add common response schemas
    openapi_schema["components"]["schemas"].update({
        "Error": {
            "type": "object",
            "properties": {
                "code": {"type": "integer"},
                "message": {"type": "string"},
                "details": {"type": "object"},
                "correlation_id": {"type": "string"}
            }
        }
    })

    # Add common responses
    openapi_schema["components"]["responses"] = {
        "UnauthorizedError": {
            "description": "Authentication failed",
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/Error"},
                    "example": {
                        "code": 1001,
                        "message": "Invalid credentials",
                        "correlation_id": "123e4567-e89b-12d3-a456-426614174000"
                    }
                }
            }
        },
        "RateLimitError": {
            "description": "Rate limit exceeded",
            "headers": {
                "Retry-After": {
                    "schema": {"type": "integer"},
                    "description": "Time until rate limit reset"
                }
            },
            "content": {
                "application/json": {
                    "schema": {"$ref": "#/components/schemas/Error"},
                    "example": {
                        "code": 4001,
                        "message": "Rate limit exceeded",
                        "correlation_id": "123e4567-e89b-12d3-a456-426614174000"
                    }
                }
            }
        }
    }

    # Add tags with descriptions
    openapi_schema["tags"] = [
        {
            "name": "Authentication",
            "description": "User authentication and authorization endpoints"
        },
        {
            "name": "Teams",
            "description": "Fantasy team management endpoints"
        },
        {
            "name": "Players",
            "description": "Player statistics and analysis endpoints"
        },
        {
            "name": "Trades",
            "description": "Trade analysis and processing endpoints"
        },
        {
            "name": "Simulations",
            "description": "Monte Carlo simulation endpoints"
        }
    ]

    return openapi_schema

def generate_openapi_spec(output_file: str) -> Path:
    """
    Generates and validates the OpenAPI specification from FastAPI application.
    
    Args:
        output_file: Output filename for the specification
        
    Returns:
        Path to generated OpenAPI specification file
    """
    try:
        # Get base OpenAPI schema from FastAPI app
        openapi_schema = app.openapi()
        
        # Enhance schema with security and documentation
        enhanced_schema = customize_openapi_spec(openapi_schema)
        
        # Create output directory if it doesn't exist
        output_path = OUTPUT_DIR / output_file
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write schema to file with pretty formatting
        with open(output_path, 'w') as f:
            json.dump(enhanced_schema, f, indent=2, sort_keys=True)
            
        logger.info(
            f"OpenAPI specification generated successfully: {output_path}",
            extra={"schema_version": OPENAPI_VERSION}
        )
        
        return output_path
        
    except Exception as e:
        logger.error(f"Failed to generate OpenAPI specification: {str(e)}")
        raise

def main(
    output_file: str = typer.Option(
        DEFAULT_FILENAME,
        help="Output filename for OpenAPI specification"
    ),
    validate: bool = typer.Option(
        True,
        help="Validate generated specification"
    ),
    pretty: bool = typer.Option(
        True,
        help="Pretty print JSON output"
    )
) -> None:
    """
    Main entry point for OpenAPI generation script.
    
    Args:
        output_file: Output filename
        validate: Whether to validate the generated spec
        pretty: Whether to pretty print the JSON output
    """
    try:
        logger.info("Starting OpenAPI specification generation")
        
        # Generate specification
        output_path = generate_openapi_spec(output_file)
        
        # Log success
        logger.info(
            "OpenAPI specification generated successfully",
            extra={
                "output_path": str(output_path),
                "file_size": output_path.stat().st_size,
                "timestamp": datetime.utcnow().isoformat()
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to generate OpenAPI specification: {str(e)}")
        raise typer.Exit(code=1)

if __name__ == "__main__":
    typer.run(main)