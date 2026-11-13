export const fields = [
  ['director_name','Director Name', () => window.dtCurrentProfile?.full_name],
  ['business_name','Business Name'], ['school_name','School Name'], ['teacher_name','Teacher Name'],
  ['tuition','Tuition'], ['enrollment_link','Enrollment Link'], ['contact_email','Contact Email'],
  ['contact_phone','Contact Phone'], ['location','Location'], ['dance_day','Dance Day'],
  ['recital_date','Recital Date'], ['registration_deadline','Registration Deadline']
];
export function captionFields(text) { return [...new Set(text.match(/\{[a-z_][a-z0-9_]*\}/gi) || [])]; }
export function personalizeCaption(text, values) {
  const missing = captionFields(text).filter(token => !values.get(token));
  return { missing, text: text.replace(/\{[a-z_][a-z0-9_]*\}/gi, token => values.get(token) || token) };
}
