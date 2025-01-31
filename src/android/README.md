# Fantasy GM Assistant - Android Application

## Overview

The Fantasy GM Assistant Android application is a high-performance, secure mobile client built with React Native and native modules. The application provides AI-powered fantasy sports management with real-time analytics, secure authentication, and optimized caching for sub-2-second response times.

## Prerequisites

- Android Studio Electric Eel or newer
- JDK 11+
- Node.js 18+
- React Native CLI
- Android SDK API Level 33
- Android Build Tools 33.0.0

## Environment Setup

### 1. Android Studio Configuration

```bash
# Required SDK components
- Android SDK Platform 33
- Android SDK Build-Tools 33.0.0
- Android Emulator
- Android SDK Platform-Tools
- Google Play services
```

### 2. Environment Variables

Add to your `~/.bash_profile` or `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 3. Project Configuration

Create a `local.properties` file in the android directory:

```properties
sdk.dir=/path/to/your/Android/sdk
```

## Security Configuration

### 1. Firebase Setup

Place `google-services.json` in `app/` directory with proper configuration:

```json
{
  "project_info": {
    "project_id": "fantasy-gm-assistant"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "your_app_id",
        "android_client_info": {
          "package_name": "com.fantasygm.assistant"
        }
      }
    }
  ]
}
```

### 2. Certificate Pinning

Configure in `network_security_config.xml`:

```xml
<network-security-config>
    <domain-config>
        <domain includeSubdomains="true">api.fantasygm.assistant.com</domain>
        <pin-set>
            <pin digest="SHA-256">your_certificate_pin</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```

### 3. ProGuard Rules

Enable in `app/build.gradle`:

```gradle
release {
    minifyEnabled true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
}
```

## Performance Monitoring

### 1. DataDog Integration

Configure in `AndroidManifest.xml`:

```xml
<meta-data
    android:name="com.datadoghq.android.APPLICATION_ID"
    android:value="${DATADOG_APPLICATION_ID}" />
```

### 2. Performance Metrics

- Response Time Target: < 2 seconds (95th percentile)
- Cache TTL Values:
  - Player Stats: 15 minutes
  - Weather Data: 1 hour
  - Trade Analysis: 24 hours
  - Video Content: 7 days

## Build Configuration

### Debug Build

```bash
# Clean and build debug variant
./gradlew clean
./gradlew assembleDebug
```

### Release Build

```bash
# Generate release bundle
./gradlew bundleRelease

# Generate APK
./gradlew assembleRelease
```

## Native Modules

### 1. Authentication Module

Provides secure Firebase authentication with MFA support:

```kotlin
FirebaseAuthModule
├── signInWithMFA()
├── refreshToken()
└── handleMFAChallenge()
```

### 2. Analytics Module

Implements comprehensive event tracking:

```kotlin
AnalyticsModule
├── trackEvent()
├── trackScreen()
└── trackError()
```

### 3. Cache Module

Manages secure local data storage:

```kotlin
CacheModule
├── setItem()
├── getItem()
└── removeItem()
```

## Testing

### Unit Tests

```bash
./gradlew test
```

### Integration Tests

```bash
./gradlew connectedAndroidTest
```

### Security Tests

```bash
./gradlew dependencyCheckAnalyze
```

## Deployment

### 1. Play Store Release

1. Update version in `build.gradle`:
```gradle
versionCode 1
versionName "1.0.0"
```

2. Generate signed bundle:
```bash
./gradlew bundleRelease
```

3. Upload to Play Console

### 2. CI/CD Pipeline

Configure in `.github/workflows/android.yml`:

```yaml
- name: Build Android
  run: ./gradlew bundleRelease

- name: Upload Bundle
  uses: actions/upload-artifact@v2
  with:
    name: app-release
    path: app/build/outputs/bundle/release/
```

## Troubleshooting

### Common Issues

1. Build Failures
```bash
./gradlew clean
rm -rf ~/.gradle/caches/
./gradlew build
```

2. Native Module Linking
```bash
npx react-native link
cd android && ./gradlew clean
```

3. Performance Issues
- Check DataDog dashboard for metrics
- Verify cache implementation
- Monitor API response times

## Security Guidelines

1. Data Storage
- Use EncryptedSharedPreferences for sensitive data
- Implement proper key management
- Regular security audits

2. Network Security
- Certificate pinning
- TLS 1.3
- Request signing

3. Authentication
- Implement MFA
- Secure token management
- Session monitoring

## Support

For technical issues:
- Create GitHub issue
- Contact development team
- Check DataDog logs

## License

Copyright © 2023 Fantasy GM Assistant