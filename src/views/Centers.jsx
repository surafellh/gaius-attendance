import { useMemo } from 'react';
import { etLabel, semesterOf, semName, semesterStart } from '../lib/ethiopian';
import { pct, weekSummary } from '../lib/stats';
import { effStatus } from '../lib/plans';
import { Icon } from './common';

/* HQ: every center side by side. Opening one switches the whole app to that center. */
export default function Centers({ R, today, setCenter }) {
  const sem = semesterOf(today);
  const from = semesterStart(sem);
  const rows = useMemo(() => R.centers.map((c) => {
    const people = R.people.filter((p) => (p.center_id ?? 1) === c.id && !p.archived);
    const pid = new Set(people.map((p) => p.id));
    const by = {};
    for (const r of R.att) if (pid.has(r.person_id)) (by[r.sunday] ||= []).push(r);
    const held = Object.keys(by).filter((s) => by[s].some((r) => r.status === 'Present')).sort();
    const last = held[held.length - 1];
    const w = last ? weekSummary(by[last]) : null;
    const semHeld = held.filter((s) => s >= from);
    const avg = semHeld.length ? semHeld.reduce((n, s) => n + by[s].filter((r) => r.status === 'Present').length, 0) / semHeld.length : null;
    const planIds = new Set((R.plans || []).filter((p) => (p.center_id ?? 1) === c.id && p.semester === sem).map((p) => p.id));
    const items = (R.items || []).filter((i) => planIds.has(i.plan_id));
    const due = items.filter((i) => effStatus(i, today) !== 'planned');
    const done = items.filter((i) => i.status === 'done').length;
    const unread = (R.messages || []).filter((m) => m.center_id === c.id && !m.from_hq && !(R.reads || []).some((x) => x.message_id === m.id)).length;
    return {
      c, leaders: people.filter((p) => p.category === 'Leader').length, members: people.filter((p) => p.category === 'Member').length,
      ncs: people.filter((p) => p.category === 'New Comer' && p.nc_active).length, last, w, avg, semHeld: semHeld.length,
      plans: planIds.size, done, due: due.length, budget: items.reduce((n, i) => n + Number(i.budget || 0), 0), unread,
    };
  }), [R, sem, from, today]);
  return (
    <div className="page">
      <div className="page-head"><div><h1 className="page-title">All centers</h1><p className="page-sub">{semName(sem)} at a glance. Open a center to see its full pages – the whole app switches to it.</p></div></div>
      <div className="center-grid">
        {rows.map((x) => (
          <section key={x.c.id} className="card center-card">
            <div className="card-head" style={{ marginBottom: 6 }}>
              <div><div className="card-title">{x.c.name} <span className="am muted">{x.c.name_am}</span></div><div className="card-sub">{x.c.address || x.c.meeting_place || 'No address yet'}</div></div>
              {x.unread > 0 && <span className="tag bad">{x.unread} new message{x.unread > 1 ? 's' : ''}</span>}
            </div>
            <div className="glance">
              <div><b>{x.w ? x.w.present : '–'}</b><span>present {x.last ? `· ${etLabel(x.last)}` : ''}</span></div>
              <div><b>{x.w ? pct(x.w.rate) : '–'}</b><span>leaders & members</span></div>
              <div><b>{x.avg != null ? x.avg.toFixed(1) : '–'}</b><span>average · {x.semHeld} Sundays</span></div>
              <div><b>{x.leaders}</b><span>leaders</span></div><div><b>{x.members}</b><span>members</span></div><div><b>{x.ncs}</b><span>active new comers</span></div>
              <div><b>{x.plans ? `${x.done}/${x.due}` : '–'}</b><span>plans done so far</span></div><div><b>{x.budget ? x.budget.toLocaleString() : '–'}</b><span>birr planned</span></div>
            </div>
            <button className="btn lime wide" style={{ marginTop: 12 }} onClick={() => setCenter(x.c.id)}>Open {x.c.name} <Icon.right width="16" height="16" /></button>
          </section>
        ))}
      </div>
    </div>
  );
}
