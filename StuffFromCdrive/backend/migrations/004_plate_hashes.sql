-- Migration 004: Plate hash opt-in system
-- Run in Supabase SQL editor.
--
-- Players can register a SHA-256 hash of their own license plate.
-- When another player's ALPR captures a vehicle with a matching hash,
-- the catcher earns a "Spotter" XP bonus and the plate owner is notified.
-- The raw plate number is NEVER stored — only the on-device hash.

create table if not exists plate_hashes (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  plate_hash    text not null,        -- SHA-256 hex of plate string (uppercased, spaces stripped)
  label         text,                 -- user-chosen label e.g. "My daily driver"
  created_at    timestamptz not null default now(),
  -- Prevent a player from registering the same hash twice
  unique (player_id, plate_hash)
);

-- Index for fast lookup during catch ingestion
create index if not exists plate_hashes_hash_idx on plate_hashes(plate_hash);

-- spotted_events: audit log of plate matches
create table if not exists spotted_events (
  id              uuid primary key default gen_random_uuid(),
  catch_id        uuid not null references catches(id) on delete cascade,
  plate_hash_id   uuid not null references plate_hashes(id) on delete cascade,
  spotter_id      uuid not null references players(id),   -- who caught it
  owner_id        uuid not null references players(id),   -- whose plate it is
  spotted_at      timestamptz not null default now(),
  xp_awarded      int not null default 0
);

-- RLS: players can only see their own plate hashes
alter table plate_hashes enable row level security;
create policy "owner only" on plate_hashes
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

-- spotted_events: spotter and owner can both read their own events
alter table spotted_events enable row level security;
create policy "involved players" on spotted_events
  using (spotter_id = auth.uid() or owner_id = auth.uid());
