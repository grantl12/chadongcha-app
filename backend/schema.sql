-- CHADONGCHA · Supabase Schema
-- Run: supabase db push < backend/schema.sql
-- Or paste into Supabase SQL editor.

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- VEHICLE DATABASE
-- ============================================================

create table makes (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  country     text,
  logo_asset  text,
  created_at  timestamptz not null default now()
);

create table models (
  id       uuid primary key default uuid_generate_v4(),
  make_id  uuid not null references makes(id) on delete cascade,
  name     text not null,
  class    text not null check (class in ('car','truck','motorcycle','van','suv')),
  created_at timestamptz not null default now(),
  unique (make_id, name)
);

create table generations (
  id                        uuid primary key default uuid_generate_v4(),
  model_id                  uuid not null references models(id) on delete cascade,
  generation_number         int  not null,
  common_name               text,
  year_start                int  not null,
  year_end                  int,            -- null = current
  facelift_flag             boolean not null default false,
  facelift_year             int,
  rarity_tier               text not null check (rarity_tier in ('common','uncommon','rare','epic','legendary')),
  production_volume_annual  int,
  production_volume_source  text,
  asset_3d_ref              text,           -- Cloudflare R2 key for glTF
  hero_image_ref            text,           -- R2 key for fallback image
  created_at                timestamptz not null default now(),
  unique (model_id, generation_number)
);

create table variants (
  id               uuid primary key default uuid_generate_v4(),
  generation_id    uuid not null references generations(id) on delete cascade,
  name             text not null,           -- e.g. 'Sedan', 'Si', 'Type R'
  visually_distinct boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (generation_id, name)
);

-- ============================================================
-- PLAYERS
-- ============================================================

create table players (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique,
  home_city       text,
  home_city_set_at timestamptz,             -- enforce once-per-month change
  xp              bigint not null default 0,
  level           int    not null default 1,
  hero_car_id     uuid references generations(id),
  plate_hash      text,                     -- bcrypt hash, cost 12 — opt-in only
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- CATCHES
-- ============================================================

create table catches (
  id             uuid primary key default uuid_generate_v4(),
  player_id      uuid not null references players(id) on delete cascade,
  generation_id  uuid references generations(id),   -- null = unknown vehicle
  variant_id     uuid references variants(id),
  catch_type     text not null check (catch_type in ('highway','scan360','space','unknown')),
  color          text,
  body_style     text,
  confidence     float,
  -- fuzzy location only — no street-level coordinates stored
  fuzzy_city     text,
  fuzzy_district text,
  -- road segment catch occurred on (for road king XP)
  road_segment_id uuid,                             -- fk added after road_segments table
  caught_at      timestamptz not null default now(),
  xp_awarded     int not null default 0,
  -- space catches
  space_object_id uuid,                             -- fk added after catchable_objects table
  synced_at      timestamptz                        -- when backend received it
);

create index catches_player_id_idx    on catches(player_id);
create index catches_generation_id_idx on catches(generation_id);
create index catches_caught_at_idx    on catches(caught_at desc);

-- ============================================================
-- FIRST FINDERS
-- ============================================================

create table first_finders (
  id             uuid primary key default uuid_generate_v4(),
  generation_id  uuid not null references generations(id) on delete cascade,
  variant_id     uuid references variants(id),
  player_id      uuid not null references players(id) on delete cascade,
  catch_id       uuid references catches(id),
  region_scope   text not null check (region_scope in ('city','country','continent','global')),
  region_value   text not null,             -- e.g. 'Seoul', 'KR', 'Asia', 'global'
  badge_name     text not null,             -- 'City Pioneer', 'National Spotter', etc.
  awarded_at     timestamptz not null default now(),
  retroactive    boolean not null default false,
  unique (generation_id, player_id, region_scope, region_value)
);

-- ============================================================
-- UNKNOWN VEHICLE COMMUNITY ID FLOW
-- ============================================================

create table unknown_catches (
  id             uuid primary key default uuid_generate_v4(),
  catch_id       uuid not null unique references catches(id) on delete cascade,
  body_type      text,
  city           text,
  -- opt-in photo — stored in R2, key here
  community_photo_ref text,
  photo_shared   boolean not null default false,
  status         text not null default 'open'
                   check (status in ('open','pending_review','confirmed','rejected')),
  confirmed_generation_id uuid references generations(id),
  confirmed_at   timestamptz,
  moderator_id   uuid references players(id),
  created_at     timestamptz not null default now()
);

create table id_suggestions (
  id               uuid primary key default uuid_generate_v4(),
  unknown_catch_id uuid not null references unknown_catches(id) on delete cascade,
  player_id        uuid not null references players(id) on delete cascade,
  generation_id    uuid not null references generations(id),
  created_at       timestamptz not null default now(),
  unique (unknown_catch_id, player_id)
);

-- ============================================================
-- ROAD OWNERSHIP (TERRITORY)
-- ============================================================

create table road_segments (
  id           uuid primary key default uuid_generate_v4(),
  osm_way_id   bigint unique,              -- OpenStreetMap way ID
  name         text,
  city         text,
  country      text,
  king_id      uuid references players(id),
  king_car_id  uuid references generations(id),
  king_scan_count int not null default 0,
  king_since   timestamptz,
  created_at   timestamptz not null default now()
);

create index road_segments_city_idx on road_segments(city);

-- back-fill FK now that road_segments exists
alter table catches
  add constraint catches_road_segment_id_fkey
  foreign key (road_segment_id) references road_segments(id);

create table road_challengers (
  id               uuid primary key default uuid_generate_v4(),
  road_segment_id  uuid not null references road_segments(id) on delete cascade,
  player_id        uuid not null references players(id) on delete cascade,
  scan_count_30d   int not null default 0,
  last_updated     timestamptz not null default now(),
  unique (road_segment_id, player_id)
);

-- ============================================================
-- SPACE / SATELLITE OBJECTS
-- ============================================================

create table space_objects (
  id              uuid primary key default uuid_generate_v4(),
  norad_id        int unique,
  name            text not null,
  object_type     text not null check (object_type in ('satellite','iss','crewed','rocket_body','debris')),
  rarity_tier     text not null check (rarity_tier in ('common','uncommon','rare','epic','legendary')),
  tle_line1       text,
  tle_line2       text,
  tle_updated_at  timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table catchable_objects (
  id              uuid primary key default uuid_generate_v4(),
  space_object_id uuid not null references space_objects(id) on delete cascade,
  pass_start      timestamptz not null,
  pass_end        timestamptz not null,
  max_elevation   float,
  -- approximate region this pass is visible from
  region_lat      float,
  region_lon      float,
  region_radius_km float,
  notified        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index catchable_objects_pass_start_idx on catchable_objects(pass_start);

-- back-fill FK now that catchable_objects exists
alter table catches
  add constraint catches_space_object_id_fkey
  foreign key (space_object_id) references catchable_objects(id);

-- ============================================================
-- XP LEDGER
-- ============================================================

create table xp_events (
  id          uuid primary key default uuid_generate_v4(),
  player_id   uuid not null references players(id) on delete cascade,
  catch_id    uuid references catches(id),
  reason      text not null,               -- 'highway_catch', 'road_king_passive', etc.
  xp_delta    int  not null,
  created_at  timestamptz not null default now()
);

create index xp_events_player_id_idx on xp_events(player_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table players         enable row level security;
alter table catches         enable row level security;
alter table first_finders   enable row level security;
alter table unknown_catches enable row level security;
alter table id_suggestions  enable row level security;
alter table xp_events       enable row level security;

-- Players can read their own row; service role bypasses RLS
create policy "players_self_read"  on players for select using (auth.uid() = id);
create policy "players_self_write" on players for update using (auth.uid() = id);

-- Catches: player owns their catches
create policy "catches_owner_read"  on catches for select using (auth.uid() = player_id);
create policy "catches_owner_write" on catches for insert with check (auth.uid() = player_id);

-- Public read on vehicle DB (no auth needed to browse)
alter table makes       enable row level security;
alter table models      enable row level security;
alter table generations enable row level security;
alter table variants    enable row level security;

create policy "makes_public_read"       on makes       for select using (true);
create policy "models_public_read"      on models      for select using (true);
create policy "generations_public_read" on generations for select using (true);
create policy "variants_public_read"    on variants    for select using (true);
create policy "first_finders_public_read" on first_finders for select using (true);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_updated_at
  before update on players
  for each row execute function set_updated_at();
