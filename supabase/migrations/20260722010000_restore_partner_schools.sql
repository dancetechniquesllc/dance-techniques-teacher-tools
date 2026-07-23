-- Restore the preserved Dance Techniques partner-school directory after the
-- normalized table was introduced empty. Names are treated case-insensitively
-- so this migration is safe to rerun without creating duplicates.

create unique index if not exists partner_schools_name_unique
  on public.partner_schools (lower(name));

insert into public.partner_schools (
  name, nickname, address, city, state, postal_code, district,
  director_name, director_phone, director_email, dance_day, time_of_day,
  season_start_date, active
)
values
  ('Arka Montessori Forney', 'Arka Montessori Forney', '1340 Pinson Rd', 'Forney', 'TX', '75126', 'Forney ISD', null, '(469) 300-3899', 'arkaforney@gmail.com', null, 'AM', '2026-08-31', true),
  ('Cadence Academy Forney', 'Cadence Academy Forney', '929 College Avenue', 'Forney', 'TX', '75126', null, 'Tyffanie Foster', '(972) 564-1133', 'forney@cadence-academy.com', null, 'AM', '2026-08-31', true),
  ('Children''s Lighthouse Fate', 'Children''s Lighthouse Fate', 'S FM 551', 'Fate', 'TX', '75189', null, 'Ms. Lindsay', '(469) 437-7796', 'Fate@ChildrensLighthouse.com', null, 'AM', '2026-08-31', true),
  ('Children''s Lighthouse Rockwall', 'Children''s Lighthouse Rockwall', '3009 N Goliad St', 'Rockwall', 'TX', '75087', null, null, '(972) 608-3848', 'Rockwall@ChildrensLighthouse.com', null, 'AM', '2026-08-31', true),
  ('Children''s Lighthouse Sachse', 'Children''s Lighthouse Sachse', '7280 Highway 78', 'Sachse', 'TX', '75048', null, 'Ramiah Alissa / Ms. Rebecca', '(469) 217-4292', 'WoodbridgeTX@ChildrensLighthouse.com', null, 'AM', '2026-08-31', true),
  ('Children''s Lighthouse Forney', 'Children''s Lighthouse Forney', '2401 FM 741', 'Forney', 'TX', '75126', null, null, '(972) 430-4855', 'Forney@ChildrensLighthouse.com', null, 'AM', '2026-08-31', true),
  ('The Fulton School', 'The Fulton School', '1626 Smirl Dr', 'Heath', 'TX', '75032', null, null, '(972) 772-4445', 'info@thefultonschool.com', null, 'AM', '2026-08-31', true),
  ('Highview Learning Center', 'Highview Learning Center', '907 W Holiday', 'Fate', 'TX', '75087', 'Rockwall ISD', 'Breanna Blue', '(972) 771-8441', null, null, 'AM', '2026-08-31', true),
  ('Kiddie Academy Murphy', 'Kiddie Academy Murphy', '605 E FM 544', 'Murphy', 'TX', '75094', null, 'Nekeshe Faulk-Swanson', '(469) 825-1200', null, null, 'AM', '2026-08-31', true),
  ('KinderCare of Melissa', 'KinderCare of Melissa', '3404 Sky Ridge Lane', 'Melissa', 'TX', '75454', null, 'Devonna Majors', '(855) 910-2418', 'Care@KinderCare.com', null, 'AM', '2026-08-31', true),
  ('Meadow Oaks', 'Meadow Oaks', '1412 S Belt Line Rd', 'Mesquite', 'TX', '75149', null, 'Lori Sargeant', '(972) 285-6895', null, null, 'AM', '2026-08-31', true),
  ('Oakhill Day School', 'Oakhill Day School', null, null, 'TX', null, null, null, '(972) 530-4962', 'oakhilldayschool@gmail.com', null, 'AM', '2026-08-31', true),
  ('Pillars Hickox', 'Pillars Hickox', '2501 Hickox Road', 'Rowlett', 'TX', '75089', null, null, '(972) 412-7036', 'info@thepillars.com', null, 'AM', '2026-08-31', true),
  ('Pinnacle Montessori Forney', 'Pinnacle Montessori Forney', '613 Ridge Crest Rd', 'Forney', 'TX', '75126', null, null, '(972) 552-7227', 'pmaforney@pinnaclemontessori.com', null, 'AM', '2026-08-31', true),
  ('Pinnacle Montessori Wylie St. Paul', 'Pinnacle Montessori Wylie St. Paul', '2931 Parker Rd', 'Wylie', 'TX', '75098', null, 'Miss Ru', '(972) 455-8230', null, null, 'AM', '2026-08-31', true),
  ('Primrose Chase Oaks', 'Primrose Chase Oaks', '6525 Chase Oaks Blvd', 'Plano', 'TX', '75023', null, 'Tammy Paul', '(972) 517-1173', null, null, 'AM', '2026-08-31', true),
  ('Primrose Forney Gateway', 'Primrose Forney Gateway', '1451 Whaley Drive', 'Forney', 'TX', '75126', null, 'Megan Daner', '(972) 552-5851', null, null, 'AM', '2026-08-31', true),
  ('Primrose School of North Rockwall', 'Primrose North', null, null, 'TX', null, 'Rockwall ISD', 'Kali Hernandez', '(469) 543-9570', null, null, 'AM', '2026-08-31', true),
  ('Primrose School of Rockwall', 'Primrose Rockwall', '3115 Ridge Road', 'Rockwall', 'TX', '75032', 'Rockwall ISD', 'Bailey Guilfoil', '(972) 772-0180', 'bguilfoil@primroserockwall.com', null, 'AM', '2026-08-31', true),
  ('Primrose School of Rowlett', 'Primrose Rowlett', '8401 Liberty Grove Rd', 'Rowlett', 'TX', '75089', 'Garland ISD', 'Erika Bailey', '(972) 463-2655', null, null, 'AM', '2026-08-31', true),
  ('Primrose School of Wylie', 'Primrose Wylie', '1615 W Brown St', 'Wylie', 'TX', '75098', 'Wylie ISD', 'Julie Solis', '(469) 910-8617', 'director.primrosewylie@gmail.com', null, 'AM', '2026-08-31', true),
  ('Woodbridge Montessori Rockwall', 'Woodbridge Montessori Rockwall', '3100 Stone Creek Dr', 'Rockwall', 'TX', '75087', null, 'Priscilla Chatham', '(469) 297-9985', 'facebook@woodbridgemontessori.com', null, 'AM', '2026-08-31', true),
  ('Woodbridge Montessori Sachse', 'Woodbridge Montessori Sachse', '4510 Ranch Rd', 'Sachse', 'TX', '75048', null, 'Venus Brown', '(469) 297-9938', 'facebook@woodbridgemontessori.com', null, 'AM', '2026-08-31', true)
on conflict ((lower(name))) do update set
  nickname = excluded.nickname,
  address = excluded.address,
  city = excluded.city,
  state = excluded.state,
  postal_code = excluded.postal_code,
  district = excluded.district,
  director_name = excluded.director_name,
  director_phone = excluded.director_phone,
  director_email = excluded.director_email,
  season_start_date = excluded.season_start_date,
  active = true,
  updated_at = now();

-- Restore the assignments that are unambiguously present in the preserved
-- directory. Schools without an active matching teacher remain unassigned.
insert into public.teacher_school_assignments (teacher_id, partner_school_id, active)
select p.id, s.id, true
from public.profiles p
join public.partner_schools s on lower(s.name) in (
  lower('Highview Learning Center'),
  lower('Primrose School of North Rockwall'),
  lower('Primrose School of Rockwall'),
  lower('Primrose School of Rowlett')
)
where lower(p.full_name) = lower('Lexi King')
on conflict (teacher_id, partner_school_id) do update set active = true, updated_at = now();

insert into public.teacher_school_assignments (teacher_id, partner_school_id, active)
select p.id, s.id, true
from public.profiles p
join public.partner_schools s on lower(s.name) = lower('Primrose School of Wylie')
where lower(p.full_name) like lower('Tiffany%')
on conflict (teacher_id, partner_school_id) do update set active = true, updated_at = now();
