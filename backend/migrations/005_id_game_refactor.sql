-- 005_id_game_refactor.sql
-- Rename Reddit tables to generic ID game names and add source/text-entry fields.

-- Rename tables
alter table reddit_id_queue rename to id_game_queue;
alter table reddit_id_guesses rename to id_game_guesses;

-- Update queue table
alter table id_game_queue rename column reddit_author to author_username;
alter table id_game_queue add column if not exists source text default 'scraped' check (source in ('scraped', 'community'));
alter table id_game_queue add column if not exists is_text_entry boolean default false;

-- Clean up Reddit-specific columns
alter table id_game_queue drop column if exists subreddit;
alter table id_game_queue drop column if exists post_id;
alter table id_game_queue drop column if exists post_title;

-- Update guess table
alter table id_game_guesses rename column queue_item_id to card_id;

-- Satellite Catch Badges for top 200 vehicles
create table if not exists satellite_badges (
  id              uuid primary key default uuid_generate_v4(),
  player_id       uuid not null references players(id) on delete cascade,
  generation_id   uuid not null references generations(id) on delete cascade,
  catch_id        uuid references catches(id) on delete set null,
  awarded_at      timestamptz not null default now(),
  unique (player_id, generation_id)
);

create index if not exists satellite_badges_player_idx on satellite_badges(player_id);
create index if not exists satellite_badges_gen_idx on satellite_badges(generation_id);
