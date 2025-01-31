# Python 3.11+
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import asyncio
from functools import wraps
import json

# External imports - version pinned for stability
import firebase_admin  # firebase-admin v6.0+
from firebase_admin import auth, credentials
from google.cloud.firestore_v1 import AsyncClient  # google-cloud-firestore v2.0+
from google.cloud.firestore_v1.base import DocumentSnapshot
from google.oauth2 import credentials as google_creds  # google-auth v2.0+
from cachetools import TTLCache  # cachetools v5.0+

# Internal imports
from app.core.config import settings, get_firebase_credentials
from app.core.logging import get_logger
from app.core.exceptions import (
    AuthenticationError,
    IntegrationError,
    ValidationError,
    RateLimitError
)

# Initialize logger with correlation ID support
logger = get_logger(__name__)

def rate_limit(limit: int, period: int = 60):
    """
    Rate limiting decorator for Firebase operations.
    
    Args:
        limit: Maximum number of requests allowed
        period: Time period in seconds
    """
    def decorator(func):
        cache = TTLCache(maxsize=1000, ttl=period)
        
        @wraps(func)
        async def wrapper(self, *args, **kwargs):
            cache_key = f"{func.__name__}:{args}:{kwargs}"
            current_count = cache.get(cache_key, 0)
            
            if current_count >= limit:
                raise RateLimitError(
                    message=f"Rate limit exceeded for {func.__name__}",
                    error_code=4001,
                    details={"limit": limit, "period": period}
                )
                
            cache[cache_key] = current_count + 1
            return await func(self, *args, **kwargs)
        return wrapper
    return decorator

def retry_operation(max_attempts: int = 3, delay: float = 1.0):
    """
    Retry decorator for Firebase operations with exponential backoff.
    
    Args:
        max_attempts: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_attempts):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_attempts - 1:
                        wait_time = delay * (2 ** attempt)
                        logger.warning(
                            f"Retry attempt {attempt + 1} for {func.__name__} after {wait_time}s",
                            extra={"error": str(e)}
                        )
                        await asyncio.sleep(wait_time)
                        
            raise IntegrationError(
                message=f"Operation failed after {max_attempts} attempts",
                error_code=6001,
                details={"last_error": str(last_exception)}
            )
        return wrapper
    return decorator

class FirebaseService:
    """
    Service class for Firebase operations with enhanced security and performance.
    Handles authentication, Firestore operations, and real-time updates.
    """
    
    def __init__(self):
        """Initialize Firebase service with secure credentials and optimized settings."""
        try:
            # Initialize Firebase Admin SDK
            cred = credentials.Certificate(get_firebase_credentials())
            self._app = firebase_admin.initialize_app(cred)
            
            # Initialize Firestore client with optimized settings
            self._db = AsyncClient(
                project=settings.FIREBASE_PROJECT_ID.get_secret_value(),
                credentials=cred
            )
            
            # Initialize caching system
            self._cache = {
                "documents": TTLCache(
                    maxsize=1000,
                    ttl=settings.CACHE_TTL_SECONDS
                ),
                "auth": TTLCache(
                    maxsize=1000,
                    ttl=300  # 5-minute cache for auth tokens
                )
            }
            
            # Initialize rate limits
            self._rate_limits = {
                "teams": settings.RATE_LIMIT_TEAMS,
                "players": settings.RATE_LIMIT_PLAYERS,
                "trades": settings.RATE_LIMIT_TRADES
            }
            
            logger.info("Firebase service initialized successfully")
            
        except Exception as e:
            logger.error("Failed to initialize Firebase service", exc_info=e)
            raise IntegrationError(
                message="Firebase initialization failed",
                error_code=6002,
                details={"error": str(e)}
            )

    async def verify_token(self, token: str) -> Dict[str, Any]:
        """
        Verify Firebase JWT token with enhanced security validation.
        
        Args:
            token: Firebase JWT token
            
        Returns:
            Dict containing decoded token claims
            
        Raises:
            AuthenticationError: If token is invalid or expired
        """
        try:
            # Check cache first
            cache_key = f"token:{token}"
            if cached_claims := self._cache["auth"].get(cache_key):
                return cached_claims
            
            # Verify token with Firebase
            decoded_token = auth.verify_id_token(
                token,
                check_revoked=True,
                app=self._app
            )
            
            # Validate token claims
            if not decoded_token.get("uid"):
                raise ValidationError("Token missing required claims")
                
            # Cache verified claims
            self._cache["auth"][cache_key] = decoded_token
            
            return decoded_token
            
        except auth.RevokedIdTokenError:
            raise AuthenticationError(
                message="Token has been revoked",
                error_code=1001
            )
        except auth.ExpiredIdTokenError:
            raise AuthenticationError(
                message="Token has expired",
                error_code=1002
            )
        except auth.InvalidIdTokenError as e:
            raise AuthenticationError(
                message="Invalid token",
                error_code=1003,
                details={"error": str(e)}
            )
        except Exception as e:
            logger.error("Token verification failed", exc_info=e)
            raise AuthenticationError(
                message="Authentication failed",
                error_code=1004,
                details={"error": str(e)}
            )

    @retry_operation()
    @rate_limit(limit=100)
    async def get_document(
        self,
        collection: str,
        doc_id: str,
        use_cache: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve a document from Firestore with caching and error handling.
        
        Args:
            collection: Firestore collection name
            doc_id: Document ID
            use_cache: Whether to use cache (default: True)
            
        Returns:
            Document data or None if not found
            
        Raises:
            IntegrationError: If Firestore operation fails
        """
        try:
            # Validate inputs
            if not collection or not doc_id:
                raise ValidationError(
                    message="Invalid collection or document ID",
                    error_code=3001
                )
            
            # Check cache if enabled
            cache_key = f"{collection}:{doc_id}"
            if use_cache and (cached_doc := self._cache["documents"].get(cache_key)):
                return cached_doc
            
            # Get document from Firestore
            doc_ref = self._db.collection(collection).document(doc_id)
            doc: DocumentSnapshot = await doc_ref.get()
            
            if not doc.exists:
                return None
                
            # Process document data
            doc_data = doc.to_dict()
            
            # Cache document if enabled
            if use_cache:
                self._cache["documents"][cache_key] = doc_data
                
            return doc_data
            
        except Exception as e:
            logger.error(
                f"Failed to get document {doc_id} from {collection}",
                exc_info=e
            )
            raise IntegrationError(
                message="Failed to retrieve document",
                error_code=6003,
                details={
                    "collection": collection,
                    "doc_id": doc_id,
                    "error": str(e)
                }
            )

    @retry_operation()
    @rate_limit(limit=50)
    async def set_document(
        self,
        collection: str,
        doc_id: str,
        data: Dict[str, Any],
        merge: bool = True
    ) -> None:
        """
        Set a document in Firestore with optimized write operations.
        
        Args:
            collection: Firestore collection name
            doc_id: Document ID
            data: Document data to set
            merge: Whether to merge with existing document
            
        Raises:
            IntegrationError: If Firestore operation fails
        """
        try:
            # Validate inputs
            if not collection or not doc_id or not data:
                raise ValidationError(
                    message="Invalid input parameters",
                    error_code=3002
                )
            
            # Add metadata
            data.update({
                "updated_at": datetime.utcnow().isoformat(),
                "updated_by": "system"
            })
            
            # Set document in Firestore
            doc_ref = self._db.collection(collection).document(doc_id)
            await doc_ref.set(data, merge=merge)
            
            # Invalidate cache
            cache_key = f"{collection}:{doc_id}"
            self._cache["documents"].pop(cache_key, None)
            
        except Exception as e:
            logger.error(
                f"Failed to set document {doc_id} in {collection}",
                exc_info=e
            )
            raise IntegrationError(
                message="Failed to set document",
                error_code=6004,
                details={
                    "collection": collection,
                    "doc_id": doc_id,
                    "error": str(e)
                }
            )

    async def close(self):
        """
        Cleanup Firebase resources and connections.
        """
        try:
            # Close Firestore client
            if self._db:
                await self._db.close()
            
            # Delete Firebase app
            if self._app:
                firebase_admin.delete_app(self._app)
                
            logger.info("Firebase service closed successfully")
            
        except Exception as e:
            logger.error("Error closing Firebase service", exc_info=e)
            raise IntegrationError(
                message="Failed to close Firebase service",
                error_code=6005,
                details={"error": str(e)}
            )