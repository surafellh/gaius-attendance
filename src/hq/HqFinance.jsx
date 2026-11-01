import { useState } from 'react';
import { etLabel, toEthiopian, ET_MONTHS } from '../lib/ethiopian';
import { birr } from '../lib/plans';
import { PeriodPicker, periodOf } from '../views/common';
import { CenterTag } from './HqOverview';

/* HQ finance: every center's planned budget, money in and out, side by side; then the entries themselves */
export default function HqFinance({ R, C, today, period, setPeriod }) {
  const P = periodOf(period);
  const years = [...new Set([toEthiopian(today).year, ...(R.ledger || []).map((l) => toEthiopian(l.entry_date).year), ...C.flatMap((x) => x.idx.held.map((s) => toEthiopian(s).year))])].sort((a, b) => b - a);
  const [only, setOnly] = useState(null);
  const inP = (d) => d && d >= P.from && d <= P.to;
  const planBy = Object.fromEntries((R.plans || []).map((p) => [p.id, p]));
  const rows = R.centers.map((c) => {
    const items = (R.items || []).filter((i) => inP(i.due) && i.status !== 'cancelled' && (planBy[i.plan_id]?.center_id ?? 1) === c.id);
    const led = (R.ledger || []).filter((l) => (l.center_id ?? 1) === c.id && inP(l.entry_date));
    const sumOf = (dir) => led.filter((l) => l.direction === dir).reduce((n, l) => n + Number(l.amount || 0), 0);
    const allLed = (R.ledger || []).filter((l) => (l.center_id ?? 1) === c.id && l.entry_date <= P.to);
    const bal = allLed.reduce((n, l) => n + (l.direction === 'in' ? 1 : -1) * Number(l.amount || 0), 0);
    return { c, planned: items.reduce((n, i) => n + Number(i.budget || 0), 0), dates: items.length, received: sumOf('in'), spent: sumOf('out'), balance: bal, assets: (R.assets || []).filter((a) => (a.center_id ?? 1) === c.id).length };
  });
  const tot = (k) => rows.reduce((n, r) => n + r[k], 0);
  const hqBudget = (R.activities || []).filter((a) => a.status !== 'cancelled' && inP(a.starts_on || a.due)).reduce((n, a) => n + Number(a.budget || 0), 0);
  const entries = (R.ledger || []).filter((l) => inP(l.entry_date) && (!only || (l.center_id ?? 1) === only)).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const cBy = Object.fromEntries(R.centers.map((c) => [c.id, c]));
  const months = [...new Set((R.ledger || []).filter((l) => inP(l.entry_date)).map((l) => { const e = toEthiopian(l.entry_date); return `${e.year}-${String(e.month).padStart(2, '0')}`; }))].sort();

  return (
    <div className="page hq-page">
      <div className="page-head"><div><h1 className="page-title">Finance</h1><p className="page-sub">Each center’s planned budget and money in and out. Centers record their own entries; this page only reads them.</p></div></div>
      <div className="period-float hq-period static">
        <PeriodPicker value={period} onChange={setPeriod} years={years} />
        <b className="pf-now">{P.label}</b>
      </div>
      <section className="kpis hq-mini">
        <div className="kpi"><span className="kpi-label">Planned by centers</span><span className="kpi-val small-val">{birr(tot('planned'))}</span><span className="kpi-foot">{tot('dates')} planned dates</span></div>
        <div className="kpi"><span className="kpi-label">Received</span><span className="kpi-val small-val">{birr(tot('received'))}</span><span className="kpi-foot">money in</span></div>
        <div className="kpi"><span className="kpi-label">Spent</span><span className="kpi-val small-val">{birr(tot('spent'))}</span><span className="kpi-foot">money out</span></div>
        <div className="kpi"><span className="kpi-label">HQ plans</span><span className="kpi-val small-val">{birr(hqBudget)}</span><span className="kpi-foot">budget of HQ’s own plans</span></div>
      </section>
      <section className="card flush">
        <div className="card-head pad"><div><div className="card-title">Side by side · {P.label}</div><div className="card-sub">Balance = everything in minus everything out up to the end of the period.</div></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left hq-table">
            <thead><tr><th>Center</th><th>Planned budget</th><th>Planned dates</th><th>Received</th><th>Spent</th><th>Spent of plan</th><th>Balance</th><th>Items owned</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.c.id} className="click" onClick={() => setOnly(only === r.c.id ? null : r.c.id)}>
                  <td><CenterTag R={R} c={r.c} /></td><td className="num">{birr(r.planned)}</td><td className="num">{r.dates}</td><td className="num">{birr(r.received)}</td><td className="num">{birr(r.spent)}</td>
                  <td className="num">{r.planned ? <><span className="bar-inline"><span style={{ width: `${Math.min(1, r.spent / r.planned) * 100}%` }} /></span>{Math.round((r.spent / r.planned) * 100)}%</> : '–'}</td>
                  <td className="num"><b style={{ color: r.balance < 0 ? 'var(--absent)' : undefined }}>{birr(r.balance) === '–' ? '0' : birr(r.balance)}</b></td><td className="num">{r.assets}</td>
                </tr>
              ))}
              <tr className="total"><td>All centers</td><td className="num">{birr(tot('planned'))}</td><td className="num">{tot('dates')}</td><td className="num">{birr(tot('received'))}</td><td className="num">{birr(tot('spent'))}</td><td /><td className="num">{birr(tot('balance'))}</td><td className="num">{tot('assets')}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      {months.length > 0 && (
        <section className="card flush">
          <div className="card-head pad"><div><div className="card-title">Spent month by month</div></div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable hq-table">
              <thead><tr><th>Center</th>{months.map((m) => <th key={m}>{ET_MONTHS[Number(m.slice(5))].slice(0, 3)}</th>)}</tr></thead>
              <tbody>{R.centers.map((c) => (
                <tr key={c.id}><td><b>{c.name}</b></td>{months.map((m) => {
                  const v = (R.ledger || []).filter((l) => (l.center_id ?? 1) === c.id && l.direction === 'out' && inP(l.entry_date) && (() => { const e = toEthiopian(l.entry_date); return `${e.year}-${String(e.month).padStart(2, '0')}` === m; })()).reduce((n, l) => n + Number(l.amount || 0), 0);
                  return <td key={m} className="num">{v ? v.toLocaleString('en-US') : <span className="faint">–</span>}</td>;
                })}</tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
      <section className="card flush">
        <div className="card-head pad"><div><div className="card-title">Entries · {only ? cBy[only]?.name : 'all centers'}</div><div className="card-sub">{entries.length} in {P.label}. Tap a center above to see only its entries.</div></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left hq-table">
            <thead><tr><th>Date</th><th>Center</th><th>In / out</th><th>Amount</th><th>Category</th><th>Description</th></tr></thead>
            <tbody>
              {entries.slice(0, 200).map((l) => (
                <tr key={l.id}><td className="small">{etLabel(l.entry_date, true)}</td><td>{cBy[l.center_id ?? 1] && <CenterTag R={R} c={cBy[l.center_id ?? 1]} />}</td>
                  <td>{l.direction === 'in' ? <span className="tag ok">In</span> : <span className="tag bad">Out</span>}</td><td className="num">{Number(l.amount).toLocaleString('en-US')}</td><td className="small">{l.category}</td><td className="small am">{l.description}</td></tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={6} className="muted small">No entries in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
