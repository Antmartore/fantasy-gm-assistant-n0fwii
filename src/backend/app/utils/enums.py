# Python 3.11+
from enum import Enum, unique
from typing import List

@unique
class SportType(Enum):
    """
    Enumeration of supported sports leagues with type-safe values for platform integration.
    """
    NFL = "NFL"
    NBA = "NBA"
    MLB = "MLB"

@unique
class PlayerPosition(Enum):
    """
    Comprehensive enumeration of player positions across all supported sports with platform-specific mappings.
    """
    # NFL Positions
    QB = "QB"  # Quarterback
    RB = "RB"  # Running Back
    WR = "WR"  # Wide Receiver
    TE = "TE"  # Tight End
    K = "K"    # Kicker
    DEF = "DEF"  # Defense/Special Teams

    # NBA Positions
    PG = "PG"  # Point Guard
    SG = "SG"  # Shooting Guard
    SF = "SF"  # Small Forward
    PF = "PF"  # Power Forward
    C = "C"    # Center

    # MLB Positions
    P = "P"    # Pitcher
    C1B = "1B"  # First Base
    C2B = "2B"  # Second Base
    C3B = "3B"  # Third Base
    SS = "SS"  # Shortstop
    OF = "OF"  # Outfield
    DH = "DH"  # Designated Hitter

    @staticmethod
    def get_positions_by_sport(sport_type: SportType) -> List['PlayerPosition']:
        """
        Returns list of valid positions for a given sport type.

        Args:
            sport_type (SportType): The sport type to get positions for

        Returns:
            List[PlayerPosition]: List of valid positions for the specified sport

        Raises:
            ValueError: If invalid sport type provided
        """
        positions_map = {
            SportType.NFL: [
                PlayerPosition.QB,
                PlayerPosition.RB,
                PlayerPosition.WR,
                PlayerPosition.TE,
                PlayerPosition.K,
                PlayerPosition.DEF
            ],
            SportType.NBA: [
                PlayerPosition.PG,
                PlayerPosition.SG,
                PlayerPosition.SF,
                PlayerPosition.PF,
                PlayerPosition.C
            ],
            SportType.MLB: [
                PlayerPosition.P,
                PlayerPosition.C1B,
                PlayerPosition.C2B,
                PlayerPosition.C3B,
                PlayerPosition.SS,
                PlayerPosition.OF,
                PlayerPosition.DH
            ]
        }

        if sport_type not in positions_map:
            raise ValueError(f"Invalid sport type: {sport_type}")
        
        return positions_map[sport_type]

@unique
class TradeStatus(Enum):
    """
    Enumeration of all possible trade states for comprehensive trade lifecycle management.
    """
    PROPOSED = "PROPOSED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"
    PENDING_REVIEW = "PENDING_REVIEW"
    VETOED = "VETOED"

    def is_final_state(self) -> bool:
        """
        Determines if trade status represents a final state.

        Returns:
            bool: True if status is final, False otherwise
        """
        final_states = [
            TradeStatus.ACCEPTED,
            TradeStatus.REJECTED,
            TradeStatus.CANCELLED,
            TradeStatus.EXPIRED,
            TradeStatus.VETOED
        ]
        return self in final_states

@unique
class Platform(Enum):
    """
    Enumeration of supported fantasy sports platforms with integration-specific details.
    """
    ESPN = "ESPN"
    SLEEPER = "SLEEPER"

    def get_api_base_url(self) -> str:
        """
        Returns platform-specific API base URL.

        Returns:
            str: Base URL for platform API
        """
        urls = {
            Platform.ESPN: "https://fantasy.espn.com/apis/v3",
            Platform.SLEEPER: "https://api.sleeper.app/v1"
        }
        return urls[self]

# Export constants for convenient access
ALL_POSITIONS = list(PlayerPosition)
ALL_STATUSES = list(TradeStatus)
SUPPORTED_PLATFORMS = list(Platform)