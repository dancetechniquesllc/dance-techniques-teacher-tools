-- The shared company account represents Dance Techniques rather than an
-- individual teacher, so its profile should not receive the teacher nickname.
update public.profiles as profile
set
  full_name = 'Dance Techniques',
  updated_at = now()
from auth.users as account
where profile.id = account.id
  and lower(account.email) = 'dancetechniquesllc@gmail.com';
