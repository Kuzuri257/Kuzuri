# Kuzuri Rebuild Design Reference

Source references:
- Claude Design share: `Life OS fitness tracker app`
- Local iPhone export: `/Users/abdullaaqeel/Downloads/Life OS iPhone (standalone).html`

This file captures the design/product direction to preserve during the Kuzuri rebuild. The exported Claude file should be treated as a prototype reference, not production source.

## Product Direction

Kuzuri should become a mobile-first personal operating system for training, recovery, nutrition, learning, and life review. The center of the app is not a dashboard of charts; it is a daily cockpit that tells the user what matters today, lets them log quickly, and lets them look backward to edit the truth.

## Primary Mobile Navigation

The iPhone prototype uses four core bottom tabs:

- `Today`: daily cockpit, week strip, readiness, next actions, quick access.
- `Train`: lifting programs, workout runner, running plan, synced/manual runs.
- `Fuel`: calories, macros, meals, weight trend, target editing.
- `Mind`: learning timer, reading/domains, recovery correlations, rituals.

Additional app-wide surfaces appear as overlays:

- `Pulse`: sleep, recovery, HRV, strain, correlations.
- `Session`: active lifting workout with sets, reps, weight, completion.
- `Quick`: fast action launcher.
- `Coach`: recommendations/proposals requiring user consent.
- `Builder`: workout split/program editor.
- `Meal`: food search/add flow.
- `Goals`: macro target editing.
- `Seals`: achievement room.
- `Me`: profile and settings.
- `Day`: "Looking back" history review for editing past logs.

## Core Screens To Rebuild

### Today

- Shows the current day as the main action surface.
- Includes a tappable week calendar with colored dots for logged domains.
- Opens day history from each week day.
- Surfaces recovery/readiness and practical next actions.
- Has quick routes into workout, food, learning, profile, and seals.

### Day History

- Opened by tapping a day in the week calendar.
- Lets the user move backward/forward with previous/next controls.
- Shows logged training, runs, meals, learning, sleep, recovery, and weight.
- Past entries are editable/removable.
- Future days show an empty/future state.

This is essential. The old Kuzuri app lacks a strong editable historical ledger.

### Train

- Segmented lift/run mode.
- Lifting includes program list, split builder, and a session runner.
- Session runner supports exercise expansion, set completion, weight/reps stepper controls, and finishing the session.
- Running includes upcoming plan workouts and synced/manual run history.
- Coach may suggest schedule swaps based on recovery.

### Fuel

- Macro ring and remaining calories.
- Protein, carbs, fat progress bars.
- Food search/add flow with meal chips.
- Logged meal list with macro metadata.
- Goal editor for calories and macros.
- Weight trend chart and manual weight logging.

### Mind

- Domain-based learning timer.
- Tracks reading/learning time by domain such as AI, investing, philosophy, history, novels.
- Shows weekly progress against learning goal.
- Includes domain totals, formats, and learning milestones/seals.

This directly answers the need to track reading, domains of interest, and time spent.

### Pulse

- Recovery score ring.
- Sleep/recovery/weight context.
- Weekly recovery strip.
- Correlations such as sleep versus lifting volume, recovery versus strain, and HRV versus run pace.

### Me / Settings

- Profile card with avatar, name, training identity, weight, height, birth year.
- Connections with status toggles: Whoop, Strava, Runna, Apple Health.
- Coach consent controls: draft my day, may move workouts, weekly review.
- Targets and training shortcuts: macro targets, split builder.
- Units: kg/km and lb/mi.
- Rituals: evening examen and quiet hours.
- Data controls: export everything, delete everything.

## Achievement System

The prototype calls achievements `Seals`.

Seal categories:
- Train
- Run
- Fuel
- Pulse
- Mind

Seal states:
- Earned: solid colored circle with date/story.
- In progress: colored ring and progress bar.
- Locked: dashed ring with unlock condition.

Example seals:
- Session Sealed
- Iron Month
- Century of Sets
- Plate Club
- First 10K
- Negative Split
- Marathon Block
- Week of Protein
- Green Streak
- Century Club
- The Thread

The seal system should be backed by real event data, not hardcoded UI badges.

## Visual Tokens

The iPhone design uses a warm, editorial fitness journal feel:

- Background: `#F1ECDF`
- Surface: `#FAF7EC`
- Ink: `#26221C`
- Muted text: `#57503F`, `#8A8272`
- Deep green: `#1E4D38`
- Action green: `#3E7A5E`
- Soft green: `#5F9678`
- Tan/gold: `#C99B62`, `#A97C50`
- Rust accent: `#B4593B`
- Dark session surface: `#1E1A13`, `#1C1811`

Typography direction:
- System sans for dense app UI.
- Occasional serif/italic display treatment for the Life OS identity.
- Compact labels in uppercase for sections.
- Avoid generic SaaS dashboard styling.

## Implementation Implications

- Build mobile-first, then adapt up to iPad/sidebar layouts.
- Model logs as dated events that can be edited after the fact.
- Use a real domain/time ledger for reading and learning.
- Treat integrations as providers feeding normalized sleep, recovery, run, and activity records.
- Keep coach actions consent-based and auditable.
- Keep the visual system warm and tactile, while making the production UI faster and more legible than the prototype.
