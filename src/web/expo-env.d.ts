// @types/expo-env.d.ts
// Version dependencies:
// - expo: ^49.0.0
// - react-native: 0.72.0

/// <reference types="expo/config" />
/// <reference types="react-native" />

declare module 'expo-env' {
  /**
   * Comprehensive environment variable type declarations for the Fantasy GM Assistant
   * Extends the ProcessEnv interface to include all application-specific environment variables
   */
  interface ProcessEnv {
    // Node environment
    NODE_ENV: 'development' | 'production' | 'test';

    // API Configuration
    EXPO_PUBLIC_API_URL: string;
    EXPO_PUBLIC_API_VERSION: string;
    EXPO_PUBLIC_ENVIRONMENT: 'development' | 'staging' | 'production';

    // Firebase Configuration
    EXPO_PUBLIC_FIREBASE_API_KEY: string;
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: string;
    EXPO_PUBLIC_STORAGE_BUCKET: string;

    // AI Service Configuration
    EXPO_PUBLIC_GPT_API_KEY: string;
    EXPO_PUBLIC_GPT_MODEL_VERSION: string;
    EXPO_PUBLIC_ELEVENLABS_API_KEY: string;
    EXPO_PUBLIC_ELEVENLABS_MODEL: string;
    EXPO_PUBLIC_RUNWAYML_API_KEY: string;
    EXPO_PUBLIC_RUNWAYML_MODEL: string;

    // Sports API Configuration
    EXPO_PUBLIC_ESPN_API_KEY: string;
    EXPO_PUBLIC_ESPN_API_VERSION: string;
    EXPO_PUBLIC_SLEEPER_API_KEY: string;
    EXPO_PUBLIC_SLEEPER_API_VERSION: string;
    EXPO_PUBLIC_SPORTRADAR_API_KEY: string;
    EXPO_PUBLIC_SPORTRADAR_ACCESS_LEVEL: 'trial' | 'production';

    // Feature Flags and Debug Configuration
    EXPO_PUBLIC_FEATURE_FLAGS: Record<string, boolean>;
    EXPO_PUBLIC_DEBUG_MODE: boolean;
  }

  /**
   * Extended Expo constants type augmentation with platform-specific features
   * Augments the ExpoConstants interface to include all platform-specific functionality
   */
  interface ExpoConstants {
    // Application ownership and version information
    appOwnership: 'standalone' | 'expo' | 'guest';
    expoVersion: string;
    installationId: string;

    // Device and platform information
    isDevice: boolean;
    platform: {
      ios?: {
        buildNumber: string;
        platform: string;
        model: string;
        userInterfaceIdiom: string;
        systemVersion: string;
      };
      android?: {
        versionCode: string;
        package: string;
        buildNumber: string;
        version: string;
      };
      web?: {
        userAgent: string;
        platform: string;
      };
    };

    // Session and system information
    sessionId: string;
    statusBarHeight: number;
    systemFonts: string[];

    // Application manifest
    manifest: {
      name: string;
      version: string;
      slug: string;
      orientation: string;
      icon: string;
      splash: {
        image: string;
        resizeMode: 'contain' | 'cover' | 'native';
        backgroundColor: string;
      };
      updates: {
        enabled: boolean;
        fallbackToCacheTimeout: number;
      };
      assetBundlePatterns: string[];
      ios: {
        supportsTablet: boolean;
        bundleIdentifier: string;
      };
      android: {
        package: string;
        versionCode: number;
        adaptiveIcon: {
          foregroundImage: string;
          backgroundColor: string;
        };
      };
      extra: {
        eas: {
          projectId: string;
        };
      };
    };
  }
}

// Global augmentations for enhanced type safety
declare global {
  namespace NodeJS {
    // Extend ProcessEnv interface globally
    interface ProcessEnv extends import('expo-env').ProcessEnv {}
  }

  // Extend global constants
  namespace Expo {
    interface Constants extends import('expo-env').ExpoConstants {}
  }
}

// Ensure this is treated as a module
export {};