# Python 3.11+
import pytest
import pytest_asyncio  # pytest-asyncio v0.21+
import pytest_timeout  # pytest-timeout v2.1+
from typing import Dict, Any
import asyncio
import json
from datetime import datetime

from tests.conftest import (
    event_loop,
    test_redis,
    test_firebase,
    test_db,
    mock_settings
)

# Test configuration constants
TEST_TIMEOUT = 5.0  # Maximum test execution time in seconds for performance requirements
TEST_MODULES = [
    'test_simulation_tasks',  # Monte Carlo simulation worker tests
    'test_media_tasks',       # Video/audio generation worker tests
    'test_analytics_tasks'    # Data processing worker tests
]
PERFORMANCE_THRESHOLD = 0.95  # Required 95% success rate for performance tests
MOCK_SERVICES = {
    "sqs": "moto",           # Mock AWS SQS for worker queue testing
    "redis": "fakeredis",    # Mock Redis for caching and pub/sub
    "s3": "moto"            # Mock S3 for media storage
}

def pytest_configure(config: Any) -> None:
    """
    Configure pytest for worker service tests with comprehensive setup.
    
    Args:
        config: Pytest configuration object
    """
    # Register worker-specific test markers
    config.addinivalue_line(
        "markers",
        "simulation: tests for Monte Carlo simulation workers"
    )
    config.addinivalue_line(
        "markers",
        "media: tests for media generation workers"
    )
    config.addinivalue_line(
        "markers",
        "analytics: tests for data processing workers"
    )
    
    # Configure async test settings
    config.option.asyncio_mode = "auto"
    
    # Set test timeouts for performance requirements
    config.option.timeout = TEST_TIMEOUT
    config.option.timeout_method = "thread"
    
    # Configure test parallelization
    config.option.numprocesses = 4
    
    # Register custom test result processors
    config.addinivalue_line(
        "reportchase",
        "performance_report: report on worker performance metrics"
    )
    
    # Set environment variables for testing
    config.setenv("TESTING", "true")
    config.setenv("AWS_DEFAULT_REGION", "us-east-1")
    
    # Initialize performance tracking
    config.stash['performance_metrics'] = {
        'total_tests': 0,
        'passed_tests': 0,
        'response_times': [],
        'start_time': datetime.utcnow()
    }

@pytest.fixture(scope='session', autouse=True)
async def cleanup_test_resources(request: Any) -> None:
    """
    Clean up test resources and reset mock services after test execution.
    
    Args:
        request: Pytest request object
    """
    # Setup phase
    moto_sqs = pytest.importorskip("moto").mock_sqs()
    moto_s3 = pytest.importorskip("moto").mock_s3()
    
    moto_sqs.start()
    moto_s3.start()
    
    # Create test SQS queues
    import boto3
    sqs = boto3.client('sqs', region_name='us-east-1')
    sqs.create_queue(QueueName='test-simulation-queue')
    sqs.create_queue(QueueName='test-media-queue')
    sqs.create_queue(QueueName='test-analytics-queue')
    
    # Create test S3 bucket
    s3 = boto3.client('s3', region_name='us-east-1')
    s3.create_bucket(Bucket='test-fantasy-gm-bucket')
    
    yield
    
    # Cleanup phase
    try:
        # Clear Redis test data
        redis = request.getfixturevalue('test_redis')
        await redis.flushall()
        
        # Delete test queues
        for queue in ['test-simulation-queue', 'test-media-queue', 'test-analytics-queue']:
            queue_url = sqs.get_queue_url(QueueName=queue)['QueueUrl']
            sqs.delete_queue(QueueUrl=queue_url)
            
        # Empty and delete test bucket
        objects = s3.list_objects_v2(Bucket='test-fantasy-gm-bucket')
        if 'Contents' in objects:
            for obj in objects['Contents']:
                s3.delete_object(Bucket='test-fantasy-gm-bucket', Key=obj['Key'])
        s3.delete_bucket(Bucket='test-fantasy-gm-bucket')
        
        # Stop mock services
        moto_sqs.stop()
        moto_s3.stop()
        
        # Reset performance metrics
        if hasattr(request.config, 'stash'):
            request.config.stash['performance_metrics'] = {
                'total_tests': 0,
                'passed_tests': 0,
                'response_times': [],
                'start_time': datetime.utcnow()
            }
            
    except Exception as e:
        pytest.fail(f"Failed to cleanup test resources: {str(e)}")