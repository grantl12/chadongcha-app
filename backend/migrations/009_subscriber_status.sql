-- 009_subscriber_status.sql
-- Add subscriber status to players and update crews for team bonuses.

alter table players add column if not exists is_subscriber boolean not null default false;

-- Create an index for faster team bonus calculations
create index if not exists players_is_subscriber_idx on players(is_subscriber) where is_subscriber = true;
