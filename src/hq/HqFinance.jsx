import { useState } from 'react';
import { etLabel, toEthiopian, ET_MONTHS } from '../lib/ethiopian';
import { money, featureOn } from '../lib/config';
import { PeriodPicker, periodOf, Icon } from '../views/common';
import { CenterTag } from './HqOverview';

const cur = (c) => c?.currency || 'ETB';

/* HQ finance: each center side by side, totals per currency, centers with separate finance on their own,
   and every entry with filters (center, in / out, category, search) */
export default function HqFinance({ R, today, period, setPeriod }) {
  const P = periodOf(period);
  const years = [...new Set([toEthiopian(today).year, ...(R.ledger || []).map((l) => toEthiopian(l.entry_date).year)])];
  const [only, setOnly] = useState(null);
  const [dir, setDir] = useState('');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(R.config?.lists?.pageSize || 40);
  const inP = (d) => d && d >= P.from && d <= P.to;
  const planBy = Object.fromEntries((R.plans || []).map((p) => [p.id, p]));
  const centers = R.centers.filter((c) => featureOn(c, 'finance'));
  const cBy = Object.fromEntries(centers.map((c) => [c.id, c]));
  const ledger = (R.ledger || []).filter((l) => cBy[l.center_id ?? 1]);
  const rows = centers.map((c) => {
    const items = (R.items || []).filter((i) => inP(i.due) && i.status !== 'cancelled' && (planBy[i.plan_id]?.center_id ?? 1) === c.id);
    const led = ledger.filter((l) => (l.center_id ?? 1) === c.id && inP(l.entry_date));
    const sumOf = (d) => led.filter((l) => l.direction === d).reduce((n, l) => n + Number(l.amount || 0), 0);
    const bal = ledger.filter((l) => (l.center_id ?? 1) === c.id && l.entry_date <= P.to).reduce((n, l) => n + (l.direction === 'in' ? 1 : -1) * Number(l.amount || 0), 0);
    return { c, cur: cur(c), planned: items.reduce((n, i) => n + Number(i.budget || 0), 0), dates: items.length, received: sumOf('in'), spent: sumOf('out'), balance: bal, assets: (R.assets || []).filter((a) => (a.center_id ?? 1) === c.id).length };
  });
  const main = rows.filter((r) => !r.c.finance_separate), separate = rows.filter((r) => r.c.finance_separate);
  // totals per currency (birr centers add up; a dollar center is never added to birr)
  const totals = (list) => Object.values(list.reduce((t, r) => { const k = r.cur; t[k] ||= { cur: k, planned: 0, received: 0, spent: 0, balance: 0, n: 0 }; for (const f of ['planned', 'received', 'spent', 'balance']) t[k][f] += r[f]; t[k].n++; return t; }, {}));
  const tMain = totals(main);
  const hqBudget = (R.activities || []).filter((a) => a.status !== 'cancelled' && inP(a.starts_on || a.due)).reduce((n, a) => n + Number(a.budget || 0), 0);
  const cats = [...new Set(ledger.filter((l) => inP(l.entry_date)).map((l) => l.category).filter(Boolean))].sort();
  const entries = ledger.filter((l) => inP(l.entry_date) && (!only || (l.center_id ?? 1) === only) && (!dir || l.direction === dir) && (!cat || l.category === cat)
    && (!q || `${l.description || ''} ${l.category || ''} ${l.receipt_ref || ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const eTotals = Object.values(entries.reduce((t, l) => { const k = l.currency || cur(cBy[l.center_id ?? 1]); t[k] ||= { k, inn: 0, out: 0 }; t[k][l.direction === 'in' ? 'inn' : 'out'] += Number(l.amount || 0); return t; }, {}));
  const mk = (d) => { const e = toEthiopian(d); return `${e.year}-${String(e.month).padStart(2, '0')}`; };
  const months = [...new Set(ledger.filter((l) => inP(l.entry_date)).map((l) => mk(l.entry_date)))].sort();
  const spentIn = (c, m) => ledger.filter((l) => (l.center_id ?? 1) === c.id && l.direction === 'out' && inP(l.entry_date) && mk(l.entry_date) === m).reduce((n, l) => n + Number(l.amount || 0), 0);
  const table = (list, label) => (
    <div style={{ overflowX: 'auto' }}>
      <table className="gtable left hq-table">
        <thead><tr><th>Center</th><th>Currency</th><th>Planned budget</th><th>Planned dates</th><th>Received</th><th>Spent</th><th>Spent of plan</th><th>Balance</th><th>Items owned</th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.c.id} className={`click ${only === r.c.id ? 'sel' : ''}`} onClick={() => setOnly(only === r.c.id ? null : r.c.id)}>
              <td><CenterTag R={R} c={r.c} />{r.c.international && <span className="tiny muted"> 🌍 {r.c.country}</span>}</td><td className="small">{r.cur}</td>
              <td className="num">{money(r.planned, r.cur)}</td><td className="num">{r.dates}</td><td className="num">{money(r.received, r.cur)}</td><td className="num">{money(r.spent, r.cur)}</td>
              <td className="num">{r.planned ? <><span className="bar-inline"><span style={{ width: `${Math.min(1, r.spent / r.planned) * 100}%` }} /></span>{Math.round((r.spent / r.planned) * 100)}%</> : '–'}</td>
              <td className="num"><b style={{ color: r.balance < 0 ? 'var(--absent)' : undefined }}>{money(r.balance, r.cur, '0')}</b></td><td className="num">{r.assets}</td>
            </tr>
          ))}
          {label && totals(list).map((t) => (
            <tr key={t.cur} className="total"><td>{label}{totals(list).length > 1 ? ` · ${t.cur}` : ''}</td><td className="small">{t.cur}</td><td className="num">{money(t.planned, t.cur)}</td><td /><td className="num">{money(t.received, t.cur)}</td><td className="num">{money(t.spent, t.cur)}</td><td /><td className="num">{money(t.balance, t.cur, '0')}</td><td /></tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page hq-page">
      <div className="page-head"><div><h1 className="page-title">Finance</h1><p className="page-sub">Each center’s planned budget and money in and out, in its own currency. Centers record their own entries; this page only reads them.</p></div></div>
      <div className="period-float hq-period static">
        <PeriodPicker value={period} onChange={setPeriod} years={years} />
        <b className="pf-now">{P.label}</b>
      </div>
      <section className="kpis hq-mini">
        {tMain.map((t) => <div key={`r${t.cur}`} className="kpi"><span className="kpi-label">Received{tMain.length > 1 ? ` · ${t.cur}` : ''}</span><span className="kpi-val small-val">{money(t.received, t.cur, '0')}</span><span className="kpi-foot">{t.n} center{t.n > 1 ? 's' : ''}</span></div>)}
        {tMain.map((t) => <div key={`s${t.cur}`} className="kpi"><span className="kpi-label">Spent{tMain.length > 1 ? ` · ${t.cur}` : ''}</span><span className="kpi-val small-val">{money(t.spent, t.cur, '0')}</span><span className="kpi-foot">{t.planned ? `${Math.round((t.spent / t.planned) * 100)}% of ${money(t.planned, t.cur)} planned` : 'no planned budget'}</span></div>)}
        <div className="kpi"><span className="kpi-label">HQ plans</span><span className="kpi-val small-val">{money(hqBudget, 'ETB', '0')}</span><span className="kpi-foot">budget of HQ’s own plans</span></div>
        {separate.length > 0 && <div className="kpi"><span className="kpi-label">Followed separately</span><span className="kpi-val small-val">{separate.length}</span><span className="kpi-foot">{separate.map((r) => r.c.name).join(', ')}</span></div>}
      </section>
      <section className="card flush">
        <div className="card-head pad"><div><div className="card-title">Side by side · {P.label}</div><div className="card-sub">Balance = everything in minus everything out up to the end of the period. Tap a center to filter the entries below.</div></div></div>
        {table(main, 'All centers')}
      </section>
      {separate.length > 0 && (
        <section className="card flush">
          <div className="card-head pad"><div><div className="card-title">Followed separately</div><div className="card-sub">International or separately-run centers – kept out of the totals above (set on Settings → Centers).</div></div></div>
          {table(separate, 'Separate centers')}
        </section>
      )}
      {months.length > 0 && (
        <section className="card flush">
          <div className="card-head pad"><div><div className="card-title">Spent month by month</div></div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable hq-table">
              <thead><tr><th>Center</th>{months.map((m) => <th key={m}>{ET_MONTHS[Number(m.slice(5))].slice(0, 3)}</th>)}</tr></thead>
              <tbody>{centers.map((c) => <tr key={c.id}><td><b>{c.name}</b> <span className="tiny muted">{cur(c)}</span></td>{months.map((m) => { const v = spentIn(c, m); return <td key={m} className="num">{v ? v.toLocaleString('en-US') : <span className="faint">–</span>}</td>; })}</tr>)}</tbody>
            </table>
          </div>
        </section>
      )}
      <section className="card flush">
        <div className="card-head pad"><div><div className="card-title">Entries · {only ? cBy[only]?.name : 'all centers'}</div>
          <div className="card-sub">{entries.length} in {P.label}{eTotals.length ? ' · ' + eTotals.map((t) => `in ${money(t.inn, t.k, '0')}, out ${money(t.out, t.k, '0')}`).join(' · ') : ''}</div></div></div>
        <div className="fin-filters pad">
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            <button className={`chipbtn ${!only ? 'on' : ''}`} onClick={() => setOnly(null)}>All centers</button>
            {centers.map((c) => <button key={c.id} className={`chipbtn ${only === c.id ? 'on' : ''}`} onClick={() => setOnly(only === c.id ? null : c.id)}>{c.name}</button>)}
          </div>
          <div className="seg"><button className={!dir ? 'on' : ''} onClick={() => setDir('')}>All</button><button className={dir === 'in' ? 'on' : ''} onClick={() => setDir('in')}>In</button><button className={dir === 'out' ? 'on' : ''} onClick={() => setDir('out')}>Out</button></div>
          <select className="small-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">Every category</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <label className="search grow"><Icon.search width="16" height="16" /><input placeholder="Search description or receipt" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left hq-table">
            <thead><tr><th>Date</th><th>Center</th><th>In / out</th><th>Amount</th><th>Category</th><th>Description</th></tr></thead>
            <tbody>
              {entries.slice(0, limit).map((l) => { const c = cBy[l.center_id ?? 1]; return (
                <tr key={l.id}><td className="small">{etLabel(l.entry_date, true)}</td><td>{c && <CenterTag R={R} c={c} />}</td>
                  <td>{l.direction === 'in' ? <span className="tag ok">In</span> : <span className="tag bad">Out</span>}</td><td className="num">{money(l.amount, l.currency || cur(c), '0')}</td><td className="small">{l.category}</td><td className="small am">{l.description}</td></tr>
              ); })}
              {entries.length === 0 && <tr><td colSpan={6} className="muted small">No entries match.</td></tr>}
            </tbody>
          </table>
        </div>
        {entries.length > limit && <div className="pad" style={{ paddingBottom: 12 }}><button className="btn ghost small" onClick={() => setLimit(limit + (R.config?.lists?.pageSize || 40))}>Show more ({entries.length - limit} left)</button></div>}
      </section>
    </div>
  );
}
