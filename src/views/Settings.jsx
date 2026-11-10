import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { record } from '../lib/undo';
import { CAPS, CENTER_ROLE_KEYS, HQ_ROLE_KEYS, DOWNLOADS } from '../lib/config';
import { ROLES, roleName } from '../lib/roles';
import { buildReport } from './ExportSheet';
import { Icon } from './common';
import Centers from './CentersAdmin';

/* Settings (admin): change the app without code – what each role can do, the dashboard, columns, downloads, role names */
export default function Settings({ R, ctx, reload, setError }) {
  const [tab, setTab] = useState('access');
  const cfg = R.config;
  const TABS = [['access', 'Roles & access'], ['centers', 'Centers'], ['dashboard', 'Dashboard'], ['people', 'People columns'], ['downloads', 'Downloads'], ['names', 'Role names'], ['other', 'Calendar, finance & lists']];
  if (!cfg.fromDb) return <div className="banner err">Settings are saved in the database, so they need the SQL file <b>run_v8_to_v11.sql</b> to be run in Supabase once (SQL Editor → paste → Run). Until then the app uses its built-in rules.</div>;

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
      {tab === 'centers' && <Centers {...props} />}
      {tab === 'dashboard' && <Dashboards {...props} />}
      {tab === 'people' && (
        <section className="card">
          <div className="card-head"><div><div className="card-title">People page columns</div><div className="card-sub">Which profile columns show in Simple and in Studio mode, and their order (left to right).</div></div></div>
          <OrderList items={cfg.people} flags={[['simple', 'Simple'], ['studio', 'Studio']]} onChange={(items) => save('people_columns', items.map(({ key, simple, studio }) => ({ key, simple, studio })), 'People columns')} />
        </section>
      )}
      {tab === 'downloads' && <Downloads {...props} />}
      {tab === 'names' && <Names {...props} />}
      {tab === 'other' && <Other {...props} />}
      <p className="tiny muted" style={{ marginTop: 10 }}>Every change saves at once and applies to everyone the next time their app loads. Undo (top bar) reverses a change.</p>
    </div>
  );
}

/* roles: rename, describe, add your own (center or HQ), remove unused ones */
function RolesEditor({ R, reload, setError }) {
  const [draft, setDraft] = useState({ name: '', side: 'center', copy: '' });
  if (!R.r8) return <div className="banner err">Adding your own roles needs the release 8 SQL (run_v8_to_v11.sql) to be run in Supabase once.</div>;
  const rows = [...(R.roles || [])].sort((a, b) => (a.side === b.side ? 0 : a.side === 'hq' ? -1 : 1) || (a.sort ?? 100) - (b.sort ?? 100));
  const upd = async (r, patch) => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, r[k] ?? null]));
    const put = (v) => async () => { const { error } = await supabase.from('app_roles').update(v).eq('key', r.key); if (error) throw error; };
    try { await put(patch)(); record({ label: `role ${r.name}`, undo: put(before), redo: put(patch) }); } catch (e) { setError(`Not saved: ${e.message}`); }
    reload();
  };
  async function add() {
    const name = draft.name.trim(); if (!name) return;
    const key = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || `role_${Date.now() % 100000}`;
    const k = (R.roles || []).some((x) => x.key === key) ? `${key}_${Date.now() % 1000}` : key;
    const { error } = await supabase.from('app_roles').insert({ key: k, name, side: draft.side, sort: 200 });
    if (error) return setError(`Role not added: ${error.message}`);
    const caps = draft.copy ? [...(R.config.caps[draft.copy] || [])] : [];
    if (caps.length) { const { error: e2 } = await supabase.from('role_caps').insert(caps.map((cap) => ({ role: k, cap }))); if (e2) setError(`Abilities not copied: ${e2.message}`); }
    setDraft({ name: '', side: draft.side, copy: '' }); reload();
  }
  async function remove(r) {
    if (!window.confirm(`Remove the role “${r.name}”? Its abilities are removed too.`)) return;
    const { error } = await supabase.from('app_roles').delete().eq('key', r.key);
    if (error) return setError(error.message.includes('still has') ? `${r.name} is still given to someone – change their role first.` : `Not removed: ${error.message}`);
    reload();
  }
  return (
    <section className="card flush">
      <div className="card-head pad"><div><div className="card-title">Roles</div><div className="card-sub">Rename any role, or add your own – a center role (works at one center) or an HQ role (the HQ side). Then tick what it can do below.</div></div></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="gtable left">
          <thead><tr><th>Name</th><th>Side</th><th>What it is for</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><input defaultValue={r.name} key={r.name} aria-label={`Name of ${r.name}`} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.name && upd(r, { name: e.target.value.trim() })} /></td>
                <td><span className={`tag ${r.side === 'hq' ? 'sun' : 'ok'}`}>{r.side === 'hq' ? 'HQ' : 'Center'}</span></td>
                <td><input defaultValue={r.description || ''} key={r.description || ''} placeholder="Short description" aria-label={`Description of ${r.name}`} onBlur={(e) => e.target.value !== (r.description || '') && upd(r, { description: e.target.value || null })} /></td>
                <td>{!r.builtin && <button className="icon-btn" aria-label={`Remove ${r.name}`} onClick={() => remove(r)}><Icon.trash width="16" height="16" /></button>}</td>
              </tr>
            ))}
            <tr className="ge-new">
              <td><input placeholder="New role name, e.g. Treasurer" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="New role name" /></td>
              <td><select value={draft.side} onChange={(e) => setDraft({ ...draft, side: e.target.value, copy: '' })} aria-label="Side"><option value="center">Center</option><option value="hq">HQ</option></select></td>
              <td><select value={draft.copy} onChange={(e) => setDraft({ ...draft, copy: e.target.value })} aria-label="Start from"><option value="">Start with no abilities</option>{rows.filter((r) => r.side === draft.side).map((r) => <option key={r.key} value={r.key}>Copy abilities of {r.name}</option>)}</select></td>
              <td><button className="btn lime small" disabled={!draft.name.trim()} onClick={add} aria-label="Add role"><Icon.plus width="16" height="16" /></button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Access(props) {
  return (
    <>
      <RolesEditor {...props} />
      <AccessGrid {...props} editable />
    </>
  );
}

/* role × ability grid; the database follows mark / manage / approve / finance straight away */
export function AccessGrid({ R, reload, setError, editable }) {
  const cfg = R.config;
  const [busy, setBusy] = useState('');
  const can = editable && cfg.fromDb;
  async function toggle(role, cap) {
    const on = cfg.caps[role]?.has(cap);
    setBusy(`${role}.${cap}`);
    const add = async () => { const { error } = await supabase.from('role_caps').insert({ role, cap }); if (error) throw error; };
    const del = async () => { const { error } = await supabase.from('role_caps').delete().eq('role', role).eq('cap', cap); if (error) throw error; };
    try { await (on ? del : add)(); record({ label: `${roleName(role)}: ${cap}`, undo: on ? add : del, redo: on ? del : add }); } catch (e) { setError(`Not saved: ${e.message}`); }
    setBusy(''); reload();
  }
  const short = (r) => roleName(r).replace(' / Visionary', '').replace(' (አገልግሎት አስተባባሪ)', '');
  const block = (title, sub, roles, sides) => (
    <section className="card flush">
      <div className="card-head pad"><div><div className="card-title">{title}</div><div className="card-sub">{sub}</div></div></div>
      <div style={{ overflowX: 'auto' }}>
        <table className="gtable access settings-grid">
          <thead><tr><th>Can…</th><th title="The admin can always do everything">Admin</th>{roles.map((r) => <th key={r}>{short(r)}</th>)}</tr></thead>
          <tbody>{CAPS.filter(([, , side]) => sides.includes(side)).map(([cap, label, , db]) => (
            <tr key={cap}><td>{label}{db && <span className="tag" style={{ marginLeft: 6 }} title="The database enforces this too">enforced</span>}</td>
              <td className="num"><span className="yes">✓</span></td>
              {roles.map((r) => <td key={r} className="num">{can
                ? <input type="checkbox" aria-label={`${roleName(r)}: ${label}`} checked={!!cfg.caps[r]?.has(cap)} disabled={!!busy} onChange={() => toggle(r, cap)} />
                : cfg.caps[r]?.has(cap) ? <span className="yes">✓</span> : <span className="faint">–</span>}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
  return (
    <div className="settings">
      {editable && !cfg.fromDb && <div className="banner err">To change these, run the SQL file run_v8_to_v11.sql in Supabase once. Until then these are the built-in rules.</div>}
      {block('Center roles · what each can do', 'On the center side, at its own center.', CENTER_ROLE_KEYS, ['center', 'both'])}
      {block('HQ roles · what each can see', 'On the HQ side. Editing HQ plans, activities and events is set per person (HQ access, Users & roles). HQ roles never change a center’s data.', HQ_ROLE_KEYS, ['both'])}
    </div>
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

/* smaller settings: overlap warnings, finance categories, list lengths */
function Other({ cfg, save }) {
  const num = (key, obj, field, label) => (
    <label>{label}<input inputMode="numeric" defaultValue={obj[field]} onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== obj[field]) save(key, { ...obj, [field]: v }, label); }} /></label>
  );
  const list = (field, label) => (
    <label>{label}<textarea rows={4} defaultValue={cfg.finance[field].join('\n')} onBlur={(e) => { const v = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); if (v.join('|') !== cfg.finance[field].join('|')) save('finance', { ...cfg.finance, [field]: v }, label); }} /></label>
  );
  return (
    <>
      <section className="card"><div className="card-head"><div><div className="card-title">Calendar</div><div className="card-sub">Days with this many plans or events (or more) are highlighted as overlapping – on the center calendar, the HQ calendar and after a plan upload.</div></div></div>
        <div className="form">{num('calendar', cfg.calendar, 'overlap', 'Overlap warning from (plans or events on one day)')}</div></section>
      <section className="card"><div className="card-head"><div><div className="card-title">Finance categories</div><div className="card-sub">One per line. Used in every center’s money in / out table; Amharic is fine.</div></div></div>
        <div className="form"><div className="row2">{list('inCats', 'Money in')}{list('outCats', 'Money out')}</div></div></section>
      <section className="card"><div className="card-head"><div><div className="card-title">Long lists</div><div className="card-sub">How many rows a long list shows before “Show more”, and how many names a top / lowest ranking shows.</div></div></div>
        <div className="form"><div className="row2">{num('lists', cfg.lists, 'pageSize', 'Rows before “Show more”')}{num('lists', cfg.lists, 'top', 'Names in a top / lowest list')}</div></div></section>
    </>
  );
}
