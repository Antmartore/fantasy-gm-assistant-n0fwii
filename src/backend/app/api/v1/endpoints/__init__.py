# Python 3.11+
from fastapi import APIRouter
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import MetricsCollector  # version: 0.16+

# Internal router imports
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.teams import router as teams_router
from app.api.v1.endpoints.players import router as players_router
from app.api.v1.endpoints.trades import router as trades_router
from app.api.v1.endpoints.simulations import router as simulations_router
from app.api.v1.endpoints.lineups import router as lineups_router
from app.api.v1.endpoints.users import router as users_router
from app.api.v1.endpoints.analytics import router as analytics_router
from app.api.v1.endpoints.media import router as media_router

# Core imports
from app.core.security import rate_limiter

# Initialize main v1 router
router = APIRouter(prefix='/v1', tags=['v1'])

# Rate limits per minute for each endpoint type
RATE_LIMITS = {
    'auth': '100/min',
    'teams': '100/min',
    'players': '200/min',
    'trades': '50/min',
    'simulations': '20/min',
    'lineups': '100/min',
    'users': '100/min',
    'analytics': '200/min',
    'media': '50/min'
}

# CORS configuration
CORS_ORIGINS = [
    'https://*.fantasygm.com',
    'http://localhost:*'
]

def configure_router(router: APIRouter) -> APIRouter:
    """
    Configures the main API router with security, monitoring, and rate limiting.
    
    Args:
        router: Base APIRouter instance
        
    Returns:
        APIRouter: Configured router with all middleware and endpoints
    """
    # Add CORS middleware
    router.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Total-Count", "X-Rate-Limit-Remaining"]
    )

    # Configure rate limiting for each endpoint
    for endpoint, limit in RATE_LIMITS.items():
        rate_limiter.configure_endpoint(endpoint, limit)

    # Initialize metrics collector
    metrics = MetricsCollector()
    metrics.configure_router(router)

    # Include all endpoint routers with rate limiting and monitoring
    router.include_router(
        auth_router,
        prefix="/auth",
        tags=["Authentication"]
    )

    router.include_router(
        teams_router,
        prefix="/teams",
        tags=["Teams"]
    )

    router.include_router(
        players_router,
        prefix="/players",
        tags=["Players"]
    )

    router.include_router(
        trades_router,
        prefix="/trades",
        tags=["Trades"]
    )

    router.include_router(
        simulations_router,
        prefix="/simulations",
        tags=["Simulations"]
    )

    router.include_router(
        lineups_router,
        prefix="/lineups",
        tags=["Lineups"]
    )

    router.include_router(
        users_router,
        prefix="/users",
        tags=["Users"]
    )

    router.include_router(
        analytics_router,
        prefix="/analytics",
        tags=["Analytics"]
    )

    router.include_router(
        media_router,
        prefix="/media",
        tags=["Media"]
    )

    return router

# Configure and export the v1 router
router = configure_router(router)

# Export all endpoint routers for testing and documentation
__all__ = [
    'router',
    'auth_router',
    'teams_router', 
    'players_router',
    'trades_router',
    'simulations_router',
    'lineups_router',
    'users_router',
    'analytics_router',
    'media_router'
]