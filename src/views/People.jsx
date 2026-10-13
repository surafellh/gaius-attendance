import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, sundaysOf, SEMESTERS } from '../lib/ethiopian';
import { CATEGORIES, SHORT, pct } from '../lib/stats';
import { Modal } from './common';

export default function People({ roster, people, statuses, semester, stats, profile, reload }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [edit, setEdit] = useState(null);
  const isAdmin = profile.role === 'admin';
  const byId = Object.fromEntries(stats.rows.map((r) => [r.id, r]));
  const onRoster = new Set(roster.map((p) => p.id));

  const list = people
    .map((p) => ({ ...p, category: roster.find((r) => r.id === p.id)?.category || null }))
    .filter((p) => (cat === 'All' ? true : cat === 'Not listed' ? !onRoster.has(p.id) : p.category === cat))
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.phone || '').includes(q));

  return (
    <div className="page">
      <div className="toolbar">
        <input className="search" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        {isAdmin && <button className="btn" onClick={() => setEdit({ new: true })}>+ Person</button>}
      </div>
      <div className="seg wrap">
        {['All', ...CATEGORIES, 'Not listed'].map((c) => (
          <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
            {SHORT[c] || c} <small>{c === 'All' ? people.length : c === 'Not listed' ? people.length - onRoster.size : roster.filter((r) => r.category === c).length}</small>
          </button>
        ))}
      </div>
      <div className="card flush">
        <table className="tbl people-tbl">
          <thead><tr><th>#</th><th>Name</th><th>Status · {semester}</th><th className="hide-sm">Responsible</th><th className="hide-sm">Joined</th><th>Semester %</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} onClick={() => setEdit(p)} className="clickable">
                <td className="muted">{p.sn}</td>
                <td><b>{p.name}</b><div className="muted small">{p.phone}</div></td>
                <td>
                  {p.category ? SHORT[p.category] : <span className="muted">—</span>}
                  {p.category === 'New Comer' && <em className={p.nc_active ? 'tag ok' : 'tag'}>{p.nc_active ? 'Active' : 'Inactive'}</em>}
                </td>
                <td className="hide-sm">{p.responsible}</td>
                <td className="hide-sm">{p.week_joined ? etLabel(p.week_joined, true) : ''}</td>
                <td>{pct(byId[p.id]?.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Editor person={edit} statuses={statuses} people={people} semester={semester} isAdmin={isAdmin}
          onClose={() => setEdit(null)} saved={() => { setEdit(null); reload(); }} />
      )}
    </div>
  );
}

function Editor({ person, statuses, people, semester, isAdmin, onClose, saved }) {
  const isNew = !!person.new;
  const own = isNew ? [] : statuses.filter((s) => s.person_id === person.id);
  const [f, setF] = useState({
    name: person.name || '', phone: person.phone || '+251', responsible: person.responsible || '',
    week_joined: person.week_joined || '', nc_active: person.nc_active ?? true,
  });
  const [cats, setCats] = useState(() => Object.fromEntries(SEMESTERS.map((s) => [s, own.find((o) => o.semester === s)?.category || ''])));
  const [busy, setBusy] = useState(false);
  const joinOptions = [...SEMESTERS.slice(0, 6).flatMap(sundaysOf)].filter((s) => s <= new Date().toISOString().slice(0, 10)).reverse();

  async function save(e) {
    e.preventDefault();
    if (!isAdmin) return onClose();
    setBusy(true);
    const payload = {
      name: f.name.trim(), phone: f.phone.trim() || null, responsible: f.responsible.trim() || null,
      week_joined: f.week_joined || null, nc_active: f.nc_active,
    };
    let id = person.id;
    if (isNew) {
      const sn = Math.max(0, ...people.map((p) => p.sn || 0)) + 1;
      const { data, error } = await supabase.from('people').insert({ ...payload, sn }).select().single();
      if (error) { setBusy(false); return window.alert(error.message); }
      id = data.id;
    } else {
      const { error } = await supabase.from('people').update(payload).eq('id', id);
      if (error) { setBusy(false); return window.alert(error.message); }
    }
    const upserts = Object.entries(cats).filter(([, c]) => c).map(([s, c]) => ({ person_id: id, semester: s, category: c }));
    const removes = Object.entries(cats).filter(([s, c]) => !c && own.some((o) => o.semester === s)).map(([s]) => s);
    if (upserts.length) {
      const { error } = await supabase.from('person_status').upsert(upserts);
      if (error) { setBusy(false); return window.alert(error.message); }
    }
    if (removes.length) await supabase.from('person_status').delete().eq('person_id', id).in('semester', removes);
    saved();
  }

  async function remove() {
    if (!window.confirm(`Delete ${person.name} and all their attendance? This cannot be undone.`)) return;
    const { error } = await supabase.from('people').delete().eq('id', person.id);
    if (error) return window.alert(error.message);
    saved();
  }

  const ro = !isAdmin;
  return (
    <Modal title={isNew ? 'Add person' : person.name} onClose={onClose}>
      <form onSubmit={save} className="form">
        <label>Name<input disabled={ro} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <div className="row2">
          <label>Phone<input disabled={ro} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label>Responsible person<input disabled={ro} value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })} /></label>
        </div>
        <div className="row2">
          <label>Week joined
            <select disabled={ro} value={f.week_joined} onChange={(e) => setF({ ...f, week_joined: e.target.value })}>
              <option value="">— (existing member)</option>
              {f.week_joined && !joinOptions.includes(f.week_joined) && <option value={f.week_joined}>{etLabel(f.week_joined, true)}</option>}
              {joinOptions.map((s) => <option key={s} value={s}>{etLabel(s, true)} · {fmtGreg(s)}</option>)}
            </select>
          </label>
          <label>New comer active?
            <select disabled={ro} value={f.nc_active ? 'yes' : 'no'} onChange={(e) => setF({ ...f, nc_active: e.target.value === 'yes' })}>
              <option value="yes">Active</option><option value="no">Inactive</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Status per semester</legend>
          <div className="sem-grid">
            {SEMESTERS.slice(0, 6).map((s) => (
              <label key={s} className={s === semester ? 'cur' : ''}>{s}
                <select disabled={ro} value={cats[s]} onChange={(e) => setCats({ ...cats, [s]: e.target.value })}>
                  <option value="">—</option>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="muted small">If a semester is blank, the latest earlier status is used.</p>
        </fieldset>
        {isAdmin ? (
          <div className="row-actions">
            {!isNew && <button type="button" className="btn danger ghost" onClick={remove}>Delete</button>}
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        ) : <p className="muted small">Only an admin can edit people.</p>}
      </form>
    </Modal>
  );
}
