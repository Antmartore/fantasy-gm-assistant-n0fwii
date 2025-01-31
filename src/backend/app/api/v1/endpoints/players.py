# Python 3.11+
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Request, BackgroundTasks, Query
from sqlalchemy.orm import Session
from prometheus_fastapi_instrumentator import Instrumentator  # v5.9.0
from redis_cache import RedisCache  # v2.0.0

from app.models.player import Player
from app.core.security import rate_limit
from app.core.exceptions import ValidationError, RateLimitError
from app.core.logging import get_logger, CORRELATION_ID_CTX_VAR
from app.utils.enums import SportType, PlayerPosition
from app.utils.validators import SportValidator
from app.core.config import settings
from app.services.sportradar import SportradarService
from app.schemas.player import PlayerBase, PlayerList, PlayerStats

# Initialize components
logger = get_logger(__name__)
sport_validator = SportValidator()
redis_cache = RedisCache(
    host=settings.REDIS_URL,
    port=6379,
    db=0,
    password=settings.REDIS_PASSWORD.get_secret_value() if settings.REDIS_PASSWORD else None,
    decode_responses=True
)

# Configure router
router = APIRouter(prefix="/players", tags=["players"])

# Constants
CACHE_TTL = settings.CACHE_TTL_PLAYER_STATS  # 15 minutes
RATE_LIMIT_LIST = settings.RATE_LIMIT_PLAYERS  # 200/minute
RATE_LIMIT_REFRESH = 20  # 20/minute

@router.get("/", response_model=PlayerList)
@rate_limit(limit=RATE_LIMIT_LIST)
async def get_players(
    request: Request,
    db: Session = Depends(get_db),
    sport: Optional[SportType] = None,
    team: Optional[str] = None,
    position: Optional[PlayerPosition] = None,
    status: Optional[str] = Query(None, regex="^(ACTIVE|INJURED|INACTIVE)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
) -> PlayerList:
    """
    Retrieve a paginated list of players with optional filtering and caching.
    
    Args:
        request: FastAPI request object
        db: Database session
        sport: Optional sport type filter
        team: Optional team name filter
        position: Optional position filter
        status: Optional player status filter
        skip: Number of records to skip
        limit: Maximum number of records to return
        
    Returns:
        PlayerList: Paginated list of players matching filters
        
    Raises:
        ValidationError: If invalid filter parameters provided
        RateLimitError: If rate limit exceeded
    """
    try:
        # Set correlation ID for request tracking
        correlation_id = str(request.headers.get("X-Correlation-ID", UUID()))
        CORRELATION_ID_CTX_VAR.set(correlation_id)
        
        # Validate sport type if provided
        if sport and not sport_validator.validate_sport(sport)[0]:
            raise ValidationError(
                message=f"Invalid sport type: {sport}",
                error_code=3001
            )
            
        # Build cache key
        cache_key = f"players:{sport}:{team}:{position}:{status}:{skip}:{limit}"
        
        # Try to get from cache
        cached_result = redis_cache.get(cache_key)
        if cached_result:
            logger.info(
                "Retrieved players from cache",
                extra={
                    "correlation_id": correlation_id,
                    "cache_hit": True
                }
            )
            return PlayerList.parse_raw(cached_result)
            
        # Build query with filters
        query = db.query(Player)
        if sport:
            query = query.filter(Player.sport == sport)
        if team:
            query = query.filter(Player.team == team)
        if position:
            query = query.filter(Player.position == position)
        if status:
            query = query.filter(Player.status == status)
            
        # Execute query with pagination
        total = query.count()
        players = query.offset(skip).limit(limit).all()
        
        # Prepare response
        result = PlayerList(
            items=[PlayerBase.from_orm(p) for p in players],
            total=total,
            skip=skip,
            limit=limit
        )
        
        # Cache result
        redis_cache.set(cache_key, result.json(), ttl=CACHE_TTL)
        
        logger.info(
            "Retrieved players from database",
            extra={
                "correlation_id": correlation_id,
                "cache_hit": False,
                "total_players": total
            }
        )
        
        return result
        
    except Exception as e:
        logger.error(
            f"Error retrieving players: {str(e)}",
            extra={"correlation_id": correlation_id},
            exc_info=True
        )
        raise

@router.post("/{player_id}/refresh", response_model=dict)
@rate_limit(limit=RATE_LIMIT_REFRESH)
async def refresh_player_stats(
    player_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sportradar_service: SportradarService = Depends(get_sportradar_service)
) -> dict:
    """
    Refresh player statistics asynchronously using Sportradar API.
    
    Args:
        player_id: UUID of player to refresh
        background_tasks: FastAPI background tasks
        db: Database session
        sportradar_service: Sportradar API service
        
    Returns:
        dict: Acknowledgment of refresh request
        
    Raises:
        ValidationError: If player not found
        RateLimitError: If rate limit exceeded
    """
    try:
        # Verify player exists
        player = db.query(Player).filter(Player.id == player_id).first()
        if not player:
            raise ValidationError(
                message=f"Player not found: {player_id}",
                error_code=3002
            )
            
        # Queue background task for stats refresh
        async def refresh_stats():
            try:
                # Get fresh stats from Sportradar
                new_stats = await sportradar_service.get_player_stats(
                    player.external_id,
                    player.sport
                )
                
                # Update player stats
                player.update_stats(new_stats)
                db.commit()
                
                # Invalidate cache
                cache_pattern = f"players:*"
                redis_cache.delete_pattern(cache_pattern)
                
                logger.info(
                    f"Successfully refreshed stats for player {player_id}",
                    extra={"player_id": str(player_id)}
                )
                
            except Exception as e:
                logger.error(
                    f"Error refreshing player stats: {str(e)}",
                    extra={"player_id": str(player_id)},
                    exc_info=True
                )
                
        background_tasks.add_task(refresh_stats)
        
        return {
            "message": "Stats refresh queued successfully",
            "player_id": str(player_id)
        }
        
    except Exception as e:
        logger.error(
            f"Error queueing stats refresh: {str(e)}",
            extra={"player_id": str(player_id)},
            exc_info=True
        )
        raise

# Initialize monitoring
instrumentator = Instrumentator().instrument(router)