# Jotform Waitlist Integration

The **Waitlist** form uses Jotform form ID `262808772109059` and sends submissions to the `jotform-waitlist-webhook` Supabase Edge Function.

## Verified form fields

| Question | Jotform field | Future Dancer destination |
| --- | --- | --- |
| School | `q4_school` | Partner school match |
| Dancer | `q3_dancer[first]`, `q3_dancer[last]` | Student name |
| Dancer's Birthday | `q6_dancersBirthday[month/day/year]` | Birth date |
| Classroom | `q5_classroom` | Original and official classroom; used to select the correct dance class |
| Parent/Guardian | `q8_parentguardian[first/last]` | Parent name |
| Email | `q9_email` | Parent email |
| Phone Number | `q10_phoneNumber[full]` | Parent phone |

The webhook creates a Future Dancer with a `waitlisted` class enrollment. Waitlisted dancers do not consume class capacity and are not available for class check-in. Duplicate Jotform deliveries are ignored by submission ID.

The webhook URL must include the private `JOTFORM_WAITLIST_WEBHOOK_SECRET`. Never commit or expose that value in browser code.
