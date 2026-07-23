# Dance Techniques Notification System

## Roles and delivery

- Teachers receive assigned-school/class alerts plus mandatory studio announcements.
- Directors receive enrollment, schedule-change, provisional-dancer acknowledgment, message, failed-intake, and unpaid-fee alerts.
- Same-day enrollment, closure, and schedule-change alerts are urgent and may bypass personal quiet hours.
- Other new enrollments are grouped into an hourly director digest.
- Notification history remains visible for 90 days. The underlying enrollment, message, or schedule record remains available afterward.

## Push configuration

The browser contains only the public VAPID key. Store these values as Supabase Edge Function secrets before deploying `send-push-notifications`:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (recommended: `mailto:admin@dancetechniques.info`)
- `PUSH_DISPATCH_SECRET`

The private VAPID key must never be committed or placed in browser code.

Deploy the function with JWT verification disabled; it verifies `PUSH_DISPATCH_SECRET` itself. The database scheduler securely POSTs to:

`https://pgagpvfiplizahsnmvxf.supabase.co/functions/v1/send-push-notifications`

The matching dispatch secret is stored in Supabase Vault as `dance_techniques_push_dispatch_secret`. The scheduler runs the dispatch every minute. The database separately groups routine enrollments at the top of every hour.

## Device behavior

Each installed phone or desktop registers its own row in `push_subscriptions`. Disabling an expired browser subscription does not affect another device. Users control preferences and quiet hours under Profile → Notification Preferences. Studio announcements cannot be disabled.

On iPhone and iPad, web push requires the PWA to be added to the Home Screen before the user enables notifications.
