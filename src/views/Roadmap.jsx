import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, todayIso } from '../lib/ethiopian';
import { ONE } from '../lib/stats';
import { Sheet, Icon, CAT_COLOR } from './common';
import { lessonIndex, programTopics, norm } from '../lib/teaching';

const GROUPS = [
  ['Member', 'Members', (p) => p.category === 'Member'], ['Leader', 'Leaders', (p) => ['Leader', 'Senior Leader'].includes(p.category)],
  ['Informal', 'Informal members', (p) => ['Active Informal Member', 'Inactive Informal Member'].includes(p.category)],
  ['New Comer', 'New comers', (p) => p.category === 'New Comer'],
];

/* Teaching roadmap: who has taken which lesson, and what each person still needs.
   Taken = ticked here, or present on a Sunday whose program topic is linked to the lesson, or their first teaching. */
export default function Roadmap({ D, idx, perm, openPerson, reload, setError }) {
  const [groups, setGroups] = useState(() => GROUPS.map((g) => g[0]));
  const [need, setNeed] = useState('');           // "took:<id>" or "needs:<id>"
  const flip = (k) => setGroups((g) => (g.includes(k) ? (g.length > 1 ? g.filter((x) => x !== k) : g) : [...g, k]));
  const [manage, setManage] = useState(false);
  const [topics, setTopics] = useState(false);
  const [busy, setBusy] = useState(null);
  const cid = D.center?.id || 1;
  const lessons = D.lessons.filter((l) => l.active && (l.center_id == null || l.center_id === cid));
  const li = useMemo(() => lessonIndex(D, lessons, idx, cid), [D, idx, cid]); // eslint-disable-line
  const test = (p) => GROUPS.some(([k, , t]) => groups.includes(k) && t(p));
  const base = D.people.filter((p) => !p.archived && test(p)).sort((a, b) => (a.sn ?? 1e9) - (b.sn ?? 1e9));
  let people = base;
  if (need) { const [mode, id] = need.split(':'); const l = lessons.find((x) => String(x.id) === id); if (l) people = people.filter((p) => (mode === 'took') === !!li.took(p, l)); }
  const countOf = (p) => lessons.filter((l) => li.took(p, l)).length;
  const complete = people.filter((p) => lessons.length && countOf(p) === lessons.length).length;
  const linked = [...li.topicsOf.values()].reduce((n, t) => n + t.length, 0);

  async function toggle(p, l) {
    if (!perm.mark) return;
    const k = `${p.id}|${l.id}`;
    setBusy(k);
    const ex = li.manual.get(k);
    const { error } = ex ? await supabase.from('person_lessons').delete().eq('id', ex.id)
      : await supabase.from('person_lessons').insert({ person_id: p.id, lesson_id: l.id, completed_on: todayIso() });
    setBusy(null);
    if (error) return setError(`Not saved: ${error.message}`);
    reload();
  }
  const title = (t) => (t.how === 'ticked' ? `Ticked${t.on ? ' ' + etLabel(t.on, true) : ''}${t.x?.note ? ' – ' + t.x.note : ''} · tap to untick`
    : t.how === 'attended' ? `Present on ${etLabel(t.on, true)} (from the program report)` : `First teaching${t.on ? ' ' + etLabel(t.on, true) : ''}`);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Teaching roadmap</h1><p className="page-sub">Who has gone through which lesson. A lesson counts as taken when someone was present on a Sunday it was taught (from the program report), when it was their first teaching, or when it is ticked here.</p></div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {perm.manage && <button className="btn lime" onClick={() => setTopics(true)}><Icon.book /> Choose roadmap teachings</button>}
          {perm.manage && <button className="btn ghost" onClick={() => setManage(true)}>Lessons ({lessons.length})</button>}
        </div>
      </div>
      {perm.manage && linked === 0 && <div className="banner">No Sunday programs are linked to the roadmap yet. Use <b>Choose roadmap teachings</b> to pick which program topics are roadmap lessons – everyone who was present those Sundays is then counted.</div>}
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
              {lessons.map((l) => <th key={l.id} className="lesson-h"><span className="am">{l.name_am || l.name}</span><small>{l.name_am && l.name !== l.name_am ? l.name : ''}</small><small>{base.filter((p) => li.took(p, l)).length} took · {li.sundaysOf.get(l.id).length ? `taught ${li.sundaysOf.get(l.id).length}×` : 'not linked'}</small></th>)}
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
                    const t = li.took(p, l);
                    const auto = t && t.how !== 'ticked';
                    return (
                      <td key={l.id} className="lesson-c">
                        <button className={`lbox ${t ? 'on' : ''} ${auto ? 'auto' : ''}`} disabled={!perm.mark || auto || busy === `${p.id}|${l.id}`} onClick={() => toggle(p, l)}
                          title={t ? title(t) : 'Not yet'} aria-label={`${p.name}: ${l.name}${t ? ', taken' : ', not yet'}`}>{t ? '✓' : ''}</button>
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
      <div className="grid-legend"><span className="row"><i className="lbox on sm">✓</i> Ticked here</span><span className="row"><i className="lbox on auto sm">✓</i> From attendance / first teaching</span></div>
      {manage && <LessonSheet D={D} lessons={D.lessons.filter((l) => l.center_id == null || l.center_id === cid)} cid={cid} admin={perm.switchCenter} onClose={() => setManage(false)} reload={reload} setError={setError} />}
      {topics && <TopicsSheet D={D} lessons={lessons} cid={cid} li={li} onClose={() => setTopics(false)} reload={reload} setError={setError} />}
    </div>
  );
}

/* every program in the monthly program report; pick which ones are roadmap teachings */
function TopicsSheet({ D, lessons, cid, li, onClose, reload, setError }) {
  const [only, setOnly] = useState(true);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);
  const links = (D.lessonTopics || []).filter((t) => t.center_id === cid);
  const all = programTopics(D).filter((t) => (!only || t.kinds.includes('Teaching')) && (!q || t.topic.toLowerCase().includes(q.toLowerCase())));
  const linkOf = (topic) => links.find((t) => norm(t.topic) === norm(topic));
  async function choose(topic, v) {
    setBusy(topic);
    try {
      const ex = linkOf(topic);
      if (ex) { const { error } = await supabase.from('lesson_topics').delete().eq('id', ex.id); if (error) throw error; }
      let lessonId = v === 'new' ? null : Number(v) || null;
      if (v === 'new') {
        const { data, error } = await supabase.from('lessons').insert({ center_id: cid, name: topic, name_am: topic, sort: lessons.length + 1, active: true }).select().single();
        if (error) throw error;
        lessonId = data.id;
      }
      if (lessonId) { const { error } = await supabase.from('lesson_topics').insert({ center_id: cid, lesson_id: lessonId, topic }); if (error) throw error; }
      reload();
    } catch (e) { setError(`Not saved: ${e.message}`); }
    setBusy(null);
  }
  return (
    <Sheet title="Choose roadmap teachings" onClose={onClose} wide>
      <div className="form">
        <p className="small muted" style={{ margin: 0 }}>Every program from the monthly program report. Not every teaching is on the roadmap – for each one that is, pick its lesson (or make it a new lesson). Everyone present that Sunday then counts as having taken it.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="search" style={{ flex: 1, minWidth: 180 }}><Icon.search /><input placeholder="Search a topic…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Teachings only</label>
        </div>
        <ul className="topic-list">
          {all.map((t) => {
            const l = linkOf(t.topic);
            return (
              <li key={t.topic} className={l ? 'on' : ''}>
                <div className="topic-main">
                  <b className="am">{t.topic}</b>
                  <span className="tiny muted">{t.kinds.join(', ')} · {t.sundays.map((s) => etLabel(s, true)).join(', ')}</span>
                </div>
                <select className="small-select" value={l ? String(l.lesson_id) : ''} disabled={busy === t.topic} onChange={(e) => choose(t.topic, e.target.value)} aria-label={`Roadmap lesson for ${t.topic}`}>
                  <option value="">Not a roadmap teaching</option>
                  {lessons.map((x) => <option key={x.id} value={x.id}>Lesson: {x.name_am || x.name}</option>)}
                  <option value="new">+ New lesson from this topic</option>
                </select>
              </li>
            );
          })}
          {all.length === 0 && <li className="muted">No programs found.</li>}
        </ul>
      </div>
    </Sheet>
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
