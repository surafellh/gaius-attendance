-- Gaius release 8: your own roles, new centers with their own features and currency, finance kept separately.
-- Run after v10_roles_settings.sql (run_v8_to_v11.sql has everything). Safe to run more than once.

-- ── roles are a table now: the admin adds roles and gives each its own abilities ──────────────────
create table if not exists app_roles (
  key text primary key,
  name text not null,
  side text not null check (side in ('center','hq')),
  description text,
  sort int default 100,
  builtin boolean default false
);
insert into app_roles (key, name, side, description, sort, builtin) values
  ('founder','Founder / Visionary','hq','Sees every center (HQ side)',10,true),
  ('director','Director','hq','Sees every center (HQ side)',20,true),
  ('hq_followup','HQ Follow-up','hq','Sees every center (HQ side), profiles',30,true),
  ('hq_staff','HQ staff','hq','Sees every center (HQ side)',40,true),
  ('coordinator','Coordinator (አገልግሎት አስተባባሪ)','center','Runs the center: edits everything, approves the center’s users',50,true),
  ('followup_leader','Follow-up leader','center','Edits attendance, people, follow-up and plans',60,true),
  ('center_leader','Center leader','center','Sees the whole center',70,true),
  ('leader','Leader','center','Sees the center',80,true),
  ('viewer','Viewer','center','Sees the center, no profiles',90,true)
on conflict (key) do nothing;
alter table app_roles enable row level security;
drop policy if exists ar_read on app_roles;
drop policy if exists ar_write on app_roles;
create policy ar_read on app_roles for select to authenticated using (true);
create policy ar_write on app_roles for all to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
grant select, insert, update, delete on app_roles to authenticated;

create or replace function public.is_hq_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select r = 'admin' or exists (select 1 from public.app_roles where key = r and side = 'hq')
$$;
create or replace function public.is_center_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_roles where key = r and side = 'center')
$$;
grant execute on function public.is_hq_role(text), public.is_center_role(text) to authenticated;

-- a profile's roles must exist (the fixed list is replaced by the table)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles drop constraint if exists profiles_hq_role_check;
create or replace function public.check_profile_roles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role not in ('admin','pending','former') and not exists (select 1 from public.app_roles where key = new.role) then
    raise exception 'Unknown role %', new.role;
  end if;
  if new.hq_role is not null and not exists (select 1 from public.app_roles where key = new.hq_role and side = 'hq') then
    raise exception 'Unknown HQ role %', new.hq_role;
  end if;
  return new;
end $$;
drop trigger if exists check_profile_roles on profiles;
create trigger check_profile_roles before insert or update on profiles for each row execute function public.check_profile_roles();
-- a role still in use can't be deleted
create or replace function public.guard_role_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.builtin then raise exception 'Built-in roles can be renamed but not deleted'; end if;
  if exists (select 1 from public.profiles where role = old.key or hq_role = old.key) then
    raise exception 'Someone still has the role %', old.name;
  end if;
  delete from public.role_caps where role = old.key;
  return old;
end $$;
drop trigger if exists guard_role_delete on app_roles;
create trigger guard_role_delete before delete on app_roles for each row execute function public.guard_role_delete();

-- the rules, now reading the roles table instead of a fixed list
create or replace function public.has_hq_cap(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p join public.role_caps rc
      on rc.role = case when public.is_hq_role(p.role) and p.role <> 'admin' then p.role else p.hq_role end and rc.cap = c
    where p.user_id = auth.uid() and p.role not in ('pending','former'))
$$;
create or replace function public.is_hq() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role not in ('pending','former')
    and (public.is_hq_role(role) or hq_role is not null))
$$;
create or replace function public.hq_can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role not in ('pending','former')
    and (role = 'admin' or ((public.is_hq_role(role) or hq_role is not null) and hq_access = 'edit')))
$$;
create or replace function public.can_read(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid()
    and role not in ('pending','former')
    and (public.is_hq_role(role) or hq_role is not null or center_id = c))
$$;
create or replace function public.can_mark(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin' or (public.has_cap('mark') and public.my_center() = c and public.is_center_role(public.my_role()))
$$;
create or replace function public.can_manage(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'admin' or (public.has_cap('manage') and public.my_center() = c and public.is_center_role(public.my_role()))
$$;

drop policy if exists prof_update on profiles;
create policy prof_update on profiles for update to authenticated
  using (public.my_role() = 'admin' or (public.has_cap('approve') and center_id = public.my_center() and not public.is_hq_role(role)))
  with check (public.my_role() = 'admin' or (public.has_cap('approve') and center_id = public.my_center()
    and (role in ('former','pending') or public.is_center_role(role))));

-- ── centers: new centers, their features, currency, and finance followed on its own ──────────────
alter table centers add column if not exists country text default 'Ethiopia';
alter table centers add column if not exists currency text default 'ETB';
alter table centers add column if not exists international boolean default false;
alter table centers add column if not exists finance_separate boolean default false;
alter table centers add column if not exists features jsonb default '{}'::jsonb;   -- {"finance": false, …} = turned off
alter table centers add column if not exists active boolean default true;
alter table centers add column if not exists sort int default 0;
alter table ledger add column if not exists currency text;                          -- null = the center's currency

drop policy if exists centers_insert on centers;
drop policy if exists centers_delete on centers;
create policy centers_insert on centers for insert to authenticated with check (public.my_role() = 'admin');
create policy centers_delete on centers for delete to authenticated using (public.my_role() = 'admin');
drop policy if exists centers_write on centers;
create policy centers_write on centers for update to authenticated using (public.my_role() = 'admin' or public.can_manage(id));
grant insert, update, delete on centers to authenticated;
-- a center's own leaders edit its details; features, currency and finance set-up are for the admin
create or replace function public.guard_center() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' and auth.uid() is not null and (
     new.features is distinct from old.features or new.currency is distinct from old.currency or new.international is distinct from old.international
     or new.finance_separate is distinct from old.finance_separate or new.active is distinct from old.active or new.name is distinct from old.name) then
    raise exception 'Only the admin can change a center''s name, features, currency or finance set-up';
  end if;
  return new;
end $$;
drop trigger if exists guard_center on centers;
create trigger guard_center before update on centers for each row execute function public.guard_center();

-- the admin adds a center (the next number is picked automatically)
create or replace function public.create_center(p_name text, p_name_am text default null, p_country text default 'Ethiopia', p_currency text default 'ETB',
  p_international boolean default false, p_finance_separate boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if public.my_role() <> 'admin' then raise exception 'Only the admin can add centers'; end if;
  select coalesce(max(id), 0) + 1 into n from public.centers;
  insert into public.centers (id, name, name_am, country, currency, international, finance_separate, sort)
  values (n, p_name, p_name_am, coalesce(p_country, 'Ethiopia'), coalesce(p_currency, 'ETB'), coalesce(p_international, false), coalesce(p_finance_separate, false), n);
  return n;
end $$;
grant execute on function public.create_center(text, text, text, text, boolean, boolean) to authenticated;

-- the sign-up list shows active centers only
create or replace function public.public_centers() returns table (id int, name text, name_am text)
language sql stable security definer set search_path = public as $$
  select id, name, name_am from public.centers where coalesce(active, true) order by coalesce(sort, id), id
$$;
grant execute on function public.public_centers() to anon, authenticated;

-- money and assets follow the "manage" ability (as the Settings page says)
drop policy if exists assets_write on assets;
create policy assets_write on assets for all to authenticated using (public.can_manage(center_id)) with check (public.can_manage(center_id));
drop policy if exists ledger_write on ledger;
create policy ledger_write on ledger for all to authenticated using (public.can_manage(center_id)) with check (public.can_manage(center_id));

-- semester plans: who is responsible for each plan (filled from the upload template)
alter table plans add column if not exists responsible text;
