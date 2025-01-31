# Python 3.11+
import logging
from logging.config import fileConfig
from typing import Dict

from alembic import context  # alembic v1.5+
from sqlalchemy import engine_from_config, pool  # sqlalchemy v1.4+
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings

# Initialize logging
logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger("alembic.env")

# Load alembic.ini config
config = context.config

# Load logging configuration if present
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set SQLAlchemy URL from settings
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Import all models here for Alembic to detect
from app.models.base import Base  # noqa
target_metadata = Base.metadata

# Connection pool settings
POOL_SIZE = 5
MAX_OVERFLOW = 10
POOL_RECYCLE = 3600  # 1 hour
POOL_TIMEOUT = 30

def get_engine_config() -> Dict:
    """
    Creates SQLAlchemy engine configuration with optimized connection pooling settings.
    
    Returns:
        Dict: Engine configuration dictionary with pool settings
    """
    return {
        'sqlalchemy.pool_size': POOL_SIZE,
        'sqlalchemy.max_overflow': MAX_OVERFLOW,
        'sqlalchemy.pool_recycle': POOL_RECYCLE,
        'sqlalchemy.pool_timeout': POOL_TIMEOUT,
        'sqlalchemy.pool_pre_ping': True,
        'sqlalchemy.echo': settings.DEBUG,
        'sqlalchemy.pool_class': pool.QueuePool,
        'sqlalchemy.connect_args': {
            'statement_timeout': 60000,  # 60 seconds
            'application_name': 'fantasy_gm_migrations'
        }
    }

def run_migrations_offline() -> None:
    """
    Executes database migrations in offline mode for generating SQL scripts.
    Useful for generating migration SQL without database connection.
    """
    try:
        url = config.get_main_option("sqlalchemy.url")
        context.configure(
            url=url,
            target_metadata=target_metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
            compare_type=True,
            compare_server_default=True
        )

        with context.begin_transaction():
            context.run_migrations()
            logger.info("Offline migrations completed successfully")

    except Exception as e:
        logger.error(f"Error during offline migrations: {str(e)}")
        raise

def run_migrations_online() -> None:
    """
    Executes database migrations in online mode with active connection and enhanced error handling.
    Implements connection pooling and transaction management for safe migrations.
    """
    # Update engine configuration with pooling settings
    configuration = config.get_section(config.config_ini_section)
    configuration.update(get_engine_config())
    
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.QueuePool
    )

    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
                compare_server_default=True,
                include_schemas=True,
                transaction_per_migration=True,
                render_as_batch=True
            )

            with context.begin_transaction():
                context.run_migrations()
                logger.info("Online migrations completed successfully")

    except SQLAlchemyError as e:
        logger.error(f"Database error during migrations: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during migrations: {str(e)}")
        raise
    finally:
        connectable.dispose()

if context.is_offline_mode():
    logger.info("Running migrations in offline mode")
    run_migrations_offline()
else:
    logger.info("Running migrations in online mode")
    run_migrations_online()