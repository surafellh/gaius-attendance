import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, semesterOf, semesterStart } from '../lib/ethiopian';
import { ONE, pct, personFacts } from '../lib/stats';
import { Sheet, Initials, Icon, CAT_COLOR } from './common';

export const PROFILE_FIELDS = [
  ['full_name', 'Full name'], ['gender', 'Gender'], ['phone', 'Phone'], ['church', 'Church'], ['education', 'Education'],
  ['work', 'Work'], ['passion', 'Passion / talent'], ['area', 'Residential area'], ['birth_year', 'Birth year'],
  ['level', 'Level'], ['start_teaching', 'First teaching (roadmap)'],
];
const TABS = [
  ['members', 'Members', (p) => p.category === 'Member'],
  ['leaders', 'Leaders', (p) => ['Leader', 'Senior Leader'].includes(p.category)],
  ['potential', 'Potential leaders', (p) => p.potential_leader],
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
              {perm.manage && <button className="icon-btn" onClick={() => setEdit(p)} aria-label={`Edit ${p.name}'s profile`}><Icon.edit /></button>}
            </div>
          );
        })}
      </div>
      {list.length === 0 && <div className="card empty">Nobody here yet.</div>}
      {edit && <ProfileForm person={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} setError={setError} />}
    </div>
  );
}

export function ProfileForm({ person, onClose, onSaved, setError }) {
  const [f, setF] = useState(() => Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, person[k] ?? ''])));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const age = f.birth_year ? new Date().getFullYear() - Number(f.birth_year) : null;
  async function save(e) {
    e.preventDefault(); setBusy(true);
    const patch = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : k === 'birth_year' ? Number(v) : v]));
    const { error } = await supabase.from('people').update(patch).eq('id', person.id);
    setBusy(false);
    if (error) return setError(`Not saved: ${error.message}`);
    onSaved();
  }
  return (
    <Sheet title={`Profile · ${person.name}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="row2">
          <label>Full name<input value={f.full_name} onChange={set('full_name')} /></label>
          <label>Gender<select value={f.gender} onChange={set('gender')}><option value="">—</option><option value="M">Male</option><option value="F">Female</option></select></label>
        </div>
        <div className="row2">
          <label>Phone<input inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
          <label>Birth year {age ? <span className="faint">(about {age})</span> : null}<input inputMode="numeric" value={f.birth_year} onChange={set('birth_year')} placeholder="e.g. 2001" /></label>
        </div>
        <div className="row2">
          <label>Church<input value={f.church} onChange={set('church')} /></label>
          <label>Residential area<input value={f.area} onChange={set('area')} /></label>
        </div>
        <div className="row2">
          <label>Education<input value={f.education} onChange={set('education')} /></label>
          <label>Work<input value={f.work} onChange={set('work')} /></label>
        </div>
        <div className="row3">
          <label>Passion / talent<input value={f.passion} onChange={set('passion')} /></label>
          <label>Level<input value={f.level} onChange={set('level')} placeholder="1, 2, 3…" /></label>
          <label>First teaching<input value={f.start_teaching} onChange={set('start_teaching')} placeholder="e.g. ተሃድሶ" /></label>
        </div>
        <p className="muted tiny">Joined: {person.week_joined ? etLabel(person.week_joined, true) : 'before records'} (set from the person's first Sunday).</p>
        <button className="btn lime wide" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </form>
    </Sheet>
  );
}
