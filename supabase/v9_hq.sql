-- Gaius release 6: the HQ side. HQ's own plans & activities (for all centers or one center).
-- HQ roles (founder, director, HQ follow-up, HQ staff, admin) add and edit them; centers see the ones meant for them.
-- Run after v8_release5.sql. Safe to run more than once.

create table if not exists hq_activities (
  id bigserial primary key,
  center_id int references centers(id),          -- null = HQ / every center
  title text not null,
  kind text default 'Activity',                  -- Activity, Visit, Training, Meeting, Event, Report, Other
  owner text,                                    -- who at HQ is responsible
  starts_on date,
  due date,
  budget numeric,
  status text not null default 'planned' check (status in ('planned','in_progress','done','postponed','cancelled')),
  notes text,
  sort int default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists hq_activities_due_idx on hq_activities(due);

alter table hq_activities enable row level security;
drop policy if exists hqa_read on hq_activities;
drop policy if exists hqa_write on hq_activities;
create policy hqa_read on hq_activities for select to authenticated
  using (public.is_hq() or (center_id is null and public.can_read(public.my_center())) or public.can_read(center_id));
create policy hqa_write on hq_activities for all to authenticated
  using (public.is_hq()) with check (public.is_hq());
grant select, insert, update, delete on hq_activities to authenticated;
grant usage, select on sequence hq_activities_id_seq to authenticated;
