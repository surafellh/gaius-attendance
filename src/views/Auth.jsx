import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Mark } from './common';

export default function Auth({ recovery, onRecovered, embedded, start = 'in', site }) {
  const [mode, setMode] = useState(recovery ? 'new' : start);
  const [f, setF] = useState({ name: '', email: '', password: '', center: '' });
  const [centers, setCenters] = useState([]);
  useEffect(() => { // the centers list for sign-up (names only, readable before signing in)
    supabase.rpc('public_centers').then(({ data }) => setCenters(data || []));
  }, []);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    let res;
    if (mode === 'in') res = await supabase.auth.signInWithPassword({ email: f.email, password: f.password });
    else if (mode === 'up') res = await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.name, center_id: /^\d+$/.test(f.center) ? f.center : null, hq: f.center === 'hq' }, emailRedirectTo: window.location.origin } });
    else if (mode === 'forgot') res = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: window.location.origin });
    else res = await supabase.auth.updateUser({ password: f.password });
    setBusy(false);
    if (res.error) return setMsg(res.error.message);
    if (mode === 'up' && !res.data.session) setMsg('Account created. Check your email to confirm, then sign in. Your center’s coordinator will approve your access.');
    if (mode === 'forgot') setMsg('If that email has an account, a reset link is on its way. Open it on this device.');
    if (mode === 'new') { setMsg('Password changed.'); onRecovered?.(); }
  }

  const titles = { in: 'Sign in', up: 'Create account', forgot: 'Send reset link', new: 'Save new password' };
  const card = (
      <div className="auth-card">
        <div className="brand">
          {site?.logo ? <img className="logo-img" src={site.logo} alt="" width="36" height="36" /> : <Mark />}
          <div><div className="brand-name">{titles[mode]}</div><div className="brand-sub">Gaius Ministry · centers</div></div>
        </div>
        {mode === 'forgot' && <p className="small muted" style={{ marginBottom: 12 }}>Enter your email and we'll send you a link to choose a new password.</p>}
        {mode === 'new' && <p className="small muted" style={{ marginBottom: 12 }}>Choose a new password for your account.</p>}
        <form onSubmit={submit} className="form">
          {mode === 'up' && <label>Full name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>}
          {mode === 'up' && <label>My center<select value={f.center} onChange={(e) => setF({ ...f, center: e.target.value })} required>
            <option value="">Choose your center…</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.name_am ? ` · ${c.name_am}` : ''}</option>)}<option value="hq">HQ (head office)</option>
          </select></label>}
          {mode !== 'new' && <label>Email<input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>}
          {mode !== 'forgot' && <label>{mode === 'new' ? 'New password' : 'Password'}<input type="password" minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>}
          {msg && <div className="banner">{msg}</div>}
          <button className="btn lime wide" disabled={busy}>{busy ? 'One moment…' : titles[mode]}</button>
        </form>
        {mode !== 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: 12 }}>
            {mode === 'in' && <button className="link" onClick={() => { setMode('forgot'); setMsg(''); }}>Forgot password?</button>}
            <button className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>
              {mode === 'in' ? 'New leader? Create an account' : 'Back to sign in'}
            </button>
          </div>
        )}
      </div>
  );
  return embedded ? card : <div className="auth-wrap">{card}</div>;
}
