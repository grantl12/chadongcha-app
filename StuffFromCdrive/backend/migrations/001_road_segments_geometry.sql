-- Migration 001: add geometry columns to road_segments
-- Run in Supabase SQL editor or via psql.

alter table road_segments
  add column if not exists centroid_lat   float,
  add column if not exists centroid_lon   float,
  add column if not exists geometry_json  text;

-- Index for proximity queries (used by GET /territory/nearby)
create index if not exists road_segments_centroid_idx
  on road_segments(centroid_lat, centroid_lon);

-- Push token column for players (used by satellite notification worker)
alter table players
  add column if not exists expo_push_token text;
