# Jotform Recital Conflict Connection

The Recital Conflict Form uses Jotform form ID `262864434875066` and sends submissions to the `jotform-recital-conflict-webhook` Supabase Edge Function.

The webhook matches a dancer using first name, last name, and school. Parent email resolves duplicate names. It never assigns an ambiguous submission to a dancer. Unmatched submissions remain in `recital_conflict_submissions` for review.

The current live form fields are mapped as follows: dancer `q7`, school `q8`, email `q9`, conflict choice `q2`, conditional timing details `q3`, note to teacher `q10`, and acknowledgment `q5`.

Responses are written to `students.additional_information` using these keys:

- `recital_conflict_type`
- `recital_conflict_note`
- `recital_available_before`
- `recital_available_after`
- `recital_conflict_submission_id`
- `recital_conflict_submitted_at`
- `recital_conflict_source`
- `no_recital`, `no_recital_note`, and `no_recital_source` when the dancer cannot or will not participate

## Required Supabase secrets

- `JOTFORM_RECITAL_CONFLICT_FORM_ID=262864434875066`
- `JOTFORM_RECITAL_CONFLICT_WEBHOOK_SECRET=<private random value>`

## Jotform webhook

Add the following URL under **Settings → Integrations → WebHooks**, replacing the placeholder with the private secret:

`https://pgagpvfiplizahsnmvxf.supabase.co/functions/v1/jotform-recital-conflict-webhook?secret=<private-secret>`

Keep the secret out of browser code, screenshots, and the repository.

## Verification

Submit one controlled response for a known dancer. Confirm:

1. The Edge Function returns HTTP 200.
2. `recital_conflict_submissions.status` is `matched`.
3. The matched student's `additional_information` contains the conflict fields.
4. The dancer appears in **The Big Stage → Recital Matching → Recital Conflicts**.
