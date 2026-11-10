import { useState } from 'react';
import Users from './Users';
import Backup from './Backup';
import Settings from './Settings';

/* App admin: users & roles, settings (admin), backup & the landing page */
export default function Admin({ ctx, R, realProfile, viewAs, setViewAs }) {
  const { perm } = ctx;
  const admin = realProfile.role === 'admin';
  const tabs = [['users', 'Users & roles'], ...(admin ? [['settings', 'Settings']] : []), ...(perm.backup || admin ? [['backup', admin ? 'Backup & landing page' : 'Backup']] : [])];
  const [tab, setTab] = useState('users');
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">App admin</h1>
          <p className="page-sub">{admin ? 'Users and roles, and Settings: what each role can do, the dashboard cards, People columns and downloads.' : 'Approve new accounts and set their roles for your center.'}</p>
        </div>
      </div>
      {tabs.length > 1 && <div className="seg wrap" role="tablist" style={{ marginBottom: 12 }}>{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>}
      {tab === 'users' && <Users {...ctx} R={R} realProfile={realProfile} viewAs={viewAs} setViewAs={setViewAs} />}
      {tab === 'settings' && admin && <Settings R={R} ctx={ctx} reload={ctx.reload} setError={ctx.setError} />}
      {tab === 'backup' && <Backup {...ctx} R={R} realProfile={realProfile} />}
    </div>
  );
}
