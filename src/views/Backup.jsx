import { useState } from 'react';
import { supabase, fetchAll } from '../lib/supabase';
import { etLabel, todayIso } from '../lib/ethiopian';
import { record } from '../lib/undo';
import { SITE_DEFAULTS } from './Landing';
import Grid from './Grid';
import { Icon } from './common';

/* tables in the order they can be put back (a row's parent comes first); key = what identifies a row */
const TABLES = [
  ['centers', 'id'], ['departments', 'id'], ['people', 'id'], ['person_status', 'person_id,semester'], ['category_history', 'id'], ['assignments', 'id'],
  ['department_members', 'id'], ['attendance', 'person_id,sunday'], ['programs', 'id'], ['eval_criteria', 'id'], ['evaluations', 'id'], ['events', 'id'],
  ['meetings', 'id'], ['agenda_items', 'id'], ['teaching_plan', 'id'], ['plans', 'id'], ['plan_items', 'id'], ['lessons', 'id'], ['person_lessons', 'id'],
  ['lesson_topics', 'id'], ['hq_reconcile', 'id'], ['messages', 'id'], ['assets', 'id'], ['ledger', 'id'], ['site_info', 'key'],
];

/* App admin: backup (download everything as one file), restore (admin), and the landing page text */
export default function Backup({ D, R, perm, realProfile, reload, setError }) {
  const [busy, setBusy] = useState('');
  const [file, setFile] = useState(null);
  const [done, setDone] = useState('');

  async function backup() {
    setBusy('Downloading…');
    const data = {};
    for (const [t] of TABLES) { try { data[t] = await fetchAll(() => supabase.from(t).select('*')); } catch { data[t] = []; } }
    const meta = { app: 'gaius-attendance', made: new Date().toISOString(), by: realProfile.email, scope: perm.admin ? 'all centers' : D.center?.name };
    const blob = new Blob([JSON.stringify({ meta, data })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `Gaius_backup_${perm.admin ? 'all' : D.center?.name}_${todayIso()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setBusy(''); setDone(`Backup saved · ${Object.values(data).reduce((n, x) => n + x.length, 0).toLocaleString()} rows.`);
  }
  async function readBackup(f) {
    try {
      const j = JSON.parse(await f.text());
      if (j?.meta?.app !== 'gaius-attendance' || !j.data) return setError('That file is not a Gaius backup.');
      setFile(j); setDone('');
    } catch (e) { setError(`Couldn’t read the backup: ${e.message}`); }
  }
  async function restore() {
    if (!window.confirm(`Put back every row from the backup of ${etLabel(file.meta.made.slice(0, 10), true)}?\nRows changed since then return to how they were; deleted rows come back. Rows added later stay.`)) return;
    let n = 0;
    try {
      for (const [t, key] of TABLES) {
        const rows = file.data[t] || [];
        for (let i = 0; i < rows.length; i += 500) {
          setBusy(`Restoring ${t.replace(/_/g, ' ')}… ${i}/${rows.length}`);
          const { error } = await supabase.from(t).upsert(rows.slice(i, i + 500), { onConflict: key });
          if (error) throw new Error(`${t}: ${error.message}`);
          n += Math.min(500, rows.length - i);
        }
      }
      setDone(`Restored ${n.toLocaleString()} rows from the backup of ${etLabel(file.meta.made.slice(0, 10), true)}.`); setFile(null); reload();
    } catch (e) { setError(`Restore stopped: ${e.message}. Rows before that point were restored.`); }
    setBusy('');
  }

  const site = { ...SITE_DEFAULTS, ...(R.site || {}) };
  const siteRows = [['logo', 'Logo (image link)'], ['tagline', 'Tagline'], ['vision', 'Vision'], ['verse', 'Key verse'], ['verse_ref', 'Verse reference'], ['about', 'About Gaius'], ['website', 'Website'], ['telegram', 'Telegram']]
    .map(([key, label]) => ({ id: key, key, label, value: site[key] || '' }));
  async function saveSite(r, patch) {
    const { error } = await supabase.from('site_info').upsert({ key: r.key, value: patch.value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return setError(`Not saved: ${error.message}`);
    const put = (value) => async () => { const { error: e } = await supabase.from('site_info').upsert({ key: r.key, value }, { onConflict: 'key' }); if (e) throw e; };
    record({ label: `landing ${r.label.toLowerCase()}`, undo: put(r.value), redo: put(patch.value) });
    reload();
  }

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <section className="card">
        <div className="card-head"><div><div className="card-title">Backup &amp; restore</div><div className="card-sub">A backup is one file with every record you can see{perm.admin ? ' – all centers' : ` – ${D.center?.name}`}. Keep it somewhere safe (Google Drive, Telegram saved messages). Undo (top bar) covers this session’s changes; a backup covers everything.</div></div></div>
        <div className="import-box">
          <button className="btn lime" disabled={!!busy} onClick={backup}><Icon.download width="18" height="18" /> Download a backup now</button>
          {perm.restore && <label className="btn ghost file-btn"><Icon.upload width="18" height="18" /> Restore from a backup…<input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files[0] && readBackup(e.target.files[0])} /></label>}
        </div>
        {busy && <p className="small muted">{busy}</p>}
        {done && <p className="banner ok" style={{ margin: '10px 0 0' }}>{done}</p>}
        {file && (
          <div className="restore-box">
            <p className="small" style={{ margin: 0 }}>Backup of <b>{etLabel(file.meta.made.slice(0, 10), true)}</b> by {file.meta.by} ({file.meta.scope}).</p>
            <div className="chips" style={{ flexWrap: 'wrap', margin: '8px 0' }}>{TABLES.filter(([t]) => file.data[t]?.length).map(([t]) => <span key={t} className="tag">{t.replace(/_/g, ' ')} · {file.data[t].length}</span>)}</div>
            <div className="row"><button className="btn danger" disabled={!!busy} onClick={restore}>Restore these rows</button><button className="btn ghost" onClick={() => setFile(null)}>Cancel</button></div>
          </div>
        )}
      </section>
      {perm.admin && (
        <section className="card">
          <div className="card-head"><div><div className="card-title">Landing page</div><div className="card-sub">What everyone sees before signing in. Taken from gaiusministry.org – edit any line.</div></div></div>
          {!D.r5 && <p className="banner err">Run the release 5 SQL to save changes here.</p>}
          <Grid canEdit={D.r5} rows={siteRows} rowKey={(r) => r.key} onSave={saveSite}
            columns={[{ key: 'label', label: 'Item', ro: true, width: 140 }, { key: 'value', label: 'Text', width: 460 }]} />
        </section>
      )}
    </div>
  );
}
