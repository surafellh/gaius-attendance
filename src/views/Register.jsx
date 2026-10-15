import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, sundaysOf, SEMESTERS, todayIso } from '../lib/ethiopian';
import { CATEGORIES, SHORT, ONE } from '../lib/stats';
import { Icon, Sheet, Initials, CAT_COLOR } from './common';

const recentSundays = () => {
  const t = todayIso();
  return SEMESTERS.flatMap(sundaysOf).filter((s) => s <= t).reverse();
};

export default function Register({ D, perm, latest, openPerson, saveMark, createRoll, reload, setError }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '+251', invited_by: '', week_joined: latest });
  const [busy, setBusy] = useState(false);
  const sundays = useMemo(recentSundays, []);

  const list = D.people
    .filter((p) => showArchived || !p.archived)
    .filter((p) => cat === 'All' || p.category === cat)
    .filter((p) => !q || [p.name, p.full_name, p.phone, p.invited_by].some((v) => (v || '').toLowerCase().includes(q.toLowerCase())));
  const count = (c) => D.people.filter((p) => !p.archived && (c === 'All' || p.category === c)).length;

  async function update(p, patch) {
    if (Object.entries(patch).every(([k, v]) => (p[k] || '') === (v || ''))) return;
    const { error } = await supabase.from('people').update(patch).eq('id', p.id);
    if (error) setError(`Not saved: ${error.message}`); else reload();
  }
  async function addRow() {
    if (!draft.name.trim()) return;
    setBusy(true);
    const ok = await registerPerson({ D, draft, createRoll, setError });
    setBusy(false);
    if (ok) { setDraft({ name: '', phone: '+251', invited_by: '', week_joined: draft.week_joined }); reload(); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">People</h1>
          <p className="page-sub">Everyone in the order they first came. {count('All')} on the list.</p>
        </div>
        {perm.mark && <button className="btn lime" onClick={() => setAdding(true)}><Icon.plus /> Register someone</button>}
      </div>
      <label className="search">
        <Icon.search /><span className="sr-only">Search</span>
        <input placeholder="Search name, phone or who invited them…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="scroll-x">
        <div className="chips" style={{ flexWrap: 'nowrap' }}>
          {['All', ...CATEGORIES].map((c) => (
            <button key={c} className={`chipbtn ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{SHORT[c] || c} <span className="n">{count(c)}</span></button>
          ))}
          <button className={`chipbtn ${showArchived ? 'on' : ''}`} onClick={() => setShowArchived(!showArchived)}>Show left / archived</button>
        </div>
      </div>

      <div className="card flush">
        <div className="reg-wrap desk">
          <table className="reg-table">
            <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Invited by</th><th>First Sunday</th><th>Group</th><th>Responsible</th><th /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td className="sn">{p.sn}</td>
                  <td><input defaultValue={p.name} disabled={!perm.mark} onBlur={(e) => update(p, { name: e.target.value.trim() || p.name })} aria-label="Name" /></td>
                  <td><input defaultValue={p.phone || ''} disabled={!perm.mark} inputMode="tel" onBlur={(e) => update(p, { phone: e.target.value.trim() })} aria-label="Phone" /></td>
                  <td><input defaultValue={p.invited_by || ''} disabled={!perm.mark} list="people-names" onBlur={(e) => update(p, { invited_by: e.target.value.trim() || null })} aria-label="Invited by" /></td>
                  <td className="small" style={{ whiteSpace: 'nowrap', padding: '0 8px' }}>{p.week_joined ? etLabel(p.week_joined, true) : <span className="faint">earlier</span>}</td>
                  <td><span className="row small" style={{ gap: 6, whiteSpace: 'nowrap', padding: '0 8px' }}><span className="dot" style={{ background: CAT_COLOR[p.category] || 'var(--line)' }} />{ONE[p.category] || '—'}{p.category === 'New Comer' && <span className={`tag ${p.nc_active ? 'ok' : ''}`}>{p.nc_active ? 'active' : 'inactive'}</span>}</span></td>
                  <td className="small" style={{ padding: '0 8px', whiteSpace: 'nowrap' }}>{p.responsible || <span className="faint">—</span>}</td>
                  <td><button className="icon-btn" onClick={() => openPerson(p.id)} aria-label={`Open ${p.name}`}><Icon.right /></button></td>
                </tr>
              ))}
              {perm.mark && !q && cat === 'All' && (
                <tr className="new">
                  <td className="sn">+</td>
                  <td><input placeholder="New name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addRow()} /></td>
                  <td><input placeholder="+251…" inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></td>
                  <td><input placeholder="Who invited them" list="people-names" value={draft.invited_by} onChange={(e) => setDraft({ ...draft, invited_by: e.target.value })} /></td>
                  <td><select value={draft.week_joined} onChange={(e) => setDraft({ ...draft, week_joined: e.target.value })}>{sundays.slice(0, 30).map((s) => <option key={s} value={s}>{etLabel(s, true)}</option>)}</select></td>
                  <td className="small muted" style={{ padding: '0 8px' }}>New comer</td>
                  <td colSpan={2}><button className="btn small lime" disabled={busy || !draft.name.trim()} onClick={addRow}>{busy ? 'Adding…' : 'Add row'}</button></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="reg-cards">
          {list.map((p) => (
            <button key={p.id} className="list-row" style={{ border: 0, background: 'none', textAlign: 'left', width: '100%' }} onClick={() => openPerson(p.id)}>
              <span className="faint small" style={{ width: 28, textAlign: 'center' }}>{p.sn}</span>
              <Initials name={p.name} category={p.category} />
              <span className="pinfo">
                <span className="pname">{p.name}</span>
                <span className="pmeta">
                  <span>{ONE[p.category] || '—'}</span>
                  {p.invited_by && <span>via {p.invited_by}</span>}
                  {p.week_joined && <span>since {etLabel(p.week_joined)}</span>}
                </span>
              </span>
              <Icon.right className="faint" />
            </button>
          ))}
        </div>
      </div>
      <datalist id="people-names">{D.people.map((p) => <option key={p.id} value={p.name} />)}</datalist>

      {adding && <NewPersonSheet D={D} defaultSunday={latest} createRoll={createRoll} setError={setError} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

export async function registerPerson({ D, draft, createRoll, setError, category = 'New Comer' }) {
  const sn = Math.max(0, ...D.people.map((p) => p.sn || 0)) + 1;
  const inviter = D.people.find((p) => p.name.toLowerCase() === (draft.invited_by || '').trim().toLowerCase());
  const { data, error } = await supabase.from('people').insert({
    sn, name: draft.name.trim(), phone: (draft.phone || '').trim() === '+251' ? null : draft.phone.trim(),
    invited_by: draft.invited_by?.trim() || null, invited_by_id: inviter?.id || null,
    week_joined: draft.week_joined, category, nc_active: true, center_id: D.center?.id || 1,
    responsible: draft.responsible || null,
  }).select().single();
  if (error) { setError(`Not saved: ${error.message}`); return false; }
  await supabase.from('category_history').insert({ person_id: data.id, category, since: draft.week_joined, note: 'Registered' });
  if (draft.week_joined <= todayIso()) {
    if (createRoll) await createRoll(draft.week_joined);
    await supabase.from('attendance').upsert({ person_id: data.id, sunday: draft.week_joined, status: 'Present', category, active: true }, { onConflict: 'person_id,sunday' });
  }
  return true;
}

export function NewPersonSheet({ D, defaultSunday, createRoll, setError, onClose, onDone }) {
  const [f, setF] = useState({ name: '', phone: '+251', invited_by: '', week_joined: defaultSunday });
  const [busy, setBusy] = useState(false);
  const sundays = useMemo(recentSundays, []);
  const dup = f.name.trim().length > 2 && D.people.filter((p) => p.name.toLowerCase().includes(f.name.trim().toLowerCase().split(' ')[0]));
  return (
    <Sheet title="Register a new comer" onClose={onClose}>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault(); if (!f.name.trim()) return;
        setBusy(true);
        const ok = await registerPerson({ D, draft: f, createRoll, setError });
        setBusy(false); if (ok) onDone();
      }}>
        <label>Name<input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        {dup?.length > 0 && <p className="small muted">Similar names already on the list: {dup.slice(0, 5).map((p) => p.name).join(', ')}. Add who invited them to tell them apart.</p>}
        <div className="row2">
          <label>Phone<input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label>Invited by<input list="people-names-2" value={f.invited_by} onChange={(e) => setF({ ...f, invited_by: e.target.value })} placeholder="Who brought them" /></label>
        </div>
        <label>First Sunday
          <select value={f.week_joined} onChange={(e) => setF({ ...f, week_joined: e.target.value })}>
            {sundays.slice(0, 30).map((s) => <option key={s} value={s}>{etLabel(s, true)} ({fmtGreg(s)})</option>)}
          </select>
        </label>
        <datalist id="people-names-2">{D.people.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <p className="muted small">They start as an active new comer and are marked present on their first Sunday. Full profile details can be added later, once they become a member.</p>
        <button className="btn lime wide" disabled={busy}>{busy ? 'Registering…' : 'Register'}</button>
      </form>
    </Sheet>
  );
}
