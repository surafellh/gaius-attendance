import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { roleName } from '../lib/roles';
import { Icon } from './common';

const PREFS_KEY = 'gaius-prefs';
export function loadPrefs() {
  try { return { start: 'home', text: 'normal', compact: true, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { start: 'home', text: 'normal', compact: true }; }
}
export function applyPrefs(p) {
  document.documentElement.dataset.text = p.text;
  document.documentElement.dataset.compact = p.compact ? '1' : '';
}

/* Account & settings: who you are, personal display settings, password, sign out */
export default function AccountPanel({ profile, perm, onExport, go, studio, setMode }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [name, setName] = useState(profile.full_name || '');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const set = (k, v) => { const n = { ...prefs, [k]: v }; setPrefs(n); try { localStorage.setItem(PREFS_KEY, JSON.stringify(n)); } catch { /* private mode */ } applyPrefs(n); };
  async function saveName() {
    const { error } = await supabase.rpc('set_my_name', { n: name.trim() });
    setMsg(error ? `Not saved: ${error.message}` : 'Name saved.');
  }
  async function savePw() {
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? error.message : 'Password changed.'); setPw('');
  }
  return (
    <div className="form">
      <div className="acct-head">
        <span className="avatar big">{(profile.full_name || profile.email || '?').trim()[0].toUpperCase()}</span>
        <div><b>{profile.full_name}</b><div className="small muted">{profile.email}</div><div className="small"><span className="tag lime">{roleName(profile.role)}</span>{profile.title && <span className="tag">{profile.title}</span>}</div></div>
      </div>
      {msg && <div className="banner ok">{msg}</div>}
      <div className="form-section">Quick actions</div>
      <div className="row2">
        <button type="button" className="btn lime" onClick={onExport}><Icon.download width="18" height="18" /> Downloads</button>
        {perm.users || profile.role === 'admin' ? <button type="button" className="btn ghost" onClick={() => go('users')}><Icon.settings width="18" height="18" /> App admin</button> : <span />}
      </div>
      <div className="form-section">My settings</div>
      {perm.canStudio && (
        <label>View
          <select value={studio ? '1' : ''} onChange={(e) => setMode(!!e.target.value)}>
            <option value="">Simple – the everyday pages</option><option value="1">Studio – every detail, report and tool</option>
          </select>
        </label>
      )}
      <label>Open the app on
        <select value={prefs.start} onChange={(e) => set('start', e.target.value)}>
          <option value="home">Dashboard</option><option value="attendance">Attendance</option>{!perm.hqView && <option value="calls">Calls (follow-up)</option>}<option value="people">People</option><option value="calendar">Calendar</option><option value="plans">Plans &amp; budget</option>
        </select>
      </label>
      <div className="row2">
        <label>Text size<select value={prefs.text} onChange={(e) => set('text', e.target.value)}><option value="normal">Normal</option><option value="large">Large</option></select></label>
        <label>Attendance rows<select value={prefs.compact ? '1' : ''} onChange={(e) => set('compact', !!e.target.value)}><option value="">Comfortable</option><option value="1">Compact – more on screen</option></select></label>
      </div>
      <div className="form-section">Profile</div>
      <label>My name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button type="button" className="btn ghost" onClick={saveName} disabled={!name.trim() || name === profile.full_name}>Save name</button>
      <label>New password<input type="password" minLength={6} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <button type="button" className="btn ghost" onClick={savePw} disabled={pw.length < 6}>Change password</button>
      <div className="form-section" />
      <button type="button" className="btn danger wide" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  );
}
