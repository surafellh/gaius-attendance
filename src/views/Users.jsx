import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ROLES, ACCESS, roleName, HQ_ROLES } from '../lib/roles';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Users({ D, R, perm, profile, realProfile, viewAs, setViewAs, reload }) {
  const me = realProfile || profile;
  const isAdmin = me.role === 'admin';
  const CENTER_ROLES = ['coordinator', 'followup_leader', 'center_leader', 'leader', 'viewer', 'former', 'pending'];
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
  // the coordinator sees and approves the people of their own center; the admin sees everyone
  const shown = isAdmin ? list : list.filter((u) => u.center_id === me.center_id && !HQ_ROLES.includes(u.role));
  const pending = shown.filter((u) => u.role === 'pending');
  const leaders = D.people.filter((p) => ['Leader', 'Senior Leader'].includes(p.category));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">App admin</h1>
          <p className="page-sub">Users, roles, center settings, backup &amp; restore{isAdmin ? ', landing page and “view as”' : ''}. Only the Coordinator, the Follow-up leader and the admin can change data; everyone else views.</p>
        </div>
      </div>
      {isAdmin && (
        <section className="card">
          <div className="card-head"><div><div className="card-title">View as a role</div><div className="card-sub">Check exactly what a role can see: HQ roles open the HQ side, center roles the center side (view-only for leaders). A bar at the top lets you exit. To use the HQ side yourself, use the HQ side / Center side button in the header.</div></div></div>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {ROLES.filter(([k]) => !['former', 'pending', 'admin'].includes(k)).map(([k, l]) => <button key={k} className={`chipbtn ${viewAs === k ? 'on' : ''}`} onClick={() => setViewAs(viewAs === k ? null : k)}>{l}</button>)}
          </div>
        </section>
      )}
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
            <thead><tr><th>Name</th><th>Access</th>{isAdmin && <th>Center</th>}<th>Title</th><th>Linked person</th></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.user_id}>
                  <td><b>{u.full_name}</b><div className="muted small">{u.email}</div></td>
                  <td>
                    <select value={u.role} disabled={!perm.users || u.user_id === me.user_id || (!isAdmin && !CENTER_ROLES.includes(u.role))} onChange={(e) => upd(u, { role: e.target.value })}>
                      {ROLES.filter(([k]) => isAdmin || CENTER_ROLES.includes(k) || k === u.role).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    {u.role === 'pending' && <span className="tag sun" style={{ marginLeft: 6 }}>new</span>}
                  </td>
                  {isAdmin && <td><select value={u.center_id || 1} onChange={(e) => upd(u, { center_id: Number(e.target.value) })}>{(R?.centers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>}
                  <td><input defaultValue={u.title || ''} disabled={!perm.users} placeholder="e.g. Follow-up dept." onBlur={(e) => e.target.value !== (u.title || '') && upd(u, { title: e.target.value || null })} /></td>
                  <td>
                    <select value={u.person_id || ''} disabled={!perm.users} onChange={(e) => upd(u, { person_id: e.target.value ? Number(e.target.value) : null })}>
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
        <div className="card-title" style={{ marginBottom: 4 }}>Who can do what</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>The database enforces the same rules, so a role can’t see or change more than shown here.</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable access">
            <thead><tr><th>What</th>{ROLES.filter(([k]) => !['former', 'pending'].includes(k)).map(([k, l]) => <th key={k} title={l}>{l.replace(' / Visionary', '')}</th>)}</tr></thead>
            <tbody>{ACCESS.map(([what, who]) => <tr key={what}><td>{what}</td>{ROLES.filter(([k]) => !['former', 'pending'].includes(k)).map(([k]) => <td key={k} className="num">{who.includes(k) ? <span className="yes">✓</span> : <span className="faint">–</span>}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
