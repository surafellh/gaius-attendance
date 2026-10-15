-- Gaius attendance – Phase 2: potential-leader evaluations, events calendar,
-- leaders' meeting agenda, HQ teaching plan. Safe to run more than once.

-- ── potential leader evaluation ─────────────────────────────────────
create table if not exists eval_criteria (
  id bigserial primary key,
  center_id int references centers(id),          -- null = HQ template used by every center
  name text not null,
  description text,
  sort int default 0,
  active boolean default true
);
create table if not exists evaluations (
  id bigserial primary key,
  center_id int references centers(id) default 1,
  person_id bigint not null references people(id) on delete cascade,
  evaluated_on date not null default current_date,
  evaluator text,
  scores jsonb not null default '{}'::jsonb,     -- { "<criterion id>": 1..5 }
  strengths text,
  growth text,
  next_steps text,
  recommendation text check (recommendation in ('Keep growing', 'Ready to serve as leader', 'Not now')),
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists evaluations_person_idx on evaluations(person_id, evaluated_on);

insert into eval_criteria(center_id, name, description, sort)
select null, v.n, v.d, v.s from (values
  ('Spiritual life', 'Personal devotion, prayer, love for the Word', 1),
  ('Faithfulness', 'Comes consistently, keeps commitments, on time', 2),
  ('Character', 'Humility, integrity, teachable, good testimony', 3),
  ('Relationships', 'Cares for others, follows up people, works well in a team', 4),
  ('Serving', 'Takes part in a department, serves without being asked', 5),
  ('Teaching & sharing', 'Can share the Word or lead a small group', 6),
  ('Vision fit', 'Understands and carries the Gaius vision', 7),
  ('Church covering', 'Active in a local church, accountable', 8)
) v(n, d, s)
where not exists (select 1 from eval_criteria);

-- ── events calendar ─────────────────────────────────────────────────
create table if not exists events (
  id bigserial primary key,
  center_id int references centers(id),          -- null = HQ / all centers
  title text not null,
  starts_on date not null,
  ends_on date,
  start_time text,
  location text,
  kind text default 'Event',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists events_date_idx on events(starts_on);

-- ── leaders' meeting agenda ─────────────────────────────────────────
create table if not exists meetings (
  id bigserial primary key,
  center_id int references centers(id) default 1,
  meets_on date not null,
  attendees text,
  notes text,
  created_by uuid default auth.uid(),
  unique (center_id, meets_on)
);
create table if not exists agenda_items (
  id bigserial primary key,
  center_id int references centers(id) default 1,
  title text not null,
  details text,
  owner text,
  raised_on date default current_date,
  due date,
  meeting_on date,                               -- meeting it is planned for (null = next one)
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  outcome text,
  done_on date,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);

-- ── HQ teaching plan ────────────────────────────────────────────────
create table if not exists teaching_plan (
  id bigserial primary key,
  center_id int references centers(id),          -- null = HQ plan for all centers
  sunday date not null,
  series text,
  topic text,
  teacher text,
  notes text,
  created_by uuid default auth.uid()
);
create unique index if not exists teaching_plan_uniq on teaching_plan(coalesce(center_id, 0), sunday);

-- ── security ────────────────────────────────────────────────────────
alter table eval_criteria enable row level security;
alter table evaluations enable row level security;
alter table events enable row level security;
alter table meetings enable row level security;
alter table agenda_items enable row level security;
alter table teaching_plan enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('eval_criteria','evaluations','events','meetings','agenda_items','teaching_plan') loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- HQ-wide rows (center_id null) are readable by everyone with access; only admin changes them.
create policy crit_read on eval_criteria for select to authenticated using (public.can_read(coalesce(center_id, public.my_center())));
create policy crit_write on eval_criteria for all to authenticated using (public.can_manage(center_id)) with check (public.can_manage(center_id));
create policy eval_read on evaluations for select to authenticated using (public.can_read(center_id));
create policy eval_write on evaluations for all to authenticated using (public.can_manage(center_id)) with check (public.can_manage(center_id));
create policy ev_read on events for select to authenticated using (public.can_read(coalesce(center_id, public.my_center())));
create policy ev_write on events for all to authenticated using (public.can_manage(center_id)) with check (public.can_manage(center_id));
create policy mt_read on meetings for select to authenticated using (public.can_read(center_id));
create policy mt_write on meetings for all to authenticated using (public.can_mark(center_id)) with check (public.can_mark(center_id));
create policy ag_read on agenda_items for select to authenticated using (public.can_read(center_id));
create policy ag_write on agenda_items for all to authenticated using (public.can_mark(center_id)) with check (public.can_mark(center_id));
create policy tp_read on teaching_plan for select to authenticated using (public.can_read(coalesce(center_id, public.my_center())));
create policy tp_write on teaching_plan for all to authenticated using (public.can_manage(center_id)) with check (public.can_manage(center_id));

grant select, insert, update, delete on eval_criteria, evaluations, events, meetings, agenda_items, teaching_plan to authenticated;
grant usage, select on all sequences in schema public to authenticated;
