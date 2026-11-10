import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { record } from '../lib/undo';
import { FEATURES, CURRENCIES, featureOn } from '../lib/config';
import { Icon } from './common';

/* Settings → Centers: add centers, turn parts of the app on or off for each, currency and finance set-up */
export default function CentersAdmin({ R, reload, setError }) {
  const [draft, setDraft] = useState({ name: '', name_am: '', country: 'Ethiopia', currency: 'ETB', international: false, finance_separate: false });
  const [busy, setBusy] = useState(false);
  if (!R.r8) return <div className="banner err">Adding centers and choosing their features needs the SQL file run_v8_to_v11.sql to be run in Supabase once.</div>;
  async function upd(c, patch, label) {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, c[k] ?? null]));
    const put = (v) => async () => { const { error } = await supabase.from('centers').update(v).eq('id', c.id); if (error) throw error; };
    try { await put(patch)(); record({ label: `${c.name}: ${label}`, undo: put(before), redo: put(patch) }); } catch (e) { setError(`Not saved: ${e.message}`); }
    reload();
  }
  async function add() {
    if (!draft.name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('create_center', { p_name: draft.name.trim(), p_name_am: draft.name_am.trim() || null, p_country: draft.country || null, p_currency: draft.currency, p_international: draft.international, p_finance_separate: draft.finance_separate });
    setBusy(false);
    if (error) return setError(`Center not added: ${error.message}`);
    record({ label: `center ${draft.name}`, undo: async () => { const { error: e } = await supabase.from('centers').update({ active: false }).eq('id', data); if (e) throw e; }, redo: async () => { const { error: e } = await supabase.from('centers').update({ active: true }).eq('id', data); if (e) throw e; } });
    setDraft({ name: '', name_am: '', country: 'Ethiopia', currency: 'ETB', international: false, finance_separate: false }); reload();
  }
  const centers = [...R.allCenters || R.centers].sort((a, b) => (a.sort ?? a.id) - (b.sort ?? b.id));
  return (
    <>
      <section className="card flush">
        <div className="card-head pad"><div><div className="card-title">Centers</div><div className="card-sub">Name, country and currency. An international center can keep its money in its own currency; “Separate finance” keeps it out of the ministry totals and shows it on its own at HQ.</div></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left centers-admin">
            <thead><tr><th>Name</th><th>Amharic</th><th>Country</th><th>Currency</th><th className="num">International</th><th className="num">Separate finance</th><th className="num">In use</th></tr></thead>
            <tbody>
              {centers.map((c) => (
                <tr key={c.id} className={c.active === false ? 'inactive-row' : ''}>
                  <td><input defaultValue={c.name} key={c.name} aria-label={`Name of ${c.name}`} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && upd(c, { name: e.target.value.trim() }, 'name')} /></td>
                  <td><input className="am" defaultValue={c.name_am || ''} key={c.name_am || ''} aria-label={`Amharic name of ${c.name}`} onBlur={(e) => e.target.value !== (c.name_am || '') && upd(c, { name_am: e.target.value || null }, 'Amharic name')} /></td>
                  <td><input defaultValue={c.country || 'Ethiopia'} key={c.country || ''} aria-label={`Country of ${c.name}`} onBlur={(e) => e.target.value !== (c.country || 'Ethiopia') && upd(c, { country: e.target.value || null }, 'country')} /></td>
                  <td><select value={c.currency || 'ETB'} onChange={(e) => upd(c, { currency: e.target.value }, 'currency')} aria-label={`Currency of ${c.name}`}>{CURRENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                  <td className="num"><input type="checkbox" checked={!!c.international} onChange={(e) => upd(c, { international: e.target.checked }, 'international')} aria-label={`${c.name} international`} /></td>
                  <td className="num"><input type="checkbox" checked={!!c.finance_separate} onChange={(e) => upd(c, { finance_separate: e.target.checked }, 'separate finance')} aria-label={`${c.name} separate finance`} /></td>
                  <td className="num"><input type="checkbox" checked={c.active !== false} onChange={(e) => upd(c, { active: e.target.checked }, e.target.checked ? 'back in use' : 'not in use')} aria-label={`${c.name} in use`} /></td>
                </tr>
              ))}
              <tr className="ge-new">
                <td><input placeholder="New center, e.g. Adama" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="New center name" /></td>
                <td><input className="am" placeholder="አዳማ" value={draft.name_am} onChange={(e) => setDraft({ ...draft, name_am: e.target.value })} aria-label="New center Amharic name" /></td>
                <td><input value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} aria-label="New center country" /></td>
                <td><select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} aria-label="New center currency">{CURRENCIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td className="num"><input type="checkbox" checked={draft.international} onChange={(e) => setDraft({ ...draft, international: e.target.checked, finance_separate: e.target.checked || draft.finance_separate })} aria-label="New center international" /></td>
                <td className="num"><input type="checkbox" checked={draft.finance_separate} onChange={(e) => setDraft({ ...draft, finance_separate: e.target.checked })} aria-label="New center separate finance" /></td>
                <td><button className="btn lime small" disabled={!draft.name.trim() || busy} onClick={add} aria-label="Add center"><Icon.plus width="16" height="16" /></button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="tiny muted pad">A center that is not in use disappears from sign-up, the HQ side and the center list, and keeps its data. New centers start with every part of the app on.</p>
      </section>
      <section className="card flush">
        <div className="card-head pad"><div><div className="card-title">What each center uses</div><div className="card-sub">Untick a part a center doesn’t use – it disappears from that center’s menu and from HQ totals for it. Attendance, People and the dashboard are always on.</div></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable access settings-grid">
            <thead><tr><th>Part of the app</th>{centers.filter((c) => c.active !== false).map((c) => <th key={c.id}>{c.name}</th>)}</tr></thead>
            <tbody>{FEATURES.map(([k, l]) => (
              <tr key={k}><td>{l}</td>{centers.filter((c) => c.active !== false).map((c) => (
                <td key={c.id} className="num"><input type="checkbox" checked={featureOn(c, k)} aria-label={`${c.name}: ${l}`}
                  onChange={(e) => upd(c, { features: { ...(c.features || {}), [k]: e.target.checked } }, `${l} ${e.target.checked ? 'on' : 'off'}`)} /></td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
