-- ═══════════════════════════════════════════════════════════════════
-- Gaius Attendance v2 — centers, roles, weekly status snapshots,
-- programs, profiles, departments, responsible-person history.
-- Safe to run once on top of v1. Run the whole file in SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ── centers ─────────────────────────────────────────────────────────
create table if not exists centers (
  id int primary key,
  name text not null,
  name_am text,
  meeting_weekday int default 3,          -- 0=Sun … 3=Wed (leaders' meeting)
  meeting_time text default '18:00',
  telegram_chat text,
  created_at timestamptz default now()
);
insert into centers(id, name, name_am) values
  (1, 'Gerji', 'ገርጂ'), (2, 'Mekanisa', 'መካኒሳ'), (3, 'Mesalemia', 'መሳለሚያ'), (4, 'Bishoftu', 'ቢሾፍቱ')
on conflict (id) do nothing;

-- ── people: profile + current status ────────────────────────────────
alter table people
  add column if not exists center_id int default 1 references centers(id),
  add column if not exists category text,
  add column if not exists full_name text,
  add column if not exists gender text,
  add column if not exists church text,
  add column if not exists education text,
  add column if not exists work text,
  add column if not exists passion text,
  add column if not exists area text,
  add column if not exists birth_year int,
  add column if not exists level text,
  add column if not exists start_teaching text,
  add column if not exists invited_by text,
  add column if not exists invited_by_id bigint references people(id) on delete set null,
  add column if not exists potential_leader boolean default false,
  add column if not exists archived boolean default false,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz default now();

do $$ begin
  alter table people add constraint people_category_chk check (category is null or category in
    ('Leader','Senior Leader','Member','Active Informal Member','Inactive Informal Member','New Comer'));
exception when duplicate_object then null; end $$;

update people p set category = s.category
from person_status s where s.person_id = p.id and s.semester = 'Meskerem 2019' and p.category is null;
update people set center_id = 1 where center_id is null;

-- ── status history (group changes are never lost) ───────────────────
create table if not exists category_history (
  id bigserial primary key,
  person_id bigint references people(id) on delete cascade,
  category text not null,
  since date not null,
  changed_by uuid default auth.uid(),
  note text,
  created_at timestamptz default now()
);
create index if not exists category_history_person on category_history(person_id, since);
insert into category_history(person_id, category, since, changed_by, note)
select person_id, category, case semester when 'Meskerem 2018' then date '2025-09-11'
  when 'Megabit 2018' then date '2026-03-10' when 'Meskerem 2019' then date '2026-09-11' end, null, 'from sheet'
from person_status
where not exists (select 1 from category_history h where h.person_id = person_status.person_id and h.note = 'from sheet');

-- ── attendance: weekly snapshot of group + active flag ──────────────
alter table attendance
  add column if not exists category text,
  add column if not exists active boolean default true,
  add column if not exists center_id int default 1 references centers(id);

-- ── responsible person (follow-up assignment) with history ──────────
create table if not exists assignments (
  id bigserial primary key,
  person_id bigint references people(id) on delete cascade,
  leader_id bigint references people(id) on delete set null,
  leader_name text,
  since date,
  until date,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create index if not exists assignments_person on assignments(person_id);

-- ── departments ─────────────────────────────────────────────────────
create table if not exists departments (
  id serial primary key,
  center_id int default 1 references centers(id),
  name text not null,
  name_am text,
  description text,
  sort int default 0
);
create table if not exists department_members (
  id bigserial primary key,
  department_id int references departments(id) on delete cascade,
  person_id bigint references people(id) on delete cascade,
  role text default 'member' check (role in ('leader','member')),
  since date default current_date,
  until date
);

-- ── weekly program record ───────────────────────────────────────────
create table if not exists programs (
  id bigserial primary key,
  center_id int default 1 references centers(id),
  sunday date not null,
  kind text,                 -- Teaching, Devotion, Discussion, Worship night, Special program, Prayer, Fellowship, No meeting…
  topic text,
  minister text,
  planned_by text,           -- HQ, Center, Department
  department_id int references departments(id) on delete set null,
  notes text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  unique (center_id, sunday)
);

-- ── app users: richer roles ─────────────────────────────────────────
alter table profiles
  add column if not exists center_id int default 1 references centers(id),
  add column if not exists person_id bigint references people(id) on delete set null,
  add column if not exists title text;
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in
  ('admin','founder','director','hq_followup','hq_staff','center_leader','followup_leader','leader','viewer','former','pending'));

-- ── access helpers ──────────────────────────────────────────────────
create or replace function public.my_center() returns int
language sql stable security definer set search_path = public as $$
  select center_id from public.profiles where user_id = auth.uid()
$$;
create or replace function public.can_read(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid()
    and role not in ('pending','former')
    and (role in ('admin','founder','director','hq_followup','hq_staff') or center_id = c))
$$;
create or replace function public.can_mark(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid()
    and (role = 'admin' or (role in ('center_leader','followup_leader','leader') and center_id = c)))
$$;
create or replace function public.can_manage(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid()
    and (role = 'admin' or (role in ('center_leader','followup_leader') and center_id = c)))
$$;

-- ── row level security ──────────────────────────────────────────────
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('people','person_status','attendance','profiles') loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

alter table centers enable row level security;
alter table category_history enable row level security;
alter table assignments enable row level security;
alter table departments enable row level security;
alter table department_members enable row level security;
alter table programs enable row level security;

create policy centers_read on centers for select to authenticated using (true);
create policy centers_write on centers for update to authenticated using (public.can_manage(id));

create policy people_read on people for select to authenticated using (public.can_read(center_id));
create policy people_insert on people for insert to authenticated with check (public.can_mark(center_id));
create policy people_update on people for update to authenticated using (public.can_mark(center_id));
create policy people_delete on people for delete to authenticated using (public.can_manage(center_id));

create policy ps_read on person_status for select to authenticated using (exists (select 1 from people p where p.id = person_id and public.can_read(p.center_id)));
create policy ps_write on person_status for all to authenticated using (exists (select 1 from people p where p.id = person_id and public.can_manage(p.center_id)));

create policy att_read on attendance for select to authenticated using (public.can_read(center_id));
create policy att_insert on attendance for insert to authenticated with check (public.can_mark(center_id));
create policy att_update on attendance for update to authenticated using (public.can_mark(center_id));
create policy att_delete on attendance for delete to authenticated using (public.can_manage(center_id));

create policy ch_read on category_history for select to authenticated using (exists (select 1 from people p where p.id = person_id and public.can_read(p.center_id)));
create policy ch_insert on category_history for insert to authenticated with check (exists (select 1 from people p where p.id = person_id and public.can_mark(p.center_id)));
create policy ch_update on category_history for update to authenticated using (exists (select 1 from people p where p.id = person_id and public.can_manage(p.center_id)));

create policy as_read on assignments for select to authenticated using (exists (select 1 from people p where p.id = person_id and public.can_read(p.center_id)));
create policy as_write on assignments for all to authenticated using (exists (select 1 from people p where p.id = person_id and public.can_manage(p.center_id)));

create policy dep_read on departments for select to authenticated using (public.can_read(center_id));
create policy dep_write on departments for all to authenticated using (public.can_manage(center_id));
create policy dm_read on department_members for select to authenticated using (exists (select 1 from departments d where d.id = department_id and public.can_read(d.center_id)));
create policy dm_write on department_members for all to authenticated using (exists (select 1 from departments d where d.id = department_id and public.can_manage(d.center_id)));

create policy prog_read on programs for select to authenticated using (public.can_read(center_id));
create policy prog_write on programs for all to authenticated using (public.can_mark(center_id)) with check (public.can_mark(center_id));

create policy prof_read on profiles for select to authenticated
  using (user_id = auth.uid() or public.my_role() in ('admin','center_leader') );
create policy prof_update on profiles for update to authenticated using (public.my_role() = 'admin');

-- keep attendance.center_id in step with the person
create or replace function public.att_center() returns trigger language plpgsql as $$
begin
  select center_id into new.center_id from public.people where id = new.person_id;
  return new;
end $$;
drop trigger if exists att_center_trg on attendance;
create trigger att_center_trg before insert on attendance for each row execute function public.att_center();

-- record every group change automatically
create or replace function public.people_cat_hist() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category is distinct from old.category and new.category is not null then
    insert into public.category_history(person_id, category, since) values (new.id, new.category, current_date);
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists people_cat_hist_trg on people;
create trigger people_cat_hist_trg before update on people for each row execute function public.people_cat_hist();
