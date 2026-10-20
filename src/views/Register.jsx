import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, sundaysOf, SEMESTERS, todayIso } from '../lib/ethiopian';
import { CATEGORIES, SHORT, ONE } from '../lib/stats';
import { Icon, Sheet, Initials, CAT_COLOR, PersonInput } from './common';
import { bestMatch, findPeople } from '../lib/names';
import { ProfileForm } from './Profiles';

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
  const [panel, setPanel] = useState(null);
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
                  <td><button className="icon-btn" onClick={() => setPanel(p)} aria-label={`Open ${p.name}'s profile`}><Icon.right /></button></td>
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
            <button key={p.id} className="list-row" style={{ border: 0, background: 'none', textAlign: 'left', width: '100%' }} onClick={() => setPanel(p)}>
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

      {panel && <ProfileForm key={panel.id} person={panel} people={D.people} canEdit={perm.mark} setError={setError}
        onOpenCard={() => { const id = panel.id; setPanel(null); openPerson(id); }} onClose={() => setPanel(null)} onSaved={() => { setPanel(null); reload(); }} />}
      {adding && <NewPersonSheet D={D} defaultSunday={latest} createRoll={createRoll} setError={setError} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

export async function registerPerson({ D, draft, createRoll, setError, category: cat = 'New Comer' }) {
  const category = draft.category || cat;
  const sn = Math.max(0, ...D.people.map((p) => p.sn || 0)) + 1;
  const inviter = draft.invited_by_id ? { id: draft.invited_by_id } : bestMatch(draft.invited_by || '', D.people);
  const joined = draft.week_joined || null;
  const { data, error } = await supabase.from('people').insert({
    sn, name: draft.name.trim(), phone: (draft.phone || '').trim() === '+251' ? null : (draft.phone || '').trim() || null,
    invited_by: draft.invited_by?.trim() || null, invited_by_id: inviter?.id || null, gender: draft.gender || null,
    week_joined: joined, category, nc_active: true, center_id: D.center?.id || 1,
  }).select().single();
  if (error) { setError(`Not saved: ${error.message}`); return false; }
  await supabase.from('category_history').insert({ person_id: data.id, category, since: joined || todayIso(), note: 'Registered' });
  if (joined && joined <= todayIso() && draft.present !== false) {
    if (createRoll) await createRoll(joined);
    await supabase.from('attendance').upsert({ person_id: data.id, sunday: joined, status: 'Present', category, active: true }, { onConflict: 'person_id,sunday' });
  }
  return true;
}

const REG_GROUPS = [['New Comer', 'New comer'], ['Active Informal Member', 'Active informal member'], ['Inactive Informal Member', 'Inactive informal member'], ['Member', 'Member'], ['Leader', 'Leader'], ['Senior Leader', 'Senior leader']];

export function NewPersonSheet({ D, defaultSunday, createRoll, setError, onClose, onDone }) {
  const [f, setF] = useState({ name: '', phone: '+251', invited_by: '', invited_by_id: null, week_joined: defaultSunday, category: 'New Comer', gender: '', present: true });
  const [busy, setBusy] = useState(false);
  const sundays = useMemo(recentSundays, []);
  const similar = f.name.trim().length > 1 ? findPeople(f.name, D.people, 5) : [];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title="Register someone" onClose={onClose}>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault(); if (!f.name.trim()) return;
        setBusy(true);
        const ok = await registerPerson({ D, draft: f, createRoll, setError });
        setBusy(false); if (ok) onDone();
      }}>
        <div className="row2">
          <label>Name<input autoFocus value={f.name} onChange={set('name')} required /></label>
          <label>Sex<select value={f.gender} onChange={set('gender')}><option value="">—</option><option value="M">Male</option><option value="F">Female</option></select></label>
        </div>
        {similar.length > 0 && <p className="small muted" style={{ margin: 0 }}>Already on the list: {similar.map(({ p }) => p.name).join(', ')}. If it’s a different person, add who invited them, e.g. “Nati (eneyew)”.</p>}
        <div className="row2">
          <label>Phone<input inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
          <label>Invited by<PersonInput value={f.invited_by} people={D.people} placeholder="Who brought them" onChange={(t, id) => setF({ ...f, invited_by: t, invited_by_id: id })} /></label>
        </div>
        <div className="row2">
          <label>Group<select value={f.category} onChange={set('category')}>{REG_GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>First Sunday
            <select value={f.week_joined || ''} onChange={(e) => setF({ ...f, week_joined: e.target.value || null })}>
              {sundays.map((s) => <option key={s} value={s}>{etLabel(s, true)} ({fmtGreg(s)} {s.slice(0, 4)})</option>)}
              <option value="">Before the records (earlier)</option>
            </select>
          </label>
        </div>
        {f.week_joined && <label className="check"><input type="checkbox" checked={f.present} onChange={(e) => setF({ ...f, present: e.target.checked })} /> Mark them present on {etLabel(f.week_joined)}</label>}
        <p className="muted small" style={{ margin: 0 }}>New comers start active. Full profile details can be filled in on the People page.</p>
        <button className="btn lime wide" disabled={busy}>{busy ? 'Registering…' : 'Register'}</button>
      </form>
    </Sheet>
  );
}
