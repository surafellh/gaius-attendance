// History downloads: anything the app has recorded, for any period (a month, a semester, a year, all time).
import { etLabel, fmtGreg, addDays, weekdayOf } from './ethiopian.js';
import { summaryTable, gridTable, programReport, REPORT_CATS } from './exports.js';
import { counts, ONE } from './stats.js';
import { planReport } from '../views/Plans.jsx';
import { lessonIndex } from './teaching.js';

const C = (ctx) => ctx.D.center?.name || '';
const fileOf = (ctx, what, label) => `Gaius_${C(ctx)}_${what}_${label.replace(/\W+/g, '_')}`;
export function sundaysBetween(from, to) {
  const out = [];
  let d = from;
  while (weekdayOf(d) !== 0) d = addDays(d, 1);
  for (; d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}
const nameOf = (ctx, id) => ctx.personBy[id]?.name || '';

export function attendanceHistory(ctx, from, to, label, keys = REPORT_CATS.map(([k]) => k)) {
  const cats = REPORT_CATS.filter(([k]) => keys.includes(k));
  const sundays = sundaysBetween(from, to).filter((s) => s <= ctx.today);
  const held = sundays.filter((s) => ctx.idx.heldSet.has(s));
  return {
    title: `Gaius ${C(ctx)} – attendance, ${label}`, file: fileOf(ctx, 'attendance', label), sub: `${held.length} Sundays recorded · ${etLabel(from, true)} – ${etLabel(to, true)}`,
    sheets: [summaryTable(ctx, sundays, cats), gridTable(ctx, sundays, cats)],
  };
}

export function callsHistory(ctx, from, to, label) {
  const rows = ctx.D.att.filter((r) => r.sunday >= from && r.sunday <= to && r.status === 'Absent' && counts(r) && ctx.personBy[r.person_id])
    .sort((a, b) => a.sunday.localeCompare(b.sunday) || nameOf(ctx, a.person_id).localeCompare(nameOf(ctx, b.person_id)));
  return {
    title: `Gaius ${C(ctx)} – follow-up calls, ${label}`, file: fileOf(ctx, 'calls', label), sub: `${rows.length} absences · ${rows.filter((r) => r.called).length} called`,
    sheets: [{ name: 'Calls', head: ['Sunday', 'Date', 'Name', 'Group', 'Called', 'Reason / note'],
      body: rows.map((r) => [etLabel(r.sunday), fmtGreg(r.sunday), nameOf(ctx, r.person_id), r.category === 'New Comer' ? 'New comer' : ONE[r.category] || r.category, r.called ? 'Yes' : 'No', r.reason || '']) }],
  };
}

export function changesHistory(ctx, from, to, label) {
  const hist = [...ctx.D.history].sort((a, b) => a.person_id - b.person_id || a.since.localeCompare(b.since));
  const prev = new Map();
  const groups = [];
  for (const h of hist) {
    const before = prev.get(h.person_id);
    prev.set(h.person_id, h.category);
    if (h.since < from || h.since > to || !ctx.personBy[h.person_id]) continue;
    groups.push([etLabel(h.since, true), fmtGreg(h.since), nameOf(ctx, h.person_id), before ? ONE[before] || before : '–', ONE[h.category] || h.category, h.note || '']);
  }
  groups.sort((a, b) => a[1].localeCompare(b[1]));
  const resp = ctx.D.assignments.filter((a) => ctx.personBy[a.person_id] && (a.since || '') <= to && (!a.until || a.until >= from))
    .sort((a, b) => (a.since || '').localeCompare(b.since || ''))
    .map((a) => [nameOf(ctx, a.person_id), a.leader_name || nameOf(ctx, a.leader_id), a.since ? etLabel(a.since, true) : '', a.until ? etLabel(a.until, true) : 'still', a.note || '']);
  return {
    title: `Gaius ${C(ctx)} – group & responsible changes, ${label}`, file: fileOf(ctx, 'changes', label), sub: `${groups.length} group changes · ${resp.length} responsible-person records`,
    sheets: [{ name: 'Group changes', head: ['Since', 'Date', 'Name', 'From', 'To', 'Note'], body: groups },
      { name: 'Responsible persons', head: ['Person', 'Responsible', 'From', 'Until', 'Note'], body: resp }],
  };
}

export function roadmapReport(ctx) {
  const cid = ctx.D.center?.id || 1;
  const lessons = ctx.D.lessons.filter((l) => l.active && (l.center_id == null || l.center_id === cid));
  const li = lessonIndex(ctx.D, lessons, ctx.idx, cid);
  const people = ctx.D.people.filter((p) => !p.archived).sort((a, b) => (a.sn ?? 1e9) - (b.sn ?? 1e9));
  const how = (t) => (!t ? '' : t.how === 'attended' ? `✓ ${etLabel(t.on)}` : t.how === 'first' ? '✓ first teaching' : '✓');
  return {
    title: `Gaius ${C(ctx)} – teaching roadmap`, file: `Gaius_${C(ctx)}_roadmap`, sub: `As of ${etLabel(ctx.today, true)} · ${lessons.length} lessons`,
    sheets: [{ name: 'Roadmap', head: ['Name', 'Group', 'First teaching', 'On', ...lessons.map((l) => l.name_am || l.name), 'Taken'],
      body: people.map((p) => { const ts = lessons.map((l) => li.took(p, l)); return [p.name, ONE[p.category] || p.category || '', p.start_teaching || '', p.start_teaching_on ? etLabel(p.start_teaching_on, true) : '', ...ts.map(how), `${ts.filter(Boolean).length}/${lessons.length}`]; }) }],
  };
}

export function eventsHistory(ctx, from, to, label) {
  const cid = ctx.D.center?.id || 1;
  const list = ctx.D.events.filter((e) => (e.center_id == null || e.center_id === cid) && e.starts_on <= to && (e.ends_on || e.starts_on) >= from).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  return {
    title: `Gaius ${C(ctx)} – events, ${label}`, file: fileOf(ctx, 'events', label), sub: `${list.length} events`,
    sheets: [{ name: 'Events', head: ['Starts', 'Ends', 'Event', 'Kind', 'Where', 'By', 'Notes'],
      body: list.map((e) => [etLabel(e.starts_on, true), e.ends_on && e.ends_on !== e.starts_on ? etLabel(e.ends_on, true) : '', e.title, e.kind || '', e.location || '', e.center_id == null ? 'HQ' : C(ctx), e.notes || '']) }],
  };
}

export function meetingsHistory(ctx, from, to, label) {
  const ms = ctx.D.meetings.filter((m) => m.meets_on >= from && m.meets_on <= to).sort((a, b) => a.meets_on.localeCompare(b.meets_on));
  const ag = ctx.D.agenda.filter((a) => (a.meeting_on || a.raised_on || '') >= from && (a.meeting_on || a.raised_on || '') <= to).sort((a, b) => (a.meeting_on || a.raised_on || '').localeCompare(b.meeting_on || b.raised_on || ''));
  return {
    title: `Gaius ${C(ctx)} – leaders’ meetings, ${label}`, file: fileOf(ctx, 'meetings', label), sub: `${ms.length} meetings · ${ag.length} agenda items`,
    sheets: [{ name: 'Meetings', head: ['Date', 'Attendees', 'Notes'], body: ms.map((m) => [etLabel(m.meets_on, true), m.attendees || '', m.notes || '']) },
      { name: 'Agenda & decisions', head: ['Meeting', 'Item', 'Details', 'Owner', 'Due', 'Status', 'Outcome'],
        body: ag.map((a) => [etLabel(a.meeting_on || a.raised_on, true), a.title, a.details || '', a.owner || '', a.due ? etLabel(a.due, true) : '', a.status, a.outcome || '']) }],
  };
}

export function financeHistory(ctx, from, to, label) {
  const dn = (id) => ctx.D.departments.find((d) => d.id === id)?.name || '';
  const list = ctx.D.ledger.filter((l) => l.entry_date >= from && l.entry_date <= to).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const sum = (d) => list.filter((l) => l.direction === d).reduce((n, l) => n + Number(l.amount || 0), 0);
  return {
    title: `Gaius ${C(ctx)} – money in / out, ${label}`, file: fileOf(ctx, 'money', label), sub: `In ${sum('in').toLocaleString()} · out ${sum('out').toLocaleString()} · balance ${(sum('in') - sum('out')).toLocaleString()} birr`,
    sheets: [{ name: 'Money in & out', head: ['Date', 'In / out', 'Amount (birr)', 'Category', 'Department', 'Description', 'Receipt'],
      body: list.map((l) => [etLabel(l.entry_date, true), l.direction === 'in' ? 'In' : 'Out', Number(l.amount), l.category || '', dn(l.department_id), l.description || '', l.receipt_ref || '']) },
      { name: 'Assets', head: ['Item', 'Category', 'Quantity', 'Condition', 'Where', 'From', 'Since', 'Value (birr)', 'Notes'],
        body: ctx.D.assets.map((a) => [a.name, a.category || '', a.quantity ?? '', a.condition || '', a.location || '', a.source || '', a.acquired_on ? etLabel(a.acquired_on, true) : '', a.value ?? '', a.notes || '']) }],
  };
}

/* one workbook with everything for the period */
export function everything(ctx, from, to, label, { finance }) {
  const parts = [attendanceHistory(ctx, from, to, label), programReport(ctx, from, to, label), planReport(ctx.D, from, to, label), callsHistory(ctx, from, to, label),
    changesHistory(ctx, from, to, label), eventsHistory(ctx, from, to, label), meetingsHistory(ctx, from, to, label), roadmapReport(ctx), ...(finance ? [financeHistory(ctx, from, to, label)] : [])];
  const seen = new Set();
  const sheets = parts.flatMap((r) => r.sheets).map((sh) => { let n = sh.name; let i = 2; while (seen.has(n)) n = `${sh.name} ${i++}`; seen.add(n); return { ...sh, name: n }; });
  return { title: `Gaius ${C(ctx)} – everything, ${label}`, file: fileOf(ctx, 'everything', label), sub: `${etLabel(from, true)} – ${etLabel(to, true)}`, sheets };
}
