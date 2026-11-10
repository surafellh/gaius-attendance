-- Gaius: releases 5–8 in one file (v8 + v9 + v10 + v11). Paste into Supabase → SQL Editor → Run.
-- Safe to run again, and safe if some parts were already run. It never overwrites settings changed in the app.

-- Gaius release 5: a Coordinator (አገልግሎት አስተባባሪ) role, editing only by the Coordinator, Follow-up leader and admin,
-- sign-up with a center, and a public landing page. Run after release 4 (v7). Safe to run more than once.

-- ── roles: add the Coordinator ───────────────────────────────────────────────────────────────────
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in
  ('admin','founder','director','hq_followup','hq_staff','coordinator','center_leader','followup_leader','leader','viewer','former','pending'));

-- only the Coordinator, the Follow-up leader and the admin change data; every other role views
create or replace function public.can_mark(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid()
    and (role = 'admin' or (role in ('coordinator','followup_leader') and center_id = c)))
$$;
create or replace function public.can_manage(c int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid()
    and (role = 'admin' or (role in ('coordinator','followup_leader') and center_id = c)))
$$;

-- the Coordinator sees and approves the people who sign up for their own center
drop policy if exists prof_read on profiles;
create policy prof_read on profiles for select to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin' or (public.my_role() = 'coordinator' and center_id = public.my_center()));
drop policy if exists prof_update on profiles;
create policy prof_update on profiles for update to authenticated
  using (public.my_role() = 'admin' or (public.my_role() = 'coordinator' and center_id = public.my_center() and role not in ('admin')))
  with check (public.my_role() = 'admin' or (public.my_role() = 'coordinator' and center_id = public.my_center()
    and role in ('coordinator','center_leader','followup_leader','leader','viewer','former','pending')));

-- ── sign-up: the person picks their center ──────────────────────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  c := case when coalesce(new.raw_user_meta_data->>'center_id', '') ~ '^[0-9]+$' then (new.raw_user_meta_data->>'center_id')::int end;
  if c is not null and not exists (select 1 from public.centers where id = c) then c := null; end if;
  insert into public.profiles(user_id, email, full_name, role, center_id, title)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email),
          case when (select count(*) from public.profiles) = 0 then 'admin' else 'pending' end, coalesce(c, 1),
          -- people who chose "HQ" wait for the admin to give them an HQ role
          case when new.raw_user_meta_data->>'hq' = 'true' then 'Asked for HQ access' end)
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- the centers list for the sign-up form (names only)
create or replace function public.public_centers() returns table (id int, name text, name_am text)
language sql stable security definer set search_path = public as $$
  select id, name, name_am from public.centers order by id
$$;
grant execute on function public.public_centers() to anon, authenticated;

-- ── landing page text, readable by anyone with the link, edited by the admin ─────────────────────
create table if not exists site_info (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);
alter table site_info enable row level security;
drop policy if exists site_read on site_info;
drop policy if exists site_write on site_info;
create policy site_read on site_info for select to anon, authenticated using (true);
create policy site_write on site_info for all to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
grant select on site_info to anon;
grant select, insert, update, delete on site_info to authenticated;

insert into site_info(key, value) values
  ('tagline', 'Here to reveal the true image of Jesus Christ in our youth''s lives.'),
  ('vision', 'To see young people trained, equipped and lead a life of discipleship.'),
  ('verse', 'My friend, I pray that you may prosper in all things and be in health, just as your soul prospers.'),
  ('verse_ref', '3 John 2'),
  ('about', 'Gaius Ministry is a Bible-based Christian spiritual institution focused on the holistic development and transformation of youth. Established in February 2018 G.C., it has worked on youth matters since 2014 G.C., together with Evangelical churches, EVASUE and Scripture Union – youth conferences, addiction awareness, and weekly Sunday youth programs in its centers.'),
  ('logo', 'https://gaiusministry.org/wp-content/uploads/2023/02/cropped-gaius_logo-270x270.png'),
  ('website', 'https://gaiusministry.org'),
  ('telegram', 'https://t.me/Gaiusministry')
on conflict (key) do nothing;

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

-- the landing page in Amharic (shown when someone picks አማ); edit on App admin → Backup & landing page
insert into site_info (key, value) values
  ('tagline_am', 'የኢየሱስ ክርስቶስን እውነተኛ መልክ በወጣቶቻችን ሕይወት ለመግለጥ።'),
  ('vision_am', 'ወጣቶች ሰልጥነውና ታጥቀው የደቀ መዝሙርነት ሕይወት ሲኖሩ ማየት።'),
  ('verse_am', 'ወዳጅ ሆይ፥ ነፍስህ እንደሚከናወንልህ በሁሉ እንዲከናወንልህና ጤና እንዲኖርህ እጸልያለሁ።'),
  ('verse_ref_am', '3ኛ ዮሐንስ 2'),
  ('about_am', 'ጋይዮስ አገልግሎት በወጣቶች ሁለንተናዊ እድገትና ለውጥ ላይ የሚያተኩር መጽሐፍ ቅዱሳዊ የክርስቲያን መንፈሳዊ ተቋም ነው። በየካቲት 2018 እ.ኤ.አ. የተመሠረተ ሲሆን ከ2014 እ.ኤ.አ. ጀምሮ ከወንጌላውያን አብያተ ክርስቲያናት፣ ከኢቫሱና ከስክሪፕቸር ዩኒየን ጋር በመሆን በወጣቶች ጉዳይ ሠርቷል – የወጣቶች ኮንፈረንሶች፣ የሱስ ግንዛቤ እና በማዕከላቱ ሳምንታዊ የእሑድ የወጣቶች ፕሮግራሞች።')
on conflict (key) do nothing;

