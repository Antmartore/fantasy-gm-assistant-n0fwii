# Python 3.11+
import click  # click v8.0+
import logging
import sys
from datetime import datetime
from typing import Optional

from alembic.util.exc import CommandError
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from migrations.env import run_migrations_offline, run_migrations_online

# Initialize logger
logger = logging.getLogger(__name__)

def setup_logging() -> None:
    """
    Configures comprehensive logging system for migration execution with timestamp formatting
    and console output for immediate feedback.
    """
    # Set root logger level
    logger.setLevel(logging.INFO)

    # Create console handler with formatting
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)

    # Create formatter with timestamp
    formatter = logging.Formatter(
        '[%(asctime)s] %(levelname)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    console_handler.setFormatter(formatter)

    # Add handler to logger if not already added
    if not logger.handlers:
        logger.addHandler(console_handler)

    # Ensure propagation to root logger
    logger.propagate = True

@click.command()
@click.option(
    '--offline',
    is_flag=True,
    help='Run migrations in offline mode for isolated environments'
)
def run_migrations(offline: bool = False) -> None:
    """
    Executes database migrations with comprehensive error handling and logging.
    
    Args:
        offline (bool): Flag to run migrations in offline mode
    """
    start_time = datetime.now()
    exit_code = 0
    
    try:
        # Initialize logging
        setup_logging()
        
        # Log migration start
        logger.info(
            f"Starting database migrations in {'offline' if offline else 'online'} mode"
        )
        logger.info(f"Using database URL: {settings.DATABASE_URL.split('@')[1]}")  # Hide credentials
        
        # Execute migrations based on mode
        if offline:
            logger.info("Running offline migrations...")
            run_migrations_offline()
        else:
            logger.info("Running online migrations with transaction safety...")
            run_migrations_online()
        
        # Calculate execution time
        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"Migrations completed successfully in {execution_time:.2f} seconds")
        
    except SQLAlchemyError as e:
        logger.error(f"Database error during migration: {str(e)}")
        logger.error("Rolling back any incomplete migrations...")
        exit_code = 1
        
    except CommandError as e:
        logger.error(f"Alembic command error: {str(e)}")
        logger.error("Migration failed - check alembic version history")
        exit_code = 1
        
    except Exception as e:
        logger.error(f"Unexpected error during migration: {str(e)}")
        logger.error("Migration failed - manual intervention may be required")
        exit_code = 1
        
    finally:
        if exit_code != 0:
            logger.info(
                "Migration encountered errors. Please check logs and database state."
            )
            execution_time = (datetime.now() - start_time).total_seconds()
            logger.info(f"Migration process ended after {execution_time:.2f} seconds")
        sys.exit(exit_code)

if __name__ == '__main__':
    run_migrations()