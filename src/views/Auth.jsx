import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [mode, setMode] = useState('in');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const { error, data } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
      : await supabase.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.name }, emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === 'up' && !data.session) setMsg('Account created. Check your email to confirm, then sign in.');
  }

  return (
    <div className="center auth">
      <div className="card narrow">
        <div className="brand big"><span className="logo">GG</span>
          <div><div className="title">Gaius Gerji Center</div><div className="sub">Attendance follow-up</div></div>
        </div>
        <form onSubmit={submit} className="form">
          {mode === 'up' && <label>Full name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>}
          <label>Email<input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
          <label>Password<input type="password" minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
          {msg && <div className="banner">{msg}</div>}
          <button className="btn wide" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>
          {mode === 'in' ? 'New leader? Create an account' : 'Have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
