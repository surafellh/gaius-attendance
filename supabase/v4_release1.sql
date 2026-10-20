-- Gaius release 1. Run once in Supabase → SQL Editor. Safe to run again.

-- 1. Let each user change their own display name (Account & settings) without touching their role.
create or replace function public.set_my_name(n text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set full_name = nullif(trim(n), '') where user_id = auth.uid();
$$;
grant execute on function public.set_my_name(text) to authenticated;

-- 2. Responsible persons: the list from Semester 1 · 2018 is closed (kept as history) so Semester 1 · 2019 starts blank.
update assignments set until = '2026-09-10' where until is null and person_id in (select id from people where center_id = 1);
update people set responsible = null where center_id = 1;
