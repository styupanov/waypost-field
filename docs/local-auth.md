# Local credentials authentication

Waypost uses Auth.js Credentials with JWT sessions for local development only. It is disabled unless `LOCAL_AUTH_ENABLED=true`. Configure `AUTH_SECRET` and both `LOCAL_AUTH_USER_A_*` and `LOCAL_AUTH_USER_B_*` entries in the untracked `.env.local`; `.env.example` contains safe placeholders. Passwords stay in server environment configuration and are never stored in PostgreSQL.

Each configured login resolves a provider-independent identity: `{ subject, email?, name? }`. The opaque subject (for example `local:serge`) is upserted into `public.users.auth_subject`, so repeated logins resolve the same Waypost user UUID. Trip APIs derive ownership exclusively from the authenticated server session and never accept a browser-supplied user ID.

Anonymous planning remains available. A coherent draft can be saved through **Save this to your map**; after sign-in it becomes an owned trip at `?trip=<UUID>`. Successful owned rebuilds and Add/Remove/Replace edits update version 1 atomically. A reload restores persisted geometry and metrics first, then calculates fresh, non-persisted Along the Way alternatives.

To test isolation, sign in as User A, save a trip, sign out, then sign in as User B and open User A's URL. The API returns not found and does not expose the trip.

This identity-provider boundary is intentionally replaceable: later, an Amazon Cognito JWT subject will feed the same `AuthenticatedIdentity.subject → Waypost user` resolution. Ownership, persistence, autosave, reload, and UI ownership state do not depend on the local provider.
