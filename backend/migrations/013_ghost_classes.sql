-- Ghost classes: vehicles the community identifies that don't exist as model classes.
-- Accumulate community votes across multiple catches → flag for next training run.

create table if not exists ghost_classes (
  id                uuid primary key default gen_random_uuid(),
  make              text not null,
  model             text not null,
  generation_label  text not null default '',
  catch_count       int  not null default 0,
  unique_voter_count int not null default 0,
  sample_image_refs text[] not null default '{}',
  status            text not null default 'accumulating'
    check (status in ('accumulating', 'promotion_ready', 'promoted')),
  created_at        timestamptz not null default now(),
  promoted_at       timestamptz
);

-- Case-insensitive dedup on make+model+generation_label
create unique index if not exists ghost_classes_label_idx
  on ghost_classes (lower(make), lower(model), lower(generation_label));

create table if not exists ghost_class_votes (
  id               uuid primary key default gen_random_uuid(),
  ghost_class_id   uuid not null references ghost_classes(id) on delete cascade,
  unknown_catch_id uuid not null references unknown_catches(id) on delete cascade,
  player_id        uuid not null references players(id) on delete cascade,
  created_at       timestamptz not null default now(),
  unique (ghost_class_id, unknown_catch_id, player_id)
);

-- Link confirmed ghost catches back to their ghost class
alter table unknown_catches
  add column if not exists ghost_class_id uuid references ghost_classes(id);

-- Public read so mobile can display ghost class labels
alter table ghost_classes enable row level security;
do $$ begin
  create policy "ghost_classes_public_read" on ghost_classes for select using (true);
exception when duplicate_object then null; end $$;

alter table ghost_class_votes enable row level security;
do $$ begin
  create policy "ghost_votes_self_read" on ghost_class_votes
    for select using (auth.uid() = player_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ghost_votes_self_write" on ghost_class_votes
    for insert with check (auth.uid() = player_id);
exception when duplicate_object then null; end $$;
