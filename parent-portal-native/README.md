# My Dance Techniques — Native Parent Portal

This project packages the existing Parent Portal as native iOS and Android apps with Capacitor.

## App identity

- App name: `My Dance Techniques`
- Bundle/package ID: `com.dancetechniques.parentportal`
- Web source: `../parent-portal`
- Generated native web bundle: `www` (not committed)

## Local commands

```sh
pnpm install
pnpm sync
pnpm open:ios
pnpm open:android
```

`pnpm sync` rebuilds the self-contained Parent Portal bundle before updating both native projects. The iOS project opens in Xcode and the Android project opens in Android Studio.

## Release work still required

- Add native push-notification credentials and device-token registration.
- Add universal/app links for Parent Portal notification destinations.
- Add the in-app account-deletion workflow required for store submission.
- Generate final store icons, splash screens, screenshots, privacy disclosures, and signed release builds.
