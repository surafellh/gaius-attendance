-- Gaius release 2: department plans (6-month action & budget plans), plan items with done / not done,
-- and the teaching roadmap (lessons each person has taken). Safe to run more than once.

create table if not exists plans (
  id bigserial primary key,
  center_id int references centers(id) default 1,
  department_id int references departments(id),
  semester text not null,                         -- e.g. 'Meskerem 2019' (= Semester 1 · 2019)
  title text not null,
  details text,
  budget numeric default 0,                       -- total requested for the plan
  budget_note text,
  timing text default 'date' check (timing in ('date','weekly','monthly','every2','within','range')),
  timing_note text,                               -- as written in the plan, e.g. "በየ 2 ወሩ"
  prepared_by text,
  sort int default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create table if not exists plan_items (
  id bigserial primary key,
  plan_id bigint not null references plans(id) on delete cascade,
  center_id int references centers(id) default 1,
  due date not null,                              -- the day, or the last day of the month / semester for loose timing
  due_kind text default 'day' check (due_kind in ('day','week','month','period')),
  label text,                                     -- e.g. the topic for that month
  budget numeric default 0,
  status text not null default 'planned' check (status in ('planned','done','not_done','cancelled')),
  reason text,                                    -- why it was not done / moved
  moved_from date,
  done_on date,
  note text,
  updated_at timestamptz default now()
);
create index if not exists plan_items_due_idx on plan_items(center_id, due);

create table if not exists lessons (
  id bigserial primary key,
  center_id int references centers(id),           -- null = HQ roadmap for every center
  name text not null,
  name_am text,
  description text,
  sort int default 0,
  active boolean default true
);
create table if not exists person_lessons (
  id bigserial primary key,
  person_id bigint not null references people(id) on delete cascade,
  lesson_id bigint not null references lessons(id) on delete cascade,
  completed_on date,
  note text,
  unique (person_id, lesson_id)
);

alter table plans enable row level security;
alter table plan_items enable row level security;
alter table lessons enable row level security;
alter table person_lessons enable row level security;
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('plans','plan_items','lessons','person_lessons') loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;
create policy plans_read on plans for select to authenticated using (public.can_read(center_id));
create policy plans_write on plans for all to authenticated using (public.can_mark(center_id)) with check (public.can_mark(center_id));
create policy items_read on plan_items for select to authenticated using (public.can_read(center_id));
create policy items_write on plan_items for all to authenticated using (public.can_mark(center_id)) with check (public.can_mark(center_id));
create policy lessons_read on lessons for select to authenticated using (public.can_read(coalesce(center_id, public.my_center())));
create policy lessons_write on lessons for all to authenticated using (public.can_manage(center_id)) with check (public.can_manage(center_id));
create policy pl_read on person_lessons for select to authenticated using (exists (select 1 from people p where p.id = person_id and public.can_read(p.center_id)));
create policy pl_write on person_lessons for all to authenticated using (exists (select 1 from people p where p.id = person_id and public.can_mark(p.center_id)))
  with check (exists (select 1 from people p where p.id = person_id and public.can_mark(p.center_id)));
grant select, insert, update, delete on plans, plan_items, lessons, person_lessons to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- the department plans call it "Prayer & Evangelism"
update departments set name = 'Prayer & Evangelism', name_am = 'ፀሎት እና ወንጌል ስርጭት' where center_id = 1 and name = 'Evangelism';
