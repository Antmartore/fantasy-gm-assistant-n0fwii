// babel.config.ts
// Dependencies:
// babel-preset-expo: ^9.5.0
// babel-plugin-module-resolver: ^5.0.0
// react-native-reanimated: ^3.5.0

import type { ConfigFunction } from 'babel-preset-expo';

interface BabelConfig {
  presets: string[];
  plugins: (string | [string, object])[];
}

const config: BabelConfig = {
  presets: ['babel-preset-expo'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: [
          '.ios.ts',
          '.android.ts',
          '.ts',
          '.ios.tsx',
          '.android.tsx',
          '.tsx',
          '.jsx',
          '.js',
          '.json'
        ],
        alias: {
          '@api': './src/api',
          '@components': './src/components',
          '@config': './src/config',
          '@hooks': './src/hooks',
          '@navigation': './src/navigation',
          '@screens': './src/screens',
          '@store': './src/store',
          '@types': './src/types',
          '@utils': './src/utils'
        }
      }
    ],
    'react-native-reanimated/plugin'
  ]
};

export default config;