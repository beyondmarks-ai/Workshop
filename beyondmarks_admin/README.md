# BeyondMarks Admin

Responsive Flutter administration app for the BeyondMarks AI Academy.

## Features

- Email, PIN, and Google Authenticator login
- Encrypted one-hour session storage
- Student summary, search, and status filters
- Verify, revoke, and permanently delete student accounts
- Exact bulk credit additions and deductions with audit reasons
- Individual or all-student notifications
- Purchased-model usage and access removal
- Pull-to-refresh and responsive phone, tablet, desktop, and web layouts

## Run

The production API is selected by default:

```powershell
flutter run
```

Use another backend without editing source code:

```powershell
flutter run --dart-define=API_BASE_URL=http://localhost:3000
```

## Validate and build

```powershell
flutter analyze
flutter test
flutter build web --release
flutter build apk --release
```

Android APK output: `build/app/outputs/flutter-apk/app-release.apk`.

The server never sends the PIN or authenticator secret to the app. Successful verification returns a signed, one-hour admin session token, which the app stores with `flutter_secure_storage`.
