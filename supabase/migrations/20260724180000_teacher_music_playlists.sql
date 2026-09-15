-- DT Tunes: teacher-created playlists
--
-- Lets each teacher build and name their own playlists, pulling only from
-- the existing DT Song Catalog (public.music_tracks). Mirrors the
-- director-owned public.music_playlists / public.music_playlist_tracks
-- pattern, but scoped per teacher:
--   * a teacher can create, rename, reorder, and delete their own playlists
--     and can only ever add tracks that already exist in music_tracks
--   * a teacher can never see or touch another teacher's playlists
--   * a teacher can never edit the director's (music_playlists) playlists
--   * directors/admins can view every teacher's playlists (read-only, for
--     oversight) but editing stays with the teacher who owns each one
--   * there is no "share" action — nothing here exposes a playlist beyond
--     its owner and the director/admin read policy below

create table public.music_teacher_playlists (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  cover_path text,
  cover_storage_path text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, name)
);

create table public.music_teacher_playlist_tracks (
  playlist_id uuid not null references public.music_teacher_playlists(id) on delete cascade,
  track_id uuid not null references public.music_tracks(id) on delete cascade,
  position integer not null default 0,
  primary key (playlist_id, position)
);

create trigger teacher_playlists_set_updated_at before update on public.music_teacher_playlists
for each row execute function public.set_updated_at();

create index music_teacher_playlists_teacher_id_idx on public.music_teacher_playlists (teacher_id);
create index music_teacher_playlist_tracks_track_id_idx on public.music_teacher_playlist_tracks (track_id);

alter table public.music_teacher_playlists enable row level security;
alter table public.music_teacher_playlist_tracks enable row level security;

-- Playlists: owner has full control; director/admin can look but not touch.
create policy "teachers manage their own playlists"
on public.music_teacher_playlists for all to authenticated
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

create policy "leaders view every teacher playlist"
on public.music_teacher_playlists for select to authenticated
using (public.is_director_or_admin());

-- Playlist tracks: same ownership check, resolved through the parent playlist.
create policy "teachers manage tracks in their own playlists"
on public.music_teacher_playlist_tracks for all to authenticated
using (
  exists (
    select 1 from public.music_teacher_playlists p
    where p.id = music_teacher_playlist_tracks.playlist_id
      and p.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.music_teacher_playlists p
    where p.id = music_teacher_playlist_tracks.playlist_id
      and p.teacher_id = auth.uid()
  )
);

create policy "leaders view tracks in every teacher playlist"
on public.music_teacher_playlist_tracks for select to authenticated
using (public.is_director_or_admin());
