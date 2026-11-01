import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, todayIso, semesterOf, semName, semesterStart, semesterEnd, WEEKDAYS, SEMESTERS } from '../lib/ethiopian';
import { deptName, deptColor, semesterItems, itemWhen, birr } from '../lib/plans';
import { toExcel, toPdf } from '../lib/exports';
import { Icon } from './common';
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
const IN_CATS = ['From HQ', 'Contribution / offering', 'Fund-raising', 'Donation', 'Other'];
const OUT_CATS = ['Program', 'Department plan', 'Purchase', 'Transport', 'Tea & coffee', 'Rent / utilities', 'Other'];

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
      <Grid canEdit={perm.mark} rows={list} empty="Nothing recorded yet." addLabel="Add item" {...gridOps('assets', () => ({ center_id: D.center?.id || 1 }), (r) => `asset “${r.name}”`, reload, setError)}
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
function Money({ D, today, perm, reload, setError }) {
  const [sem, setSem] = useState(semesterOf(today));
  const from = semesterStart(sem), to = semesterEnd(sem);
  const list = D.ledger.filter((x) => x.entry_date >= from && x.entry_date <= to).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const inSum = list.filter((x) => x.direction === 'in').reduce((n, x) => n + Number(x.amount), 0);
  const outSum = list.filter((x) => x.direction === 'out').reduce((n, x) => n + Number(x.amount), 0);
  const balanceAll = D.ledger.reduce((n, x) => n + (x.direction === 'in' ? 1 : -1) * Number(x.amount), 0);
  const items = useMemo(() => semesterItems(D, sem), [D, sem]);
  const depts = D.departments.filter((d) => items.some((i) => i.plan.department_id === d.id && Number(i.budget)) || list.some((x) => x.department_id === d.id));
  const rep = { title: `Gaius ${D.center?.name} – money in / out, ${semName(sem)}`, file: `Gaius_${D.center?.name}_money_${sem.replace(' ', '_')}`, sub: `In ${birr(inSum)} · out ${birr(outSum)} · balance ${birr(inSum - outSum)}`,
    sheets: [
      { name: 'Entries', head: ['Date', 'In / out', 'Amount', 'Category', 'Department', 'Description', 'Receipt'], body: list.map((x) => [etLabel(x.entry_date, true), x.direction === 'in' ? 'In' : 'Out', Number(x.amount), x.category || '', x.department_id ? deptName(D, x.department_id) : '', x.description || '', x.receipt_ref || '']) },
      { name: 'Budget vs spent', head: ['Department', 'Planned budget', 'Spent'], body: depts.map((d) => [d.name, items.filter((i) => i.plan.department_id === d.id).reduce((n, i) => n + Number(i.budget || 0), 0), list.filter((x) => x.direction === 'out' && x.department_id === d.id).reduce((n, x) => n + Number(x.amount), 0)]) },
    ] };
  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <select className="small-select" value={sem} onChange={(e) => setSem(e.target.value)}>{SEMESTERS.filter((x) => semesterStart(x) <= today).reverse().slice(0, 4).map((x) => <option key={x} value={x}>{semName(x)}</option>)}</select>
        <div className="row">
          <button className="btn ghost small" onClick={() => toExcel(rep)}>Excel</button><button className="btn ghost small" onClick={() => toPdf(rep)}>PDF</button>
        </div>
      </div>
      <section className="kpis">
        <div className="kpi hero"><span className="kpi-label">Balance now</span><span className="kpi-val">{balanceAll.toLocaleString()}</span><span className="kpi-foot">birr, all entries</span></div>
        <div className="kpi"><span className="kpi-label">In · {semName(sem)}</span><span className="kpi-val">{inSum.toLocaleString()}</span><span className="kpi-foot">birr</span></div>
        <div className="kpi"><span className="kpi-label">Out · {semName(sem)}</span><span className="kpi-val">{outSum.toLocaleString()}</span><span className="kpi-foot">birr</span></div>
      </section>
      <div className="page" style={{ gap: 14 }}>
        <section className="card">
          <div className="card-head"><div><div className="card-title">Entries</div><div className="card-sub">Record money from HQ and what was spent, with the receipt number.</div></div></div>
          <Grid canEdit={perm.mark} rows={list} empty={`No entries in ${semName(sem)} yet.`} addLabel="Add entry" {...gridOps('ledger', () => ({ center_id: D.center?.id || 1 }), (r) => `money entry ${r.description || r.category || ''}`, reload, setError)}
            columns={[
              { key: 'entry_date', label: 'Date', type: 'date', required: true, width: 150 },
              { key: 'direction', label: 'In / out', type: 'select', required: true, options: [['in', 'In +'], ['out', 'Out −']], width: 90 },
              { key: 'amount', label: 'Amount (birr)', type: 'number', required: true, width: 110 },
              { key: 'category', label: 'Category', type: 'select', options: [...IN_CATS, ...OUT_CATS].map((c) => [c, c]), width: 150 },
              { key: 'department_id', label: 'Department', type: 'select', options: D.departments.map((d) => [d.id, d.name]), width: 150 },
              { key: 'description', label: 'Description', width: 200 },
              { key: 'receipt_ref', label: 'Receipt', width: 100 },
            ]} />
        </section>
        <section className="card">
          <div className="card-head"><div><div className="card-title">Planned budget vs spent</div><div className="card-sub">From the department plans and the “money out” entries.</div></div></div>
          <table className="gtable">
            <thead><tr><th>Department</th><th>Planned</th><th>Spent</th></tr></thead>
            <tbody>{rep.sheets[1].body.map(([n, p, s2], k) => <tr key={n}><td><span className="dot" style={{ background: deptColor(D, depts[k].id) }} /> {n}</td><td className="num">{p ? p.toLocaleString() : '–'}</td><td className="num">{s2 ? s2.toLocaleString() : '–'}{p && s2 > p ? <span className="tag bad" style={{ marginLeft: 4 }}>over</span> : null}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </>
  );
}
