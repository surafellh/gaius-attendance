import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ROLES, accessTable, roleName, HQ_ROLES } from '../lib/roles';
import { HQ_ROLE_KEYS } from '../lib/config';

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
    <div className="page" style={{ paddingTop: 0 }}>
      {isAdmin && (
        <section className="card">
          <div className="card-head"><div><div className="card-title">View as a role</div><div className="card-sub">Check exactly what a role can see and do, with the abilities set on the Settings tab. HQ roles open the HQ side, center roles the center side. A bar at the top lets you exit.</div></div></div>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {ROLES.filter(([k]) => !['former', 'pending', 'admin'].includes(k)).map(([k]) => <button key={k} className={`chipbtn ${viewAs === k ? 'on' : ''}`} onClick={() => setViewAs(viewAs === k ? null : k)}>{roleName(k)}</button>)}
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
            <thead><tr><th>Name</th><th>Role</th>{isAdmin && <><th>Center</th><th title="A second role on the HQ side – the same account switches between the two">HQ role</th><th title="On the HQ side: view only, or also edit HQ plans, activities and events">HQ access</th></>}<th>Title</th><th>Linked person</th></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.user_id}>
                  <td><b>{u.full_name}</b><div className="muted small">{u.email}</div></td>
                  <td>
                    <select value={u.role} disabled={!perm.users || u.user_id === me.user_id || (!isAdmin && !CENTER_ROLES.includes(u.role))} onChange={(e) => upd(u, { role: e.target.value })}>
                      {ROLES.filter(([k]) => isAdmin || CENTER_ROLES.includes(k) || k === u.role).map(([k]) => <option key={k} value={k}>{roleName(k)}</option>)}
                    </select>
                    {u.role === 'pending' && <span className="tag sun" style={{ marginLeft: 6 }}>new</span>}
                  </td>
                  {isAdmin && <>
                    <td><select value={u.center_id || 1} onChange={(e) => upd(u, { center_id: Number(e.target.value) })}>{(R?.centers || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                    <td>{HQ_ROLES.includes(u.role) ? <span className="muted small">{u.role === 'admin' ? 'everything' : 'main role'}</span> : (
                      <select value={u.hq_role || ''} disabled={!R.config?.fromDb || ['pending', 'former'].includes(u.role)} onChange={(e) => upd(u, { hq_role: e.target.value || null })}>
                        <option value="">— none</option>{HQ_ROLE_KEYS.map((k) => <option key={k} value={k}>{roleName(k)}</option>)}
                      </select>)}</td>
                    <td>{u.role === 'admin' ? <span className="muted small">edit</span> : (HQ_ROLES.includes(u.role) || u.hq_role) ? (
                      <select value={u.hq_access || (R.config?.fromDb ? 'view' : 'edit')} disabled={!R.config?.fromDb} onChange={(e) => upd(u, { hq_access: e.target.value })}>
                        <option value="view">View</option><option value="edit">Edit HQ plans</option>
                      </select>) : <span className="faint">–</span>}</td>
                  </>}
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
        <div className="card-sub" style={{ marginBottom: 10 }}>{isAdmin ? 'Change it on the Settings tab. ' : ''}A center role’s rights apply on the center side, the HQ role’s on the HQ side. The database enforces the rules marked •.</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable access">
            <thead><tr><th>What</th>{ROLES.filter(([k]) => !['former', 'pending'].includes(k)).map(([k]) => <th key={k} title={roleName(k)}>{roleName(k).replace(' / Visionary', '')}</th>)}</tr></thead>
            <tbody>
              {accessTable(R.config).map(([what, who, side]) => <tr key={what}><td>{what}{['Mark', 'Progr', 'Appro', 'See F'].some((x) => what.startsWith(x)) ? ' •' : ''}</td>{ROLES.filter(([k]) => !['former', 'pending'].includes(k)).map(([k]) => <td key={k} className="num">{(side === 'center' && HQ_ROLES.includes(k) && k !== 'admin') ? <span className="faint">·</span> : who.includes(k) ? <span className="yes">✓</span> : <span className="faint">–</span>}</td>)}</tr>)}
              <tr><td>HQ side: all centers at once</td>{ROLES.filter(([k]) => !['former', 'pending'].includes(k)).map(([k]) => <td key={k} className="num">{HQ_ROLES.includes(k) ? <span className="yes">✓</span> : <span className="faint" title="Give them an HQ role">+HQ role</span>}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
