import { ExpoConfig } from 'expo/config';
import { API_CONFIG } from './src/config/constants';
import { theme } from './src/config/theme';

const config: ExpoConfig = {
  // Core application information
  name: 'Fantasy GM Assistant',
  slug: 'fantasy-gm-assistant',
  version: '1.0.0',
  owner: 'fantasygm',
  
  // Application orientation and display
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor: theme.colors.background,
  
  // Asset configuration
  icon: './src/assets/images/icon.png',
  splash: {
    image: './src/assets/images/splash.png',
    resizeMode: 'contain',
    backgroundColor: theme.colors.primary,
  },
  
  // Update configuration
  updates: {
    enabled: true,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
    url: 'https://u.expo.dev/your-project-id',
    useClassicUpdates: false,
  },
  
  // Asset bundling patterns
  assetBundlePatterns: ['**/*'],
  
  // iOS specific configuration
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.fantasygm.assistant',
    buildNumber: '1.0.0',
    requireFullScreen: true,
    infoPlist: {
      NSCameraUsageDescription: 'Required for analyzing player cards and generating video content',
      NSPhotoLibraryUsageDescription: 'Required for saving generated videos and sharing content',
      NSMicrophoneUsageDescription: 'Required for voice commands and audio analysis',
      NSLocationWhenInUseUsageDescription: 'Required for weather-based game analysis',
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSExceptionDomains: {
          [new URL(API_CONFIG.BASE_URL).hostname]: {
            NSExceptionAllowsInsecureHTTPLoads: false,
            NSExceptionRequiresForwardSecrecy: true,
            NSExceptionMinimumTLSVersion: 'TLSv1.3',
          },
        },
      },
      UIBackgroundModes: ['fetch', 'remote-notification'],
    },
    config: {
      usesNonExemptEncryption: true,
      googleServicesFile: './GoogleService-Info.plist',
    },
  },
  
  // Android specific configuration
  android: {
    package: 'com.fantasygm.assistant',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './src/assets/images/adaptive-icon.png',
      backgroundColor: theme.colors.primary,
    },
    permissions: [
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'RECORD_AUDIO',
      'ACCESS_NETWORK_STATE',
      'ACCESS_FINE_LOCATION',
      'RECEIVE_BOOT_COMPLETED',
      'VIBRATE',
    ],
    config: {
      googleServices: './google-services.json',
    },
    intentFilters: [
      {
        action: 'VIEW',
        data: {
          scheme: 'fantasygm',
          host: '*.fantasygm.com',
        },
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  
  // Plugin configuration
  plugins: [
    'expo-camera',
    'expo-media-library',
    'expo-file-system',
    'expo-notifications',
    'expo-updates',
    'expo-secure-store',
    'expo-crypto',
    'expo-auth-session',
    'expo-web-browser',
    'expo-location',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-firebase/firestore',
    '@react-native-firebase/analytics',
    '@react-native-firebase/crashlytics',
    '@react-native-firebase/performance',
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
          deploymentTarget: '13.0',
        },
        android: {
          compileSdkVersion: 33,
          targetSdkVersion: 33,
          buildToolsVersion: '33.0.0',
        },
      },
    ],
  ],
  
  // Development client configuration
  developmentClient: {
    silentLaunch: true,
  },
  
  // Extra configuration options
  extra: {
    eas: {
      projectId: 'your-project-id',
    },
    apiUrl: API_CONFIG.BASE_URL,
    apiTimeout: API_CONFIG.TIMEOUT,
  },
  
  // Web platform configuration
  web: {
    favicon: './src/assets/images/favicon.png',
  },
  
  // Hooks configuration
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {
          organization: 'fantasygm',
          project: 'mobile-app',
        },
      },
    ],
  },
};

export default config;