# Kuzuri Rebuild Audit

## Current Repo

Repository: `Kuzuri257/Kuzuri`

Cloned commit: `abbdb92354f210d968907ba50effa82e0d5c08d8`

Current architecture:

- Static Cloudflare Pages app.
- One large `index.html` containing HTML, CSS, JavaScript, state, UI rendering, and app logic.
- `_worker.js` proxies same-origin routes to a separate Cloudflare Worker:
  - `/auth/*`
  - `/api/*`
  - `/whoop/*`
  - `/oura/*`
- No package manager, build system, tests, module structure, or typed schema in this repo.
- Primary local state key: `kuzuri_v2_3`.

## What Already Exists

Kuzuri is not a small prototype. It already contains:

- Email-code auth flow.
- Account onboarding.
- Local-to-server migration flow.
- Server state sync via `/api/state`.
- WHOOP OAuth + sync.
- Oura OAuth + sync.
- Manual sleep, weight, mood logging.
- Provider-agnostic sleep/recovery helpers.
- Today screen with Train, Pulse, Mind, Habits rings.
- Morning intention.
- Evening examen.
- Weekly pause/reset.
- People/Dunbar relationship system.
- Touch/memory logging.
- Captures with tags, people, and pinned chapters.
- Life review surfaces: week/month/year, themes, chapters, habit grids.
- Habit creation and completion logic.
- Workout program editor.
- Lift session runner with sets, reps, weights, rest timer, PR detection, close notes.
- Manual run logger.
- Generic activity logger.
- Settings, profile, export/import, subscriptions, account deletion.

## What Is Missing Or Risky

The biggest risk is not feature absence. It is maintainability.

- `index.html` is about 16,871 lines.
- Rendering and state mutation are coupled through global functions and inline `onclick`.
- There is no typed data model.
- There are no automated tests for workout logic, wearable parsing, auth flows, or migrations.
- The backend Worker source is not present in this repo.
- WHOOP/Oura integration depends on the external Worker implementation and its D1/token storage.
- Manual run logging exists, but no running integration exists.
- Workout plans work, but the UX is buried inside overlays/settings rather than feeling like a primary product pillar.
- The app has many excellent ideas, but navigation currently hides them behind four broad tabs and an orb.

## Preserve

These should be preserved in the rebuild:

- The name and tone: quiet, personal, contemplative, not SaaS.
- Today rings concept.
- Examen and weekly pause.
- People/Dunbar system.
- WHOOP/Oura data model and provider abstraction.
- Workout program editor and lift session logic.
- Manual run logging model.
- Chapters and archive concept.
- Local-first export/import philosophy.

## Change

These should change:

- Replace the monolithic static app with a structured app.
- Make Training a first-class area, not only an orb action.
- Make Sleep/Recovery a first-class area, not buried in Pulse/settings.
- Add a real running path: manual first, Strava next, Apple Health only if native.
- Move data schema into typed code and migrations.
- Split UI into components and domain modules.
- Replace inline handlers with stateful components/actions.
- Add automated tests around wearable parsing, workout logging, PR logic, and migrations.

## Recommended Stack

Recommended first rebuild:

- Next.js App Router + TypeScript.
- Tailwind or CSS variables for the current Kuzuri design system.
- Supabase for auth, Postgres, storage, and scheduled jobs if leaving Cloudflare.
- Or Cloudflare Pages + Hono/Workers + D1 if staying fully Cloudflare-native.
- Zustand or TanStack Query for client state.
- Zod schemas for imported legacy state and API responses.
- Recharts or custom SVG for sleep/recovery/training charts.

Best pragmatic route:

1. Build a Next.js PWA first.
2. Preserve the current Cloudflare Worker temporarily behind API routes or proxy calls.
3. Migrate backend later only after the UI/data model is stable.

Native app route:

- Expo React Native only if Apple Health / HealthKit becomes non-negotiable.
- Otherwise, PWA first is faster and sufficient for WHOOP/Oura/Strava.

## Proposed New Information Architecture

Primary navigation:

- Today
  - readiness
  - planned training
  - intention
  - quick capture
  - evening close
- Train
  - workout plan
  - lift session
  - run log
  - activity log
  - training history
- Recovery
  - sleep
  - WHOOP/Oura
  - HRV/RHR/readiness
  - trends
- People
  - Dunbar map
  - due contacts
  - touches
  - memories
- Life
  - examen archive
  - weekly pause
  - habits
  - chapters
  - themes
- Me
  - settings
  - integrations
  - export/import

## Rebuild Phases

### Phase 1: Extract And Stabilize

- Split `index.html` into source modules without changing behavior.
- Extract data types and migration helpers.
- Extract wearable parsing helpers.
- Extract workout/session logic.
- Add tests for core pure functions.
- Keep the current UI running during extraction.

### Phase 2: New App Shell

- Create the new stack.
- Port design tokens.
- Build mobile-first app shell.
- Rebuild Today, Train, Recovery, People, Life, Me navigation.
- Add offline/PWA support.

### Phase 3: Data And Backend

- Decide backend: keep Cloudflare Worker or move to Supabase.
- Obtain source for `kuzuri-whoop` Worker.
- Recreate auth/session model.
- Recreate `/api/state`, `/api/migrate`, `/whoop/*`, `/oura/*`.
- Add database tables and row-level access.

### Phase 4: Training Core

- Port workout program editor.
- Port lift session runner.
- Port rest timer and PR detection.
- Improve running from manual log to structured history.
- Add Strava integration if desired.

### Phase 5: Recovery Core

- Port WHOOP/Oura sync.
- Add sleep/recovery dashboard.
- Add readiness/training recommendations.
- Add missing data and stale sync states.

### Phase 6: Archive And Meaning

- Port examen, weekly pause, captures, people, chapters.
- Improve search, tags, and timelines.
- Add export/import for the new schema.

## Immediate Dependencies Needed

Before implementation beyond frontend refactor, gather:

- Claude Design reimagined screens/source.
- Source code for the `kuzuri-whoop` Cloudflare Worker.
- Cloudflare/D1 schema or export.
- WHOOP OAuth configuration details.
- Oura OAuth configuration details.
- Any current production URL and Pages project settings.
- Decision: PWA-first or native-first.

## Recommendation

Do not continue investing in the Life Architecture prototype as the core app.

Kuzuri already contains the right foundation. Rebuild Kuzuri properly, preserve its best product ideas, and fold Life Architecture concepts into it only where they strengthen the daily loop.
