-- AI Rival ghost players are seeded by the backend service_role key and have
-- no corresponding auth.users entry. Drop the FK so service_role can insert them.
alter table players drop constraint if exists players_id_fkey;

-- Add columns if the live DB predates schema.sql additions
alter table players add column if not exists is_ai_rival boolean not null default false;
alter table players add column if not exists home_city    text;

-- Expose AI rival profiles publicly so the mobile client can display kings.
do $$ begin
  create policy "players_ai_rival_public_read" on players
    for select using (is_ai_rival = true);
exception when duplicate_object then null; end $$;
