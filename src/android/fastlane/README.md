# Fantasy GM Assistant - Android Fastlane Configuration
> Version: 1.0.0
> Fastlane version: 2.212.2

## Installation

### Prerequisites
- Ruby 2.7.0 or higher
- Bundler 2.3.0 or higher
- Android SDK with Build Tools 33.0.0
- Java Development Kit 11

Install Fastlane using Bundler:
```bash
bundle install
```

### Security Setup
1. Place Google Play Store API key at `fastlane/google-play-key.json`
2. Configure environment variables:
```bash
DATADOG_API_KEY=<api_key>
DATADOG_APP_KEY=<app_key>
FIREBASE_TOKEN=<token>
KEYSTORE_PATH=<path>
KEYSTORE_PASSWORD=<password>
KEY_ALIAS=<alias>
KEY_PASSWORD=<password>
SLACK_WEBHOOK=<webhook_url>
```

## Available Lanes

### Development Lane
```bash
fastlane android development
```
- **Purpose**: Debug build with Firebase distribution
- **Timing**: 5 minutes
- **Approval**: Automated
- **Security Gates**:
  - Unit Tests
  - SAST Scan
- **Monitoring**:
  - Build Status
  - Test Coverage
- **Actions**:
  1. Clean build
  2. Run unit tests
  3. Build debug APK
  4. Deploy to Firebase (testers group)

### Staging Lane
```bash
fastlane android staging
```
- **Purpose**: Release build with internal Play Store track
- **Timing**: 15 minutes
- **Approval**: Tech Lead
- **Security Gates**:
  - Unit Tests
  - Integration Tests
  - SAST Scan
  - DAST Scan
- **Monitoring**:
  - Build Status
  - Test Coverage
  - Security Metrics
- **Actions**:
  1. Tech Lead approval verification
  2. Clean build
  3. Full test suite
  4. Security scan
  5. Build release AAB
  6. Deploy to Firebase (QA group)
  7. Deploy to Play Store (internal track)

### Production Lane
```bash
fastlane android production
```
- **Purpose**: Release build with production Play Store track
- **Timing**: 15 minutes
- **Approval**: Product Owner
- **Security Gates**:
  - Unit Tests
  - Integration Tests
  - SAST Scan
  - DAST Scan
  - Compliance Check
- **Monitoring**:
  - Build Status
  - Test Coverage
  - Security Metrics
  - Performance Metrics
- **Actions**:
  1. Product Owner approval verification
  2. Clean build
  3. Full test suite
  4. Security scan
  5. Quality gate check
  6. Build release AAB
  7. Deploy to Play Store (production track)
  8. Gradual rollout (20%)

## Environment Setup

### Credentials Management
- Store sensitive files in secure credential storage
- Rotate API keys every 90 days
- Use environment-specific credentials
- Enable MFA for all service accounts

### Certificate Management
- Store keystore in secure location
- Configure signing configs in build.gradle
- Maintain separate certificates per environment
- Automate certificate rotation

### Monitoring Integration
- DataDog metrics integration
- Crash reporting via Firebase Crashlytics
- Custom alert thresholds:
  - Build failures
  - Test coverage < 80%
  - Crash-free users < 99%
  - Security scan failures

## Usage Examples

### Basic Usage
Deploy to development:
```bash
fastlane android development
```

Deploy to staging:
```bash
fastlane android staging
```

Deploy to production:
```bash
fastlane android production
```

### Advanced Usage
Build with version increment:
```bash
fastlane android build version_increment:true
```

Deploy to specific Firebase groups:
```bash
fastlane android deploy_to_firebase groups:"qa,beta-testers"
```

Run tests only:
```bash
fastlane android test
```

### Troubleshooting

#### Common Issues
1. Missing Google Play credentials:
   - Verify `google-play-key.json` exists
   - Check file permissions

2. Build failures:
   - Clean build directory
   - Verify Android SDK setup
   - Check signing configuration

3. Test failures:
   - Review test logs
   - Check coverage reports
   - Verify test dependencies

4. Deployment failures:
   - Validate API tokens
   - Check network connectivity
   - Verify version codes

## Quality Gates

### Coverage Requirements
- Minimum unit test coverage: 80%
- Minimum integration test coverage: 70%
- All critical paths covered

### Security Requirements
- SAST scan passed
- OWASP dependency check passed
- No critical vulnerabilities
- Compliance requirements met

### Performance Requirements
- Build time < 15 minutes
- Test execution < 10 minutes
- Deployment time < 5 minutes

## Monitoring and Alerts

### Build Monitoring
- Build status in DataDog
- Test coverage trends
- Security scan results
- Deployment success rate

### Runtime Monitoring
- Crash-free users
- ANR rate
- Performance metrics
- User adoption metrics

### Alert Configuration
- Slack notifications
- Email alerts
- PagerDuty integration
- Custom alert thresholds