import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ONE } from '../lib/stats';
import { Sheet, Initials, Icon } from './common';

export default function Departments({ D, perm, openPerson, reload, setError }) {
  const [edit, setEdit] = useState(null);
  const active = D.members.filter((m) => !m.until);
  const assigned = new Set(active.map((m) => m.person_id));
  const leaders = D.people.filter((p) => ['Leader', 'Senior Leader'].includes(p.category) && !p.archived);
  const unassignedLeaders = leaders.filter((p) => !assigned.has(p.id));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Departments</h1>
          <p className="page-sub">Leaders serve in a department according to their grace and interest; members can join to serve too.</p>
        </div>
      </div>
      {unassignedLeaders.length > 0 && <div className="banner">Leaders not in a department yet: {unassignedLeaders.map((p) => p.name).join(', ')}.</div>}
      <div className="dept-grid">
        {D.departments.map((d) => {
          const ms = active.filter((m) => m.department_id === d.id).map((m) => ({ ...m, p: D.people.find((p) => p.id === m.person_id) })).filter((m) => m.p);
          const heads = ms.filter((m) => m.role === 'leader');
          const rest = ms.filter((m) => m.role !== 'leader');
          return (
            <section key={d.id} className="card dept-card">
              <div className="card-head" style={{ marginBottom: 0 }}>
                <div>
                  <div className="dept-name">{d.name}</div>
                  <div className="dept-am am">{d.name_am}</div>
                </div>
                {perm.manage && <button className="icon-btn" onClick={() => setEdit(d)} aria-label={`Edit ${d.name}`}><Icon.edit /></button>}
              </div>
              <div>
                <div className="tiny muted" style={{ fontWeight: 800, marginBottom: 6 }}>Leading</div>
                <div className="chips">
                  {heads.length ? heads.map((m) => <Chip key={m.id} m={m} lead onClick={() => openPerson(m.p.id)} />) : <span className="faint small">No leader yet</span>}
                </div>
              </div>
              <div>
                <div className="tiny muted" style={{ fontWeight: 800, marginBottom: 6 }}>Serving ({rest.length})</div>
                <div className="chips">
                  {rest.length ? rest.map((m) => <Chip key={m.id} m={m} onClick={() => openPerson(m.p.id)} />) : <span className="faint small">Nobody yet</span>}
                </div>
              </div>
            </section>
          );
        })}
      </div>
      {edit && <DeptEditor d={edit} D={D} onClose={() => setEdit(null)} reload={reload} setError={setError} />}
    </div>
  );
}

function Chip({ m, lead, onClick }) {
  return <button className={`person-chip ${lead ? 'lead' : ''}`} onClick={onClick}><Initials name={m.p.name} category={m.p.category} />{m.p.name}</button>;
}

function DeptEditor({ d, D, onClose, reload, setError }) {
  const [pick, setPick] = useState('');
  const [role, setRole] = useState('member');
  const ms = D.members.filter((m) => m.department_id === d.id && !m.until).map((m) => ({ ...m, p: D.people.find((p) => p.id === m.person_id) })).filter((m) => m.p);
  const candidates = D.people.filter((p) => !p.archived && ['Leader', 'Senior Leader', 'Member', 'Active Informal Member'].includes(p.category) && !ms.some((m) => m.person_id === p.id));
  const today = new Date().toISOString().slice(0, 10);
  async function run(q) { const { error } = await q; if (error) setError(error.message); else reload(); }
  return (
    <Sheet title={d.name} onClose={onClose}>
      <ul className="hist" style={{ marginBottom: 14 }}>
        {ms.map((m) => (
          <li key={m.id}>
            <span>{m.p.name} <span className="muted">· {ONE[m.p.category]}</span></span>
            <span className="row">
              <select value={m.role} onChange={(e) => run(supabase.from('department_members').update({ role: e.target.value }).eq('id', m.id))} style={{ padding: '4px 8px' }}>
                <option value="leader">Leads</option><option value="member">Serves</option>
              </select>
              <button className="icon-btn" onClick={() => run(supabase.from('department_members').update({ until: today }).eq('id', m.id))} aria-label={`Remove ${m.p.name}`}><Icon.trash /></button>
            </span>
          </li>
        ))}
        {ms.length === 0 && <li className="muted">Nobody yet.</li>}
      </ul>
      <div className="form">
        <div className="row2">
          <label>Add a person<select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose…</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.name} ({ONE[p.category]})</option>)}
          </select></label>
          <label>Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="member">Serves</option><option value="leader">Leads</option></select></label>
        </div>
        <button className="btn lime" disabled={!pick} onClick={() => { run(supabase.from('department_members').insert({ department_id: d.id, person_id: Number(pick), role, since: today })); setPick(''); }}>Add to {d.name}</button>
        <p className="muted tiny">Removing someone keeps the record of when they served.</p>
      </div>
    </Sheet>
  );
}
