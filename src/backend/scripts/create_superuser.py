#!/usr/bin/env python3
# Python 3.11+

import click
import re
import getpass
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings, PROJECT_NAME
from app.models.user import User
from app.core.security import get_password_hash
from app.core.logging import get_logger

# Initialize logger
logger = get_logger(__name__)

# Constants for security validation
EMAIL_REGEX = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
PASSWORD_MIN_LENGTH = 12
MAX_LOGIN_ATTEMPTS = 3

def validate_email(email: str) -> bool:
    """
    Validate email format using regex pattern.
    
    Args:
        email: Email address to validate
        
    Returns:
        bool: True if email is valid, False otherwise
    """
    return bool(re.match(EMAIL_REGEX, email))

def validate_password(password: str) -> bool:
    """
    Validate password complexity requirements.
    
    Args:
        password: Password to validate
        
    Returns:
        bool: True if password meets all requirements
    """
    if len(password) < PASSWORD_MIN_LENGTH:
        return False
    
    # Check for at least one uppercase letter
    if not any(c.isupper() for c in password):
        return False
    
    # Check for at least one lowercase letter
    if not any(c.islower() for c in password):
        return False
    
    # Check for at least one digit
    if not any(c.isdigit() for c in password):
        return False
    
    # Check for at least one special character
    special_chars = "!@#$%^&*()_+-=[]{}|;:,.<>?"
    if not any(c in special_chars for c in password):
        return False
    
    return True

@click.command()
@click.option('--email', prompt=True, help='Superuser email address')
@click.option('--name', prompt=True, help='Superuser name')
def create_superuser(email: str, name: str) -> None:
    """
    CLI command to create a superuser account with enhanced security validation.
    
    Args:
        email: Email address for superuser
        name: Display name for superuser
    """
    try:
        # Validate email format
        if not validate_email(email):
            logger.error(f"Invalid email format: {email}")
            click.echo("Error: Invalid email format. Please use a valid email address.")
            return

        # Initialize database connection
        engine = create_engine(settings.DATABASE_URL)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        db = SessionLocal()

        # Check if superuser already exists
        existing_user = db.query(User).filter(User.email == email.lower()).first()
        if existing_user:
            logger.warning(f"Attempted to create duplicate superuser: {email}")
            click.echo("Error: A user with this email already exists.")
            return

        # Password input with validation
        attempts = 0
        while attempts < MAX_LOGIN_ATTEMPTS:
            password = getpass.getpass("Enter password: ")
            password_confirm = getpass.getpass("Confirm password: ")

            if password != password_confirm:
                logger.warning("Password confirmation mismatch")
                click.echo("Error: Passwords do not match.")
                attempts += 1
                continue

            if not validate_password(password):
                click.echo(
                    "Error: Password must contain at least:\n"
                    f"- {PASSWORD_MIN_LENGTH} characters\n"
                    "- One uppercase letter\n"
                    "- One lowercase letter\n"
                    "- One number\n"
                    "- One special character (!@#$%^&*()_+-=[]{}|;:,.<>?)"
                )
                attempts += 1
                continue

            break
        else:
            logger.error("Maximum password attempts exceeded")
            click.echo("Error: Maximum password attempts exceeded. Please try again later.")
            return

        # Create superuser
        hashed_password = get_password_hash(password)
        superuser = User(
            email=email.lower(),
            name=name,
            hashed_password=hashed_password
        )
        superuser.role = "ADMIN"
        superuser.is_active = True
        superuser.is_premium = True

        # Save to database
        try:
            db.add(superuser)
            db.commit()
            logger.info(
                f"Superuser created successfully: {email}",
                extra={
                    'security_event': 'superuser_created',
                    'user_email': email
                }
            )
            click.echo(f"Superuser {email} created successfully!")
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(
                f"Database error creating superuser: {str(e)}",
                extra={'error_details': str(e)}
            )
            click.echo("Error: Failed to create superuser. Please check the logs.")
            return

    except Exception as e:
        logger.error(
            f"Unexpected error creating superuser: {str(e)}",
            extra={'error_details': str(e)}
        )
        click.echo(f"Error: An unexpected error occurred. Please check the logs.")
    finally:
        db.close()

if __name__ == "__main__":
    click.echo(f"=== {PROJECT_NAME} Superuser Creation ===")
    create_superuser()