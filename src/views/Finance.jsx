import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, todayIso, semesterOf, semName, semesterStart, semesterEnd, WEEKDAYS, SEMESTERS } from '../lib/ethiopian';
import { deptName, deptColor, semesterItems, itemWhen, birr } from '../lib/plans';
import { toExcel, toPdf } from '../lib/exports';
import { Sheet, Icon } from './common';

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
  const [edit, setEdit] = useState(null);
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
          {perm.mark && <button className="btn lime small" onClick={() => setEdit({ name: '', category: '', quantity: 1, condition: 'Good', location: '', source: '', acquired_on: '', value: '', notes: '' })}><Icon.plus width="16" height="16" /> Add</button>}
        </div>
      </div>
      <label className="search" style={{ marginBottom: 10 }}><Icon.search /><input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div style={{ overflowX: 'auto' }}>
        <table className="gtable left act-table">
          <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Condition</th><th>Where</th><th>Source</th></tr></thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} onClick={() => perm.mark && setEdit(a)}>
                <td><b>{a.name}</b>{a.notes && <div className="tiny muted">{a.notes}</div>}</td><td>{a.category}</td><td className="num">{a.quantity}</td>
                <td><span className={`tag ${a.condition === 'Good' ? 'ok' : a.condition === 'Needs repair' ? 'sun' : 'bad'}`}>{a.condition}</span></td><td>{a.location}</td><td>{a.source}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="muted">Nothing recorded yet. Add the items the center has (chairs, sound system, guitar, water tank…).</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && <AssetSheet a={edit} D={D} onClose={() => setEdit(null)} reload={reload} setError={setError} />}
    </section>
  );
}
function AssetSheet({ a, D, onClose, reload, setError }) {
  const [f, setF] = useState({ ...a, acquired_on: a.acquired_on || '', value: a.value ?? '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    const row = { center_id: D.center?.id || 1, name: f.name.trim(), category: f.category || null, quantity: Number(f.quantity) || 1, condition: f.condition, location: f.location || null, source: f.source || null, acquired_on: f.acquired_on || null, value: f.value === '' ? null : Number(f.value), notes: f.notes || null, updated_at: new Date().toISOString() };
    const { error } = a.id ? await supabase.from('assets').update(row).eq('id', a.id) : await supabase.from('assets').insert(row);
    if (error) return setError(`Not saved: ${error.message}`);
    reload(); onClose();
  }
  async function remove() { if (!window.confirm('Remove this item?')) return; const { error } = await supabase.from('assets').delete().eq('id', a.id); if (error) setError(error.message); else { reload(); onClose(); } }
  return (
    <Sheet title={a.id ? a.name : 'Add an item'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="row2"><label>Item<input value={f.name} onChange={set('name')} required placeholder="e.g. Water tank 90 L" /></label><label>Category<input value={f.category || ''} onChange={set('category')} list="asset-cats" placeholder="Furniture, sound, kitchen…" /></label></div>
        <datalist id="asset-cats">{[...new Set(D.assets.map((x) => x.category).filter(Boolean)), 'Furniture', 'Sound & music', 'Kitchen', 'Cleaning', 'Stationery'].map((c) => <option key={c} value={c} />)}</datalist>
        <div className="row3">
          <label>Quantity<input inputMode="numeric" value={f.quantity} onChange={set('quantity')} /></label>
          <label>Condition<select value={f.condition} onChange={set('condition')}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Value each (birr)<input inputMode="numeric" value={f.value} onChange={set('value')} /></label>
        </div>
        <div className="row3">
          <label>Where<input value={f.location || ''} onChange={set('location')} /></label>
          <label>Source<input value={f.source || ''} onChange={set('source')} list="asset-src" /></label>
          <label>Since<input type="date" value={f.acquired_on} onChange={set('acquired_on')} /></label>
        </div>
        <datalist id="asset-src"><option value="HQ" /><option value="Purchased" /><option value="Donated" /></datalist>
        <label>Notes<input value={f.notes || ''} onChange={set('notes')} /></label>
        <div className="row-actions">{a.id ? <button type="button" className="btn danger small" onClick={remove}>Remove</button> : <span />}<button className="btn lime">Save</button></div>
      </form>
    </Sheet>
  );
}

function Money({ D, today, perm, reload, setError }) {
  const [sem, setSem] = useState(semesterOf(today));
  const [adding, setAdding] = useState(null);
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
          {perm.mark && <><button className="btn lime small" onClick={() => setAdding('in')}>+ Money in</button><button className="btn ghost small" onClick={() => setAdding('out')}>− Money out</button></>}
        </div>
      </div>
      <section className="kpis">
        <div className="kpi hero"><span className="kpi-label">Balance now</span><span className="kpi-val">{balanceAll.toLocaleString()}</span><span className="kpi-foot">birr, all entries</span></div>
        <div className="kpi"><span className="kpi-label">In · {semName(sem)}</span><span className="kpi-val">{inSum.toLocaleString()}</span><span className="kpi-foot">birr</span></div>
        <div className="kpi"><span className="kpi-label">Out · {semName(sem)}</span><span className="kpi-val">{outSum.toLocaleString()}</span><span className="kpi-foot">birr</span></div>
      </section>
      <div className="dash-grid">
        <section className="card">
          <div className="card-head"><div><div className="card-title">Entries</div><div className="card-sub">Record money from HQ and what was spent, with the receipt number.</div></div></div>
          <ul className="ev-list">
            {list.map((x) => (
              <li key={x.id} className="money-row">
                <span className={`money-amt ${x.direction}`}>{x.direction === 'in' ? '+' : '−'}{Number(x.amount).toLocaleString()}</span>
                <span style={{ minWidth: 0, flex: 1 }}><b>{x.description || x.category}</b><span className="prog-meta" style={{ display: 'block' }}>{etLabel(x.entry_date, true)} · {x.category}{x.department_id ? ` · ${deptName(D, x.department_id)}` : ''}{x.receipt_ref ? ` · receipt ${x.receipt_ref}` : ''}</span></span>
                {perm.mark && <button className="icon-btn" aria-label="Delete entry" onClick={async () => { if (window.confirm('Delete this entry?')) { const { error } = await supabase.from('ledger').delete().eq('id', x.id); if (error) setError(error.message); else reload(); } }}><Icon.trash width="16" height="16" /></button>}
              </li>
            ))}
            {list.length === 0 && <li className="muted small">No entries in {semName(sem)} yet.</li>}
          </ul>
        </section>
        <section className="card">
          <div className="card-head"><div><div className="card-title">Planned budget vs spent</div><div className="card-sub">From the department plans and the “money out” entries.</div></div></div>
          <table className="gtable">
            <thead><tr><th>Department</th><th>Planned</th><th>Spent</th></tr></thead>
            <tbody>{rep.sheets[1].body.map(([n, p, s2], k) => <tr key={n}><td><span className="dot" style={{ background: deptColor(D, depts[k].id) }} /> {n}</td><td className="num">{p ? p.toLocaleString() : '–'}</td><td className="num">{s2 ? s2.toLocaleString() : '–'}{p && s2 > p ? <span className="tag bad" style={{ marginLeft: 4 }}>over</span> : null}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
      {adding && <EntrySheet dir={adding} D={D} sem={sem} onClose={() => setAdding(null)} reload={reload} setError={setError} />}
    </>
  );
}
function EntrySheet({ dir, D, sem, onClose, reload, setError }) {
  const [f, setF] = useState({ entry_date: todayIso(), amount: '', category: dir === 'in' ? IN_CATS[0] : OUT_CATS[1], department_id: '', plan_item_id: '', description: '', receipt_ref: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const its = semesterItems(D, sem).filter((i) => Number(i.budget) > 0 && (!f.department_id || i.plan.department_id === Number(f.department_id)));
  async function save(e) {
    e.preventDefault();
    const it = its.find((i) => String(i.id) === String(f.plan_item_id));
    const { error } = await supabase.from('ledger').insert({ center_id: D.center?.id || 1, direction: dir, entry_date: f.entry_date, amount: Number(f.amount), category: f.category,
      department_id: f.department_id ? Number(f.department_id) : it?.plan.department_id || null, plan_item_id: it?.id || null, description: f.description || it?.plan.title || null, receipt_ref: f.receipt_ref || null });
    if (error) return setError(`Not saved: ${error.message}`);
    reload(); onClose();
  }
  return (
    <Sheet title={dir === 'in' ? 'Money in' : 'Money out'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="row2">
          <label>Date {f.entry_date && <span className="faint">{etLabel(f.entry_date, true)}</span>}<input type="date" value={f.entry_date} onChange={set('entry_date')} required /></label>
          <label>Amount (birr)<input inputMode="decimal" value={f.amount} onChange={set('amount')} required /></label>
        </div>
        <div className="row2">
          <label>Category<select value={f.category} onChange={set('category')}>{(dir === 'in' ? IN_CATS : OUT_CATS).map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Department<select value={f.department_id} onChange={set('department_id')}><option value="">—</option>{D.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        </div>
        {dir === 'out' && its.length > 0 && <label>For a planned item (optional)<select value={f.plan_item_id} onChange={set('plan_item_id')}><option value="">—</option>{its.map((i) => <option key={i.id} value={i.id}>{i.plan.title.slice(0, 50)} · {itemWhen(i)} · {Number(i.budget).toLocaleString()}</option>)}</select></label>}
        <label>Description<input value={f.description} onChange={set('description')} /></label>
        <label>Receipt number<input value={f.receipt_ref} onChange={set('receipt_ref')} /></label>
        <button className="btn lime wide">Save</button>
      </form>
    </Sheet>
  );
}
