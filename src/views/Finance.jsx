import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, todayIso, semesterOf, semName, semesterStart, semesterEnd, WEEKDAYS, semNo, semYear, toEthiopian, ET_MONTHS } from '../lib/ethiopian';
import { money, curOf } from '../lib/config';
import { deptName, deptColor, semesterItems, itemWhen, birr, curLabel } from '../lib/plans';
import { toExcel, toPdf } from '../lib/exports';
import { Icon, PeriodPicker, periodOf } from './common';
import Grid from './Grid';
import { recordUpdate, recordInsert, recordDelete } from '../lib/undo';

/* save / add / remove helpers for a spreadsheet table, with undo */
export function gridOps(table, extra, label, reload, setError) {
  return {
    onSave: async (r, patch) => { const before = Object.fromEntries(Object.keys(patch).map((k) => [k, r[k] ?? null])), l = label(r); const { error } = await supabase.from(table).update(patch).eq('id', r.id); if (error) return setError(`Not saved: ${error.message}`); recordUpdate(table, r.id, before, patch, l); reload(); },
    onAdd: async (row) => { const { data, error } = await supabase.from(table).insert({ ...extra(row), ...row }).select().single(); if (error) { setError(`Not saved: ${error.message}`); return false; } recordInsert(table, data, label(data)); reload(); return true; },
    onDelete: async (r0) => { const r = { ...r0 }; const { error } = await supabase.from(table).delete().eq('id', r.id); if (error) return setError(`Not deleted: ${error.message}`); recordDelete(table, r, label(r)); reload(); },
  };
}

const CONDITIONS = ['Good', 'Needs repair', 'Broken', 'Lost'];
const IN_CATS0 = ['From HQ', 'Contribution / offering', 'Fund-raising', 'Donation', 'Other'];
const OUT_CATS0 = ['Program', 'Department plan', 'Purchase', 'Transport', 'Tea & coffee', 'Rent / utilities', 'Other'];

/* Admin & Finance: center information, what the center owns, money in and out */
export default function Finance(props) {
  const [tab, setTab] = useState('info');
  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Admin &amp; finance</h1><p className="page-sub">Everything about the center itself: its details, what it owns, and the money that comes in and goes out.</p></div>
        <div className="seg">{[['info', 'Center'], ['assets', 'Assets'], ['money', 'Money in / out']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      </div>
      {tab === 'info' && <CenterInfo {...props} />}
      {tab === 'assets' && <Assets {...props} />}
      {tab === 'money' && <Money {...props} />}
    </div>
  );
}

function CenterInfo({ D, perm, reload, setError, idx, latest, summaries }) {
  const c = D.center || {};
  const [f, setF] = useState({ address: c.address || '', phone: c.phone || '', meeting_place: c.meeting_place || '', sunday_time: c.sunday_time || '', started_on: c.started_on || '', info: c.info || '' });
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setSaved(false); };
  const leaders = D.people.filter((p) => p.category === 'Leader' && !p.archived).length;
  const members = D.people.filter((p) => p.category === 'Member' && !p.archived).length;
  const ncs = D.people.filter((p) => p.category === 'New Comer' && !p.archived && p.nc_active).length;
  const sem = semesterOf(latest);
  const semHeld = idx.held.filter((s) => s >= semesterStart(sem) && s <= latest);
  const avg = semHeld.length ? semHeld.reduce((n, s) => n + summaries[s].present, 0) / semHeld.length : null;
  async function save(e) {
    e.preventDefault();
    const { error } = await supabase.from('centers').update(f).eq('id', c.id);
    if (error) return setError(`Not saved: ${error.message}`);
    setSaved(true); reload();
  }
  return (
    <div className="dash-grid">
      <section className="card">
        <div className="card-head"><div><div className="card-title">{c.name} center <span className="am muted">{c.name_am}</span></div><div className="card-sub">Shown to HQ on the All centers page.</div></div></div>
        <form className="form" onSubmit={save}>
          <div className="row2">
            <label>Address / area<input value={f.address} onChange={set('address')} disabled={!perm.manage} /></label>
            <label>Center phone<input value={f.phone} onChange={set('phone')} disabled={!perm.manage} /></label>
          </div>
          <div className="row2">
            <label>Where we meet<input value={f.meeting_place} onChange={set('meeting_place')} disabled={!perm.manage} placeholder="e.g. church hall, 2nd floor" /></label>
            <label>Sunday program time<input value={f.sunday_time} onChange={set('sunday_time')} disabled={!perm.manage} placeholder="e.g. 10:30 – 12:30" /></label>
          </div>
          <label>Started<input value={f.started_on} onChange={set('started_on')} disabled={!perm.manage} placeholder="e.g. Meskerem 2012" /></label>
          <label>About the center<textarea rows={4} value={f.info} onChange={set('info')} disabled={!perm.manage} placeholder="Vision, partners, anything HQ should know" /></label>
          {perm.manage && <button className="btn lime">{saved ? 'Saved ✓' : 'Save center details'}</button>}
          <p className="tiny muted" style={{ margin: 0 }}>Leaders’ meeting: {WEEKDAYS[c.meeting_weekday ?? 3]} {c.meeting_time || ''} (change under Users &amp; access).</p>
        </form>
      </section>
      <section className="card">
        <div className="card-head"><div><div className="card-title">At a glance</div><div className="card-sub">{semName(sem)}</div></div></div>
        <div className="glance">
          <div><b>{leaders}</b><span>leaders</span></div><div><b>{members}</b><span>members</span></div><div><b>{ncs}</b><span>active new comers</span></div>
          <div><b>{avg != null ? avg.toFixed(1) : '–'}</b><span>average present</span></div><div><b>{D.departments.length}</b><span>departments</span></div><div><b>{D.assets.length}</b><span>assets recorded</span></div>
        </div>
      </section>
    </div>
  );
}

function Assets({ D, perm, reload, setError }) {
  const [q, setQ] = useState('');
  const list = D.assets.filter((a) => !q || [a.name, a.category, a.location].some((v) => (v || '').toLowerCase().includes(q.toLowerCase()))).sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  const value = list.reduce((n, a) => n + Number(a.value || 0) * (Number(a.quantity) || 1), 0);
  const rep = { title: `Gaius ${D.center?.name} – assets`, file: `Gaius_${D.center?.name}_assets`, sub: `${list.length} items · ${birr(value)}`,
    sheets: [{ name: 'Assets', head: ['Item', 'Category', 'Qty', 'Condition', 'Where', 'Source', 'Since', 'Value each', 'Notes'], body: list.map((a) => [a.name, a.category || '', a.quantity, a.condition || '', a.location || '', a.source || '', a.acquired_on ? etLabel(a.acquired_on, true) : '', a.value || '', a.notes || '']) }] };
  return (
    <section className="card">
      <div className="card-head">
        <div><div className="card-title">What the center owns ({list.length})</div><div className="card-sub">For the property count HQ asks for. Total value {birr(value)}.</div></div>
        <div className="row">
          <button className="btn ghost small" onClick={() => toExcel(rep)}>Excel</button><button className="btn ghost small" onClick={() => toPdf(rep)}>PDF</button>
        </div>
      </div>
      <label className="search" style={{ marginBottom: 10 }}><Icon.search /><input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <Grid canEdit={perm.manage} rows={list} empty="Nothing recorded yet." addLabel="Add item" {...gridOps('assets', () => ({ center_id: D.center?.id || 1 }), (r) => `asset “${r.name}”`, reload, setError)}
        columns={[
          { key: 'name', label: 'Item', required: true, width: 190 },
          { key: 'category', label: 'Category', width: 130 },
          { key: 'quantity', label: 'Qty', type: 'number', width: 70 },
          { key: 'condition', label: 'Condition', type: 'select', options: CONDITIONS.map((c) => [c, c]), width: 130 },
          { key: 'location', label: 'Where', width: 130 },
          { key: 'source', label: 'Source', width: 110 },
          { key: 'acquired_on', label: 'Since', type: 'date', width: 150 },
          { key: 'value', label: 'Value each', type: 'number', width: 100 },
          { key: 'notes', label: 'Notes', width: 180 },
        ]} />
    </section>
  );
}
function Money({ D, today, perm, reload, setError, config }) {
  const IN_CATS = config?.finance?.inCats || IN_CATS0, OUT_CATS = config?.finance?.outCats || OUT_CATS0;
  const [period, setPeriod] = useState(() => ({ kind: 'sem', no: semNo(semesterOf(today)), year: semYear(semesterOf(today)) }));
  const [dir, setDir] = useState('');
  const [cat, setCat] = useState('');
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const P = periodOf(period);
  const cur = curOf(D.center);
  const inP = D.ledger.filter((x) => x.entry_date >= P.from && x.entry_date <= P.to);
  const list = inP.filter((x) => (!dir || x.direction === dir) && (!cat || (x.category || '') === cat) && (!dept || String(x.department_id || '') === dept)
    && (!q || `${x.description || ''} ${x.receipt_ref || ''} ${x.category || ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id);
  const sumOf = (rows, d) => rows.filter((x) => x.direction === d).reduce((n, x) => n + Number(x.amount || 0), 0);
  const inSum = sumOf(inP, 'in'), outSum = sumOf(inP, 'out');
  const balanceAll = D.ledger.filter((x) => x.entry_date <= P.to).reduce((n, x) => n + (x.direction === 'in' ? 1 : -1) * Number(x.amount), 0);
  const sem = P.sem || semesterOf(P.to > today ? today : P.to);
  const items = useMemo(() => D.plans ? semesterItems(D, sem) : [], [D, sem]);
  const planned = items.filter((i) => i.due >= P.from && i.due <= P.to && i.status !== 'cancelled').reduce((n, i) => n + Number(i.budget || 0), 0);
  const depts = D.departments.filter((d) => items.some((i) => i.plan.department_id === d.id && Number(i.budget)) || inP.some((x) => x.department_id === d.id));
  const cats = [...new Set([...IN_CATS, ...OUT_CATS, ...inP.map((x) => x.category).filter(Boolean)])];
  const byCat = cats.map((c) => ({ c, inn: sumOf(inP.filter((x) => x.category === c), 'in'), out: sumOf(inP.filter((x) => x.category === c), 'out') })).filter((r) => r.inn || r.out).sort((a, b) => b.out + b.inn - a.out - a.inn);
  const months = [...new Set(inP.map((x) => { const e = toEthiopian(x.entry_date); return `${e.year}-${String(e.month).padStart(2, '0')}`; }))].sort();
  const monthRows = months.map((m) => { const rows = inP.filter((x) => { const e = toEthiopian(x.entry_date); return `${e.year}-${String(e.month).padStart(2, '0')}` === m; }); return { m, name: `${ET_MONTHS[Number(m.slice(5))]} ${m.slice(0, 4)}`, inn: sumOf(rows, 'in'), out: sumOf(rows, 'out') }; });
  const maxM = Math.max(1, ...monthRows.flatMap((r) => [r.inn, r.out]));
  const rep = { title: `Gaius ${D.center?.name} – money in / out, ${P.label}`, file: `Gaius_${D.center?.name}_money_${P.label.replace(/\W+/g, '_')}`, sub: `In ${birr(inSum)} · out ${birr(outSum)} · balance ${birr(inSum - outSum)}`,
    sheets: [
      { name: 'Entries', head: ['Date', 'In / out', `Amount (${curLabel()})`, 'Category', 'Department', 'Description', 'Receipt'], body: list.map((x) => [etLabel(x.entry_date, true), x.direction === 'in' ? 'In' : 'Out', Number(x.amount), x.category || '', x.department_id ? deptName(D, x.department_id) : '', x.description || '', x.receipt_ref || '']) },
      { name: 'By category', head: ['Category', 'In', 'Out'], body: byCat.map((r) => [r.c, r.inn, r.out]) },
      { name: 'By month', head: ['Month', 'In', 'Out', 'Net'], body: monthRows.map((r) => [r.name, r.inn, r.out, r.inn - r.out]) },
      { name: 'Budget vs spent', head: ['Department', 'Planned budget', 'Spent'], body: depts.map((d) => [d.name, items.filter((i) => i.plan.department_id === d.id && i.due >= P.from && i.due <= P.to).reduce((n, i) => n + Number(i.budget || 0), 0), inP.filter((x) => x.direction === 'out' && x.department_id === d.id).reduce((n, x) => n + Number(x.amount), 0)]) },
    ] };
  const years = [...new Set(D.ledger.map((x) => toEthiopian(x.entry_date).year))];
  return (
    <>
      <div className="period-float static">
        <PeriodPicker value={period} onChange={setPeriod} years={years} />
        <b className="pf-now">{P.label}</b>
        <span className="row" style={{ marginLeft: 'auto' }}><button className="btn ghost small" onClick={() => toExcel(rep)}>Excel</button><button className="btn ghost small" onClick={() => toPdf(rep)}>PDF</button></span>
      </div>
      <section className="kpis">
        <div className="kpi hero"><span className="kpi-label">Balance · end of {P.label}</span><span className="kpi-val">{money(balanceAll, cur, '0')}</span><span className="kpi-foot">everything in minus everything out</span></div>
        <div className="kpi"><span className="kpi-label">In</span><span className="kpi-val small-val">{money(inSum, cur, '0')}</span><span className="kpi-foot">{inP.filter((x) => x.direction === 'in').length} entries</span></div>
        <div className="kpi"><span className="kpi-label">Out</span><span className="kpi-val small-val">{money(outSum, cur, '0')}</span><span className="kpi-foot">{inP.filter((x) => x.direction === 'out').length} entries</span></div>
        <div className="kpi"><span className="kpi-label">Planned budget</span><span className="kpi-val small-val">{money(planned, cur, '0')}</span><span className="kpi-foot">{planned ? `${Math.round((outSum / planned) * 100)}% spent` : 'from the plans'}</span></div>
      </section>
      <div className="page" style={{ gap: 14 }}>
        <section className="card">
          <div className="card-head"><div><div className="card-title">Entries · {P.label}</div><div className="card-sub">Record money from HQ and what was spent, with the receipt number. Amounts in {curLabel()}. {list.length} of {inP.length} shown.</div></div></div>
          <div className="fin-filters">
            <div className="seg"><button className={!dir ? 'on' : ''} onClick={() => setDir('')}>All</button><button className={dir === 'in' ? 'on' : ''} onClick={() => setDir('in')}>In</button><button className={dir === 'out' ? 'on' : ''} onClick={() => setDir('out')}>Out</button></div>
            <select className="small-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">Every category</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <select className="small-select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">Every department</option>{D.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <label className="search grow"><Icon.search width="16" height="16" /><input placeholder="Search description or receipt" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          </div>
          <Grid canEdit={perm.manage} rows={list} empty={`No entries in ${P.label}.`} addLabel="Add entry" {...gridOps('ledger', () => ({ center_id: D.center?.id || 1 }), (r) => `money entry ${r.description || r.category || ''}`, reload, setError)}
            columns={[
              { key: 'entry_date', label: 'Date', type: 'date', required: true, width: 150 },
              { key: 'direction', label: 'In / out', type: 'select', required: true, options: [['in', 'In +'], ['out', 'Out −']], width: 90 },
              { key: 'amount', label: `Amount (${curLabel()})`, type: 'number', required: true, width: 110 },
              { key: 'category', label: 'Category', type: 'select', options: cats.map((c) => [c, c]), width: 150 },
              { key: 'department_id', label: 'Department', type: 'select', options: D.departments.map((d) => [d.id, d.name]), width: 150 },
              { key: 'description', label: 'Description', width: 200 },
              { key: 'receipt_ref', label: 'Receipt', width: 100 },
            ]} />
        </section>
        <div className="dash-grid">
          <section className="card">
            <div className="card-head"><div><div className="card-title">Month by month</div><div className="card-sub">In and out each Ethiopian month.</div></div></div>
            {monthRows.length === 0 ? <p className="muted small">No entries.</p> : (
              <table className="gtable left fin-months"><thead><tr><th>Month</th><th>In</th><th>Out</th><th>Net</th></tr></thead>
                <tbody>{monthRows.map((r) => (
                  <tr key={r.m}><td>{r.name}</td>
                    <td className="num"><span className="bar-inline in"><span style={{ width: `${(r.inn / maxM) * 100}%` }} /></span>{money(r.inn, cur)}</td>
                    <td className="num"><span className="bar-inline out"><span style={{ width: `${(r.out / maxM) * 100}%` }} /></span>{money(r.out, cur)}</td>
                    <td className="num"><b style={{ color: r.inn - r.out < 0 ? 'var(--absent)' : undefined }}>{money(r.inn - r.out, cur, '0')}</b></td></tr>
                ))}</tbody></table>
            )}
          </section>
          <section className="card">
            <div className="card-head"><div><div className="card-title">By category</div><div className="card-sub">Tap one to see only its entries.</div></div></div>
            {byCat.length === 0 ? <p className="muted small">No entries.</p> : (
              <table className="gtable left"><thead><tr><th>Category</th><th>In</th><th>Out</th></tr></thead>
                <tbody>{byCat.map((r) => <tr key={r.c} className="click" onClick={() => setCat(cat === r.c ? '' : r.c)} style={cat === r.c ? { background: 'var(--lime-tint)' } : undefined}><td>{r.c}</td><td className="num">{money(r.inn, cur)}</td><td className="num">{money(r.out, cur)}</td></tr>)}</tbody></table>
            )}
          </section>
          <section className="card span2">
            <div className="card-head"><div><div className="card-title">Planned budget vs spent</div><div className="card-sub">From the department plans and the “money out” entries, {P.label}.</div></div></div>
            <table className="gtable">
              <thead><tr><th>Department</th><th>Planned</th><th>Spent</th><th>Left</th></tr></thead>
              <tbody>{rep.sheets[3].body.map(([n, p, s2], k) => <tr key={n} className="click" onClick={() => setDept(dept === String(depts[k].id) ? '' : String(depts[k].id))}><td><span className="dot" style={{ background: deptColor(D, depts[k].id) }} /> {n}</td><td className="num">{money(p, cur)}</td><td className="num">{money(s2, cur)}{p && s2 > p ? <span className="tag bad" style={{ marginLeft: 4 }}>over</span> : null}</td><td className="num">{p ? money(p - s2, cur, '0') : '–'}</td></tr>)}</tbody>
            </table>
          </section>
        </div>
      </div>
    </>
  );
}
