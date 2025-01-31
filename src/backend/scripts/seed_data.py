"""
Database seeding script for Fantasy GM Assistant with comprehensive data initialization
across NFL, NBA, and MLB leagues with platform-specific mappings and validations.
"""

# Python 3.11+
import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

import aiofiles  # v23.1+
from sqlalchemy.ext.asyncio import AsyncSession  # v2.0+

from app.models.team import Team
from app.models.player import Player
from app.utils.enums import SportType, Platform, PlayerPosition
from app.core.config import settings

# Configure logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Constants
SEED_DATA_PATH = Path('data/seed')
BATCH_SIZE = settings.BATCH_SIZE or 1000

class DataValidationError(Exception):
    """Custom exception for data validation errors."""
    pass

async def load_json_file(file_path: Path) -> Dict:
    """
    Asynchronously load and validate JSON data file.

    Args:
        file_path (Path): Path to JSON file

    Returns:
        Dict: Loaded JSON data

    Raises:
        DataValidationError: If file loading or validation fails
    """
    try:
        async with aiofiles.open(file_path, mode='r') as f:
            content = await f.read()
            return json.loads(content)
    except Exception as e:
        logger.error(f"Error loading {file_path}: {str(e)}")
        raise DataValidationError(f"Failed to load seed data: {str(e)}")

async def seed_teams(session: AsyncSession) -> None:
    """
    Seeds sample fantasy teams with platform-specific configurations.

    Args:
        session (AsyncSession): Database session

    Raises:
        DataValidationError: If team data validation fails
    """
    logger.info("Starting team seeding process...")
    
    try:
        teams_data = await load_json_file(SEED_DATA_PATH / 'teams.json')
        
        for sport in settings.SUPPORTED_SPORTS:
            for platform in [Platform.ESPN, Platform.SLEEPER]:
                platform_teams = teams_data.get(sport.value, {}).get(platform.value, [])
                
                for team_data in platform_teams:
                    team = Team(
                        id=uuid4(),
                        name=team_data['name'],
                        sport=sport,
                        platform=platform,
                        settings={
                            'scoring_type': team_data.get('scoring_type', 'standard'),
                            'roster_size': team_data.get('roster_size', 16),
                            'platform_team_id': team_data.get('platform_id'),
                            'draft_position': team_data.get('draft_position'),
                            'league_size': team_data.get('league_size', 12)
                        }
                    )
                    session.add(team)
                    
                if len(platform_teams) > 0:
                    await session.flush()
                    logger.info(f"Seeded {len(platform_teams)} teams for {sport.value} on {platform.value}")
        
        await session.commit()
        logger.info("Team seeding completed successfully")
        
    except Exception as e:
        await session.rollback()
        logger.error(f"Team seeding failed: {str(e)}")
        raise DataValidationError(f"Team seeding failed: {str(e)}")

async def seed_players(session: AsyncSession) -> None:
    """
    Seeds comprehensive player data with stats and metadata.

    Args:
        session (AsyncSession): Database session

    Raises:
        DataValidationError: If player data validation fails
    """
    logger.info("Starting player seeding process...")
    
    try:
        for sport in settings.SUPPORTED_SPORTS:
            players_data = await load_json_file(SEED_DATA_PATH / f'players_{sport.value.lower()}.json')
            batch = []
            
            for player_data in players_data:
                player = Player(
                    name=player_data['name'],
                    external_id=player_data['external_id'],
                    sport=sport,
                    position=PlayerPosition[player_data['position']],
                    team=player_data['team'],
                    initial_stats=player_data.get('stats', {}),
                    initial_projections=player_data.get('projections', {})
                )
                
                # Set additional metadata
                player.injury_history = player_data.get('injury_history', [])
                player.social_sentiment = player_data.get('social_sentiment', {
                    'score': 0.0,
                    'trend': 'neutral',
                    'mentions': 0
                })
                
                batch.append(player)
                
                if len(batch) >= BATCH_SIZE:
                    session.add_all(batch)
                    await session.flush()
                    batch = []
                    
            if batch:
                session.add_all(batch)
                await session.flush()
                
            logger.info(f"Seeded {len(players_data)} players for {sport.value}")
        
        await session.commit()
        logger.info("Player seeding completed successfully")
        
    except Exception as e:
        await session.rollback()
        logger.error(f"Player seeding failed: {str(e)}")
        raise DataValidationError(f"Player seeding failed: {str(e)}")

async def verify_seed_data(session: AsyncSession) -> bool:
    """
    Verifies seeded data integrity and relationships.

    Args:
        session (AsyncSession): Database session

    Returns:
        bool: True if verification passes, False otherwise
    """
    try:
        # Verify teams
        for sport in settings.SUPPORTED_SPORTS:
            team_count = await session.scalar(
                select(func.count(Team.id)).where(Team.sport == sport)
            )
            if team_count == 0:
                logger.error(f"No teams found for {sport.value}")
                return False
                
            # Verify players
            player_count = await session.scalar(
                select(func.count(Player.id)).where(Player.sport == sport)
            )
            if player_count == 0:
                logger.error(f"No players found for {sport.value}")
                return False
                
        logger.info("Seed data verification completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"Seed data verification failed: {str(e)}")
        return False

async def main() -> None:
    """
    Main entry point for database seeding with enhanced error handling.
    """
    try:
        logger.info("Starting database seeding process...")
        
        # Initialize database session
        async with AsyncSession() as session:
            # Seed teams first to establish relationships
            await seed_teams(session)
            
            # Seed players with comprehensive data
            await seed_players(session)
            
            # Verify seeded data
            if not await verify_seed_data(session):
                raise DataValidationError("Seed data verification failed")
                
        logger.info("Database seeding completed successfully")
        
    except Exception as e:
        logger.error(f"Database seeding failed: {str(e)}")
        raise

if __name__ == "__main__":
    asyncio.run(main())