# Teacher Tools and Director Dashboard Prototype

**Status:** In development
**Last updated:** 2026-07-20

This folder is the repo-safe copy of the Teacher Tools and Director Dashboard prototype developed in Open Design.

## Open It

Start the normal Dance Techniques local app server, open the Teacher Portal, then choose **Teacher Tools & Director Dashboard**.

The live installable app is published at `https://dancetechniquesllc.github.io/dance-techniques-teacher-tools/`. Its public deployment repository contains only the browser app; the company repository remains private and Supabase keeps live records behind role-based access rules.

For an in-person walkthrough before accounts are ready, append `?tour=1` to the local Director Dashboard URL. Tour mode works only on `localhost`/`127.0.0.1`, uses sample data, and cannot bypass sign-in on the published app.

## Current Scope

- Teacher and director views
- Teacher profiles and school assignments
- Partner School cards, teacher/ISD bubbles, and sorting
- Schedule, curriculum, messages, pay-stub placeholders, and admin tools
- Browser-local prototype saving
- Supabase email/password sign-in with inactive-account approval gating
- Role-aware landing: directors/admins open the Director Dashboard, while teachers open Teacher Tools without a Director Dashboard switch
- Installable PWA manifest, offline shell, live HTTPS address, and secure password-reset/password-setup screens
- Responsive branded sign-in artwork optimized for teacher phones and director/admin computers

## Data Safety

- Teacher/profile examples use demonstration data and `.example` contacts; Partner School starter records use reviewed public business information.
- Sign-in is connected to the live Supabase project, but roster and profile edits are still saved only in that browser's local storage until the data migration is complete.
- Only active Supabase profiles can open the portal. New accounts remain inactive until a director or admin approves them.
- Do not add real passwords, payroll documents, student/parent records, or private teacher details to this folder.
- Public Partner School starter information is checked in at `data/partner-schools.js`, with source research in `research/partner-schools/`.
- Browser edits override the starter directory on that browser but do not automatically update the checked-in data file.

## Source Note

Open Design remains a local design workspace. This folder is the shareable app copy and is the version that should be reviewed, committed, and synchronized through GitHub.
