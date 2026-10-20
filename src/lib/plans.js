// Department plans: each plan has items (one per date, week or month) that get marked done / not done.
import { supabase } from './supabase';
import { toEthiopian, ET_MONTHS, etLabel, addDays, WEEKDAYS, weekdayOf, monthRange } from './ethiopian';

/* one colour per department (by sort order), readable on white and as a soft tint */
const PALETTE = ['#2a78d6', '#1baf7a', '#eb6834', '#8a5cd6', '#e0a100', '#d6457a', '#0f9bb5', '#6b8e23', '#c0392b', '#5d6d7e', '#b5651d', '#3a7d44'];
export function deptColor(D, id) {
  const i = D.departments.findIndex((d) => d.id === id);
  return i < 0 ? '#98a390' : PALETTE[i % PALETTE.length];
}
export const deptName = (D, id) => D.departments.find((d) => d.id === id)?.name || 'No department';

export const STATUS = {
  planned: ['Planned', ''], done: ['Done', 'ok'], not_done: ['Not done', 'bad'], cancelled: ['Cancelled', ''],
};
/* when the item's month is over and nobody marked it, it counts as not done and needs a reason */
export function effStatus(it, today) {
  if (it.status !== 'planned') return it.status;
  const e = toEthiopian(it.due);
  const monthEnd = it.due_kind === 'period' ? it.due : monthRange({ year: e.year, month: e.month })[1];
  return monthEnd < today ? 'not_done' : 'planned';
}
export const needsReason = (it, today) => effStatus(it, today) === 'not_done' && !(it.reason || '').trim();
export const isPostponed = (it) => !!it.moved_from && it.status === 'planned';
export const KIND_LABEL = { day: 'On the day', week: 'Weekly', month: 'During the month', period: 'Any time this semester' };

export const birr = (n) => (n ? `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })} birr` : '–');

/* the items of a semester, joined with their plan */
export function semesterItems(D, sem) {
  const plans = new Map(D.plans.filter((p) => p.semester === sem).map((p) => [p.id, p]));
  return D.items.filter((i) => plans.has(i.plan_id)).map((i) => ({ ...i, plan: plans.get(i.plan_id) }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.plan.sort - b.plan.sort);
}
export function itemsBetween(D, from, to) {
  const plans = new Map(D.plans.map((p) => [p.id, p]));
  return D.items.filter((i) => i.due >= from && i.due <= to && plans.has(i.plan_id)).map((i) => ({ ...i, plan: plans.get(i.plan_id) }))
    .sort((a, b) => a.due.localeCompare(b.due) || a.plan.sort - b.plan.sort);
}

/* is this item finished, overdue, or still ahead? */
export function itemState(it, today) {
  if (it.status !== 'planned') return it.status;
  if (effStatus(it, today) === 'not_done') return 'not_done';
  if (it.due_kind === 'week' || it.due_kind === 'day') return it.due < today ? 'overdue' : 'ahead';
  return it.due < today ? 'overdue' : 'ahead';
}
export const monthKeyOf = (d) => { const e = toEthiopian(d); return `${e.year}-${String(e.month).padStart(2, '0')}`; };
export const monthName = (key) => `${ET_MONTHS[Number(key.slice(5))]} ${key.slice(0, 4)}`;

export async function saveItem(id, patch) {
  const { error } = await supabase.from('plan_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export const nextWeek = (d) => addDays(d, 7);
export const nextMonth = (d) => addDays(d, 30);
export const itemWhen = (it) => (it.due_kind === 'day' ? `${WEEKDAYS[weekdayOf(it.due)]}, ${etLabel(it.due, true)}`
  : it.due_kind === 'week' ? `Week of ${etLabel(it.due)}`
    : it.due_kind === 'month' ? `${ET_MONTHS[toEthiopian(it.due).month]} (during the month)` : 'Any time this semester');
