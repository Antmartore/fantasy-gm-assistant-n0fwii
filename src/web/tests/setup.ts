// @ts-ignore
import '@testing-library/jest-native/extend-expect'; // v12.0.0
import { cleanup } from '@testing-library/react-native'; // v12.0.0
import 'jest-expo'; // v49.0.0

/**
 * Sets up comprehensive global mocks for React Native, Expo modules, and external services
 */
export const setupGlobalMocks = (): void => {
  // Mock React Native core modules
  jest.mock('react-native', () => ({
    Animated: {
      Value: jest.fn(),
      timing: jest.fn(),
      spring: jest.fn(),
      createAnimatedComponent: jest.fn(),
    },
    Platform: {
      OS: 'ios',
      select: jest.fn(obj => obj.ios),
    },
    Alert: {
      alert: jest.fn(),
    },
    AppState: {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      currentState: 'active',
    },
    AsyncStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    },
    Dimensions: {
      get: jest.fn(() => ({ width: 375, height: 812 })),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    Keyboard: {
      dismiss: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    Linking: {
      openURL: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    NativeModules: {},
    StyleSheet: {
      create: jest.fn(styles => styles),
      flatten: jest.fn(),
    },
  }));

  // Mock Expo modules
  jest.mock('expo-font', () => ({
    loadAsync: jest.fn(),
    isLoaded: jest.fn(),
    isLoading: jest.fn(),
  }));

  jest.mock('expo-asset', () => ({
    Asset: {
      loadAsync: jest.fn(),
      fromModule: jest.fn(),
    },
  }));

  jest.mock('expo-constants', () => ({
    Constants: {
      manifest: {},
      statusBarHeight: 20,
      systemFonts: [],
    },
  }));

  jest.mock('expo-notifications', () => ({
    requestPermissionsAsync: jest.fn(),
    setNotificationHandler: jest.fn(),
    scheduleNotificationAsync: jest.fn(),
  }));

  jest.mock('expo-splash-screen', () => ({
    preventAutoHideAsync: jest.fn(),
    hideAsync: jest.fn(),
  }));

  // Mock navigation utilities
  jest.mock('@react-navigation/native', () => ({
    useNavigation: jest.fn(() => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      setOptions: jest.fn(),
    })),
    useRoute: jest.fn(() => ({
      params: {},
    })),
  }));

  // Mock AI services
  jest.mock('../../services/GPTService', () => ({
    analyzeTeam: jest.fn(),
    generateTradeAnalysis: jest.fn(),
    getLineupRecommendations: jest.fn(),
  }));

  jest.mock('../../services/ElevenLabsService', () => ({
    generateVoiceover: jest.fn(),
  }));

  jest.mock('../../services/RunwayMLService', () => ({
    generateVideo: jest.fn(),
  }));

  // Mock sports data services
  jest.mock('../../services/ESPNService', () => ({
    getTeamData: jest.fn(),
    getPlayerStats: jest.fn(),
    getLeagueData: jest.fn(),
  }));

  jest.mock('../../services/SleeperService', () => ({
    getTeamInfo: jest.fn(),
    getLeagueInfo: jest.fn(),
    getPlayerData: jest.fn(),
  }));

  jest.mock('../../services/SportradarService', () => ({
    getLiveStats: jest.fn(),
    getGameData: jest.fn(),
    getPlayerAnalytics: jest.fn(),
  }));

  // Mock Firebase services
  jest.mock('../../services/FirebaseService', () => ({
    auth: {
      signIn: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChanged: jest.fn(),
    },
    firestore: {
      collection: jest.fn(),
      doc: jest.fn(),
      query: jest.fn(),
    },
    storage: {
      ref: jest.fn(),
      upload: jest.fn(),
      getDownloadURL: jest.fn(),
    },
  }));

  // Mock global objects
  global.fetch = jest.fn();
  global.FormData = jest.fn(() => ({}));
  global.XMLHttpRequest = jest.fn();
  global.__DEV__ = true;
};

/**
 * Sets up global test utilities, custom matchers, and test configuration
 */
export const setupGlobalUtilities = (): void => {
  // Configure test environment
  beforeAll(() => {
    jest.useFakeTimers();
  });

  // Clean up after each test
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  // Configure custom matchers
  expect.extend({
    toBeVisible(received) {
      const pass = received?.props?.style?.display !== 'none';
      return {
        pass,
        message: () => `expected ${received} to be visible`,
      };
    },
    toHaveStyle(received, style) {
      const pass = Object.keys(style).every(
        key => received?.props?.style[key] === style[key]
      );
      return {
        pass,
        message: () => `expected ${received} to have style ${JSON.stringify(style)}`,
      };
    },
  });

  // Configure test timeouts
  jest.setTimeout(10000);

  // Configure coverage settings
  jest.collectCoverageFrom([
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/types.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/index.{ts,tsx}',
  ]);
};

// Initialize test environment
setupGlobalMocks();
setupGlobalUtilities();