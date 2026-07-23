# My Dance Techniques — Canonical App

**Status:** Active canonical app
**Last updated:** 2026-07-23

This folder is the single source of truth for My Dance Techniques, including Teacher Tools and the Director Dashboard. All development starts here, and approved releases are published from here to the public deployment repository.

## Open It

Start the normal Dance Techniques local app server, open the Teacher Portal, then choose **Teacher Tools & Director Dashboard**. The local server now resolves this repository automatically instead of relying on a computer-specific folder.

The live installable app is published at `https://dancetechniquesllc.github.io/dance-techniques-teacher-tools/`. Its public deployment repository contains only the browser app; the company repository remains private and Supabase keeps live records behind role-based access rules.

For an in-person walkthrough before accounts are ready, append `?tour=1` to the local Director Dashboard URL. Tour mode works only on `localhost`/`127.0.0.1`, uses sample data, and cannot bypass sign-in on the published app.

## Current Scope

- Responsive **My Dance Techniques** landing page with Teacher Tools active and future Parent Portal and franchise Director Dashboard entrances visibly marked Coming Soon
- Teacher and director views
- Teacher profiles and school assignments
- Partner School cards, teacher/ISD bubbles, and sorting
- Schedule, curriculum, messages, pay-stub placeholders, and admin tools
- Shared Supabase-backed Classes & Rosters for signed-in accounts, with browser-local saving retained for the safe local tour and unfinished prototype sections
- Private-by-default shared-roster loading: signed-in users never see fictional roster records while live role-filtered data is opening or unavailable
- Supabase email/password sign-in with inactive-account approval gating
- Role-aware landing: directors/admins open the Director Dashboard, while teachers open Teacher Tools without a Director Dashboard switch
- Installable PWA manifest, offline shell, live HTTPS address, and secure password-reset/password-setup screens
- Responsive branded sign-in artwork optimized for teacher phones and director/admin computers
- Teacher-first mobile role ordering, with the existing secure sign-in and role-aware routing preserved behind the Teacher Tools entrance

## Data Safety

- Teacher/profile examples use demonstration data and `.example` contacts; Partner School starter records use reviewed public business information.
- Signed-in Classes & Rosters records load from and save to the live Supabase project. Other unfinished prototype sections still save only in that browser's local storage.
- A failed shared write is replaced by a fresh role-filtered database copy so an unsaved change is not left looking complete.
- Only active Supabase profiles can open the portal. New accounts remain inactive until a director or admin approves them.
- Do not add real passwords, payroll documents, student/parent records, or private teacher details to this folder.
- Public Partner School starter information is checked in at `data/partner-schools.js`, with source research in `research/partner-schools/`.
- Browser edits override the starter directory on that browser but do not automatically update the checked-in data file.

## Canonical Source Rule

Do not develop directly in a separate deployment checkout. Changes are reviewed and committed in this folder first, then published with `tools/publish-teacher-tools-site.sh`. The public repository is a deployment mirror, not a second development source.

The July 23, 2026 public release was reconciled back into this folder after development had temporarily drifted into the deployment repository. Git history preserves the earlier app; no old prototype should be used as a working source.
