import { useMemo, useState } from 'react';
import { semesterOf, semNo, semYear, toEthiopian } from '../lib/ethiopian';
import { pct } from '../lib/stats';
import { tally, itemsIn, scoreClass, hqSupport, hoursText } from '../lib/performance';
import { money, featureOn } from '../lib/config';
import { toExcel } from '../lib/exports';
import { PeriodPicker, periodOf, Icon } from '../views/common';
import Performance from '../views/Performance';
import { CenterTag } from './HqOverview';

/* HQ: how every center is doing on its plans, its departments side by side, and how quickly HQ helps each center */
export default function HqPerformance({ R, C, today }) {
  const [period, setPeriod] = useState(() => ({ kind: 'sem', no: semNo(semesterOf(today)), year: semYear(semesterOf(today)) }));
  const [open, setOpen] = useState(null);
  const P = periodOf(period);
  const rows = useMemo(() => C.filter((x) => featureOn(x.c, 'plans')).map((x) => {
    const items = itemsIn(x.D, P.from, P.to);
    return { x, items, t: tally(items, today), help: hqSupport(R, x.c.id, P.from, P.to, today) };
  }).sort((a, b) => (b.t.achievement ?? -1) - (a.t.achievement ?? -1)), [C, R, P.from, P.to, today]);
  const all = tally(rows.flatMap((r) => r.items), today);
  // departments by name across centers (each center has its own list; matching names line up)
  const depts = [...new Set(rows.flatMap((r) => r.x.D.departments.filter((d) => r.items.some((i) => i.plan.department_id === d.id)).map((d) => d.name)))].sort();
  const cell = (r, name) => { const d = r.x.D.departments.find((y) => y.name === name); return d ? tally(r.items.filter((i) => i.plan.department_id === d.id), today) : null; };
  const helpAll = rows.reduce((t, r) => ({ asks: t.asks + r.help.asks, answered: t.answered + r.help.answered, waiting: t.waiting + r.help.waiting, hqDue: t.hqDue + r.help.hqDue, hqDone: t.hqDone + r.help.hqDone }), { asks: 0, answered: 0, waiting: 0, hqDue: 0, hqDone: 0 });
  const avgH = (() => { const a = rows.filter((r) => r.help.avgHours != null); return a.length ? a.reduce((n, r) => n + r.help.avgHours * r.help.answered, 0) / a.reduce((n, r) => n + r.help.answered, 0) : null; })();
  const S = ({ v }) => <b className={`score ${scoreClass(v)}`}>{pct(v)}</b>;
  const Bar = ({ t }) => <span className="perf-bar"><i className="ontime" style={{ flex: t.ontime }} /><i className="late" style={{ flex: t.late }} /><i className="notdone" style={{ flex: t.notdone + t.overdue }} /><i className="upcoming" style={{ flex: t.upcoming + t.postponed }} /></span>;
  const years = [...new Set([toEthiopian(today).year, ...(R.items || []).map((i) => toEthiopian(i.due).year)])];
  const exportIt = () => toExcel({ title: `Gaius – plan achievement by center, ${P.label}`, file: `Gaius_center_performance_${P.label.replace(/\W+/g, '_')}`, sub: `Achievement ${pct(all.achievement)} · on time ${pct(all.onTimeRate)}`, sheets: [
    { name: 'Centers', head: ['Center', 'Activities', 'Due so far', 'Done', 'On time', 'Not done', 'Postponed', 'Achievement %', 'On time %', 'Budget', 'Messages from center', 'Answered', 'Average reply', 'Waiting', 'HQ plans due', 'HQ plans done'],
      body: rows.map(({ x, t, help: h }) => [x.c.name, t.total, t.due, t.done, t.ontime, t.notdone + t.overdue, t.postponed, t.achievement != null ? Math.round(t.achievement * 100) : '', t.onTimeRate != null ? Math.round(t.onTimeRate * 100) : '', t.budget, h.asks, h.answered, hoursText(h.avgHours), h.waiting, h.hqDue, h.hqDone]) },
    { name: 'Departments', head: ['Department', ...rows.map((r) => r.x.c.name)], body: depts.map((n) => [n, ...rows.map((r) => { const t = cell(r, n); return t?.achievement != null ? Math.round(t.achievement * 100) : ''; })]) },
  ] });
  const ox = open && rows.find((r) => r.x.c.id === open);

  return (
    <div className="perf">
      <div className="period-float hq-period static">
        <PeriodPicker value={period} onChange={setPeriod} years={years} />
        <b className="pf-now">{P.label}</b>
        <button className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={exportIt}>Excel</button>
      </div>
      <section className="kpis hq-mini">
        <div className="kpi"><span className="kpi-label">Centers’ achievement</span><span className="kpi-val"><S v={all.achievement} /></span><span className="kpi-foot">{all.done} of {all.due} due activities done</span></div>
        <div className="kpi"><span className="kpi-label">On time</span><span className="kpi-val">{pct(all.onTimeRate)}</span><span className="kpi-foot">{all.notdone + all.overdue} not done · {all.postponed} postponed</span></div>
        <div className="kpi"><span className="kpi-label">HQ replies</span><span className="kpi-val small-val">{hoursText(avgH)}</span><span className="kpi-foot">average · {helpAll.waiting} message{helpAll.waiting === 1 ? '' : 's'} waiting</span></div>
        <div className="kpi"><span className="kpi-label">HQ’s plans for centers</span><span className="kpi-val">{helpAll.hqDue ? pct(helpAll.hqDone / helpAll.hqDue) : '–'}</span><span className="kpi-foot">{helpAll.hqDone} of {helpAll.hqDue} due were done</span></div>
      </section>
      <section className="card flush">
        <div className="card-head pad"><div><div className="card-title">Centers · plan achievement</div><div className="card-sub">Best first. Tap a center for its departments, responsible people and each activity.</div></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left hq-table perf-table">
            <thead><tr><th>Center</th><th>Progress</th><th className="num">Achievement</th><th className="num">On time</th><th className="num">Done / due</th><th className="num">Not done</th><th className="num">Postponed</th><th className="num">Coming up</th><th className="num">Budget</th></tr></thead>
            <tbody>
              {rows.map(({ x, t }, k) => (
                <tr key={x.c.id} className={`click ${open === x.c.id ? 'sel' : ''}`} onClick={() => setOpen(open === x.c.id ? null : x.c.id)}>
                  <td><span className="rank-pos">{k + 1}</span> <CenterTag R={R} c={x.c} /></td><td style={{ minWidth: 140 }}><Bar t={t} /></td>
                  <td className="num"><S v={t.achievement} /></td><td className="num">{pct(t.onTimeRate)}</td><td className="num">{t.done}/{t.due}</td><td className="num">{t.notdone + t.overdue || '–'}{t.needReason ? <small className="muted"> ({t.needReason} no reason)</small> : null}</td>
                  <td className="num">{t.postponed || '–'}</td><td className="num">{t.upcoming || '–'}</td><td className="num">{money(t.budget, x.c.currency || 'ETB')}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="muted small">No centers with plans.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {ox && (
        <section className="card">
          <div className="card-head"><div><div className="card-title">{ox.x.c.name} · plan achievement</div><div className="card-sub">The center’s own report, as its leaders see it.</div></div><button className="icon-btn" onClick={() => setOpen(null)} aria-label="Close"><Icon.x /></button></div>
          <Performance D={ox.x.D} today={today} R={R} embedded />
        </section>
      )}
      {depts.length > 0 && (
        <section className="card flush">
          <div className="card-head pad"><div><div className="card-title">Departments across centers</div><div className="card-sub">Achievement of each department (by name) in each center.</div></div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable heat">
              <thead><tr><th>Department</th>{rows.map((r) => <th key={r.x.c.id}>{r.x.c.name}</th>)}</tr></thead>
              <tbody>{depts.map((n) => (
                <tr key={n}><td><b>{n}</b></td>{rows.map((r) => { const t = cell(r, n); const v = t?.achievement; return <td key={r.x.c.id} className="num" style={v != null ? { background: `color-mix(in srgb, ${v >= 0.8 ? 'var(--present)' : v >= 0.5 ? 'var(--warn)' : 'var(--absent)'} 22%, white)` } : undefined}>{v != null ? pct(v) : t?.total ? <span className="faint">{t.upcoming} to come</span> : <span className="faint">–</span>}</td>; })}</tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
      <section className="card flush">
        <div className="card-head pad"><div><div className="card-title">Timely help from HQ</div><div className="card-sub">How fast HQ answers each center’s messages, and whether HQ’s own plans for that center (visits, trainings…) happened.</div></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left hq-table">
            <thead><tr><th>Center</th><th className="num">Messages from the center</th><th className="num">Answered</th><th className="num">Average reply</th><th className="num">Waiting now</th><th className="num">HQ plans for it</th><th className="num">Done / due</th></tr></thead>
            <tbody>{rows.map(({ x, help: h }) => (
              <tr key={x.c.id}><td><CenterTag R={R} c={x.c} /></td><td className="num">{h.asks}</td><td className="num">{h.answered}</td>
                <td className="num"><b className={`score ${h.avgHours == null ? '' : h.avgHours <= 24 ? 'good' : h.avgHours <= 72 ? 'mid' : 'low'}`}>{hoursText(h.avgHours)}</b></td>
                <td className="num">{h.waiting ? <span className="tag bad">{h.waiting}{h.oldestWait != null ? ` · ${h.oldestWait} d` : ''}</span> : '–'}</td>
                <td className="num">{h.hqPlans || '–'}</td><td className="num">{h.hqDue ? <><b className={`score ${scoreClass(h.hqDone / h.hqDue)}`}>{h.hqDone}/{h.hqDue}</b></> : '–'}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="tiny muted pad" style={{ padding: 12 }}>Reply time = from a center’s message to HQ’s next answer to that center. Green within a day, amber within 3 days.</p>
      </section>
    </div>
  );
}
