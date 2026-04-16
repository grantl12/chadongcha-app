-- 006_satellite_badge_eligibility.sql
-- Add flag to generations table for vehicles that qualify for a Satellite Catch Badge.

alter table generations add column if not exists is_satellite_badge_eligible boolean not null default false;

-- Create an index for faster lookup during catch ingestion
create index if not exists generations_satellite_badge_idx on generations(id) where is_satellite_badge_eligible = true;
