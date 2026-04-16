-- 007_player_badges.sql
-- Generic table for game-related achievement badges (streaks, volume, mastery).

create table if not exists player_badges (
  id          uuid primary key default uuid_generate_v4(),
  player_id   uuid not null references players(id) on delete cascade,
  badge_type  text not null, -- 'streak_10', 'volume_100', 'text_master'
  label       text not null, -- Display name: "Sharpshooter", etc.
  awarded_at  timestamptz not null default now(),
  unique (player_id, badge_type)
);

create index if not exists player_badges_player_idx on player_badges(player_id);
