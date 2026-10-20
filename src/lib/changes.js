// Changes that must keep a history: a person's group and their responsible leader.
import { supabase } from './supabase';
import { semesterOf, semesterStart, todayIso } from './ethiopian';

/* Move someone to another group from Sunday `from`. The old group stays in category_history,
   and earlier Sundays keep the group they had then. */
export async function changeGroup(p, to, from, note) {
  const patch = { category: to };
  if (to === 'New Comer') patch.nc_active = true;
  if (!['Leader', 'Member'].includes(to)) { patch.leader_stage = null; patch.potential_leader = false; }
  const { error } = await supabase.from('people').update(patch).eq('id', p.id);
  if (error) throw error;
  await supabase.from('attendance').update({ category: to, active: true }).eq('person_id', p.id).gte('sunday', from);
  // the database records the change dated today; date it from the chosen Sunday and keep the note
  await supabase.from('category_history').update({ since: from, note: note || null }).eq('person_id', p.id).eq('category', to).gte('since', from);
}

/* Responsible person, one per semester: the previous assignment is closed, never deleted. */
export async function setResponsible(p, leader, assignments) {
  const today = todayIso();
  const semStart = semesterStart(semesterOf(today));
  const current = assignments.find((a) => a.person_id === p.id && !a.until);
  if (current && String(current.leader_id || '') === String(leader?.id || '')) return;
  if (current) {
    const { error } = await supabase.from('assignments').update({ until: current.since && current.since >= semStart ? today : semStart }).eq('id', current.id);
    if (error) throw error;
  }
  if (leader) {
    const since = current && current.since >= semStart ? today : semStart;
    const { error } = await supabase.from('assignments').insert({ person_id: p.id, leader_id: leader.id, leader_name: leader.name, since, note: semesterOf(today) });
    if (error) throw error;
  }
  await supabase.from('people').update({ responsible: leader?.name || null }).eq('id', p.id);
}
