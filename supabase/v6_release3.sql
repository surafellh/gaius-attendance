-- Gaius release 3: postponing with approval, month-end request choices, HQ ↔ center reconciliation and messages,
-- Admin & Finance (center info, assets, money in/out), HQ editing of HQ-wide items. Safe to run more than once.

-- HQ roles that may write HQ-wide rows (center_id is null) and send messages as HQ
create or replace function public.is_hq() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role in ('admin','founder','director','hq_followup','hq_staff'))
$$;
create or replace function public.can_write_scope(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select case when c is null then public.is_hq() else public.can_manage(c) end
$$;

-- plans: postponing needs a reason and approval; items can be left out of the month-end budget request
alter table plan_items add column if not exists approved boolean default false;
alter table plan_items add column if not exists approved_by text;
alter table plan_items add column if not exists request_skip boolean default false;

-- center information
alter table centers add column if not exists address text;
alter table centers add column if not exists phone text;
alter table centers add column if not exists meeting_place text;
alter table centers add column if not exists sunday_time text;
alter table centers add column if not exists started_on text;
alter table centers add column if not exists info text;

create table if not exists assets (
  id bigserial primary key,
  center_id int references centers(id) default 1,
  name text not null,
  category text,
  quantity numeric default 1,
  condition text default 'Good',
  location text,
  source text,                                    -- HQ, purchased, donated…
  acquired_on date,
  value numeric,
  notes text,
  updated_at timestamptz default now()
);
create table if not exists ledger (
  id bigserial primary key,
  center_id int references centers(id) default 1,
  entry_date date not null default current_date,
  direction text not null check (direction in ('in','out')),
  amount numeric not null,
  category text,
  department_id int references departments(id),
  plan_item_id bigint references plan_items(id) on delete set null,
  description text,
  receipt_ref text,
  created_by uuid default auth.uid(),
  created_at timestamptz default now()
);
create table if not exists hq_reconcile (
  id bigserial primary key,
  center_id int references centers(id) not null,
  kind text not null check (kind in ('event','teaching')),
  ref_id bigint not null,
  decision text check (decision in ('fits','adjusted','clash','not_applicable')),
  note text,
  updated_at timestamptz default now(),
  unique (center_id, kind, ref_id)
);
create table if not exists messages (
  id bigserial primary key,
  center_id int references centers(id),           -- the center the conversation is with; null = HQ to every center
  from_hq boolean not null default false,
  author_id uuid default auth.uid(),
  author_name text,
  subject text,
  body text not null,
  parent_id bigint references messages(id) on delete cascade,
  created_at timestamptz default now()
);
create table if not exists message_reads (
  message_id bigint references messages(id) on delete cascade,
  user_id uuid default auth.uid(),
  read_at timestamptz default now(),
  primary key (message_id, user_id)
);

alter table assets enable row level security;
alter table ledger enable row level security;
alter table hq_reconcile enable row level security;
alter table messages enable row level security;
alter table message_reads enable row level security;
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('assets','ledger','hq_reconcile','messages','message_reads') loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;
create policy assets_read on assets for select to authenticated using (public.can_read(center_id));
create policy assets_write on assets for all to authenticated using (public.can_mark(center_id)) with check (public.can_mark(center_id));
create policy ledger_read on ledger for select to authenticated using (public.can_mark(center_id) or public.is_hq());
create policy ledger_write on ledger for all to authenticated using (public.can_mark(center_id)) with check (public.can_mark(center_id));
create policy rec_read on hq_reconcile for select to authenticated using (public.can_read(center_id));
create policy rec_write on hq_reconcile for all to authenticated using (public.can_mark(center_id)) with check (public.can_mark(center_id));
create policy msg_read on messages for select to authenticated using (public.is_hq() or center_id is null or public.can_read(center_id));
create policy msg_write on messages for insert to authenticated with check (
  (from_hq and public.is_hq()) or (not from_hq and center_id is not null and public.can_mark(center_id)));
create policy msg_delete on messages for delete to authenticated using (author_id = auth.uid());
create policy reads_own on message_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- HQ staff (not only the admin) can now edit HQ-wide events, teaching plan, lessons and evaluation criteria
drop policy if exists ev_write on events;
create policy ev_write on events for all to authenticated using (public.can_write_scope(center_id)) with check (public.can_write_scope(center_id));
drop policy if exists tp_write on teaching_plan;
create policy tp_write on teaching_plan for all to authenticated using (public.can_write_scope(center_id)) with check (public.can_write_scope(center_id));
drop policy if exists lessons_write on lessons;
create policy lessons_write on lessons for all to authenticated using (public.can_write_scope(center_id)) with check (public.can_write_scope(center_id));
drop policy if exists crit_write on eval_criteria;
create policy crit_write on eval_criteria for all to authenticated using (public.can_write_scope(center_id)) with check (public.can_write_scope(center_id));

grant select, insert, update, delete on assets, ledger, hq_reconcile, messages, message_reads to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_hq(), public.can_write_scope(int) to authenticated;
