// The HQ side: every center's numbers at once. HQ looks at leaders, members and informal members;
// totals still count everyone who came.
import { centerCtx } from '../lib/scope';
import { FOLLOWED, personFacts, readiness } from '../lib/stats';
import { toEthiopian, ET_MONTHS, semesterOf, semesterStart } from '../lib/ethiopian';

export const CENTER_COLORS = ['#4f8a12', '#2a78d6', '#eb6834', '#8a5cd6', '#e0a100', '#0f9bb5', '#d6457a', '#6b7d2a'];
export const colorOf = (R, id) => CENTER_COLORS[Math.max(0, R.centers.findIndex((c) => c.id === id)) % CENTER_COLORS.length];

/* one entry per center: its own context (D, idx, latest…) plus the HQ numbers */
export function allCenters(R, today) {
  return R.centers.map((c) => ({ c, ...centerCtx(R, c.id, today) }));
}

/* a center's numbers on one Sunday (its own latest when s is not given) */
export function sundayNumbers(x, s = x.latest) {
  const { idx, summaries, D } = x;
  const cur = summaries[s];
  const hi = idx.held.indexOf(s);
  const prevS = hi > 0 ? idx.held[hi - 1] : null;
  const prev = prevS ? summaries[prevS] : null;
  if (!cur) return { s, recorded: false };
  const L = cur.byCat.Leader, M = cur.byCat.Member;
  const rows = idx.bySunday[s] || [];
  const dropped = rows.filter((r) => FOLLOWED.includes(r.category) && r.status === 'Absent' && idx.byPerson[r.person_id]?.[prevS]?.status === 'Present').length;
  return {
    s, recorded: true, present: cur.present, prevPresent: prev?.present ?? null,
    leaders: L.present, leadersTotal: L.total, members: M.present, membersTotal: M.total,
    informal: cur.informal, others: cur.present - L.present - M.present - cur.informal,
    firstTime: D.people.filter((p) => p.week_joined === s).length, dropped, rate: cur.rate, prevRate: prev?.rate ?? null,
  };
}

/* a center over a period: Sundays, average present, L+M rate, month by month */
export function periodNumbers(x, P) {
  const weeks = x.idx.held.filter((s) => s >= P.from && s <= P.to);
  const sums = weeks.map((s) => x.summaries[s]);
  const rates = sums.map((w) => w.rate).filter((v) => v != null);
  const months = new Map();
  for (const s of weeks) {
    const e = toEthiopian(s); const k = `${e.year}-${String(e.month).padStart(2, '0')}`;
    if (!months.has(k)) months.set(k, { k, name: ET_MONTHS[e.month], list: [] });
    months.get(k).list.push(s);
  }
  return {
    weeks, avg: weeks.length ? sums.reduce((n, w) => n + w.present, 0) / weeks.length : null,
    rate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    best: weeks.length ? Math.max(...sums.map((w) => w.present)) : null,
    firstTime: x.D.people.filter((p) => p.week_joined && p.week_joined >= P.from && p.week_joined <= P.to).length,
    months: [...months.values()].map((m) => ({ ...m, avg: m.list.reduce((n, s) => n + x.summaries[s].present, 0) / m.list.length })),
  };
}

/* the people HQ follows (leaders, members, informal members), with their facts as of the center's latest Sunday */
export function followedPeople(x) {
  const s = x.latest;
  const semStart = semesterStart(semesterOf(s));
  const semHeld = x.idx.held.filter((d) => d >= semStart && d <= s);
  return x.D.people.filter((p) => !p.archived && FOLLOWED.includes(p.category)).map((p) => {
    const marks = x.idx.byPerson[p.id] || {};
    return { p, c: x.c, f: personFacts(p, marks, x.idx.held, s, semStart), dots: semHeld.map((d) => marks[d]?.status), row: marks[s] };
  });
}

/* the new comers coming most faithfully since their first visit (at least 4 Sundays) */
export function promising(x, n = 5) {
  const rows = x.idx.bySunday[x.latest] || [];
  return rows.filter((r) => r.category === 'New Comer' && r.active && x.personBy[r.person_id]).map((r) => {
    const p = x.personBy[r.person_id];
    return { p, c: x.c, r: readiness(p, x.idx.byPerson[p.id] || {}, x.idx.held, x.latest) };
  }).filter((v) => v.r.weeksIn >= 4 && v.r.sinceRate != null).sort((a, b) => b.r.sinceRate - a.r.sinceRate || b.r.weeksIn - a.r.weeksIn).slice(0, n);
}

export const FOLLOW_LISTS = [
  { key: 'dropped', label: 'Came last Sunday, missed this one', accent: 'var(--warn)', test: (x) => x.f.lastWeek === 'Present' && x.f.thisWeek === 'Absent' },
  { key: 'consistent', label: '…who had been coming 4+ weeks in a row', accent: 'var(--absent)', test: (x) => x.f.lastWeek === 'Present' && x.f.thisWeek === 'Absent' && x.f.consistent },
  { key: 'two', label: 'Missed 2 Sundays in a row', accent: 'var(--warn)', test: (x) => x.f.streak === 2 },
  { key: 'three', label: 'Missed 3 or more in a row', accent: 'var(--absent)', test: (x) => x.f.streak >= 3 },
];

/* everything dated between from and to: HQ activities, HQ and center events, every center's planned dates (no done / not done) */
export function agenda(R, from, to) {
  const cBy = Object.fromEntries(R.centers.map((c) => [c.id, c]));
  const planBy = Object.fromEntries((R.plans || []).map((p) => [p.id, p]));
  const deptBy = Object.fromEntries((R.departments || []).map((d) => [d.id, d]));
  const out = [];
  for (const a of R.activities || []) {
    const d = a.starts_on || a.due;
    if (d && d >= from && d <= to && a.status !== 'cancelled') out.push({ key: `a${a.id}`, date: d, end: a.due, title: a.title, sub: [a.kind, a.owner].filter(Boolean).join(' · '), c: a.center_id ? cBy[a.center_id] : null, type: 'hq', budget: a.budget, src: a });
  }
  for (const e of R.events || []) {
    if (e.starts_on >= from && e.starts_on <= to) out.push({ key: `e${e.id}`, date: e.starts_on, end: e.ends_on, title: e.title, sub: [e.kind, e.location].filter(Boolean).join(' · '), c: e.center_id ? cBy[e.center_id] : null, type: 'event' });
  }
  for (const i of R.items || []) {
    const p = planBy[i.plan_id];
    if (!p || i.status === 'cancelled' || i.due < from || i.due > to) continue;
    out.push({ key: `i${i.id}`, date: i.due, title: p.title + (i.label ? ` – ${i.label}` : ''), sub: [deptBy[p.department_id]?.name, i.due_kind === 'month' ? 'during the month' : i.due_kind === 'period' ? 'any time this semester' : i.due_kind === 'week' ? 'that week' : null].filter(Boolean).join(' · '), c: cBy[p.center_id ?? 1], type: 'plan', budget: i.budget });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
