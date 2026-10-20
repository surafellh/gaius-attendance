import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, todayIso } from '../lib/ethiopian';
import { ONE } from '../lib/stats';
import { Sheet, Icon, CAT_COLOR } from './common';

const GROUPS = [
  ['Member', 'Members', (p) => p.category === 'Member'], ['Leader', 'Leaders', (p) => ['Leader', 'Senior Leader'].includes(p.category)],
  ['Informal', 'Informal members', (p) => ['Active Informal Member', 'Inactive Informal Member'].includes(p.category)],
  ['New Comer', 'New comers', (p) => p.category === 'New Comer'],
];

/* Teaching roadmap: who has taken which lesson, and what each person still needs */
export default function Roadmap({ D, perm, openPerson, reload, setError }) {
  const [groups, setGroups] = useState(['Member']);
  const [need, setNeed] = useState('');           // "took:<id>" or "needs:<id>"
  const flip = (k) => setGroups((g) => (g.includes(k) ? (g.length > 1 ? g.filter((x) => x !== k) : g) : [...g, k]));
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(null);
  const cid = D.center?.id || 1;
  const lessons = D.lessons.filter((l) => l.active && (l.center_id == null || l.center_id === cid));
  const done = useMemo(() => {
    const m = new Map();
    for (const x of D.plessons) m.set(`${x.person_id}|${x.lesson_id}`, x);
    return m;
  }, [D.plessons]);
  const test = (p) => GROUPS.some(([k, , t]) => groups.includes(k) && t(p));
  let people = D.people.filter((p) => !p.archived && test(p)).sort((a, b) => (a.sn ?? 1e9) - (b.sn ?? 1e9));
  if (need) { const [mode, id] = need.split(':'); people = people.filter((p) => (mode === 'took') === done.has(`${p.id}|${id}`)); }
  const countOf = (p) => lessons.filter((l) => done.has(`${p.id}|${l.id}`)).length;
  const complete = people.filter((p) => lessons.length && countOf(p) === lessons.length).length;

  async function toggle(p, l) {
    if (!perm.mark) return;
    const k = `${p.id}|${l.id}`;
    setBusy(k);
    const ex = done.get(k);
    const { error } = ex ? await supabase.from('person_lessons').delete().eq('id', ex.id)
      : await supabase.from('person_lessons').insert({ person_id: p.id, lesson_id: l.id, completed_on: todayIso() });
    setBusy(null);
    if (error) return setError(`Not saved: ${error.message}`);
    reload();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Teaching roadmap</h1><p className="page-sub">Who has gone through which lesson. Tap a box to mark a lesson as taken (or untaken).</p></div>
        {perm.manage && <button className="btn ghost" onClick={() => setManage(true)}><Icon.book /> Lessons ({lessons.length})</button>}
      </div>
      <div className="banner">This is a starting list taken from the “first teaching” column. When HQ sends the roadmap, add its lessons in order under <b>Lessons</b>.</div>
      <div className="toolbar row" style={{ flexWrap: 'wrap' }}>
        <div className="chips">
          {GROUPS.map(([k, l, t]) => <button key={k} aria-pressed={groups.includes(k)} className={`chipbtn ${groups.includes(k) ? 'on' : ''}`} onClick={() => flip(k)}>{groups.includes(k) ? '✓ ' : ''}{l} <span className="n">{D.people.filter((p) => !p.archived && t(p)).length}</span></button>)}
          <button className="chipbtn" onClick={() => setGroups(GROUPS.map((g) => g[0]))}>Everyone</button>
        </div>
        <select className="small-select" value={need} onChange={(e) => setNeed(e.target.value)} aria-label="Filter by lesson">
          <option value="">Any lesson</option>
          <optgroup label="Took it">{lessons.map((l) => <option key={l.id} value={`took:${l.id}`}>Took: {l.name_am || l.name}</option>)}</optgroup>
          <optgroup label="Still needs it">{lessons.map((l) => <option key={l.id} value={`needs:${l.id}`}>Still needs: {l.name_am || l.name}</option>)}</optgroup>
        </select>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{people.length} people · {complete} have taken every lesson</p>
      <div className="sheet-grid">
        <table className="xl road">
          <thead>
            <tr>
              <th className="fz0">#</th><th className="fz1">Name</th>
              {lessons.map((l) => <th key={l.id} className="lesson-h"><span className="am">{l.name_am || l.name}</span><small>{l.name_am ? l.name : ''}</small><small>{D.people.filter((p) => !p.archived && test(p) && done.has(`${p.id}|${l.id}`)).length} done</small></th>)}
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p, i) => {
              const n = countOf(p);
              return (
                <tr key={p.id}>
                  <td className="fz0">{i + 1}</td>
                  <td className="fz1"><button className="xl-name btn-name" style={{ '--c': CAT_COLOR[p.category] || 'var(--line)' }} onClick={() => openPerson(p.id)}>{p.name}<small>{ONE[p.category]}</small></button></td>
                  {lessons.map((l) => {
                    const x = done.get(`${p.id}|${l.id}`);
                    return (
                      <td key={l.id} className="lesson-c">
                        <button className={`lbox ${x ? 'on' : ''}`} disabled={!perm.mark || busy === `${p.id}|${l.id}`} onClick={() => toggle(p, l)}
                          title={x ? `Taken${x.completed_on ? ' ' + etLabel(x.completed_on, true) : ''}${x.note ? ' – ' + x.note : ''}` : 'Not yet'} aria-label={`${p.name}: ${l.name}${x ? ', taken' : ', not yet'}`}>{x ? '✓' : ''}</button>
                      </td>
                    );
                  })}
                  <td><span className={`rpill ${lessons.length && n === lessons.length ? 'hi' : n ? 'mid' : 'lo'}`}>{n}/{lessons.length}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {manage && <LessonSheet D={D} lessons={D.lessons.filter((l) => l.center_id == null || l.center_id === cid)} cid={cid} admin={perm.switchCenter} onClose={() => setManage(false)} reload={reload} setError={setError} />}
    </div>
  );
}

function LessonSheet({ lessons, cid, admin, onClose, reload, setError }) {
  const [f, setF] = useState({ name: '', name_am: '' });
  async function run(q) { const { error } = await q; if (error) setError(`Not saved: ${error.message}`); else reload(); }
  return (
    <Sheet title="Roadmap lessons" onClose={onClose}>
      <p className="small muted" style={{ marginBottom: 10 }}>In teaching order. HQ lessons (used by every center) can only be changed by the admin.</p>
      <ul className="hist">
        {[...lessons].sort((a, b) => a.sort - b.sort).map((l) => (
          <li key={l.id} style={{ opacity: l.active ? 1 : 0.5 }}>
            <span><b className="am">{l.name_am || l.name}</b> {l.name_am && <span className="muted">· {l.name}</span>} {l.center_id == null && <span className="tag">HQ</span>}</span>
            {(admin || l.center_id != null) && <span className="row">
              <button className="link small" onClick={() => run(supabase.from('lessons').update({ sort: l.sort - 1.5 }).eq('id', l.id))}>↑</button>
              <button className="link small" onClick={() => { const n = window.prompt('Name', l.name_am || l.name); if (n) run(supabase.from('lessons').update(l.name_am ? { name_am: n } : { name: n }).eq('id', l.id)); }}>Rename</button>
              <button className="link small" onClick={() => run(supabase.from('lessons').update({ active: !l.active }).eq('id', l.id))}>{l.active ? 'Hide' : 'Show'}</button>
            </span>}
          </li>
        ))}
      </ul>
      <form className="form" style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); if (!f.name.trim() && !f.name_am.trim()) return; run(supabase.from('lessons').insert({ center_id: admin ? null : cid, name: f.name.trim() || f.name_am.trim(), name_am: f.name_am.trim() || null, sort: lessons.length + 1 })); setF({ name: '', name_am: '' }); }}>
        <div className="row2"><label>Lesson (Amharic)<input value={f.name_am} onChange={(e) => setF({ ...f, name_am: e.target.value })} /></label><label>In English<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label></div>
        <button className="btn ghost">Add lesson{admin ? ' (HQ)' : ''}</button>
      </form>
    </Sheet>
  );
}
