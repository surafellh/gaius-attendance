import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Users() {
  const [list, setList] = useState([]);
  const load = () => supabase.from('profiles').select('*').order('created_at').then(({ data }) => setList(data || []));
  useEffect(() => { load(); }, []);

  async function setRole(u, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('user_id', u.user_id);
    if (error) return window.alert(error.message);
    load();
  }

  const pending = list.filter((u) => u.role === 'pending');
  return (
    <div className="page">
      {pending.length > 0 && <div className="banner">{pending.length} account{pending.length > 1 ? 's' : ''} waiting for approval.</div>}
      <div className="card flush">
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.user_id}>
                <td><b>{u.full_name}</b></td>
                <td className="muted">{u.email}</td>
                <td>
                  <select value={u.role} onChange={(e) => setRole(u, e.target.value)}>
                    <option value="pending">Pending (no access)</option>
                    <option value="leader">Leader</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Leaders can mark attendance, see follow-up and register new comers. Admins can also edit people and approve users.</p>
    </div>
  );
}
