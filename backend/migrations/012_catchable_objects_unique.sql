-- Required for the sat-worker's upsert on_conflict="space_object_id,pass_start"
alter table catchable_objects
  add constraint catchable_objects_space_object_pass_start_key
  unique (space_object_id, pass_start);
