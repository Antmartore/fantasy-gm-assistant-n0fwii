# Fantasy GM Assistant iOS Fastlane Configuration

## Installation

### Prerequisites
- Xcode 14.0+
- Ruby 2.7+
- Bundler
- CocoaPods
- Git Access
- Apple Developer Account
- App Store Connect API Key

### Setup
```bash
# Install fastlane and dependencies
bundle install

# Set up required environment variables
export MATCH_PASSWORD="your_match_password"
export MATCH_GIT_BASIC_AUTHORIZATION="your_git_auth"
export APP_STORE_CONNECT_API_KEY_PATH="path/to/key.json"
export FASTLANE_USER="your_apple_id"
export FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD="your_app_specific_password"
```

## Available Actions

### iOS Lanes

#### Development Build
```bash
fastlane ios build_development
```
Builds development version with:
- Development certificates
- Debug configuration
- Symbol upload to Crashlytics and Sentry
- DataDog metrics tracking

#### Staging Build
```bash
fastlane ios build_staging
```
Builds staging version with:
- App Store certificates
- Release configuration
- TestFlight distribution
- Full test suite execution
- Symbol upload to Crashlytics and Sentry

#### Production Build
```bash
fastlane ios build_production
```
Builds production version with:
- App Store certificates
- Release configuration
- App Store submission
- Security audit
- Full test suite
- Automated changelog generation
- Git tagging

## Environment Setup

### Development Environment
- Bundle ID: com.fantasygm.assistant.dev
- Certificate Type: Development
- Export Method: Development
- Monitoring: DataDog + Sentry

### Staging Environment
- Bundle ID: com.fantasygm.assistant.staging
- Certificate Type: App Store
- Export Method: App Store
- TestFlight Distribution
- Monitoring: DataDog + Sentry

### Production Environment
- Bundle ID: com.fantasygm.assistant
- Certificate Type: App Store
- Export Method: App Store
- App Store Distribution
- Enhanced Security Measures
- Full Monitoring Suite

## Security Protocols

### Certificate Management
- Automated via match
- 90-day rotation policy
- Encrypted git storage
- Backup enabled
- 2FA required

### Access Control
- CI/CD restricted access
- No manual override
- Audit logging enabled
- Secure environment variable handling

### Emergency Procedures
1. Certificate Revocation
2. Emergency Build Termination
3. Security Audit Triggers
4. Incident Response Plan

## Monitoring

### Build Metrics
- DataDog integration
- Build success/failure tracking
- Performance metrics
- Environment-specific monitoring

### Error Tracking
- Sentry integration
- Automated error reporting
- Stack trace analysis
- Team notifications via Slack

## Troubleshooting

### Common Issues

#### Certificate Issues
```bash
# Refresh certificates
fastlane ios refresh_certificates

# Verify certificate installation
security find-identity -v -p codesigning
```

#### Build Failures
```bash
# Clean build artifacts
fastlane ios clean

# Reset certificates
fastlane match nuke development
fastlane match nuke distribution
```

#### Code Signing
```bash
# Verify provisioning profiles
security cms -D -i *.mobileprovision

# Reset signing
fastlane ios setup_signing
```

### Decision Tree
1. Build Error
   - Check certificates
   - Verify environment variables
   - Review build logs
   
2. Upload Error
   - Verify API keys
   - Check network connectivity
   - Validate bundle ID

3. Test Failure
   - Review test logs
   - Check test environment
   - Verify dependencies

### Support Resources
- Fastlane Documentation: [https://docs.fastlane.tools](https://docs.fastlane.tools)
- Apple Developer Portal: [https://developer.apple.com](https://developer.apple.com)
- Internal Wiki: [link_to_internal_wiki]