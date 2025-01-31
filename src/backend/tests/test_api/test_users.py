# Python 3.11+
import pytest
import pytest_asyncio
from datetime import datetime, timedelta
import uuid
from typing import Dict, Any
from unittest.mock import Mock, patch

from fastapi import HTTPException
from firebase_admin import auth as firebase_auth
from jose import jwt

from app.schemas.user import UserCreate, UserUpdate, UserResponse, UserLogin
from app.models.user import User
from app.utils.enums import UserRole
from app.core.security import (
    create_access_token,
    verify_token,
    get_password_hash,
    verify_password
)
from app.core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ValidationError,
    RateLimitError
)

# Test constants
TEST_USER_DATA = {
    "email": "test@example.com",
    "password": "Test123!@#",
    "name": "Test User",
    "mfa_enabled": True
}

TEST_PREMIUM_USER_DATA = {
    "email": "premium@example.com",
    "password": "Premium123!@#",
    "name": "Premium User",
    "mfa_enabled": True,
    "is_premium": True
}

@pytest.fixture
def mock_firebase():
    """Fixture for mocking Firebase authentication."""
    with patch('firebase_admin.auth') as mock_auth:
        mock_auth.create_user.return_value = Mock(uid='test_firebase_uid')
        mock_auth.verify_id_token.return_value = {
            'uid': 'test_firebase_uid',
            'email': TEST_USER_DATA['email']
        }
        yield mock_auth

@pytest.fixture
async def test_user(db_session) -> User:
    """Fixture for creating a test user in the database."""
    user = User(
        email=TEST_USER_DATA['email'],
        name=TEST_USER_DATA['name'],
        password=TEST_USER_DATA['password']
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user

@pytest.fixture
def auth_headers(test_user) -> Dict[str, str]:
    """Fixture for generating authentication headers."""
    access_token = create_access_token(
        data={"sub": str(test_user.id), "role": UserRole.FREE_USER.value}
    )
    return {"Authorization": f"Bearer {access_token}"}

@pytest.mark.asyncio
async def test_register_user_validation(client, mock_firebase, db_session):
    """Test user registration with comprehensive validation."""
    # Test email format validation
    invalid_email_data = TEST_USER_DATA.copy()
    invalid_email_data['email'] = "invalid_email"
    response = await client.post("/api/v1/users/register", json=invalid_email_data)
    assert response.status_code == 422
    assert "Invalid email format" in response.json()['message']

    # Test password strength requirements
    weak_password_data = TEST_USER_DATA.copy()
    weak_password_data['password'] = "weak"
    response = await client.post("/api/v1/users/register", json=weak_password_data)
    assert response.status_code == 422
    assert "Password must be at least 8 characters" in response.json()['message']

    # Test duplicate email prevention
    await client.post("/api/v1/users/register", json=TEST_USER_DATA)
    response = await client.post("/api/v1/users/register", json=TEST_USER_DATA)
    assert response.status_code == 400
    assert "Email already registered" in response.json()['message']

    # Test successful registration
    new_user_data = TEST_USER_DATA.copy()
    new_user_data['email'] = "new@example.com"
    response = await client.post("/api/v1/users/register", json=new_user_data)
    assert response.status_code == 201
    assert response.json()['email'] == new_user_data['email']
    assert 'id' in response.json()

@pytest.mark.asyncio
async def test_login_security(client, test_user, mock_firebase):
    """Test comprehensive login security features."""
    login_data = {
        "email": TEST_USER_DATA['email'],
        "password": TEST_USER_DATA['password']
    }

    # Test rate limiting
    for _ in range(6):
        response = await client.post("/api/v1/users/login", json=login_data)
    assert response.status_code == 429
    assert "Too many login attempts" in response.json()['message']

    # Test invalid credentials
    invalid_login = login_data.copy()
    invalid_login['password'] = "wrong_password"
    response = await client.post("/api/v1/users/login", json=invalid_login)
    assert response.status_code == 401
    assert "Invalid credentials" in response.json()['message']

    # Test MFA flow
    response = await client.post("/api/v1/users/login", json=login_data)
    assert response.status_code == 200
    assert 'mfa_required' in response.json()
    assert 'mfa_token' in response.json()

    # Test successful login with MFA
    mfa_data = {
        "mfa_token": response.json()['mfa_token'],
        "mfa_code": "123456"
    }
    response = await client.post("/api/v1/users/verify-mfa", json=mfa_data)
    assert response.status_code == 200
    assert 'access_token' in response.json()
    assert 'token_type' in response.json()

@pytest.mark.asyncio
async def test_role_based_access(client, auth_headers):
    """Test role-based access control implementation."""
    # Test free user permissions
    response = await client.get("/api/v1/users/premium-feature", headers=auth_headers)
    assert response.status_code == 403
    assert "Premium feature not available" in response.json()['message']

    # Test premium user access
    premium_headers = auth_headers.copy()
    premium_token = create_access_token(
        data={"sub": "test_id", "role": UserRole.PREMIUM_USER.value}
    )
    premium_headers["Authorization"] = f"Bearer {premium_token}"
    response = await client.get("/api/v1/users/premium-feature", headers=premium_headers)
    assert response.status_code == 200

    # Test admin permissions
    admin_headers = auth_headers.copy()
    admin_token = create_access_token(
        data={"sub": "test_id", "role": UserRole.ADMIN.value}
    )
    admin_headers["Authorization"] = f"Bearer {admin_token}"
    response = await client.get("/api/v1/users/admin-feature", headers=admin_headers)
    assert response.status_code == 200

@pytest.mark.asyncio
async def test_data_protection(client, test_user, auth_headers):
    """Test data security and privacy features."""
    # Test PII data encryption
    user_id = str(test_user.id)
    response = await client.get(f"/api/v1/users/{user_id}", headers=auth_headers)
    assert response.status_code == 200
    assert 'email' in response.json()
    assert 'hashed_password' not in response.json()

    # Test GDPR data export
    response = await client.get("/api/v1/users/export-data", headers=auth_headers)
    assert response.status_code == 200
    assert 'user_data' in response.json()
    assert 'activity_log' in response.json()

    # Test data deletion (GDPR right to be forgotten)
    response = await client.delete("/api/v1/users/delete-account", headers=auth_headers)
    assert response.status_code == 200
    
    # Verify account deletion
    response = await client.get(f"/api/v1/users/{user_id}", headers=auth_headers)
    assert response.status_code == 404

@pytest.mark.asyncio
async def test_token_security(client, test_user):
    """Test JWT token security features."""
    # Test token expiration
    expired_token = create_access_token(
        data={"sub": str(test_user.id)},
        expires_delta=timedelta(microseconds=1)
    )
    await pytest.sleep(0.1)
    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert response.status_code == 401
    assert "Token has expired" in response.json()['message']

    # Test token tampering
    invalid_token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.invalid"
    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {invalid_token}"}
    )
    assert response.status_code == 401
    assert "Invalid token" in response.json()['message']

@pytest.mark.asyncio
async def test_password_security(client, test_user):
    """Test password security features."""
    # Test password update with history check
    update_data = {"password": TEST_USER_DATA['password']}
    response = await client.put(
        "/api/v1/users/update-password",
        json=update_data,
        headers={"Authorization": f"Bearer {create_access_token(data={'sub': str(test_user.id)})}"}
    )
    assert response.status_code == 400
    assert "Password previously used" in response.json()['message']

    # Test password complexity requirements
    weak_passwords = [
        "short",  # Too short
        "nouppercaseornumbers",  # No uppercase or numbers
        "NoSpecialChars123",  # No special characters
        "Common_password123!"  # Common password pattern
    ]
    
    for password in weak_passwords:
        update_data = {"password": password}
        response = await client.put(
            "/api/v1/users/update-password",
            json=update_data,
            headers={"Authorization": f"Bearer {create_access_token(data={'sub': str(test_user.id)})}"}
        )
        assert response.status_code == 422