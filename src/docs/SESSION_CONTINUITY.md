# uRide Global Session Continuity

## Current routing/resume audit
- `App.jsx` previously used role defaults and several route-level redirects, which could send users to dashboard/home after auth instead of restoring task context.
- Host onboarding had a one-off pending draft, but it was not part of a reusable app-wide continuity layer.
- `usePersistentFormDraft` previously wrote only to localStorage and did not participate in shared resume metadata.

## Implemented global architecture
- Added `lib/sessionContinuity.js` as the shared continuity engine.
- Added `components/session/SessionContinuityManager.jsx` at the app shell level.
- The manager tracks meaningful route changes, before-unload refreshes, auth-resume intents, offline/online events, and stale-session auth failures.
- The continuity API is exposed as `window.uRideSession` for future workflows to register pending actions and drafts without one-off code.

## Draft persistence strategy
- `usePersistentFormDraft` now persists to sessionStorage, localStorage, and the global draft registry.
- Drafts include route, entity context, timestamp, and expiration metadata.
- Host onboarding registers a `create_store` pending action and draft before login redirect.

## Storage strategy
- sessionStorage: immediate tab recovery.
- localStorage: auth redirect, mobile reload, and browser restart backup.
- Database draft records remain workflow-specific for high-value multi-step records and should be added when the workflow owns a server-side entity.

## Security rules
- Admin routes only resume for admins.
- Host routes only resume for hosts/admins.
- Expired auth resumes are cleared.
- Unsafe action types are not auto-executed.
- Record-level ownership remains enforced by guarded pages and backend functions; workflow-specific ownership checks should be added when auto-resuming entity actions.

## Expiration rules
- Auth resume: 30 minutes.
- Active form draft: 24 hours.
- Vehicle/storefront draft: 7 days.
- Payment and command execution are not auto-replayed.

## Duplicate-prevention rules
- Global continuity stores intent and context, not blind execution.
- Unsafe actions such as payments, Stripe setup, command sends, contract signing, and payout actions are never auto-run after refresh.
- Host onboarding clears pending action/draft only after `instantHostOnboarding` succeeds.

## Validation coverage
1. Refresh during host onboarding: covered by draft + beforeunload route memory.
2. Auth redirect during host onboarding: covered by pending action + auth resume + existing success panel.
3. Refresh during checkout: route memory covered; workflow draft depends on checkout components adopting the shared draft API.
4. Auth redirect during checkout: route memory covered.
5. Refresh during vehicle form: covered if the form uses `usePersistentFormDraft`; otherwise route memory only.
6. Refresh during storefront customization: covered if the form uses `usePersistentFormDraft`; otherwise route memory only.
7. Refresh during inspection upload: route memory covered; file upload recovery remains workflow-specific.
8. Refresh during payment recovery: route memory covered; payment is not auto-replayed.
9. Refresh on My Vehicle: route memory covered.
10. Refresh on host vehicle management: route memory covered.
11. Refresh on admin telematics: route memory covered with admin role guard.
12. Offline → reconnect during form entry: offline banner + query refetch + local draft persistence covered.
13. Login after session expiration: unhandled auth failure saves route then redirects to login.
14. User role mismatch: guarded by role-based resume checks.
15. Entity already completed before resume: requires workflow-specific completion checks; unsafe action auto-run is blocked globally.

## Remaining risk areas
- Existing workflows that do not use `usePersistentFormDraft` will get route restoration but not full field-level draft restoration until they register drafts.
- Entity ownership and completion validation must stay in page/backend workflow logic for record-specific actions.
- Commands and payments intentionally show previous state only and require user confirmation to run again.