-- Leadership path: candidate (member) → potential leader (in the leadership team) → leader. Safe to run more than once.
alter table people add column if not exists leader_stage text check (leader_stage in ('candidate', 'potential'));
update people set leader_stage = 'potential' where potential_leader and leader_stage is null;

-- Gerji: Helen and Samuel are leaders; Biruktawit and Sami are potential leaders already in the leadership team.
update people set leader_stage = null, potential_leader = false, category = 'Leader' where center_id = 1 and sn in (10, 11);
update people set leader_stage = 'potential', potential_leader = true, category = 'Leader' where center_id = 1 and sn in (18, 112);
select sn, name, category, leader_stage from people where center_id = 1 and (sn in (10, 11, 18, 112) or leader_stage is not null) order by sn;
