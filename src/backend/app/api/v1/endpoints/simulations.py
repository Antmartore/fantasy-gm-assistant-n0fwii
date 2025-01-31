# Python 3.11+
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi_limiter.depends import RateLimiter

from app.schemas.simulation import (
    SimulationBase, SimulationCreate, SimulationResponse, SimulationResult
)
from app.ml.monte_carlo import MonteCarloSimulator
from app.services.gpt_service import GPTService
from app.services.redis_service import RedisService
from app.core.exceptions import SimulationError
from app.core.logging import get_logger

# Initialize router, services and logger
router = APIRouter(prefix="/simulations", tags=["simulations"])
logger = get_logger(__name__)

# Constants
SIMULATION_TIMEOUT = 300  # 5 minutes
CACHE_TTL = 900  # 15 minutes
MAX_PARALLEL_SIMS = 4

# Initialize services
redis_service = RedisService()
monte_carlo = MonteCarloSimulator(n_processes=MAX_PARALLEL_SIMS)
gpt_service = GPTService()

@router.get(
    "/{simulation_id}",
    response_model=SimulationResponse,
    dependencies=[Depends(RateLimiter(calls=100, period=60))]
)
async def get_simulation(
    simulation_id: UUID,
    db: AsyncSession
) -> SimulationResponse:
    """
    Retrieve a specific simulation by ID with Redis caching.

    Args:
        simulation_id: Unique identifier of the simulation
        db: Database session

    Returns:
        SimulationResponse: Simulation details and results

    Raises:
        HTTPException: If simulation not found or other errors occur
    """
    cache_key = f"simulation:{simulation_id}"
    
    try:
        # Check cache first
        cached_result = await redis_service.get(cache_key)
        if cached_result:
            logger.debug(f"Cache hit for simulation {simulation_id}")
            return SimulationResponse(**cached_result)

        # Query database if not in cache
        simulation = await db.get(simulation_id)
        if not simulation:
            raise HTTPException(
                status_code=404,
                detail=f"Simulation {simulation_id} not found"
            )

        # Cache result before returning
        await redis_service.set(
            key=cache_key,
            value=simulation.dict(),
            ttl=CACHE_TTL
        )

        return SimulationResponse(**simulation.dict())

    except Exception as e:
        logger.error(f"Error retrieving simulation {simulation_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve simulation"
        )

@router.post(
    "/",
    response_model=SimulationResponse,
    dependencies=[Depends(RateLimiter(calls=50, period=60))]
)
async def create_simulation(
    simulation_data: SimulationCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession
) -> SimulationResponse:
    """
    Create and start a new Monte Carlo simulation with parallel processing.

    Args:
        simulation_data: Simulation parameters
        background_tasks: FastAPI background tasks
        db: Database session

    Returns:
        SimulationResponse: Created simulation details

    Raises:
        HTTPException: If simulation creation fails
    """
    try:
        # Create initial simulation record
        simulation = SimulationBase(
            id=UUID(),
            team_id=simulation_data.team_id,
            created_at=datetime.utcnow(),
            status="pending"
        )

        # Save to database
        db.add(simulation)
        await db.commit()
        await db.refresh(simulation)

        # Queue simulation in background
        background_tasks.add_task(
            run_simulation,
            simulation.id,
            simulation_data,
            db
        )

        return SimulationResponse(**simulation.dict())

    except Exception as e:
        logger.error(f"Error creating simulation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create simulation"
        )

async def run_simulation(
    simulation_id: UUID,
    simulation_data: SimulationCreate,
    db: AsyncSession
) -> None:
    """
    Background task to run Monte Carlo simulation with parallel processing.

    Args:
        simulation_id: Unique identifier of the simulation
        simulation_data: Simulation parameters
        db: Database session
    """
    try:
        # Update simulation status
        simulation = await db.get(simulation_id)
        simulation.status = "running"
        await db.commit()

        # Run Monte Carlo simulation
        results = await monte_carlo.simulate_season_outcomes(
            team_id=simulation_data.team_id,
            weeks_to_simulate=simulation_data.weeks_to_simulate,
            include_injuries=simulation_data.include_injuries,
            include_weather=simulation_data.include_weather,
            include_matchups=simulation_data.include_matchups
        )

        # Generate AI insights
        insights = await gpt_service.generate_lineup_insights(results)

        # Update simulation with results
        simulation.status = "completed"
        simulation.completed_at = datetime.utcnow()
        simulation.results = SimulationResult(
            playoff_odds=results["playoff_odds"],
            final_record=results["final_record"],
            points_per_week=results["points_per_week"],
            weekly_projections=results["weekly_projections"],
            player_contributions=results["player_contributions"],
            confidence_intervals=results["confidence_intervals"],
            trend_analysis=results["trend_analysis"],
            risk_factors=results["risk_factors"]
        )
        simulation.performance_metrics = {
            "execution_time_ms": results["execution_time_ms"],
            "iterations_count": results["iterations_count"]
        }

        await db.commit()

        # Update cache
        cache_key = f"simulation:{simulation_id}"
        await redis_service.set(
            key=cache_key,
            value=simulation.dict(),
            ttl=CACHE_TTL
        )

    except Exception as e:
        logger.error(f"Error running simulation {simulation_id}: {str(e)}")
        simulation.status = "failed"
        simulation.error_message = str(e)
        await db.commit()

@router.get(
    "/",
    response_model=List[SimulationResponse],
    dependencies=[Depends(RateLimiter(calls=100, period=60))]
)
async def list_simulations(
    team_id: UUID,
    db: AsyncSession,
    skip: int = 0,
    limit: int = 10,
    status: Optional[str] = None
) -> List[SimulationResponse]:
    """
    List all simulations for a team with pagination and filtering.

    Args:
        team_id: Team identifier
        db: Database session
        skip: Number of records to skip
        limit: Maximum number of records to return
        status: Optional status filter

    Returns:
        List[SimulationResponse]: Paginated list of simulations

    Raises:
        HTTPException: If listing fails
    """
    try:
        cache_key = f"simulations:team:{team_id}:skip:{skip}:limit:{limit}:status:{status}"
        
        # Check cache
        cached_result = await redis_service.get(cache_key)
        if cached_result:
            return [SimulationResponse(**sim) for sim in cached_result]

        # Build query
        query = db.query(SimulationBase).filter(SimulationBase.team_id == team_id)
        if status:
            query = query.filter(SimulationBase.status == status)

        # Apply pagination
        simulations = await query.offset(skip).limit(limit).all()
        
        # Cache results
        result = [sim.dict() for sim in simulations]
        await redis_service.set(key=cache_key, value=result, ttl=300)

        return [SimulationResponse(**sim) for sim in result]

    except Exception as e:
        logger.error(f"Error listing simulations for team {team_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to list simulations"
        )