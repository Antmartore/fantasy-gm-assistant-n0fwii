# Python 3.11+
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
import json
from fastapi import status

from app.core.security import verify_password, get_password_hash, create_access_token, validate_token
from app.core.exceptions import AuthenticationError, RateLimitError

# Test constants with strong security requirements
TEST_USER_DATA = {
    "email": "test@example.com",
    "password": "Test123!@#",
    "name": "Test User",
    "phone": "+1234567890"
}

TEST_INVALID_USER_DATA = {
    "email": "invalid@email",
    "password": "short",
    "name": "",
    "phone": "invalid"
}

TEST_MFA_DATA = {
    "code": "123456",
    "session_id": "test_session_123"
}

@pytest.mark.asyncio
async def test_register_success(client, mock_firebase, mock_redis):
    """Test successful user registration with comprehensive validation."""
    # Setup Firebase mock
    mock_firebase.set_document.return_value = None
    mock_firebase.get_document.return_value = None
    
    # Setup Redis mock for rate limiting
    mock_redis.incr.return_value = 1
    mock_redis.expire.return_value = True
    
    response = await client.post(
        "/api/v1/auth/register",
        json=TEST_USER_DATA,
        headers={"X-Request-ID": "test-request-123"}
    )
    
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    
    # Verify response structure
    assert "access_token" in data
    assert "token_type" in data
    assert data["token_type"] == "bearer"
    
    # Verify security headers
    assert "X-Content-Type-Options" in response.headers
    assert "X-Frame-Options" in response.headers
    assert "X-XSS-Protection" in response.headers
    
    # Verify Firebase calls
    mock_firebase.set_document.assert_called_once()
    mock_redis.incr.assert_called_once()

@pytest.mark.asyncio
async def test_register_validation(client, mock_redis):
    """Test registration input validation with security checks."""
    # Setup rate limiting
    mock_redis.incr.return_value = 1
    
    # Test invalid email format
    response = await client.post(
        "/api/v1/auth/register",
        json={**TEST_USER_DATA, "email": "invalid-email"}
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    # Test weak password
    response = await client.post(
        "/api/v1/auth/register",
        json={**TEST_USER_DATA, "password": "weak"}
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "password" in response.json()["detail"]
    
    # Test rate limiting
    mock_redis.incr.return_value = 101  # Exceed rate limit
    response = await client.post(
        "/api/v1/auth/register",
        json=TEST_USER_DATA
    )
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS

@pytest.mark.asyncio
async def test_login_with_mfa(client, mock_firebase, mock_redis):
    """Test login flow with MFA verification."""
    # Setup Firebase mock for successful auth
    mock_firebase.verify_token.return_value = {
        "uid": "test_user_123",
        "email": TEST_USER_DATA["email"],
        "mfa_enabled": True
    }
    
    # Initial login request
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": TEST_USER_DATA["email"],
            "password": TEST_USER_DATA["password"]
        }
    )
    assert response.status_code == status.HTTP_202_ACCEPTED
    data = response.json()
    assert "mfa_required" in data
    assert "session_id" in data
    
    # Submit MFA code
    response = await client.post(
        "/api/v1/auth/mfa/verify",
        json=TEST_MFA_DATA
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    
    # Verify token security properties
    token = data["access_token"]
    decoded = validate_token(token)
    assert decoded["sub"] == "test_user_123"
    assert "exp" in decoded
    assert "iat" in decoded

@pytest.mark.asyncio
async def test_token_security(client, auth_headers):
    """Test JWT token security properties and validation."""
    # Test token expiration
    expired_token = create_access_token(
        {"sub": "test_user"},
        expires_delta=timedelta(seconds=-1)
    )
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    # Test token refresh
    response = await client.post(
        "/api/v1/auth/refresh",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    assert "access_token" in response.json()
    
    # Test token revocation
    response = await client.post(
        "/api/v1/auth/logout",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_200_OK
    
    # Verify revoked token is rejected
    response = await client.get(
        "/api/v1/auth/me",
        headers=auth_headers
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.asyncio
async def test_rate_limiting(client, mock_redis):
    """Test rate limiting implementation for auth endpoints."""
    # Setup Redis mock
    mock_redis.incr.side_effect = [1, 2, 101]  # Simulate increasing counts
    
    # Test successful requests within limit
    for _ in range(2):
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "email": TEST_USER_DATA["email"],
                "password": TEST_USER_DATA["password"]
            }
        )
        assert response.status_code != status.HTTP_429_TOO_MANY_REQUESTS
    
    # Test rate limit exceeded
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": TEST_USER_DATA["email"],
            "password": TEST_USER_DATA["password"]
        }
    )
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert "Retry-After" in response.headers

@pytest.mark.asyncio
async def test_password_reset_flow(client, mock_firebase, mock_redis):
    """Test password reset flow with security validations."""
    # Request password reset
    response = await client.post(
        "/api/v1/auth/password/reset",
        json={"email": TEST_USER_DATA["email"]}
    )
    assert response.status_code == status.HTTP_202_ACCEPTED
    
    # Verify reset token
    mock_token = "test-reset-token-123"
    response = await client.post(
        "/api/v1/auth/password/verify",
        json={"token": mock_token}
    )
    assert response.status_code == status.HTTP_200_OK
    
    # Set new password
    response = await client.post(
        "/api/v1/auth/password/update",
        json={
            "token": mock_token,
            "password": "NewTest123!@#"
        }
    )
    assert response.status_code == status.HTTP_200_OK
    
    # Verify old password no longer works
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": TEST_USER_DATA["email"],
            "password": TEST_USER_DATA["password"]
        }
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED