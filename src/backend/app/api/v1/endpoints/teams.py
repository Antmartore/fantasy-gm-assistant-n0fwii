# Python 3.11+
from typing import List, Optional
from uuid import UUID
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi_limiter.depends import RateLimiter
from cachetools import TTLCache, cached

# Internal imports
from app.models.team import Team
from app.schemas.team import TeamBase, TeamCreate, TeamUpdate, TeamResponse
from app.services.espn_service import ESPNService
from app.services.sleeper_service import SleeperService
from app.core.logging import get_logger, log_exception
from app.core.exceptions import IntegrationError
from app.utils.enums import Platform, SportType
from app.utils.constants import (
    RATE_LIMIT_TEAMS,
    CACHE_TTL_PLAYER_STATS,
    MAX_PAGINATION_LIMIT
)

# Initialize router with prefix and tags
router = APIRouter(prefix="/teams", tags=["teams"])

# Configure logging
logger = get_logger(__name__)

# Configure caching
CACHE_TTL = timedelta(minutes=15)
team_cache = TTLCache(maxsize=1000, ttl=CACHE_TTL.total_seconds())

# Rate limiting configuration
MAX_REQUESTS_PER_MINUTE = RATE_LIMIT_TEAMS

@router.get(
    "/",
    response_model=List[TeamResponse],
    dependencies=[Depends(RateLimiter(calls=MAX_REQUESTS_PER_MINUTE, period=60))]
)
async def get_teams(
    user_id: UUID,
    sport: Optional[SportType] = None,
    platform: Optional[Platform] = None,
    skip: int = 0,
    limit: int = MAX_PAGINATION_LIMIT,
    db: Session = Depends(get_db)
) -> List[TeamResponse]:
    """
    Retrieve all teams for a user with optional filtering and pagination.
    
    Args:
        user_id: User's unique identifier
        sport: Optional sport type filter
        platform: Optional platform filter
        skip: Number of records to skip
        limit: Maximum number of records to return
        db: Database session
        
    Returns:
        List of team responses with performance metrics
        
    Raises:
        HTTPException: If user not found or other errors occur
    """
    try:
        # Generate cache key
        cache_key = f"teams:{user_id}:{sport}:{platform}:{skip}:{limit}"
        
        # Check cache
        if cache_key in team_cache:
            logger.debug(f"Cache hit for teams query: {cache_key}")
            return team_cache[cache_key]

        # Build query
        query = db.query(Team).filter(Team.user_id == user_id)
        
        # Apply filters
        if sport:
            query = query.filter(Team.sport == sport)
        if platform:
            query = query.filter(Team.platform == platform)
            
        # Apply pagination
        query = query.offset(skip).limit(min(limit, MAX_PAGINATION_LIMIT))
        
        # Execute query and convert to response models
        teams = query.all()
        response = [TeamResponse.from_orm(team) for team in teams]
        
        # Cache results
        team_cache[cache_key] = response
        
        # Log metrics
        logger.info(
            "Teams retrieved successfully",
            extra={
                "user_id": str(user_id),
                "team_count": len(teams),
                "filters": {"sport": sport, "platform": platform}
            }
        )
        
        return response

    except Exception as e:
        log_exception(logger, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving teams"
        )

@router.post(
    "/{team_id}/sync",
    response_model=TeamResponse,
    dependencies=[Depends(RateLimiter(calls=50, period=60))]
)
async def sync_platform_data(
    team_id: UUID,
    db: Session = Depends(get_db)
) -> TeamResponse:
    """
    Synchronize team data with external platform (ESPN or Sleeper).
    
    Args:
        team_id: Team's unique identifier
        db: Database session
        
    Returns:
        Updated team data with platform-specific details
        
    Raises:
        HTTPException: If team not found or sync fails
    """
    try:
        # Get team from database
        team = db.query(Team).filter(Team.id == team_id).first()
        if not team:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Team not found"
            )

        # Initialize appropriate platform service
        if team.platform == Platform.ESPN:
            async with ESPNService() as service:
                platform_data = await service.get_team_data(
                    team_id=str(team_id),
                    sport_type=team.sport
                )
        elif team.platform == Platform.SLEEPER:
            async with SleeperService() as service:
                platform_data = await service.get_league_rosters(
                    league_id=team.settings.get("leagueId")
                )
        else:
            raise ValueError(f"Unsupported platform: {team.platform}")

        # Update team metrics
        team.update_metrics(
            points=platform_data.get("total_points", 0.0),
            probability=platform_data.get("win_probability", 0.0)
        )
        
        # Update team settings with platform data
        team.settings.update({
            "last_sync": datetime.utcnow().isoformat(),
            "platform_data": platform_data
        })
        
        # Save changes
        db.commit()
        db.refresh(team)
        
        # Invalidate cache
        cache_key = f"teams:{team.user_id}:*"
        for key in list(team_cache.keys()):
            if key.startswith(cache_key):
                team_cache.pop(key, None)
        
        # Log successful sync
        logger.info(
            "Team synchronized successfully",
            extra={
                "team_id": str(team_id),
                "platform": team.platform.value,
                "sport": team.sport.value
            }
        )
        
        return TeamResponse.from_orm(team)

    except IntegrationError as e:
        log_exception(logger, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Platform integration error: {str(e)}"
        )
    except Exception as e:
        log_exception(logger, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error synchronizing team: {str(e)}"
        )

# Export router
__all__ = ["router"]