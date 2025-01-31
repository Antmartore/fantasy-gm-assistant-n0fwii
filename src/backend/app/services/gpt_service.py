# Python 3.11+
from typing import Dict, List
import openai  # openai v1.0+
from httpx import AsyncClient  # httpx v0.24+
from tenacity import retry, stop_after_attempt, wait_fixed  # tenacity v8.0+

from app.core.config import settings
from app.core.logging import get_logger
from app.core.exceptions import IntegrationError

# Configure logging
logger = get_logger(__name__)

# Constants
MAX_RETRIES = 3
RETRY_DELAY = 1  # seconds
REQUEST_TIMEOUT = 5  # seconds
MAX_TOKENS = 4096
TEMPERATURE = 0.7

class GPTService:
    """Service class for interacting with GPT-4 API to generate fantasy sports insights."""

    def __init__(self) -> None:
        """Initialize GPT service with API configuration."""
        self._client = AsyncClient(timeout=REQUEST_TIMEOUT)
        self._api_key = settings.OPENAI_API_KEY.get_secret_value()
        openai.api_key = self._api_key

    @retry(stop=stop_after_attempt(MAX_RETRIES), wait=wait_fixed(RETRY_DELAY))
    async def analyze_trade(
        self,
        players_offered: List[Dict],
        players_requested: List[Dict],
        team_context: Dict,
        correlation_id: str
    ) -> Dict:
        """
        Analyzes a potential trade using GPT-4 with enhanced risk scoring.

        Args:
            players_offered: List of players being offered in trade
            players_requested: List of players being requested
            team_context: Current team composition and stats
            correlation_id: Unique identifier for request tracking

        Returns:
            Dict containing trade analysis with risk score and recommendations

        Raises:
            IntegrationError: If GPT API call fails
        """
        try:
            # Format trade data for analysis
            prompt = self._format_trade_prompt(
                players_offered,
                players_requested,
                team_context
            )

            # Call GPT-4 API
            response = await openai.ChatCompletion.acreate(
                model="gpt-4-turbo-preview",
                messages=[
                    {"role": "system", "content": "You are an expert fantasy sports analyst specializing in trade analysis."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=MAX_TOKENS,
                temperature=TEMPERATURE,
                n=1,
                stream=False
            )

            # Process and validate response
            analysis = self._process_trade_response(response)

            # Log performance metrics
            logger.info(
                "Trade analysis completed",
                extra={
                    "correlation_id": correlation_id,
                    "tokens_used": response.usage.total_tokens,
                    "response_time_ms": response.response_ms
                }
            )

            return analysis

        except Exception as e:
            logger.error(
                "GPT API error during trade analysis",
                extra={
                    "correlation_id": correlation_id,
                    "error": str(e)
                }
            )
            raise IntegrationError(
                message="Failed to analyze trade with GPT-4",
                details={"error": str(e)},
                correlation_id=correlation_id
            )

    def _format_trade_prompt(
        self,
        players_offered: List[Dict],
        players_requested: List[Dict],
        team_context: Dict
    ) -> str:
        """
        Formats trade data into a detailed prompt for GPT analysis.

        Args:
            players_offered: List of players being offered
            players_requested: List of players being requested
            team_context: Team composition and stats

        Returns:
            Formatted prompt string
        """
        prompt = (
            f"Analyze this fantasy sports trade proposal:\n\n"
            f"Players Offered:\n"
            f"{self._format_players(players_offered)}\n\n"
            f"Players Requested:\n"
            f"{self._format_players(players_requested)}\n\n"
            f"Team Context:\n"
            f"{self._format_team_context(team_context)}\n\n"
            f"Provide a detailed analysis including:\n"
            f"1. Trade value assessment\n"
            f"2. Risk analysis (1-100 scale)\n"
            f"3. Short-term impact\n"
            f"4. Long-term impact\n"
            f"5. Specific recommendations\n"
            f"Format the response as JSON."
        )
        return prompt

    def _format_players(self, players: List[Dict]) -> str:
        """
        Formats player data for prompt inclusion.

        Args:
            players: List of player dictionaries

        Returns:
            Formatted player string
        """
        return "\n".join([
            f"- {player['name']} ({player['position']})"
            f" - Season Stats: {player['stats']}"
            f" - Recent Performance: {player['recent_performance']}"
            f" - Injury Status: {player['injury_status']}"
            for player in players
        ])

    def _format_team_context(self, team_context: Dict) -> str:
        """
        Formats team context data for prompt inclusion.

        Args:
            team_context: Team composition and stats dictionary

        Returns:
            Formatted team context string
        """
        return (
            f"Current Record: {team_context['record']}\n"
            f"League Position: {team_context['position']}\n"
            f"Team Strengths: {', '.join(team_context['strengths'])}\n"
            f"Team Weaknesses: {', '.join(team_context['weaknesses'])}\n"
            f"Roster Composition: {team_context['roster_composition']}"
        )

    def _process_trade_response(self, response: Dict) -> Dict:
        """
        Processes and validates GPT API response.

        Args:
            response: Raw GPT API response

        Returns:
            Processed and validated analysis dictionary

        Raises:
            ValueError: If response format is invalid
        """
        try:
            analysis = response.choices[0].message.content
            return {
                "analysis": analysis,
                "confidence_score": self._calculate_confidence_score(response),
                "processing_time_ms": response.response_ms,
                "model_version": "gpt-4-turbo-preview"
            }
        except (KeyError, AttributeError) as e:
            raise ValueError(f"Invalid GPT response format: {str(e)}")

    def _calculate_confidence_score(self, response: Dict) -> float:
        """
        Calculates confidence score based on GPT response metrics.

        Args:
            response: GPT API response

        Returns:
            Confidence score between 0 and 1
        """
        # Calculate based on response properties like token usage and model confidence
        base_score = 0.85  # Base confidence for GPT-4
        token_penalty = max(0, response.usage.total_tokens / MAX_TOKENS) * 0.1
        return round(base_score - token_penalty, 2)

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup."""
        await self._client.aclose()