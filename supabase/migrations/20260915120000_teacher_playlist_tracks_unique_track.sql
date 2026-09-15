-- DT Tunes: a song can appear only once per teacher playlist.
-- Guards against duplicate rows that would make "Remove" delete both copies
-- and could collide on the (playlist_id, position) primary key when reordering.
alter table public.music_teacher_playlist_tracks
  add constraint music_teacher_playlist_tracks_playlist_track_unique unique (playlist_id, track_id);
