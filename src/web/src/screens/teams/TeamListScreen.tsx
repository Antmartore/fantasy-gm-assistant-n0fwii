// External imports - versions specified as per requirements
import React, { useEffect, useCallback, useState, useMemo } from 'react'; // ^18.0.0
import { useDispatch, useSelector } from 'react-redux'; // ^8.0.0
import { useNavigation } from '@react-navigation/native'; // ^6.0.0
import styled from 'styled-components'; // ^5.3.0
import analytics from '@react-native-firebase/analytics'; // ^18.0.0
import { 
  VirtualizedList, 
  RefreshControl, 
  Platform, 
  View, 
  ActivityIndicator 
} from 'react-native'; // ^0.71.0
import { withErrorBoundary } from 'react-error-boundary'; // ^4.0.0

// Internal imports
import { 
  fetchTeams, 
  createNewTeam, 
  importExternalTeam, 
  syncTeam 
} from '../../store/actions/teamActions';
import { 
  Team, 
  FantasyPlatform, 
  TeamSyncStatus 
} from '../../types/team';

// Styled components
const Container = styled(View)`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const LoadingContainer = styled(View)`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const TeamItemContainer = styled(View)<{ isLast?: boolean }>`
  padding: 16px;
  margin: 8px 16px;
  border-radius: 12px;
  background-color: ${({ theme }) => theme.colors.surface};
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 4px;
  elevation: 3;
  margin-bottom: ${({ isLast }) => isLast ? '16px' : '8px'};
`;

// Types
interface TeamListScreenProps {
  route: {
    params?: {
      platform?: FantasyPlatform;
      refreshTrigger?: number;
    };
  };
}

interface TeamListState {
  teams: Team[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  syncStatus: Record<string, TeamSyncStatus>;
}

// Constants
const ITEMS_PER_PAGE = 20;
const SYNC_INTERVAL = 300000; // 5 minutes
const ANALYTICS_SCREEN_NAME = 'TeamList';

// Component
const TeamListScreen: React.FC<TeamListScreenProps> = ({ route }) => {
  // Hooks
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const [state, setState] = useState<TeamListState>({
    teams: [],
    loading: true,
    error: null,
    refreshing: false,
    syncStatus: {}
  });

  // Memoized selectors
  const filteredTeams = useMemo(() => {
    return state.teams.filter(team => 
      !route.params?.platform || team.platform === route.params.platform
    );
  }, [state.teams, route.params?.platform]);

  // Analytics tracking
  useEffect(() => {
    analytics().logScreenView({
      screen_name: ANALYTICS_SCREEN_NAME,
      screen_class: 'TeamListScreen'
    });
  }, []);

  // Initial data fetch
  useEffect(() => {
    loadTeams();
    const syncInterval = setInterval(syncTeams, SYNC_INTERVAL);
    return () => clearInterval(syncInterval);
  }, [route.params?.platform, route.params?.refreshTrigger]);

  // Load teams with error handling
  const loadTeams = async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const response = await dispatch(fetchTeams({
        page: 1,
        limit: ITEMS_PER_PAGE,
        platform: route.params?.platform
      })).unwrap();
      
      setState(prev => ({
        ...prev,
        teams: response.data,
        loading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to load teams'
      }));
      analytics().logEvent('team_list_error', {
        error_type: 'load_failure',
        error_message: error.message
      });
    }
  };

  // Sync teams with platforms
  const syncTeams = useCallback(async () => {
    const syncPromises = state.teams.map(async team => {
      try {
        setState(prev => ({
          ...prev,
          syncStatus: {
            ...prev.syncStatus,
            [team.id]: TeamSyncStatus.SYNCING
          }
        }));

        await dispatch(syncTeam({
          teamId: team.id,
          forceFetch: false
        })).unwrap();

        setState(prev => ({
          ...prev,
          syncStatus: {
            ...prev.syncStatus,
            [team.id]: TeamSyncStatus.SYNCED
          }
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          syncStatus: {
            ...prev.syncStatus,
            [team.id]: TeamSyncStatus.ERROR
          }
        }));
        analytics().logEvent('team_sync_error', {
          team_id: team.id,
          error_message: error.message
        });
      }
    });

    await Promise.all(syncPromises);
  }, [state.teams, dispatch]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setState(prev => ({ ...prev, refreshing: true }));
    await loadTeams();
    setState(prev => ({ ...prev, refreshing: false }));
  }, []);

  // Team item renderer
  const renderTeamItem = useCallback(({ item, index }: { item: Team; index: number }) => (
    <TeamItemContainer isLast={index === filteredTeams.length - 1}>
      <TeamItem
        team={item}
        syncStatus={state.syncStatus[item.id]}
        onPress={() => navigation.navigate('TeamDetails', { teamId: item.id })}
      />
    </TeamItemContainer>
  ), [filteredTeams.length, state.syncStatus, navigation]);

  // List key extractor
  const keyExtractor = useCallback((item: Team) => item.id, []);

  // List empty component
  const ListEmptyComponent = useCallback(() => (
    <View style={{ padding: 16, alignItems: 'center' }}>
      {state.loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <Text>No teams found. Create or import a team to get started.</Text>
      )}
    </View>
  ), [state.loading]);

  // Error view
  if (state.error) {
    return (
      <ErrorContainer>
        <ErrorText>{state.error}</ErrorText>
        <RetryButton onPress={loadTeams} />
      </ErrorContainer>
    );
  }

  return (
    <Container>
      <VirtualizedList
        data={filteredTeams}
        renderItem={renderTeamItem}
        keyExtractor={keyExtractor}
        getItemCount={() => filteredTeams.length}
        getItem={(data, index) => filteredTeams[index]}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={ListEmptyComponent}
        onEndReachedThreshold={0.5}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={<TeamListHeader platform={route.params?.platform} />}
      />
      <FloatingActionButton
        onPress={() => navigation.navigate('CreateTeam')}
        testID="create-team-button"
      />
    </Container>
  );
};

// Error boundary configuration
const TeamListScreenWithErrorBoundary = withErrorBoundary(TeamListScreen, {
  fallback: <ErrorFallback />,
  onError: (error) => {
    analytics().logEvent('team_list_critical_error', {
      error_message: error.message,
      error_stack: error.stack
    });
  }
});

export default TeamListScreenWithErrorBoundary;