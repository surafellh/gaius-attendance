import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, semesterOf, semesterStart } from '../lib/ethiopian';
import { ONE, pct, personFacts, stageOf, STAGE_LABEL } from '../lib/stats';
import { Drawer, Initials, Icon, CAT_COLOR } from './common';

export const PROFILE_FIELDS = [
  ['full_name', 'Full name'], ['gender', 'Gender'], ['phone', 'Phone'], ['church', 'Church'], ['education', 'Education'],
  ['work', 'Work'], ['passion', 'Passion / talent'], ['area', 'Residential area'], ['birth_year', 'Birth year'],
  ['level', 'Level'], ['start_teaching', 'First teaching (roadmap)'],
];
const TABS = [
  ['members', 'Members', (p) => p.category === 'Member'],
  ['leaders', 'Leaders', (p) => ['Leader', 'Senior Leader'].includes(p.category) && stageOf(p) !== 'potential'],
  ['potential', 'Potential leaders', (p) => stageOf(p) === 'potential'],
  ['candidates', 'Leadership candidates', (p) => stageOf(p) === 'candidate'],
  ['promising', 'Promising new comers', null],
  ['informal', 'Informal members', (p) => ['Active Informal Member', 'Inactive Informal Member'].includes(p.category)],
];
const filled = (p) => PROFILE_FIELDS.filter(([k]) => p[k] != null && String(p[k]).trim() !== '').length;

export default function Profiles({ D, idx, latest, perm, openPerson, reload, setError }) {
  const [tab, setTab] = useState('members');
  const [edit, setEdit] = useState(null);
  const semStart = semesterStart(semesterOf(latest));
  const promising = useMemo(() => D.people.filter((p) => p.category === 'New Comer' && !p.archived
    && personFacts(p, idx.byPerson[p.id], idx.held, latest, semStart).promising), [D.people, idx, latest, semStart]);
  const test = TABS.find((t) => t[0] === tab)[2];
  const list = (tab === 'promising' ? promising : D.people.filter((p) => !p.archived && test(p)));

  if (!perm.profiles) return <div className="page"><div className="card empty">Profiles are visible to leaders, the follow-up team and HQ.</div></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Profiles</h1>
          <p className="page-sub">The HQ profile format. Fill it in once someone becomes a member; new comers only need a phone number and who invited them.</p>
        </div>
      </div>
      <div className="scroll-x">
        <div className="chips" style={{ flexWrap: 'nowrap' }}>
          {TABS.map(([k, l, t]) => (
            <button key={k} className={`chipbtn ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
              {l} <span className="n">{k === 'promising' ? promising.length : D.people.filter((p) => !p.archived && t(p)).length}</span>
            </button>
          ))}
        </div>
      </div>
      {tab === 'promising' && <p className="small muted">New comers who came at least half the Sundays since their first visit and 4 Sundays in a row at least once – likely members in the next 6 months.</p>}
      <div className="people-grid">
        {list.map((p) => {
          const n = filled(p);
          const f = personFacts(p, idx.byPerson[p.id], idx.held, latest, semStart);
          return (
            <div key={p.id} className="pcard">
              <Initials name={p.name} category={p.category} />
              <button className="pinfo" onClick={() => openPerson(p.id)}>
                <span className="pname">{p.full_name || p.name}{p.full_name && p.full_name !== p.name ? <span className="muted" style={{ fontWeight: 600 }}> · {p.name}</span> : null}</span>
                <span className="pmeta">
                  <span className="dot" style={{ background: CAT_COLOR[p.category] }} />{ONE[p.category]}
                  <span>{pct(f.semRate)} this semester</span>
                  <span className={`tag ${n >= 9 ? 'ok' : n >= 4 ? 'sun' : 'bad'}`}>{n}/{PROFILE_FIELDS.length} filled</span>
                </span>
              </button>
              {perm.mark && <button className="icon-btn" onClick={() => setEdit(p)} aria-label={`Edit ${p.name}'s profile`}><Icon.edit /></button>}
            </div>
          );
        })}
      </div>
      {list.length === 0 && <div className="card empty">Nobody here yet.</div>}
      {edit && <ProfileForm person={edit} people={D.people} canEdit={perm.mark} onOpenCard={() => { const id = edit.id; setEdit(null); openPerson(id); }} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} setError={setError} />}
    </div>
  );
}

export function ProfileForm({ person, onClose, onSaved, setError, canEdit = true, onOpenCard, people = [] }) {
  const keys = ['name', ...PROFILE_FIELDS.map(([k]) => k), 'invited_by', 'notes'];
  const [f, setF] = useState(() => Object.fromEntries(keys.map((k) => [k, person[k] ?? ''])));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const age = f.birth_year ? new Date().getFullYear() - Number(f.birth_year) : null;
  const n = PROFILE_FIELDS.filter(([k]) => String(f[k] ?? '').trim() !== '').length;
  async function save(e) {
    e?.preventDefault(); setBusy(true);
    const patch = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : k === 'birth_year' ? Number(v) : typeof v === 'string' ? v.trim() : v]));
    if (!patch.name) patch.name = person.name;
    const inviter = people.find((p) => p.name.toLowerCase() === (patch.invited_by || '').toLowerCase());
    patch.invited_by_id = inviter?.id || null;
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from('people').update(patch).eq('id', person.id);
    setBusy(false);
    if (error) return setError(`Not saved: ${error.message}`);
    onSaved();
  }
  const dis = !canEdit;
  return (
    <Drawer onClose={onClose}
      title={<div className="row" style={{ gap: 10 }}><Initials name={person.name} category={person.category} /><div style={{ minWidth: 0 }}><h3>{person.full_name || person.name}</h3><div className="small muted">{ONE[person.category] || 'No group'} · #{person.sn} · {n}/{PROFILE_FIELDS.length} profile fields filled</div></div></div>}
      footer={<>
        {onOpenCard && <button type="button" className="btn ghost" onClick={onOpenCard}>Attendance card</button>}
        {canEdit && <button type="submit" form="profile-form" className="btn lime" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>}
      </>}>
      <form id="profile-form" className="form" onSubmit={save}>
        <div className="form-section">Who they are</div>
        <div className="row2">
          <label>Name on the list<input disabled={dis} value={f.name} onChange={set('name')} /></label>
          <label>Full name<input disabled={dis} value={f.full_name} onChange={set('full_name')} /></label>
        </div>
        <div className="row2">
          <label>Gender<select disabled={dis} value={f.gender} onChange={set('gender')}><option value="">—</option><option value="M">Male</option><option value="F">Female</option></select></label>
          <label>Birth year {age ? <span className="faint">(about {age})</span> : null}<input disabled={dis} inputMode="numeric" value={f.birth_year} onChange={set('birth_year')} placeholder="e.g. 2001" /></label>
        </div>
        <div className="row2">
          <label>Phone<input disabled={dis} inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
          <label>Residential area<input disabled={dis} value={f.area} onChange={set('area')} /></label>
        </div>
        <div className="form-section">Church, study and work</div>
        <label>Church<input disabled={dis} value={f.church} onChange={set('church')} /></label>
        <label>Education<input disabled={dis} value={f.education} onChange={set('education')} /></label>
        <div className="row2">
          <label>Work<input disabled={dis} value={f.work} onChange={set('work')} /></label>
          <label>Passion / talent<input disabled={dis} value={f.passion} onChange={set('passion')} /></label>
        </div>
        <div className="form-section">In Gaius</div>
        <div className="row2">
          <label>Invited by<input disabled={dis} list="profile-people" value={f.invited_by} onChange={set('invited_by')} /></label>
          <label>Joined<input disabled value={person.week_joined ? etLabel(person.week_joined, true) : 'Before records'} /></label>
        </div>
        <div className="row2">
          <label>Level<input disabled={dis} value={f.level} onChange={set('level')} placeholder="1, 2, 3…" /></label>
          <label>First teaching (roadmap)<input disabled={dis} value={f.start_teaching} onChange={set('start_teaching')} placeholder="e.g. ተሃድሶ, ወንጌል" /></label>
        </div>
        {stageOf(person) && <p className="small muted" style={{ margin: 0 }}><span className="tag sun">{STAGE_LABEL[stageOf(person)]}</span> Change it from the Leadership page or the person’s card.</p>}
        <label>Notes<textarea disabled={dis} rows={4} value={f.notes} onChange={set('notes')} placeholder="Anything the leaders should know" /></label>
        <datalist id="profile-people">{people.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      </form>
    </Drawer>
  );
}
