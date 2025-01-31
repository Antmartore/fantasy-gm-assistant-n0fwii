# Python 3.11+
import os
import hashlib
from typing import Optional, Dict, Any
import mimetypes
from datetime import datetime, timedelta

import boto3  # version 1.26+
from botocore.config import Config
from botocore.exceptions import ClientError, BotoCoreError

from app.core.config import settings
from app.core.logging import get_logger
from app.core.exceptions import IntegrationError

# Initialize logger
logger = get_logger(__name__)

# Constants
UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024  # 8MB chunk size for multipart uploads
MAX_RETRIES = 3  # Maximum number of retry attempts for S3 operations

class S3Service:
    """
    Enhanced service class for handling AWS S3 operations with security, monitoring,
    and lifecycle management capabilities.
    """

    def __init__(self, config_override: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize S3 service with AWS credentials and enhanced configuration.
        
        Args:
            config_override: Optional configuration override dictionary
        """
        try:
            # Configure boto3 client with retry and timeout settings
            boto_config = Config(
                retries=dict(max_attempts=MAX_RETRIES),
                connect_timeout=5,
                read_timeout=10,
                parameter_validation=True,
                max_pool_connections=50
            )

            # Initialize S3 client with credentials
            self._client = boto3.client(
                's3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID.get_secret_value(),
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY.get_secret_value(),
                region_name=settings.AWS_REGION,
                config=boto_config
            )

            self._bucket_name = settings.AWS_S3_BUCKET

            # Configure server-side encryption
            self._upload_config = {
                'ServerSideEncryption': 'aws:kms',
                'SSEKMSKeyId': settings.AWS_S3_ENCRYPTION_KEY.get_secret_value()
            }

            # Configure lifecycle rules
            self._lifecycle_config = {
                'Rules': [
                    {
                        'ID': 'media-retention',
                        'Status': 'Enabled',
                        'Expiration': {'Days': 30},
                        'AbortIncompleteMultipartUpload': {'DaysAfterInitiation': 1}
                    }
                ]
            }

            # Verify bucket exists and set lifecycle policy
            self._verify_bucket()
            self._configure_lifecycle()

            logger.info(f"S3Service initialized for bucket: {self._bucket_name}")

        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to initialize S3Service: {str(e)}")
            raise IntegrationError(
                message="Failed to initialize S3 service",
                error_code=6001,
                details={'error': str(e)}
            )

    def _verify_bucket(self) -> None:
        """Verify bucket exists and has proper permissions."""
        try:
            self._client.head_bucket(Bucket=self._bucket_name)
        except ClientError as e:
            logger.error(f"Bucket verification failed: {str(e)}")
            raise IntegrationError(
                message=f"S3 bucket {self._bucket_name} not accessible",
                error_code=6002,
                details={'error': str(e)}
            )

    def _configure_lifecycle(self) -> None:
        """Configure bucket lifecycle rules."""
        try:
            self._client.put_bucket_lifecycle_configuration(
                Bucket=self._bucket_name,
                LifecycleConfiguration=self._lifecycle_config
            )
        except ClientError as e:
            logger.error(f"Failed to configure lifecycle rules: {str(e)}")
            raise IntegrationError(
                message="Failed to configure S3 lifecycle rules",
                error_code=6003,
                details={'error': str(e)}
            )

    def upload_file(
        self,
        file_path: str,
        key: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Upload file to S3 bucket with enhanced security and monitoring.
        
        Args:
            file_path: Local path to file
            key: S3 object key
            content_type: Optional content type
            metadata: Optional metadata dictionary
            
        Returns:
            URL of uploaded file
            
        Raises:
            IntegrationError: If upload fails
        """
        try:
            # Validate file exists
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File not found: {file_path}")

            # Calculate file checksum
            file_hash = hashlib.md5(open(file_path, 'rb').read()).hexdigest()

            # Determine content type
            if not content_type:
                content_type = mimetypes.guess_type(file_path)[0] or 'application/octet-stream'

            # Prepare upload configuration
            upload_args = {
                **self._upload_config,
                'ContentType': content_type,
                'Metadata': {
                    'md5_hash': file_hash,
                    'upload_timestamp': datetime.utcnow().isoformat(),
                    **(metadata or {})
                }
            }

            # Perform upload with progress monitoring
            self._client.upload_file(
                file_path,
                self._bucket_name,
                key,
                ExtraArgs=upload_args,
                Callback=lambda bytes_transferred: logger.debug(
                    f"Upload progress for {key}: {bytes_transferred} bytes"
                )
            )

            logger.info(f"Successfully uploaded file to S3: {key}")
            return self.get_file_url(key)

        except (ClientError, BotoCoreError, FileNotFoundError) as e:
            logger.error(f"Failed to upload file to S3: {str(e)}")
            raise IntegrationError(
                message="Failed to upload file to S3",
                error_code=6004,
                details={'error': str(e), 'key': key}
            )

    def upload_bytes(
        self,
        data: bytes,
        key: str,
        content_type: str,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Upload bytes data to S3 with enhanced security.
        
        Args:
            data: Bytes data to upload
            key: S3 object key
            content_type: Content type of the data
            metadata: Optional metadata dictionary
            
        Returns:
            URL of uploaded file
        """
        try:
            # Calculate data checksum
            data_hash = hashlib.md5(data).hexdigest()

            # Prepare upload configuration
            upload_args = {
                **self._upload_config,
                'ContentType': content_type,
                'Metadata': {
                    'md5_hash': data_hash,
                    'upload_timestamp': datetime.utcnow().isoformat(),
                    **(metadata or {})
                }
            }

            # Upload data
            self._client.put_object(
                Bucket=self._bucket_name,
                Key=key,
                Body=data,
                **upload_args
            )

            logger.info(f"Successfully uploaded bytes to S3: {key}")
            return self.get_file_url(key)

        except (ClientError, BotoCoreError) as e:
            logger.error(f"Failed to upload bytes to S3: {str(e)}")
            raise IntegrationError(
                message="Failed to upload bytes to S3",
                error_code=6005,
                details={'error': str(e), 'key': key}
            )

    def get_file_url(
        self,
        key: str,
        expiry_seconds: int = 3600,
        response_headers: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Generate secure pre-signed URL with configurable expiry.
        
        Args:
            key: S3 object key
            expiry_seconds: URL expiration time in seconds
            response_headers: Optional response headers
            
        Returns:
            Secure pre-signed URL
        """
        try:
            # Verify file exists
            self._client.head_object(Bucket=self._bucket_name, Key=key)

            # Generate pre-signed URL
            url = self._client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self._bucket_name,
                    'Key': key,
                    'ResponseContentDisposition': 'inline',
                    **(response_headers or {})
                },
                ExpiresIn=expiry_seconds
            )

            logger.debug(f"Generated pre-signed URL for {key}, expires in {expiry_seconds}s")
            return url

        except ClientError as e:
            logger.error(f"Failed to generate pre-signed URL: {str(e)}")
            raise IntegrationError(
                message="Failed to generate file URL",
                error_code=6006,
                details={'error': str(e), 'key': key}
            )

    def delete_file(self, key: str, permanent: bool = False) -> bool:
        """
        Securely delete file with verification.
        
        Args:
            key: S3 object key
            permanent: If True, bypass soft delete
            
        Returns:
            True if deletion successful
        """
        try:
            if permanent:
                # Permanent deletion
                self._client.delete_object(
                    Bucket=self._bucket_name,
                    Key=key
                )
            else:
                # Soft delete - move to deleted folder
                new_key = f"deleted/{datetime.utcnow().strftime('%Y/%m/%d')}/{key}"
                self._client.copy_object(
                    Bucket=self._bucket_name,
                    CopySource={'Bucket': self._bucket_name, 'Key': key},
                    Key=new_key
                )
                self._client.delete_object(
                    Bucket=self._bucket_name,
                    Key=key
                )

            logger.info(f"Successfully deleted file from S3: {key}")
            return True

        except ClientError as e:
            logger.error(f"Failed to delete file from S3: {str(e)}")
            raise IntegrationError(
                message="Failed to delete file from S3",
                error_code=6007,
                details={'error': str(e), 'key': key}
            )