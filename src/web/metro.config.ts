/**
 * Metro configuration for Fantasy GM Assistant
 * Version: 1.0.0
 * 
 * Optimized bundler configuration for React Native + Expo mobile application
 * with advanced caching and performance optimizations to support rapid
 * AI-powered features delivery.
 */

import { getDefaultConfig } from '@expo/metro-config'; // v0.10.0

const config = getDefaultConfig(__dirname);

/**
 * Custom Metro configuration extending Expo defaults
 * Optimized for mobile-first performance and efficient asset delivery
 */
export default {
  ...config,
  
  // Transformer configuration for optimized builds
  transformer: {
    babelTransformerPath: 'babel-jest',
    assetPlugins: ['expo-asset/tools/hashAssetFiles'],
    minifierConfig: {
      keep_classnames: true,
      keep_fnames: true,
      mangle: {
        keep_classnames: true,
        keep_fnames: true
      },
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    optimizationLevel: 3,
    enableBabelRuntime: true,
    enableBabelRCLookup: false
  },

  // Module resolution and asset handling configuration
  resolver: {
    assetExts: [
      'png', 'jpg', 'jpeg', 'gif', 'ttf', 'otf',
      'mp4', 'mp3', 'wav', 'webp', 'svg', 'ico'
    ],
    sourceExts: [
      'js', 'jsx', 'ts', 'tsx', 'json', 'mjs', 'cjs'
    ],
    platforms: ['ios', 'android', 'web'],
    alias: {
      '@api': './src/api',
      '@components': './src/components',
      '@config': './src/config',
      '@hooks': './src/hooks',
      '@navigation': './src/navigation',
      '@screens': './src/screens',
      '@store': './src/store',
      '@types': './src/types',
      '@utils': './src/utils',
      '@assets': './src/assets',
      '@constants': './src/constants',
      '@services': './src/services',
      '@theme': './src/theme'
    },
    preferNativePlatform: true,
    hasteImplModulePath: null,
    disableHierarchicalLookup: true
  },

  // Watched folders for changes
  watchFolders: ['node_modules'],

  // Worker configuration for parallel processing
  maxWorkers: 4,
  
  // Cache configuration
  resetCache: false,
  cacheStores: [{
    name: 'metro',
    maxSize: 1024 * 1024 * 1024 // 1GB cache size
  }],

  // Development server configuration
  server: {
    port: 8081,
    enableVisualizer: false,
    enhanceMiddleware: null
  },

  // Reporter configuration for build feedback
  reporter: {
    terminal: true,
    port: 8081
  },

  // Serializer configuration
  serializer: {
    createModuleIdFactory: null,
    experimentalSerializerHook: null,
    processModuleFilter: null
  }
};