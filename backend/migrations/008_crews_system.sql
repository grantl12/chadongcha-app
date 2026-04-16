-- 008_crews_system.sql
-- Initial D inspired Team/Crew system.
-- Crews have a home city and team color. Members get a bonus on Home Turf.

create table if not exists crews (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null unique,
  description  text,
  home_city    text,
  team_color   text default '#e63946', -- Project D Red
  leader_id    uuid references players(id),
  created_at   timestamptz not null default now()
);

-- Link players to crews
alter table players add column if not exists crew_id uuid references crews(id) on delete set null;

create index if not exists players_crew_idx on players(crew_id);

-- Enable RLS
alter table crews enable row level security;

do $$ begin
  create policy "crews_public_read" on crews for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "crews_leader_update" on crews 
    for update using (auth.uid() = leader_id);
exception when duplicate_object then null; end $$;
