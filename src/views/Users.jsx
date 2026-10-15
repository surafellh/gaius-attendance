import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ROLES } from '../lib/roles';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Users({ D, perm, profile, reload }) {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState('');
  const [c, setC] = useState({ meeting_weekday: D.center?.meeting_weekday ?? 3, meeting_time: D.center?.meeting_time || '18:00' });
  const load = () => supabase.from('profiles').select('*').order('created_at').then(({ data }) => setList(data || []));
  useEffect(() => { load(); }, []);

  async function upd(u, patch) {
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', u.user_id);
    setMsg(error ? error.message : 'Saved.');
    load();
  }
  async function saveCenter() {
    const { error } = await supabase.from('centers').update({ meeting_weekday: Number(c.meeting_weekday), meeting_time: c.meeting_time }).eq('id', D.center.id);
    setMsg(error ? error.message : 'Center settings saved.');
    reload();
  }
  const pending = list.filter((u) => u.role === 'pending');
  const leaders = D.people.filter((p) => ['Leader', 'Senior Leader'].includes(p.category));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Users & settings</h1>
          <p className="page-sub">Who can see and change what. HQ roles see every center; center roles see only their center.</p>
        </div>
      </div>
      {msg && <div className="banner ok">{msg}</div>}
      {pending.length > 0 && <div className="banner">{pending.length} account{pending.length > 1 ? 's' : ''} waiting for approval.</div>}

      <section className="card">
        <div className="card-head"><div><div className="card-title">{D.center?.name} center</div><div className="card-sub">The leaders' meeting day drives the Meeting page, dashboard reminder and the weekly phone reminder.</div></div></div>
        <div className="form">
          <div className="row2">
            <label>Leaders' meeting day<select disabled={!perm.manage} value={c.meeting_weekday} onChange={(e) => setC({ ...c, meeting_weekday: e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
            <label>Time<input disabled={!perm.manage} type="time" value={c.meeting_time} onChange={(e) => setC({ ...c, meeting_time: e.target.value })} /></label>
          </div>
          {perm.manage && <button className="btn lime" onClick={saveCenter} style={{ alignSelf: 'flex-start' }}>Save</button>}
        </div>
      </section>

      <section className="card flush">
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Access</th><th>Title</th><th>Linked person</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.user_id}>
                  <td><b>{u.full_name}</b><div className="muted small">{u.email}</div></td>
                  <td>
                    <select value={u.role} disabled={!perm.admin || u.user_id === profile.user_id} onChange={(e) => upd(u, { role: e.target.value })}>
                      {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td><input defaultValue={u.title || ''} disabled={!perm.admin} placeholder="e.g. Follow-up dept." onBlur={(e) => e.target.value !== (u.title || '') && upd(u, { title: e.target.value || null })} /></td>
                  <td>
                    <select value={u.person_id || ''} disabled={!perm.admin} onChange={(e) => upd(u, { person_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">—</option>
                      {leaders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-title" style={{ marginBottom: 10 }}>Access levels</div>
        <table className="tbl">
          <tbody>{ROLES.map(([k, l, d]) => <tr key={k}><td><b>{l}</b></td><td className="muted small">{d}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
