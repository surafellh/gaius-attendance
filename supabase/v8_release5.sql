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
