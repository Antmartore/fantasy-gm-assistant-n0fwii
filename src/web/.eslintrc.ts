module.exports = {
  // Root configuration flag to prevent ESLint from looking for other config files
  root: true,

  // TypeScript parser configuration
  parser: "@typescript-eslint/parser", // v5.60.0
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
    project: "./tsconfig.json",
    tsconfigRootDir: ".",
  },

  // Extended configurations
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:react/recommended", // v7.32.0
    "plugin:react-native/all", // v4.0.0
    "plugin:security/recommended", // v1.7.1
    "prettier", // v8.8.0
  ],

  // ESLint plugins
  plugins: [
    "@typescript-eslint", // v5.60.0
    "react",
    "react-native",
    "security",
  ],

  // React settings
  settings: {
    react: {
      version: "detect",
    },
  },

  // Global variables
  globals: {
    __DEV__: "readonly",
    require: "readonly",
    process: "readonly",
  },

  // ESLint rules configuration
  rules: {
    // TypeScript specific rules
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/strict-null-checks": "error",
    "@typescript-eslint/no-floating-promises": "error",

    // React specific rules
    "react/prop-types": "off", // Using TypeScript for prop validation

    // React Native specific rules
    "react-native/no-inline-styles": "error",
    "react-native/no-raw-text": [
      "error",
      { skip: ["Button", "Text"] },
    ],
    "react-native/no-unused-styles": "error",
    "react-native/split-platform-components": "error",
    "react-native/no-color-literals": "error",
    "react-native/no-single-element-style-arrays": "error",

    // Security rules
    "security/detect-object-injection": "error",
    "security/detect-non-literal-fs-filename": "error",

    // General code quality rules
    "no-console": ["error", { allow: ["warn", "error"] }],
    "eqeqeq": "error",
    "curly": "error",
    "prefer-const": "error",
    "no-var": "error",
    "no-eval": "error",
    "no-implied-eval": "error",
  },

  // Rule overrides for test files
  overrides: [
    {
      files: ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"],
      env: {
        jest: true,
        node: true,
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "react-native/no-raw-text": "off",
      },
    },
  ],

  // Environment configuration
  env: {
    "react-native/react-native": true,
    es2020: true,
    node: true,
  },
};