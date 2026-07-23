# Jotform Enrollment Webhook Setup

> Production connection status: **not connected**. Do not add the URL to the live Jotform until the exact form ID and question-ID map below have been verified with one captured sample submission.

## Endpoint

After staged deployment and mapping verification, use this URL in Jotform. Replace `<private-webhook-secret>` with the secret stored as `JOTFORM_WEBHOOK_SECRET` in Supabase; do not paste that secret into browser code or commit it to Git.

`https://pgagpvfiplizahsnmvxf.supabase.co/functions/v1/jotform-enrollment-webhook?secret=<private-webhook-secret>`

## Field Mapping

Exact Dance Techniques Jotform form ID: `261604613385153`

The webhook reads Jotform's `rawRequest` JSON. Exact question IDs from the live form must be stored in the `JOTFORM_FIELD_MAP` Supabase secret as JSON. The function will not use label guesses in production.

| Jotform question | Question ID / submitted field | Enrollment destination |
| --- | --- |
| School | `5` / `q5_school` | `requested_school_name` |
| Dancer's Name | `6` / `q6_dancersName[first]`, `q6_dancersName[last]` | `student_first_name`, `student_last_name` |
| We are | `58` / `q58_weAre` | `enrollment_history` |
| Dancer's Birthday | `7` / `q7_dancersBirthday[month/day/year]` | `student_birth_date` |
| 2025 Recital | `78` / `q78_inLast` | `requested_dance_style`; dropdown values are `Ballet`, `Tap`, `I can't remember`, or no answer |
| Daycare Classroom | `8` / `q8_daycareClassroom` | `student_classroom` |
| T-Shirt Size | `82` / `q82_tshirtSize` | `tshirt_size` |
| Gender | `23` / `q23_gender` | `student_gender` |
| Special Circumstances | `33` / `q33_specialCircumstances` | Original answer in `discount_details`; automatically sets `tuition_discount` to `sibling`, `staff`, or `none` |
| Sibling Name (conditional) | `32` / `q32_input32[firstname-2/lastname-2]` | `related_dancer_name` |
| Your Name | `11` / `q11_yourName[first]`, `q11_yourName[last]` | `parent_first_name`, `parent_last_name`, `parent_name` |
| Email | `12` / `q12_email` | `parent_email` |
| Phone Number | `13` / `q13_phoneNumber[full]` | `parent_phone` |
| Learning differences / medical information | `14` / `q14_learningDifferences` | `medical_notes` |
| Brightwheel acknowledgment | `15` / `q15_downloadingThe` | `consent_responses.brightwheel_app` |
| Parent Agreement | `29` / `q29_iAgree` | `consent_responses.parent_agreement` |
| Enrollment Fee / Square payment | `39` / `q39_myProducts` | visible `payment_status` (`paid` or `unpaid`); verification transaction ID stays stored but hidden; full response retained in `raw_submission` |
| Misc. Notes to teacher | `41` / `q41_miscNotes` | `registration_notes` |

Every parent-entered answer now has one of three destinations:

1. A named enrollment/student field in the table above.
2. `consent_responses` or the payment fields for acknowledgments and payment results.
3. `additional_information` for any current or future answered Jotform question that is not in the verified map.

`additional_information` is visible and editable in the enrollment review and in the placed Student Profile's **Additional Information** section. The original technical payload remains in `raw_submission` for recovery and troubleshooting, but it is never displayed as a second raw form in the Director Dashboard.

The live form also contains page breaks, instructions, teacher graphics, agreement copy, fee descriptions, and the Submit button. Those elements do not collect an answer and therefore do not create empty student fields.

Use this shape for the exact live question IDs after exporting them from Jotform:

```json
{
  "student_first_name": ["q6_dancersNamefirst"],
  "student_last_name": ["q6_dancersNamelast"],
  "student_birth_date": ["q7_dancersBirthday"],
  "student_gender": ["q23_gender"],
  "student_classroom": ["q8_daycareClassroom"],
  "tshirt_size": ["q82_tshirtSize"],
  "enrollment_history": ["q58_weAre"],
  "related_dancer_first_name": ["q32_input32firstname-2"],
  "related_dancer_last_name": ["q32_input32lastname-2"],
  "parent_first_name": ["q11_yourNamefirst"],
  "parent_last_name": ["q11_yourNamelast"],
  "parent_email": ["q12_email"],
  "parent_phone": ["q13_phoneNumberfull"],
  "requested_school_name": ["q5_school"],
  "requested_dance_style": ["q78_inLast"],
  "discount_details": ["q33_specialCircumstances"],
  "medical_notes": ["q14_learningDifferences"],
  "consent_brightwheel": ["q15_downloadingThe"],
  "consent_parent_agreement": ["q29_iAgree"],
  "payment_summary": ["q39_myProducts"],
  "registration_notes": ["q41_miscNotes"]
}
```

This map was read from the live form structure on July 21, 2026. It still must be verified against one captured webhook payload because Jotform can serialize compound and conditional answers differently from their browser field names. Store the verified form ID as the `JOTFORM_FORM_ID` Supabase secret.

The T-Shirt Size question was added after the five-row July 21 CSV export. Its verified choices are `2T`, `3T`, `4T`, `5T`, `XS`, `S`, `M`, `L`, and `XL`.

Special Circumstances uses these exact business rules:

- `I have already enrolled my first dancer, and am enrolling an additional dancer` → `Sibling`
- `I am an employee at my dancer's daycare facility` → `Staff`
- blank or `None` → `None`
- `Director` does not come from Jotform and remains a manual Director Dashboard option

Required Supabase function secrets:

- `JOTFORM_WEBHOOK_SECRET`: a newly generated private random value.
- `JOTFORM_FORM_ID`: the exact numeric Dance Techniques Jotform form ID.
- `JOTFORM_FIELD_MAP`: the verified JSON question-ID mapping.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: provided server-side by Supabase; never copy the service-role key into the Dashboard code.

## Add the Webhook in Jotform

1. Open the enrollment form in Jotform.
2. Choose **Settings → Integrations**.
3. Search for **Webhooks** and open it.
4. Paste the full endpoint URL, including the private `secret` query parameter.
5. Complete and save the integration.
6. Keep the endpoint URL private because possession of the secret authorizes enrollment intake submissions.

## Verify One Test Enrollment

1. Submit one clearly labeled test registration through the live Jotform form.
2. Open **Director Dashboard → Enrollments & Rosters** and select **Enrollments Waiting for Approval**.
3. Confirm the test appears once with status **New**, including the correct dancer, parent, school, date, and contact information.
4. Submit or replay the same Jotform submission once more and confirm no duplicate is created. The unique `jotform_submission_id` makes retries idempotent.
5. Open the submission, select an existing partner school, assigned teacher, and active class.
6. Choose **Approve & Place Dancer**.
7. Confirm the queue record changes to **Placed** and the dancer appears once in **Classes & Rosters** and the assigned teacher's **Rosters** mini app.
8. Complete the Brightwheel Profile Created, Parent Invited, Invoice Sent, and Enrollment Active checklist items as those steps are finished.

## Historical CSV Backfills

CSV imports remain a backfill-only path. Each imported row must enter the same `public.enrollments` intake table with `source = 'csv_backfill'` and a stable `source_record_id`. If the CSV contains the Jotform submission ID, populate `jotform_submission_id` too. Director approval uses the same student match—normalized first name, last name, and birthdate—so an existing imported dancer is reused rather than duplicated.

The July 21, 2026 export was verified with five production enrollment rows. It uses repeated generic column labels, so map the export by column position rather than by header text:

| CSV column | Meaning | Intake destination |
| --- | --- | --- |
| 1 | Submission Date | `submitted_at` |
| 3 | School | `requested_school_name` |
| 4–5 | Dancer first and last name | `student_first_name`, `student_last_name` |
| 6 | New/returning status | `enrollment_history` |
| 7 | Birthday | `student_birth_date` |
| 8 | Prior recital selection | `requested_dance_style` |
| 9 | Daycare classroom | `student_classroom` |
| 10 | Gender | `student_gender` |
| 11 | Special circumstances | `discount_details` |
| 12–13 | Sibling first and last name | `related_dancer_name` |
| 14–15 | Parent first and last name | `parent_first_name`, `parent_last_name`, `parent_name` |
| 16–17 | Parent email and phone | `parent_email`, `parent_phone` |
| 18 | Medical / learning information | `medical_notes` |
| 19 | Brightwheel acknowledgment | `consent_responses.brightwheel_app` |
| 20 | Signed Parent Agreement URL | `consent_responses.parent_agreement = "signed"`; retain URL only in `raw_submission` |
| 21 | Enrollment fee/Square payment summary | `payment_status` (`paid` or `unpaid`) and verification transaction ID; retain the full summary in `raw_submission` without copying payer details into the student record |
| 22 | Teacher notes | `registration_notes` |

This CSV does not expose a separate Submission ID column. For all five verified rows, the signed Parent Agreement URL contains the original numeric Jotform submission ID immediately after the form ID. The backfill importer must extract that value and set both `source_record_id` and `jotform_submission_id`. If a future row has no extractable ID, use a deterministic backfill fingerprint and require a secondary dancer-name/birthdate/school match during review. Never use payment card or payer information as a student duplicate key.

## Inspect Failed Webhook Logs

1. Open the Supabase project dashboard.
2. Choose **Edge Functions → jotform-enrollment-webhook → Logs**.
3. Filter to errors around the Jotform submission time.
4. Logs contain only safe error summaries and do not include the webhook secret, service-role key, or full family payload.
5. Correct the field map or submission data, then replay the same Jotform submission. Idempotency prevents a duplicate intake record.
