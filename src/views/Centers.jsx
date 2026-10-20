import { useMemo, useState } from 'react';
import { etLabel, semesterOf, semName, semesterStart, semesterEnd, SEMESTERS, fmtGreg } from '../lib/ethiopian';
import { pct, weekSummary } from '../lib/stats';
import { effStatus } from '../lib/plans';
import { toExcel, toPdf } from '../lib/exports';
import { StackedBars, RateLines } from './Charts';
import { Icon } from './common';

const COLORS = ['#7ab52c', '#2a78d6', '#eb6834', '#8a5cd6', '#e0a100', '#0f9bb5', '#d6457a'];
const birr = (n) => (n ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '–');

/* every center's numbers for one semester */
function centerStats(R, c, sem, today) {
  const from = semesterStart(sem), to = semesterEnd(sem);
  const people = R.people.filter((p) => (p.center_id ?? 1) === c.id && !p.archived);
  const pid = new Set(people.map((p) => p.id));
  const by = {};
  for (const r of R.att) if (pid.has(r.person_id)) (by[r.sunday] ||= []).push(r);
  const held = Object.keys(by).filter((s) => s >= from && s <= to && s <= today && by[s].some((r) => r.status === 'Present')).sort();
  const sums = Object.fromEntries(held.map((s) => [s, weekSummary(by[s])]));
  const last = held[held.length - 1];
  const avg = held.length ? held.reduce((n, s) => n + sums[s].present, 0) / held.length : null;
  const rates = held.map((s) => sums[s].rate).filter((v) => v != null);
  const planIds = new Set((R.plans || []).filter((p) => (p.center_id ?? 1) === c.id && p.semester === sem).map((p) => p.id));
  const items = (R.items || []).filter((i) => planIds.has(i.plan_id));
  const st = (i) => effStatus(i, today);
  const due = items.filter((i) => st(i) !== 'planned' || i.due <= today);
  const ledger = (R.ledger || []).filter((l) => (l.center_id ?? 1) === c.id && l.entry_date >= from && l.entry_date <= to);
  const unread = (R.messages || []).filter((m) => m.center_id === c.id && !m.from_hq && !(R.reads || []).some((x) => x.message_id === m.id)).length;
  return {
    c, held, sums, last, w: last ? sums[last] : null, avg, rate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    leaders: people.filter((p) => p.category === 'Leader').length, members: people.filter((p) => p.category === 'Member').length,
    ncs: people.filter((p) => p.category === 'New Comer' && p.nc_active).length,
    firstTimers: people.filter((p) => p.week_joined && p.week_joined >= from && p.week_joined <= to).length,
    plans: planIds.size, items: items.length, done: items.filter((i) => st(i) === 'done').length, notDone: items.filter((i) => st(i) === 'not_done').length, due: due.length,
    budget: items.reduce((n, i) => n + Number(i.budget || 0), 0),
    spent: ledger.filter((l) => l.direction === 'out').reduce((n, l) => n + Number(l.amount || 0), 0),
    received: ledger.filter((l) => l.direction === 'in').reduce((n, l) => n + Number(l.amount || 0), 0), unread,
  };
}

/* HQ, director and founder: how every center is doing, one overall dashboard and a card per center */
export default function Centers({ R, today, setCenter }) {
  const [sem, setSem] = useState(semesterOf(today));
  const [hidden, setHidden] = useState(() => new Set());
  const sems = SEMESTERS.filter((s) => semesterStart(s) <= today).reverse();
  const rows = useMemo(() => R.centers.map((c) => centerStats(R, c, sem, today)), [R, sem, today]);
  const colorOf = Object.fromEntries(R.centers.map((c, i) => [c.id, COLORS[i % COLORS.length]]));
  const sundays = [...new Set(rows.flatMap((r) => r.held))].sort();
  const weeks = sundays.map((s) => ({ sunday: s, values: Object.fromEntries(rows.map((r) => [r.c.id, r.sums[s]?.present || 0])) }));
  const rateWeeks = sundays.map((s) => ({ sunday: s, values: Object.fromEntries(rows.filter((r) => r.sums[s]?.rate != null).map((r) => [r.c.id, r.sums[s].rate])) }));
  const tot = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const lastAll = sundays[sundays.length - 1];
  const presentLast = rows.reduce((n, r) => n + (r.sums[lastAll]?.present || 0), 0);
  const withData = rows.filter((r) => r.held.length);
  const avgAll = withData.reduce((n, r) => n + (r.avg || 0), 0);
  const doneRate = tot('due') ? tot('done') / tot('due') : null;

  const report = () => ({
    title: `Gaius – all centers, ${semName(sem)}`, file: `Gaius_all_centers_${sem.replace(' ', '_')}`, sub: `${etLabel(semesterStart(sem), true)} – ${etLabel(lastAll || semesterEnd(sem), true)}`,
    sheets: [
      { name: 'By center', head: ['Center', 'Sundays', 'Average present', 'Last Sunday', 'Leaders & members rate', 'Leaders', 'Members', 'Active new comers', 'First-time visitors', 'Plans done / due', 'Not done', 'Budget planned', 'Spent', 'Received'],
        body: [...rows.map((r) => [r.c.name, r.held.length, r.avg != null ? Math.round(r.avg * 10) / 10 : '', r.w ? `${r.w.present} (${etLabel(r.last)})` : '', pct(r.rate), r.leaders, r.members, r.ncs, r.firstTimers, `${r.done}/${r.due}`, r.notDone, r.budget, r.spent, r.received]),
          ['All centers', '', Math.round(avgAll * 10) / 10, presentLast, '', tot('leaders'), tot('members'), tot('ncs'), tot('firstTimers'), `${tot('done')}/${tot('due')}`, tot('notDone'), tot('budget'), tot('spent'), tot('received')]] },
      { name: 'Each Sunday', head: ['Sunday', 'Date', ...rows.map((r) => r.c.name), 'Total'], body: weeks.map((w) => [etLabel(w.sunday), fmtGreg(w.sunday), ...rows.map((r) => (r.sums[w.sunday] ? r.sums[w.sunday].present : '')), rows.reduce((n, r) => n + (r.sums[w.sunday]?.present || 0), 0)]) },
    ],
  });

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">All centers</h1><p className="page-sub">How the ministry is doing overall, then each center. Open a center to see its own pages.</p></div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <select className="small-select" value={sem} onChange={(e) => setSem(e.target.value)} aria-label="Semester">{sems.map((s) => <option key={s} value={s}>{semName(s)}</option>)}</select>
          <button className="btn ghost small" onClick={() => toExcel(report())}><Icon.download width="16" height="16" /> Excel</button>
          <button className="btn ghost small" onClick={() => toPdf(report())}><Icon.book width="16" height="16" /> PDF</button>
        </div>
      </div>

      <div className="kpis six">
        <div className="kpi hero"><span className="kpi-label">Present last Sunday</span><b className="kpi-val">{lastAll ? presentLast : '–'}</b><span className="kpi-foot">{lastAll ? `${etLabel(lastAll)} · all centers` : 'no Sundays yet'}</span></div>
        <div className="kpi"><span className="kpi-label">Average each Sunday</span><b className="kpi-val">{withData.length ? Math.round(avgAll) : '–'}</b><span className="kpi-foot">{withData.length} of {rows.length} centers recording</span></div>
        <div className="kpi"><span className="kpi-label">Leaders &amp; members rate</span><b className="kpi-val">{pct(withData.length ? withData.reduce((n, r) => n + (r.rate || 0), 0) / withData.length : null)}</b><span className="kpi-foot">average of the centers</span></div>
        <div className="kpi"><span className="kpi-label">People</span><b className="kpi-val">{tot('leaders') + tot('members')}</b><span className="kpi-foot">{tot('leaders')} leaders · {tot('members')} members · {tot('ncs')} active new comers</span></div>
        <div className="kpi"><span className="kpi-label">Plans done so far</span><b className="kpi-val">{pct(doneRate)}</b><span className="kpi-foot">{tot('done')} of {tot('due')} due · {tot('notDone')} not done</span></div>
        <div className="kpi"><span className="kpi-label">Budget</span><b className="kpi-val">{birr(tot('budget'))}</b><span className="kpi-foot">birr planned · {birr(tot('spent'))} spent</span></div>
      </div>

      <div className="center-charts">
        <section className="card">
          <div className="card-head"><div><div className="card-title">Present each Sunday</div><div className="card-sub">Stacked by center · tap a center to hide it</div></div></div>
          {weeks.length ? <StackedBars weeks={weeks} keys={rows.map((r) => r.c.id)} labels={Object.fromEntries(rows.map((r) => [r.c.id, r.c.name]))} colors={colorOf} hidden={hidden} /> : <div className="empty">No attendance in {semName(sem)} yet.</div>}
          <div className="legend">{rows.map((r) => (
            <button key={r.c.id} className={hidden.has(r.c.id) ? 'off' : ''} onClick={() => setHidden((h) => { const n = new Set(h); n.has(r.c.id) ? n.delete(r.c.id) : n.add(r.c.id); return n; })}>
              <i className="dot" style={{ background: colorOf[r.c.id] }} />{r.c.name}
            </button>
          ))}</div>
        </section>
        <section className="card">
          <div className="card-head"><div><div className="card-title">Leaders &amp; members rate</div><div className="card-sub">Each center, each Sunday</div></div></div>
          {rateWeeks.length ? <RateLines weeks={rateWeeks} series={withData.map((r) => ({ key: r.c.id, label: r.c.name, color: colorOf[r.c.id] }))} /> : <div className="empty">No attendance yet.</div>}
        </section>
      </div>

      <section className="card flush">
        <div className="card-head" style={{ padding: '14px 16px 0' }}><div><div className="card-title">Side by side</div><div className="card-sub">{semName(sem)}</div></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left act-table">
            <thead><tr><th>Center</th><th>Average present</th><th>L+M rate</th><th>Leaders</th><th>Members</th><th>Active NC</th><th>First-time</th><th>Plans done</th><th>Budget</th><th>Spent</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.c.id} onClick={() => setCenter(r.c.id)} style={{ cursor: 'pointer' }}>
                <td><i className="dot" style={{ background: colorOf[r.c.id] }} /> <b>{r.c.name}</b></td>
                <td>{r.avg != null ? r.avg.toFixed(1) : '–'}</td><td>{pct(r.rate)}</td><td>{r.leaders}</td><td>{r.members}</td><td>{r.ncs}</td><td>{r.firstTimers}</td>
                <td>{r.due ? `${r.done}/${r.due}` : '–'}</td><td>{birr(r.budget)}</td><td>{birr(r.spent)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <div className="center-grid">
        {rows.map((x) => (
          <section key={x.c.id} className="card center-card" style={{ borderTop: `4px solid ${colorOf[x.c.id]}` }}>
            <div className="card-head" style={{ marginBottom: 6 }}>
              <div><div className="card-title">{x.c.name} <span className="am muted">{x.c.name_am}</span></div><div className="card-sub">{x.c.address || x.c.meeting_place || 'No address yet'}</div></div>
              {x.unread > 0 && <span className="tag bad">{x.unread} new message{x.unread > 1 ? 's' : ''}</span>}
            </div>
            <div className="glance">
              <div><b>{x.w ? x.w.present : '–'}</b><span>present {x.last ? `· ${etLabel(x.last)}` : ''}</span></div>
              <div><b>{x.w ? pct(x.w.rate) : '–'}</b><span>leaders & members</span></div>
              <div><b>{x.avg != null ? x.avg.toFixed(1) : '–'}</b><span>average · {x.held.length} Sundays</span></div>
              <div><b>{x.leaders}</b><span>leaders</span></div><div><b>{x.members}</b><span>members</span></div><div><b>{x.ncs}</b><span>active new comers</span></div>
              <div><b>{x.plans ? `${x.done}/${x.due}` : '–'}</b><span>plans done so far</span></div><div><b>{x.budget ? birr(x.budget) : '–'}</b><span>birr planned</span></div>
            </div>
            <button className="btn lime wide" style={{ marginTop: 12 }} onClick={() => setCenter(x.c.id)}>Open {x.c.name} <Icon.right width="16" height="16" /></button>
          </section>
        ))}
      </div>
    </div>
  );
}
