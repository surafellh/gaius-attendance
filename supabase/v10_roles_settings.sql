-- Gaius release 7: two roles per account (a center role + an optional HQ role, each with its own access),
-- and settings the admin changes in the app: what each role can do, dashboard cards, columns, downloads.
-- Run after v9_hq.sql. Safe to run more than once (it never overwrites settings changed in the app).

-- ── a second, HQ role on the same account ───────────────────────────────────────────────────────
alter table profiles add column if not exists hq_role text;
alter table profiles add column if not exists hq_access text default 'view';
alter table profiles drop constraint if exists profiles_hq_role_check;
alter table profiles add constraint profiles_hq_role_check check (hq_role is null or hq_role in ('founder','director','hq_followup','hq_staff'));
alter table profiles drop constraint if exists profiles_hq_access_check;
alter table profiles add constraint profiles_hq_access_check check (hq_access in ('view','edit'));
-- accounts that are HQ only keep editing HQ plans as before
update profiles set hq_access = 'edit' where role in ('founder','director','hq_followup','hq_staff') and hq_role is null and hq_access = 'view'
  and not exists (select 1 from pg_class where relname = 'role_caps');

-- ── what each role can do – edited on the Settings page (the admin can always do everything) ────
create table if not exists role_caps (
  role text not null,
  cap text not null,
  primary key (role, cap)
);
insert into role_caps (role, cap)
select r, c from (values
  ('coordinator','mark'),('coordinator','manage'),('coordinator','approve'),('coordinator','phones'),('coordinator','finance'),('coordinator','download'),('coordinator','backup'),('coordinator','studio'),('coordinator','reminders'),
  ('followup_leader','mark'),('followup_leader','manage'),('followup_leader','phones'),('followup_leader','finance'),('followup_leader','download'),('followup_leader','studio'),('followup_leader','reminders'),
  ('center_leader','phones'),('center_leader','finance'),('center_leader','download'),('center_leader','studio'),('center_leader','reminders'),
  ('leader','phones'),('leader','finance'),('leader','download'),('leader','studio'),('leader','reminders'),
  ('viewer','download'),('viewer','studio'),
  ('founder','phones'),('founder','finance'),('founder','download'),('founder','studio'),
  ('director','phones'),('director','finance'),('director','download'),('director','studio'),
  ('hq_followup','phones'),('hq_followup','finance'),('hq_followup','download'),('hq_followup','studio'),
  ('hq_staff','finance'),('hq_staff','download'),('hq_staff','studio')
) v(r, c)
where not exists (select 1 from role_caps);
alter table role_caps enable row level security;
drop policy if exists rc_read on role_caps;
drop policy if exists rc_write on role_caps;
create policy rc_read on role_caps for select to authenticated using (true);
create policy rc_write on role_caps for all to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
grant select, insert, update, delete on role_caps to authenticated;

-- ── other settings: dashboard cards, People columns, downloads, role names (JSON) ────────────────
create table if not exists app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);
alter table app_settings enable row level security;
drop policy if exists as_read on app_settings;
drop policy if exists as_write on app_settings;
create policy as_read on app_settings for select to authenticated using (true);
create policy as_write on app_settings for all to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
grant select, insert, update, delete on app_settings to authenticated;

-- ── the rules, now read from role_caps ───────────────────────────────────────────────────────────
-- the account's center role has this ability
create or replace function public.has_cap(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p join public.role_caps rc on rc.role = p.role and rc.cap = c
    where p.user_id = auth.uid() and p.role not in ('pending','former'))
$$;
-- the account's HQ role (its main role if HQ only, else the extra HQ role) has this ability
create or replace function public.has_hq_cap(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p join public.role_caps rc
      on rc.role = case when p.role in ('founder','director','hq_followup','hq_staff') then p.role else p.hq_role end and rc.cap = c
    where p.user_id = auth.uid() and p.role not in ('pending','former'))
$$;
create or replace function public.is_hq() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role not in ('pending','former')
    and (role in ('admin','founder','director','hq_followup','hq_staff') or hq_role is not null))
$$;
-- HQ plans, HQ events, HQ teaching plan: the admin, or an HQ role with "edit" HQ access
create or replace function public.hq_can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role not in ('pending','former')
    and (role = 'admin' or ((role in ('founder','director','hq_followup','hq_staff') or hq_role is not null) and hq_access = 'edit')))
$$;
create or replace function public.can_read(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid()
    and role not in ('pending','former')
    and (role in ('admin','founder','director','hq_followup','hq_staff') or hq_role is not null or center_id = c))
$$;
-- center data is changed only through the center role, at that center
create or replace function public.can_mark(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin' or (public.has_cap('mark') and public.my_center() = c
    and public.my_role() not in ('founder','director','hq_followup','hq_staff'))
$$;
create or replace function public.can_manage(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin' or (public.has_cap('manage') and public.my_center() = c
    and public.my_role() not in ('founder','director','hq_followup','hq_staff'))
$$;
create or replace function public.can_write_scope(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select case when c is null then public.hq_can_edit() else public.can_manage(c) end
$$;
grant execute on function public.has_cap(text), public.has_hq_cap(text), public.is_hq(), public.hq_can_edit(),
  public.can_read(int), public.can_mark(int), public.can_manage(int), public.can_write_scope(int) to authenticated;

drop policy if exists tp_write on teaching_plan;
create policy tp_write on teaching_plan for all to authenticated
  using (case when source = 'hq' then public.hq_can_edit() else public.can_manage(center_id) end)
  with check (case when source = 'hq' then public.hq_can_edit() else public.can_manage(center_id) end);
drop policy if exists hqa_write on hq_activities;
create policy hqa_write on hq_activities for all to authenticated using (public.hq_can_edit()) with check (public.hq_can_edit());
drop policy if exists ledger_read on ledger;
create policy ledger_read on ledger for select to authenticated using (public.can_mark(center_id)
  or (public.can_read(center_id) and (public.has_cap('finance') and center_id = public.my_center() or public.has_hq_cap('finance'))));

-- ── accounts: approving and center roles follow the "approve" ability; HQ roles, HQ access and centers only the admin ──
drop policy if exists prof_read on profiles;
create policy prof_read on profiles for select to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin' or (public.has_cap('approve') and center_id = public.my_center()));
drop policy if exists prof_update on profiles;
create policy prof_update on profiles for update to authenticated
  using (public.my_role() = 'admin' or (public.has_cap('approve') and center_id = public.my_center() and role not in ('admin','founder','director','hq_followup','hq_staff')))
  with check (public.my_role() = 'admin' or (public.has_cap('approve') and center_id = public.my_center()
    and role in ('coordinator','center_leader','followup_leader','leader','viewer','former','pending')));
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' and auth.uid() is not null and (
     new.hq_role is distinct from old.hq_role or new.hq_access is distinct from old.hq_access or new.center_id is distinct from old.center_id) then
    raise exception 'Only the admin can change HQ roles, HQ access or centers';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile on profiles;
create trigger guard_profile before update on profiles for each row execute function public.guard_profile();
