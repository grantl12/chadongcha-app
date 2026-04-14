-- CHADONGCHA · Supabase Schema
-- Fully idempotent — safe to run against a database that already has some or
-- all of these objects. Re-running will not drop or modify existing data.
-- Run: paste into Supabase SQL editor and execute.

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- VEHICLE DATABASE
-- ============================================================

create table if not exists makes (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  country     text,
  logo_asset  text,
  created_at  timestamptz not null default now()
);

create table if not exists models (
  id       uuid primary key default uuid_generate_v4(),
  make_id  uuid not null references makes(id) on delete cascade,
  name     text not null,
  class    text not null check (class in ('car','truck','motorcycle','van','suv')),
  created_at timestamptz not null default now(),
  unique (make_id, name)
);

create table if not exists generations (
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

create table if not exists variants (
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

create table if not exists players (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique,
  home_city       text,
  home_city_set_at timestamptz,
  xp              bigint not null default 0,
  level           int    not null default 1,
  hero_car_id     uuid references generations(id),
  plate_hash      text,
  is_ai_rival     boolean not null default false,  -- ghost Road King placeholder
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- push token for satellite pass notifications (added via migration 001 on existing DBs)
alter table players add column if not exists expo_push_token text;

-- ============================================================
-- CATCHES
-- ============================================================

create table if not exists catches (
  id             uuid primary key default uuid_generate_v4(),
  player_id      uuid not null references players(id) on delete cascade,
  generation_id  uuid references generations(id),   -- null = unknown vehicle
  variant_id     uuid references variants(id),
  catch_type     text not null check (catch_type in ('highway','scan360','space','unknown')),
  color          text,
  body_style     text,
  confidence     float,
  fuzzy_city     text,
  fuzzy_district text,
  road_segment_id uuid,
  caught_at      timestamptz not null default now(),
  xp_awarded     int not null default 0,
  vehicle_hash   text,
  space_object_id uuid,
  synced_at      timestamptz
);

create index if not exists catches_player_id_idx     on catches(player_id);
create index if not exists catches_generation_id_idx on catches(generation_id);
create index if not exists catches_caught_at_idx     on catches(caught_at desc);
create index if not exists catches_dedup_idx         on catches(player_id, vehicle_hash, caught_at desc)
  where vehicle_hash is not null;

-- ============================================================
-- FIRST FINDERS
-- ============================================================

create table if not exists first_finders (
  id             uuid primary key default uuid_generate_v4(),
  generation_id  uuid not null references generations(id) on delete cascade,
  variant_id     uuid references variants(id),
  player_id      uuid not null references players(id) on delete cascade,
  catch_id       uuid references catches(id),
  region_scope   text not null check (region_scope in ('city','country','continent','global')),
  region_value   text not null,
  badge_name     text not null,
  awarded_at     timestamptz not null default now(),
  retroactive    boolean not null default false,
  unique (generation_id, player_id, region_scope, region_value)
);

-- ============================================================
-- UNKNOWN VEHICLE COMMUNITY ID FLOW
-- ============================================================

create table if not exists unknown_catches (
  id             uuid primary key default uuid_generate_v4(),
  catch_id       uuid not null unique references catches(id) on delete cascade,
  body_type      text,
  city           text,
  community_photo_ref text,
  photo_shared   boolean not null default false,
  status         text not null default 'open'
                   check (status in ('open','pending_review','confirmed','rejected')),
  confirmed_generation_id uuid references generations(id),
  confirmed_at   timestamptz,
  moderator_id   uuid references players(id),
  created_at     timestamptz not null default now()
);

create table if not exists id_suggestions (
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

create table if not exists road_segments (
  id              uuid primary key default uuid_generate_v4(),
  osm_way_id      bigint unique,
  name            text,
  city            text,
  country         text,
  centroid_lat    float,
  centroid_lon    float,
  geometry_json   text,
  king_id         uuid references players(id),
  king_car_id     uuid references generations(id),
  king_scan_count int not null default 0,
  king_since      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists road_segments_city_idx     on road_segments(city);
create index if not exists road_segments_centroid_idx on road_segments(centroid_lat, centroid_lon);

-- Add FK from catches → road_segments (safe to run if it already exists)
do $$ begin
  alter table catches
    add constraint catches_road_segment_id_fkey
    foreign key (road_segment_id) references road_segments(id);
exception when duplicate_object then null;
end $$;

create table if not exists road_challengers (
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

create table if not exists space_objects (
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

create table if not exists catchable_objects (
  id              uuid primary key default uuid_generate_v4(),
  space_object_id uuid not null references space_objects(id) on delete cascade,
  pass_start      timestamptz not null,
  pass_end        timestamptz not null,
  max_elevation   float,
  region_lat      float,
  region_lon      float,
  region_radius_km float,
  notified        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists catchable_objects_pass_start_idx on catchable_objects(pass_start);

-- Add FK from catches → catchable_objects
do $$ begin
  alter table catches
    add constraint catches_space_object_id_fkey
    foreign key (space_object_id) references catchable_objects(id);
exception when duplicate_object then null;
end $$;

-- ============================================================
-- XP LEDGER
-- ============================================================

create table if not exists xp_events (
  id          uuid primary key default uuid_generate_v4(),
  player_id   uuid not null references players(id) on delete cascade,
  catch_id    uuid references catches(id),
  reason      text not null,
  xp_delta    int  not null,
  created_at  timestamptz not null default now()
);

create index if not exists xp_events_player_id_idx on xp_events(player_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table players         enable row level security;
alter table catches         enable row level security;
alter table first_finders   enable row level security;
alter table unknown_catches enable row level security;
alter table id_suggestions  enable row level security;
alter table xp_events       enable row level security;
alter table makes           enable row level security;
alter table models          enable row level security;
alter table generations     enable row level security;
alter table variants        enable row level security;

-- Players
do $$ begin
  create policy "players_self_read"  on players for select using (auth.uid() = id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "players_self_write" on players for update using (auth.uid() = id);
exception when duplicate_object then null; end $$;

-- Catches
do $$ begin
  create policy "catches_owner_read"  on catches for select using (auth.uid() = player_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "catches_owner_write" on catches for insert with check (auth.uid() = player_id);
exception when duplicate_object then null; end $$;

-- Public read on vehicle DB
do $$ begin
  create policy "makes_public_read"         on makes         for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "models_public_read"        on models        for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "generations_public_read"   on generations   for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "variants_public_read"      on variants      for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "first_finders_public_read" on first_finders for select using (true);
exception when duplicate_object then null; end $$;

-- ============================================================
-- PLATE HASH OPT-IN + SPOTTED EVENTS (migration 004)
-- ============================================================

create table if not exists plate_hashes (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  plate_hash  text not null,
  label       text,
  created_at  timestamptz not null default now(),
  unique (player_id, plate_hash)
);
create index if not exists plate_hashes_hash_idx on plate_hashes(plate_hash);

create table if not exists spotted_events (
  id            uuid primary key default gen_random_uuid(),
  catch_id      uuid not null references catches(id) on delete cascade,
  plate_hash_id uuid not null references plate_hashes(id) on delete cascade,
  spotter_id    uuid not null references players(id),
  owner_id      uuid not null references players(id),
  spotted_at    timestamptz not null default now(),
  xp_awarded    int not null default 0
);
create index if not exists spotted_events_spotter_idx on spotted_events(spotter_id);
create index if not exists spotted_events_owner_idx   on spotted_events(owner_id);

alter table plate_hashes   enable row level security;
alter table spotted_events enable row level security;
do $$ begin
  create policy "plate_hashes_owner_only" on plate_hashes
    using (player_id = auth.uid()) with check (player_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "spotted_events_involved" on spotted_events
    using (spotter_id = auth.uid() or owner_id = auth.uid());
exception when duplicate_object then null; end $$;

-- ============================================================
-- CREDITS (in-game market currency)
-- ============================================================

alter table players add column if not exists credits bigint not null default 0;
-- Shop consumable boosts — set/extended when a player buys from the shop
alter table players add column if not exists xp_boost_expires   timestamptz;
alter table players add column if not exists scan_boost_expires timestamptz;
alter table players add column if not exists id_hints           int not null default 0;

create table if not exists credit_events (
  id          uuid primary key default uuid_generate_v4(),
  player_id   uuid not null references players(id) on delete cascade,
  delta       int  not null,
  reason      text not null,
  ref_id      uuid,
  created_at  timestamptz not null default now()
);
create index if not exists credit_events_player_idx on credit_events(player_id);
alter table credit_events enable row level security;
do $$ begin
  create policy "credit_events_self" on credit_events for select using (auth.uid() = player_id);
exception when duplicate_object then null; end $$;

-- ============================================================
-- MARKET
-- ============================================================

create table if not exists market_listings (
  id          uuid primary key default uuid_generate_v4(),
  seller_id   uuid not null references players(id) on delete cascade,
  generation_id uuid references generations(id),
  catch_id    uuid references catches(id),
  rarity      text,
  asking_price int not null check (asking_price > 0),
  status      text not null default 'active' check (status in ('active','sold','cancelled')),
  listed_at   timestamptz not null default now(),
  expires_at  timestamptz
);
create index if not exists market_listings_status_idx on market_listings(status, listed_at desc);
create index if not exists market_listings_seller_idx on market_listings(seller_id);

create table if not exists market_bids (
  id          uuid primary key default uuid_generate_v4(),
  listing_id  uuid not null references market_listings(id) on delete cascade,
  bidder_id   uuid not null references players(id) on delete cascade,
  amount      int  not null check (amount > 0),
  placed_at   timestamptz not null default now()
);
create index if not exists market_bids_listing_idx on market_bids(listing_id, amount desc);
create index if not exists market_bids_bidder_idx  on market_bids(bidder_id);

alter table market_listings enable row level security;
alter table market_bids     enable row level security;
do $$ begin
  create policy "market_listings_public_read" on market_listings for select using (status = 'active');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "market_listings_seller_read" on market_listings for select using (auth.uid() = seller_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "market_listings_seller_insert" on market_listings for insert with check (auth.uid() = seller_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "market_bids_bidder_write" on market_bids for insert with check (auth.uid() = bidder_id);
exception when duplicate_object then null; end $$;

create or replace function increment_credits(p_player_id uuid, p_amount int)
returns void language plpgsql security definer as $$
begin
  update players set credits = credits + p_amount where id = p_player_id;
end;
$$;

create or replace function decrement_credits(p_player_id uuid, p_amount int)
returns void language plpgsql security definer as $$
begin
  update players set credits = greatest(0, credits - p_amount) where id = p_player_id;
end;
$$;

-- ============================================================
-- REDDIT ID QUEUE
-- ============================================================

create table if not exists reddit_id_queue (
  id             uuid primary key default uuid_generate_v4(),
  post_id        text not null unique,          -- Reddit post ID (t3_xxxxx)
  subreddit      text not null default 'whatisthiscar',
  image_url      text not null,
  post_title     text,
  reddit_author  text,                          -- OP username for attribution
  answer_class   text not null,                 -- e.g. "Toyota GR86 ZN8"
  answer_label   text not null,                 -- e.g. "Toyota GR86"
  body_style     text,                          -- sedan/coupe/suv/truck/hatchback/convertible
  status         text not null default 'active' check (status in ('active','retired')),
  created_at     timestamptz not null default now()
);
create index if not exists reddit_id_queue_status_idx on reddit_id_queue(status, created_at desc);

create table if not exists reddit_id_guesses (
  id             uuid primary key default uuid_generate_v4(),
  player_id      uuid not null references players(id) on delete cascade,
  queue_item_id  uuid not null references reddit_id_queue(id) on delete cascade,
  guessed_class  text not null,
  correct        boolean not null,
  xp_awarded     int not null default 0,
  created_at     timestamptz not null default now(),
  unique (player_id, queue_item_id)             -- one guess per player per card
);
create index if not exists reddit_id_guesses_player_idx on reddit_id_guesses(player_id);

alter table reddit_id_queue   enable row level security;
alter table reddit_id_guesses enable row level security;
do $$ begin
  create policy "reddit_queue_public_read" on reddit_id_queue for select using (status = 'active');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "reddit_guesses_self" on reddit_id_guesses
    using (auth.uid() = player_id) with check (auth.uid() = player_id);
exception when duplicate_object then null; end $$;

-- ============================================================
-- CONTENT MODERATION
-- ============================================================

-- Moderation status for community photos attached to unknown_catches
alter table unknown_catches add column if not exists moderation_status text
  not null default 'skipped'
  check (moderation_status in ('pending','approved','rejected','skipped'));

-- ============================================================
-- ACTIVITY FEED
-- ============================================================

create table if not exists activity_feed (
  id          uuid primary key default uuid_generate_v4(),
  player_id   uuid not null references players(id) on delete cascade,
  event_type  text not null check (event_type in ('catch','road_king','level_up','first_finder','market_sale')),
  catch_id    uuid references catches(id) on delete set null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists activity_feed_created_idx on activity_feed(created_at desc);
create index if not exists activity_feed_player_idx  on activity_feed(player_id, created_at desc);

alter table activity_feed enable row level security;
do $$ begin
  create policy "activity_feed_public_read" on activity_feed for select using (true);
exception when duplicate_object then null; end $$;

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

do $$ begin
  create trigger players_updated_at
    before update on players
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;
