import { useMemo, useState } from 'react';
import { etLabel, semesterOf, semNo, semYear, toEthiopian, ET_MONTHS } from '../lib/ethiopian';
import { pct } from '../lib/stats';
import { deptColor, deptName, birr, monthKeyOf } from '../lib/plans';
import { tally, itemsIn, resultOf, RESULT_LABEL, scoreClass, deadlineOf } from '../lib/performance';
import { toExcel, toPdf } from '../lib/exports';
import { PeriodPicker, periodOf, Icon } from './common';

/* the achievement of a center's plans: overall, by department, by responsible person, and each activity */
export default function Performance({ D, today, R, embedded }) {
  const [period, setPeriod] = useState(() => ({ kind: 'sem', no: semNo(semesterOf(today)), year: semYear(semesterOf(today)) }));
  const [view, setView] = useState('departments');
  const [dept, setDept] = useState('');
  const [res, setRes] = useState('');
  const [open, setOpen] = useState(null);
  const P = periodOf(period);
  const items = useMemo(() => itemsIn(D, P.from, P.to), [D, P.from, P.to]);
  const all = tally(items, today);
  const byDept = D.departments.map((d) => ({ d, t: tally(items.filter((i) => i.plan.department_id === d.id), today) })).filter((x) => x.t.total).sort((a, b) => (b.t.achievement ?? -1) - (a.t.achievement ?? -1));
  const respOf = (p) => (p.responsible || p.prepared_by || '').trim() || deptName(D, p.department_id);
  const byResp = [...new Set(items.map((i) => respOf(i.plan)))].map((r) => ({ r, t: tally(items.filter((i) => respOf(i.plan) === r), today) })).sort((a, b) => (b.t.achievement ?? -1) - (a.t.achievement ?? -1));
  const plans = [...new Map(items.map((i) => [i.plan_id, i.plan])).values()].filter((p) => !dept || String(p.department_id) === dept)
    .map((p) => ({ p, list: items.filter((i) => i.plan_id === p.id).sort((a, b) => a.due.localeCompare(b.due)) })).map((x) => ({ ...x, t: tally(x.list, today) }))
    .filter((x) => !res || x.list.some((i) => resultOf(i, today) === res)).sort((a, b) => (a.t.achievement ?? 2) - (b.t.achievement ?? 2));
  const months = [...new Set(items.map((i) => monthKeyOf(i.due)))].sort().map((m) => ({ m, t: tally(items.filter((i) => monthKeyOf(i.due) === m), today) }));
  const spent = (D.ledger || []).filter((l) => l.direction === 'out' && l.entry_date >= P.from && l.entry_date <= P.to).reduce((n, l) => n + Number(l.amount || 0), 0);
  const row = (t) => [t.total, t.due, t.done, t.ontime, t.late, t.notdone, t.overdue, t.postponed, t.upcoming, t.achievement != null ? Math.round(t.achievement * 100) : '', t.onTimeRate != null ? Math.round(t.onTimeRate * 100) : ''];
  const HEAD = ['Activities', 'Due so far', 'Done', 'On time', 'Late', 'Not done', 'Not marked', 'Postponed', 'Coming up', 'Achievement %', 'On time %'];
  const rep = {
    title: `Gaius ${D.center?.name || ''} – plan achievement, ${P.label}`, file: `Gaius_${D.center?.name || ''}_plan_achievement_${P.label.replace(/\W+/g, '_')}`,
    sub: `Achievement ${pct(all.achievement)} · on time ${pct(all.onTimeRate)} · ${all.done} of ${all.due} due activities done`,
    sheets: [
      { name: 'Departments', head: ['Department', ...HEAD, 'Budget'], body: [...byDept.map(({ d, t }) => [d.name, ...row(t), t.budget]), ['All departments', ...row(all), all.budget]] },
      { name: 'Responsible', head: ['Responsible', ...HEAD], body: byResp.map(({ r, t }) => [r, ...row(t)]) },
      { name: 'Activities', head: ['Department', 'Activity', 'Responsible', 'Date', 'Result', 'Done on', 'Reason / note'], body: items.sort((a, b) => a.due.localeCompare(b.due)).map((i) => [deptName(D, i.plan.department_id), i.plan.title, respOf(i.plan), etLabel(i.due, true), RESULT_LABEL[resultOf(i, today)], i.done_on ? etLabel(i.done_on, true) : '', i.reason || i.note || '']) },
      { name: 'By month', head: ['Month', ...HEAD], body: months.map(({ m, t }) => [`${ET_MONTHS[Number(m.slice(5))]} ${m.slice(0, 4)}`, ...row(t)]) },
    ],
  };
  const Bar = ({ t }) => (
    <span className="perf-bar" title={`${t.ontime} on time · ${t.late} late · ${t.notdone + t.overdue} not done · ${t.upcoming + t.postponed} still to come`}>
      <i className="ontime" style={{ flex: t.ontime }} /><i className="late" style={{ flex: t.late }} /><i className="notdone" style={{ flex: t.notdone + t.overdue }} /><i className="upcoming" style={{ flex: t.upcoming + t.postponed }} />
    </span>
  );
  const Score = ({ v }) => <b className={`score ${scoreClass(v)}`}>{pct(v)}</b>;
  const years = [...new Set((D.items || []).map((i) => toEthiopian(i.due).year))];

  return (
    <div className={embedded ? 'perf' : 'perf page'} style={{ gap: 14 }}>
      <div className="period-float static">
        <PeriodPicker value={period} onChange={setPeriod} years={years} />
        <b className="pf-now">{P.label}</b>
        <span className="row" style={{ marginLeft: 'auto' }}><button className="btn ghost small" onClick={() => toExcel(rep)}>Excel</button><button className="btn ghost small" onClick={() => toPdf(rep)}>PDF</button></span>
      </div>
      {items.length === 0 ? <div className="card empty">No planned activities in {P.label}.</div> : <>
        <section className="kpis">
          <div className="kpi hero"><span className="kpi-label">Achievement</span><span className="kpi-val">{pct(all.achievement)}</span><span className="kpi-foot">{all.done} of {all.due} activities due so far were done</span></div>
          <div className="kpi"><span className="kpi-label"><span className="dot" style={{ background: 'var(--present)' }} />On time</span><span className="kpi-val">{pct(all.onTimeRate)}</span><span className="kpi-foot">{all.ontime} on time · {all.late} late</span></div>
          <div className="kpi"><span className="kpi-label"><span className="dot" style={{ background: 'var(--absent)' }} />Not done</span><span className="kpi-val">{all.notdone + all.overdue}</span><span className="kpi-foot">{all.needReason ? `${all.needReason} without a reason` : 'all have a reason'}{all.overdue ? ` · ${all.overdue} not marked` : ''}</span></div>
          <div className="kpi"><span className="kpi-label">Postponed</span><span className="kpi-val">{all.postponed}</span><span className="kpi-foot">moved to a later date</span></div>
          <div className="kpi"><span className="kpi-label">Coming up</span><span className="kpi-val">{all.upcoming}</span><span className="kpi-foot">of {all.total} planned</span></div>
          <div className="kpi"><span className="kpi-label">Budget</span><span className="kpi-val small-val">{birr(all.budget)}</span><span className="kpi-foot">{spent ? `${birr(spent)} spent` : 'planned'}</span></div>
        </section>
        <div className="legend"><span className="lg"><i className="sw ontime" />On time</span><span className="lg"><i className="sw late" />Late</span><span className="lg"><i className="sw notdone" />Not done</span><span className="lg"><i className="sw upcoming" />Still to come</span></div>
        <div className="seg wrap">{[['departments', 'Departments'], ['activities', 'Each activity'], ['responsible', 'Responsible'], ['months', 'Month by month']].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}</div>

        {view === 'departments' && (
          <section className="card flush"><div style={{ overflowX: 'auto' }}>
            <table className="gtable left perf-table">
              <thead><tr><th>Department</th><th>Progress</th><th className="num">Achievement</th><th className="num">On time</th><th className="num">Done / due</th><th className="num">Not done</th><th className="num">Postponed</th><th className="num">Coming up</th><th className="num">Budget</th></tr></thead>
              <tbody>
                {byDept.map(({ d, t }, k) => (
                  <tr key={d.id} className="click" onClick={() => { setDept(String(d.id)); setView('activities'); }}>
                    <td><span className="rank-pos">{k + 1}</span> <span className="dot" style={{ background: deptColor(D, d.id) }} /> {d.name}</td><td style={{ minWidth: 140 }}><Bar t={t} /></td>
                    <td className="num"><Score v={t.achievement} /></td><td className="num">{pct(t.onTimeRate)}</td><td className="num">{t.done}/{t.due}</td><td className="num">{t.notdone + t.overdue || '–'}</td><td className="num">{t.postponed || '–'}</td><td className="num">{t.upcoming || '–'}</td><td className="num">{birr(t.budget)}</td>
                  </tr>
                ))}
                <tr className="total"><td>{D.center?.name || 'Center'} · all departments</td><td><Bar t={all} /></td><td className="num"><Score v={all.achievement} /></td><td className="num">{pct(all.onTimeRate)}</td><td className="num">{all.done}/{all.due}</td><td className="num">{all.notdone + all.overdue}</td><td className="num">{all.postponed}</td><td className="num">{all.upcoming}</td><td className="num">{birr(all.budget)}</td></tr>
              </tbody>
            </table>
          </div><p className="tiny muted pad" style={{ padding: 12 }}>Achievement = done ÷ activities whose date has passed (including ones nobody marked). Tap a department for its activities.</p></section>
        )}

        {view === 'responsible' && (
          <section className="card flush"><div style={{ overflowX: 'auto' }}>
            <table className="gtable left perf-table">
              <thead><tr><th>Responsible</th><th>Progress</th><th className="num">Achievement</th><th className="num">On time</th><th className="num">Done / due</th><th className="num">Not done</th><th className="num">Coming up</th></tr></thead>
              <tbody>{byResp.map(({ r, t }) => (
                <tr key={r}><td className="am">{r}</td><td style={{ minWidth: 140 }}><Bar t={t} /></td><td className="num"><Score v={t.achievement} /></td><td className="num">{pct(t.onTimeRate)}</td><td className="num">{t.done}/{t.due}</td><td className="num">{t.notdone + t.overdue || '–'}</td><td className="num">{t.upcoming || '–'}</td></tr>
              ))}</tbody>
            </table>
          </div><p className="tiny muted" style={{ padding: 12 }}>From “Responsible” in the semester plan upload (or who prepared it, else the department).</p></section>
        )}

        {view === 'activities' && (
          <section className="card flush">
            <div className="fin-filters pad" style={{ paddingTop: 12 }}>
              <select className="small-select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">Every department</option>{byDept.map(({ d }) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              <select className="small-select" value={res} onChange={(e) => setRes(e.target.value)} aria-label="Result"><option value="">Every result</option>{Object.entries(RESULT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <span className="tiny muted">{plans.length} activities · lowest achievement first</span>
            </div>
            <div className="card-scroll" style={{ maxHeight: 620 }}>
              <table className="gtable left perf-table">
                <thead><tr><th>Activity</th><th>Department</th><th>Progress</th><th className="num">Achievement</th><th className="num">Done / due</th><th /></tr></thead>
                <tbody>{plans.map(({ p, list, t }) => [
                  <tr key={p.id} className="click" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    <td className="am"><b>{p.title}</b>{(p.responsible || p.prepared_by) && <small className="muted" style={{ display: 'block' }}>{p.responsible || p.prepared_by}</small>}</td>
                    <td className="small"><span className="dot" style={{ background: deptColor(D, p.department_id) }} /> {deptName(D, p.department_id)}</td>
                    <td style={{ minWidth: 120 }}><Bar t={t} /></td><td className="num"><Score v={t.achievement} /></td><td className="num">{t.done}/{t.due}{t.upcoming ? <small className="muted"> +{t.upcoming}</small> : null}</td>
                    <td><Icon.down width="14" height="14" style={{ transform: open === p.id ? 'rotate(180deg)' : '' }} /></td>
                  </tr>,
                  open === p.id && <tr key={`${p.id}-x`} className="perf-items"><td colSpan={6}>
                    <ul>{list.map((i) => { const r = resultOf(i, today); return (
                      <li key={i.id}><span className={`res ${r}`}>{RESULT_LABEL[r]}</span> {etLabel(i.due)}{i.due_kind === 'month' ? ' (during the month)' : ''}{i.done_on ? ` · done ${etLabel(i.done_on)}` : ''}{r === 'late' ? ` · deadline ${etLabel(deadlineOf(i))}` : ''}{i.moved_from ? ` · moved from ${etLabel(i.moved_from)}` : ''}{(i.reason || i.note) ? <span className="am muted"> · {i.reason || i.note}</span> : null}</li>
                    ); })}</ul>
                  </td></tr>,
                ])}</tbody>
              </table>
            </div>
          </section>
        )}

        {view === 'months' && (
          <section className="card flush"><div style={{ overflowX: 'auto' }}>
            <table className="gtable left perf-table">
              <thead><tr><th>Month</th><th>Progress</th><th className="num">Achievement</th><th className="num">On time</th><th className="num">Done / due</th><th className="num">Planned</th></tr></thead>
              <tbody>{months.map(({ m, t }) => (
                <tr key={m}><td>{ET_MONTHS[Number(m.slice(5))]} {m.slice(0, 4)}</td><td style={{ minWidth: 160 }}><Bar t={t} /></td><td className="num"><Score v={t.achievement} /></td><td className="num">{pct(t.onTimeRate)}</td><td className="num">{t.done}/{t.due}</td><td className="num">{t.total}</td></tr>
              ))}</tbody>
            </table>
          </div></section>
        )}
      </>}
    </div>
  );
}
