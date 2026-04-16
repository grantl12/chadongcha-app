-- 010_telemetry.sql
-- Vehicle telemetry table for subscriber-gated Advanced Telemetry feature.
-- Stores hp, torque, weight, and MSRP ranges per generation.

create table if not exists generation_telemetry (
  generation_id  uuid primary key references generations(id) on delete cascade,
  hp_min         int,
  hp_max         int,
  torque_nm_min  int,
  torque_nm_max  int,
  weight_kg_min  int,
  weight_kg_max  int,
  msrp_usd_min   int,
  msrp_usd_max   int,
  updated_at     timestamptz not null default now()
);

alter table generation_telemetry enable row level security;

-- Public read — subscriber gate enforced at the API layer
create policy "telemetry_public_read" on generation_telemetry
  for select using (true);
