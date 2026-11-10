// Plan achievement: how each activity, department, responsible person and center did against its plan.
import { toEthiopian, monthRange } from './ethiopian';
import { effStatus } from './plans';

/* the last day an item can be done and still count as on time */
export function deadlineOf(it) {
  if (it.due_kind === 'month') { const e = toEthiopian(it.due); return monthRange({ year: e.year, month: e.month })[1]; }
  return it.due;
}
/* one item's result: done (on time or late), not done, postponed, upcoming, cancelled */
export function resultOf(it, today) {
  const st = effStatus(it, today);
  if (st === 'cancelled') return 'cancelled';
  if (st === 'done') return !it.done_on || it.done_on <= deadlineOf(it) ? 'ontime' : 'late';
  if (st === 'not_done') return 'notdone';
  if (it.moved_from) return 'postponed';
  return deadlineOf(it) < today ? 'overdue' : 'upcoming';
}
export const RESULT_LABEL = { ontime: 'Done on time', late: 'Done late', notdone: 'Not done', postponed: 'Postponed', overdue: 'Past the date, not marked', upcoming: 'Coming up', cancelled: 'Cancelled' };

/* add up a list of items: achievement = done ÷ (done + not done + past the date); on time = on time ÷ done */
export function tally(items, today) {
  const t = { total: 0, ontime: 0, late: 0, notdone: 0, postponed: 0, overdue: 0, upcoming: 0, cancelled: 0, budget: 0, needReason: 0 };
  for (const it of items) {
    const r = resultOf(it, today); t[r]++; if (r !== 'cancelled') { t.total++; t.budget += Number(it.budget || 0); }
    if (r === 'notdone' && !(it.reason || '').trim()) t.needReason++;
  }
  t.done = t.ontime + t.late;
  t.due = t.done + t.notdone + t.overdue;                 // items whose time has come
  t.achievement = t.due ? t.done / t.due : null;
  t.onTimeRate = t.done ? t.ontime / t.done : null;
  return t;
}
/* the items of a center inside a period, joined with their plan */
export function itemsIn(D, from, to) {
  const plans = new Map((D.plans || []).map((p) => [p.id, p]));
  return (D.items || []).filter((i) => i.due >= from && i.due <= to && plans.has(i.plan_id)).map((i) => ({ ...i, plan: plans.get(i.plan_id) }));
}
/* a score colour: green from 80%, amber from 50%, red below */
export const scoreClass = (v) => (v == null ? '' : v >= 0.8 ? 'good' : v >= 0.5 ? 'mid' : 'low');

/* HQ support for a center: how fast HQ answers its messages, and HQ's own plans for that center */
export function hqSupport(R, cid, from, to, today) {
  const msgs = (R.messages || []).filter((m) => m.center_id === cid).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const asks = msgs.filter((m) => !m.from_hq && m.created_at.slice(0, 10) >= from && m.created_at.slice(0, 10) <= to);
  let answered = 0, hours = 0; const waiting = [];
  for (const m of asks) {
    const reply = msgs.find((x) => x.from_hq && x.created_at > m.created_at && (x.parent_id === m.id || x.parent_id === m.parent_id || !x.parent_id));
    if (reply) { answered++; hours += (Date.parse(reply.created_at) - Date.parse(m.created_at)) / 36e5; } else waiting.push(m);
  }
  const acts = (R.activities || []).filter((a) => a.center_id === cid && (a.due || a.starts_on) && (a.due || a.starts_on) >= from && (a.due || a.starts_on) <= to && a.status !== 'cancelled');
  const due = acts.filter((a) => (a.due || a.starts_on) < today || a.status === 'done');
  const done = acts.filter((a) => a.status === 'done');
  return {
    asks: asks.length, answered, avgHours: answered ? hours / answered : null, waiting: waiting.length,
    oldestWait: waiting.length ? Math.round((Date.parse(today) - Date.parse(waiting[0].created_at)) / 864e5) : null,
    hqPlans: acts.length, hqDue: due.length, hqDone: done.length, hqLate: due.length - done.length,
  };
}
export const hoursText = (h) => (h == null ? '–' : h < 1 ? 'under 1 hour' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
