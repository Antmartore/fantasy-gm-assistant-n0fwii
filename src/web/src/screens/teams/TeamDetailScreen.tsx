import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { withErrorBoundary } from 'react-error-boundary'; // ^4.0.0
import { datadogRum } from '@datadog/browser-rum'; // ^4.0.0
import styled from 'styled-components';

import { Team, FantasyPlatform } from '../../types/team';
import { useTeam } from '../../hooks/useTeam';

// Constants for refresh intervals by platform
const REFRESH_INTERVALS = {
  [FantasyPlatform.ESPN]: 30000, // 30 seconds
  [FantasyPlatform.SLEEPER]: 60000, // 1 minute
};

interface TeamDetailScreenProps {
  onError?: (error: Error) => void;
}

// Styled components with responsive design
const Container = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  max-width: 1200px;
  margin: 0 auto;
  position: relative;

  @media (max-width: ${({ theme }) => theme.breakpoints.md}) {
    padding: ${({ theme }) => theme.spacing.md};
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.overlay};
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const TeamStats = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const RosterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

// Error Fallback component
const ErrorFallback = ({ error, resetErrorBoundary }: any) => (
  <div role="alert" className="error-container">
    <h2>Something went wrong:</h2>
    <pre>{error.message}</pre>
    <button onClick={resetErrorBoundary}>Try again</button>
  </div>
);

const TeamDetailScreen: React.FC<TeamDetailScreenProps> = ({ onError }) => {
  const { teamId } = useParams<{ teamId: string }>();
  const [refreshInterval, setRefreshInterval] = useState<number>();
  const { 
    fetchTeamById, 
    updateTeam, 
    deleteTeam,
    teams,
    loading,
    error 
  } = useTeam();

  // Get current team from store
  const team = useMemo(() => teams[teamId], [teams, teamId]);

  // Initialize performance monitoring
  useEffect(() => {
    datadogRum.addTiming('team_detail_loaded');
    return () => {
      datadogRum.clearTimings();
    };
  }, []);

  // Set up refresh interval based on platform
  useEffect(() => {
    if (team?.platform) {
      const interval = REFRESH_INTERVALS[team.platform];
      setRefreshInterval(interval);

      const timer = setInterval(() => {
        fetchTeamById(teamId, { skipCache: true })
          .catch(error => {
            datadogRum.addError(error);
            onError?.(error);
          });
      }, interval);

      return () => clearInterval(timer);
    }
  }, [team?.platform, teamId, fetchTeamById]);

  // Initial data fetch
  useEffect(() => {
    fetchTeamById(teamId)
      .catch(error => {
        datadogRum.addError(error);
        onError?.(error);
      });
  }, [teamId, fetchTeamById]);

  // Handle team update with optimistic updates
  const handleTeamUpdate = useCallback(async (updates: Partial<Team>) => {
    try {
      await updateTeam(teamId, updates, { optimistic: true });
      datadogRum.addAction('team_updated');
    } catch (error) {
      datadogRum.addError(error);
      onError?.(error);
    }
  }, [teamId, updateTeam]);

  // Handle team deletion with confirmation
  const handleTeamDelete = useCallback(async () => {
    if (window.confirm('Are you sure you want to delete this team?')) {
      try {
        await deleteTeam(teamId);
        datadogRum.addAction('team_deleted');
      } catch (error) {
        datadogRum.addError(error);
        onError?.(error);
      }
    }
  }, [teamId, deleteTeam]);

  if (!team && !loading) {
    return <div role="alert">Team not found</div>;
  }

  return (
    <Container>
      {loading && (
        <LoadingOverlay role="progressbar" aria-label="Loading team details">
          <span>Loading...</span>
        </LoadingOverlay>
      )}

      <Header>
        <h1>{team?.name}</h1>
        <div>
          <button
            onClick={() => handleTeamUpdate(team)}
            aria-label="Save team changes"
          >
            Save Changes
          </button>
          <button
            onClick={handleTeamDelete}
            aria-label="Delete team"
            className="danger"
          >
            Delete Team
          </button>
        </div>
      </Header>

      {error && (
        <div role="alert" className="error-message">
          {error.message}
        </div>
      )}

      {team && (
        <>
          <TeamStats>
            <div>
              <h3>Record</h3>
              <p>{team.stats.wins}-{team.stats.losses}</p>
            </div>
            <div>
              <h3>Points</h3>
              <p>{team.stats.totalPoints}</p>
            </div>
            <div>
              <h3>Playoff Probability</h3>
              <p>{(team.stats.playoffProbability * 100).toFixed(1)}%</p>
            </div>
          </TeamStats>

          <section aria-label="Team Roster">
            <h2>Roster</h2>
            <RosterGrid>
              {team.roster.playerIds.map(playerId => (
                <div key={playerId} className="player-card">
                  {/* Player card content */}
                </div>
              ))}
            </RosterGrid>
          </section>

          <div aria-live="polite" className="update-status">
            {`Auto-refreshing every ${refreshInterval ? refreshInterval / 1000 : '...'} seconds`}
          </div>
        </>
      )}
    </Container>
  );
};

// Export with error boundary wrapper
export default withErrorBoundary(TeamDetailScreen, {
  FallbackComponent: ErrorFallback,
  onError: (error) => {
    datadogRum.addError(error);
    console.error('TeamDetailScreen Error:', error);
  }
});