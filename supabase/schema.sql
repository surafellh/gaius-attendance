-- Gaius Gerji Center Attendance: tables, security, and data import. Run once in SQL Editor.
create table if not exists people (
  id bigserial primary key, sn int unique, name text not null, phone text, responsible text,
  week_joined date, nc_active boolean default true, created_at timestamptz default now()
);
create table if not exists person_status (
  person_id bigint references people(id) on delete cascade,
  semester text not null,
  category text not null check (category in
    ('Leader','Senior Leader','Member','Active Informal Member','Inactive Informal Member','New Comer')),
  primary key (person_id, semester)
);
create table if not exists attendance (
  person_id bigint references people(id) on delete cascade,
  sunday date not null,
  status text check (status in ('Present','Absent')),
  called boolean default false,
  reason text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz default now(),
  primary key (person_id, sunday)
);
create index if not exists attendance_sunday_idx on attendance(sunday);
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text, full_name text,
  role text not null default 'pending' check (role in ('admin','leader','pending')),
  created_at timestamptz default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(user_id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email),
          case when (select count(*) from public.profiles) = 0 then 'admin' else 'pending' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter table people enable row level security;
alter table person_status enable row level security;
alter table attendance enable row level security;
alter table profiles enable row level security;

create policy people_read on people for select to authenticated using ((select public.my_role()) in ('admin','leader'));
create policy status_read on person_status for select to authenticated using ((select public.my_role()) in ('admin','leader'));
create policy att_read on attendance for select to authenticated using ((select public.my_role()) in ('admin','leader'));
create policy prof_read on profiles for select to authenticated using (user_id = (select auth.uid()) or (select public.my_role()) = 'admin');
create policy att_insert on attendance for insert to authenticated with check ((select public.my_role()) in ('admin','leader'));
create policy att_update on attendance for update to authenticated using ((select public.my_role()) in ('admin','leader'));
create policy att_delete on attendance for delete to authenticated using ((select public.my_role()) = 'admin');
create policy people_insert on people for insert to authenticated with check ((select public.my_role()) in ('admin','leader'));
create policy people_update on people for update to authenticated using ((select public.my_role()) = 'admin');
create policy people_delete on people for delete to authenticated using ((select public.my_role()) = 'admin');
create policy status_insert on person_status for insert to authenticated with check ((select public.my_role()) in ('admin','leader'));
create policy status_update on person_status for update to authenticated using ((select public.my_role()) = 'admin');
create policy status_delete on person_status for delete to authenticated using ((select public.my_role()) = 'admin');
create policy prof_update on profiles for update to authenticated using ((select public.my_role()) = 'admin');

-- ===== DATA IMPORT (133 people, statuses, Meskerem 2019 weeks 1-5) =====
