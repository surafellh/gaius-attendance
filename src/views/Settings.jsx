import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { record } from '../lib/undo';
import { CAPS, CENTER_ROLE_KEYS, HQ_ROLE_KEYS, DOWNLOADS } from '../lib/config';
import { ROLES, roleName } from '../lib/roles';
import { buildReport } from './ExportSheet';
import { Icon } from './common';

/* Settings (admin): change the app without code – what each role can do, the dashboard, columns, downloads, role names */
export default function Settings({ R, ctx, reload, setError }) {
  const [tab, setTab] = useState('access');
  const cfg = R.config;
  const TABS = [['access', 'Access'], ['dashboard', 'Dashboard'], ['people', 'People columns'], ['downloads', 'Downloads'], ['names', 'Role names']];
  if (!cfg.fromDb) return <div className="banner err">Settings need the release 7 SQL (v10_roles_settings.sql) to be run in Supabase once. Until then the app uses its built-in defaults.</div>;

  async function save(key, value, label) {
    const { data: old } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
    const put = (v) => async () => { const { error } = await supabase.from('app_settings').upsert({ key, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' }); if (error) throw error; };
    try { await put(value)(); } catch (e) { return setError(`Not saved: ${e.message}`); }
    record({ label: `settings: ${label}`, undo: old ? put(old.value) : async () => { await supabase.from('app_settings').delete().eq('key', key); }, redo: put(value) });
    reload();
  }
  const props = { cfg, save, R, ctx, reload, setError };
  return (
    <div className="settings">
      <div className="seg wrap" role="tablist" style={{ marginBottom: 12 }}>{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'access' && <Access {...props} />}
      {tab === 'dashboard' && <Dashboards {...props} />}
      {tab === 'people' && (
        <section className="card">
          <div className="card-head"><div><div className="card-title">People page columns</div><div className="card-sub">Which profile columns show in Simple and in Studio mode, and their order (left to right).</div></div></div>
          <OrderList items={cfg.people} flags={[['simple', 'Simple'], ['studio', 'Studio']]} onChange={(items) => save('people_columns', items.map(({ key, simple, studio }) => ({ key, simple, studio })), 'People columns')} />
        </section>
      )}
      {tab === 'downloads' && <Downloads {...props} />}
      {tab === 'names' && <Names {...props} />}
      <p className="tiny muted" style={{ marginTop: 10 }}>Every change saves at once and applies to everyone the next time their app loads. Undo (top bar) reverses a change.</p>
    </div>
  );
}

/* role × ability grid; the database follows mark / manage / approve / finance straight away */
function Access({ cfg, reload, setError }) {
  const [busy, setBusy] = useState('');
  async function toggle(role, cap) {
    const on = cfg.caps[role]?.has(cap);
    setBusy(`${role}.${cap}`);
    const add = async () => { const { error } = await supabase.from('role_caps').insert({ role, cap }); if (error) throw error; };
    const del = async () => { const { error } = await supabase.from('role_caps').delete().eq('role', role).eq('cap', cap); if (error) throw error; };
    try { await (on ? del : add)(); record({ label: `${roleName(role)}: ${cap}`, undo: on ? add : del, redo: on ? del : add }); } catch (e) { setError(`Not saved: ${e.message}`); }
    setBusy(''); reload();
  }
  const block = (title, sub, roles, sides) => (
    <section className="card flush">
      <div className="card-head pad"><div><div className="card-title">{title}</div><div className="card-sub">{sub}</div></div></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="gtable access settings-grid">
          <thead><tr><th>Can…</th>{roles.map((r) => <th key={r}>{roleName(r).replace(' / Visionary', '').replace(' (አገልግሎት አስተባባሪ)', '')}</th>)}</tr></thead>
          <tbody>{CAPS.filter(([, , side]) => sides.includes(side)).map(([cap, label, , db]) => (
            <tr key={cap}><td>{label}{db && <span className="tag" style={{ marginLeft: 6 }} title="The database enforces this too">enforced</span>}</td>
              {roles.map((r) => <td key={r} className="num"><input type="checkbox" aria-label={`${roleName(r)}: ${label}`} checked={!!cfg.caps[r]?.has(cap)} disabled={!!busy} onChange={() => toggle(r, cap)} /></td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
  return (
    <>
      {block('Center roles', 'What each role can do on the center side, at its own center. The admin can always do everything.', CENTER_ROLE_KEYS, ['center', 'both'])}
      {block('HQ roles', 'What each HQ role can see on the HQ side. Editing HQ plans, activities and events is set per person (HQ access on Users & roles). HQ roles never change a center’s data.', HQ_ROLE_KEYS, ['both'])}
    </>
  );
}

function Dashboards({ cfg, save }) {
  return (
    <>
      <section className="card">
        <div className="card-head"><div><div className="card-title">Center dashboard · cards</div><div className="card-sub">Show or hide each card in Simple and in Studio mode; use the arrows to change the order.</div></div></div>
        <OrderList items={cfg.dash} flags={[['simple', 'Simple'], ['studio', 'Studio']]} onChange={(items) => save('dashboard', items.map(({ key, simple, studio }) => ({ key, simple, studio })), 'dashboard cards')} />
      </section>
      <section className="card">
        <div className="card-head"><div><div className="card-title">Number tiles</div><div className="card-sub">The tiles under “Total present”. Center = the center’s own dashboard; HQ = a center opened from the HQ side.</div></div></div>
        <OrderList items={cfg.tiles} flags={[['center', 'Center'], ['hq', 'HQ']]} onChange={(items) => save('tiles', items.map(({ key, center, hq }) => ({ key, center, hq })), 'number tiles')} />
      </section>
      <section className="card">
        <div className="card-head"><div><div className="card-title">HQ overview · cards</div><div className="card-sub">The first page of the HQ side.</div></div></div>
        <OrderList items={cfg.hqCards} flags={[['on', 'Show']]} onChange={(items) => save('hq_dashboard', items.map(({ key, on }) => ({ key, on })), 'HQ overview cards')} />
      </section>
    </>
  );
}

/* a list with on/off flags and up / down arrows */
export function OrderList({ items, flags, onChange }) {
  const move = (i, d) => { const a = [...items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <table className="gtable left order-list">
      <thead><tr><th style={{ width: 70 }}>Order</th><th>Item</th>{flags.map(([k, l]) => <th key={k} className="num">{l}</th>)}</tr></thead>
      <tbody>{items.map((x, i) => (
        <tr key={x.key}>
          <td><span className="row" style={{ gap: 2 }}>
            <button className="icon-btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${x.label} up`}><Icon.up width="15" height="15" /></button>
            <button className="icon-btn sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${x.label} down`}><Icon.down width="15" height="15" /></button>
          </span></td>
          <td>{x.label}</td>
          {flags.map(([k]) => <td key={k} className="num"><input type="checkbox" aria-label={`${x.label}: ${k}`} checked={!!x[k]} onChange={(e) => onChange(items.map((y) => (y.key === x.key ? { ...y, [k]: e.target.checked } : y)))} /></td>)}
        </tr>
      ))}</tbody>
    </table>
  );
}

/* each download: on / off, who may use it, which columns it has */
function Downloads({ cfg, save, ctx }) {
  const [open, setOpen] = useState(null);
  const d = cfg.downloads;
  const put = (k, patch, label) => save('downloads', { ...d, [k]: { ...d[k], ...patch } }, label);
  const roles = ROLES.filter(([k]) => !['admin', 'former', 'pending'].includes(k)).map(([k]) => k);
  const heads = useMemo(() => {
    if (!open) return [];
    try { const rep = buildReport(ctx, open, {}); return [...new Set(rep.sheets.flatMap((s) => s.head || []).filter(Boolean))]; } catch { return []; }
  }, [open, ctx]);
  return (
    <section className="card flush">
      <div className="card-head pad"><div><div className="card-title">Downloads</div><div className="card-sub">Turn a download off, limit it to some roles (none ticked = every role that has “Downloads”), and choose its columns.</div></div></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="gtable left">
          <thead><tr><th>Download</th><th className="num">On</th><th>Only for</th><th>Columns</th></tr></thead>
          <tbody>{DOWNLOADS.map(([k, label]) => (
            <tr key={k} className={d[k].on ? '' : 'inactive-row'}>
              <td><b>{label}</b></td>
              <td className="num"><input type="checkbox" checked={d[k].on} aria-label={`${label} on`} onChange={(e) => put(k, { on: e.target.checked }, label)} /></td>
              <td><div className="chips" style={{ flexWrap: 'wrap' }}>{roles.map((r) => {
                const on = (d[k].roles || []).includes(r);
                return <button key={r} className={`chipbtn tiny-chip ${on ? 'on' : ''}`} onClick={() => { const list = on ? d[k].roles.filter((x) => x !== r) : [...(d[k].roles || []), r]; put(k, { roles: list.length ? list : null }, label); }}>{roleName(r).replace(' / Visionary', '').replace(' (አገልግሎት አስተባባሪ)', '')}</button>;
              })}</div></td>
              <td>
                <button className="btn ghost small" onClick={() => setOpen(open === k ? null : k)}>{d[k].hide.length ? `${d[k].hide.length} hidden` : 'All'} <Icon.down width="14" height="14" /></button>
                {open === k && (
                  <div className="col-pick">
                    {heads.length === 0 ? <p className="small muted">No columns to choose (or no data yet).</p> : heads.map((h) => (
                      <label key={h} className="check"><input type="checkbox" checked={!d[k].hide.includes(h)} onChange={(e) => put(k, { hide: e.target.checked ? d[k].hide.filter((x) => x !== h) : [...d[k].hide, h] }, `${label} columns`)} /> {h}</label>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function Names({ cfg, save }) {
  const keys = ROLES.filter(([k]) => !['pending'].includes(k));
  return (
    <section className="card">
      <div className="card-head"><div><div className="card-title">Role names</div><div className="card-sub">What each role is called everywhere in the app. Leave empty for the built-in name.</div></div></div>
      <div className="form">
        {keys.map(([k, l]) => (
          <label key={k}>{l}<input defaultValue={cfg.roleNames[k] || ''} placeholder={l} onBlur={(e) => {
            const v = e.target.value.trim(); if ((cfg.roleNames[k] || '') === v) return;
            const n = { ...cfg.roleNames }; if (v) n[k] = v; else delete n[k]; save('role_names', n, 'role names');
          }} /></label>
        ))}
      </div>
    </section>
  );
}
