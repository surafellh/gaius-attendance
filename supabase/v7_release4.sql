-- Gaius release 4: teaching plan "by HQ" and "by the center" per center, roadmap lessons linked to the
-- Sunday program topics, date of the first teaching. Run after release 3 (v6). Safe to run more than once.

-- ── teaching plan: HQ can give each center its own plan; the center keeps its own next to it ──────────
alter table teaching_plan add column if not exists source text default 'center';
update teaching_plan set source = 'hq' where center_id is null and coalesce(source, 'center') <> 'hq';
update teaching_plan set source = 'center' where source is null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teaching_plan_source_chk') then
    alter table teaching_plan add constraint teaching_plan_source_chk check (source in ('hq', 'center'));
  end if;
end $$;
drop index if exists teaching_plan_uniq;
create unique index if not exists teaching_plan_uniq2 on teaching_plan(coalesce(center_id, 0), sunday, source);

-- HQ rows (for one center or for all) are written by HQ; the center's own rows by its leaders
drop policy if exists tp_write on teaching_plan;
create policy tp_write on teaching_plan for all to authenticated
  using (case when source = 'hq' then public.is_hq() else public.can_manage(center_id) end)
  with check (case when source = 'hq' then public.is_hq() else public.can_manage(center_id) end);
drop policy if exists tp_read on teaching_plan;
create policy tp_read on teaching_plan for select to authenticated
  using (public.is_hq() or public.can_read(coalesce(center_id, public.my_center())));

-- ── roadmap: which Sunday program topics count as which lesson (per center) ─────────────────────────
create table if not exists lesson_topics (
  id bigserial primary key,
  center_id int not null references centers(id),
  lesson_id bigint not null references lessons(id) on delete cascade,
  topic text not null,
  unique (center_id, topic)
);
alter table lesson_topics enable row level security;
drop policy if exists lt_read on lesson_topics;
drop policy if exists lt_write on lesson_topics;
create policy lt_read on lesson_topics for select to authenticated using (public.can_read(center_id));
create policy lt_write on lesson_topics for all to authenticated using (public.can_manage(center_id)) with check (public.can_manage(center_id));
grant select, insert, update, delete on lesson_topics to authenticated;
grant usage, select on sequence lesson_topics_id_seq to authenticated;

-- ── first teaching: keep the Sunday it happened, next to the topic ─────────────────────────────────
alter table people add column if not exists start_teaching_on date;
