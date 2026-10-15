import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, semesterOf, semesterStart } from '../lib/ethiopian';
import { ONE, pct, personFacts, stageOf, STAGE_LABEL } from '../lib/stats';
import LeaderStage from './LeaderStage';
import { Drawer, Sheet, Initials, Icon, CAT_COLOR } from './common';

const RECS = ['Keep growing', 'Ready to serve as leader', 'Not now'];
const REC_TAG = { 'Keep growing': 'sun', 'Ready to serve as leader': 'ok', 'Not now': 'bad' };
const avgOf = (ev, crit) => {
  const v = crit.map((c) => Number(ev.scores?.[c.id])).filter((x) => x > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export default function Leadership({ D, idx, latest, today, perm, profile, reload, setError, openPerson }) {
  const [open, setOpen] = useState(null);
  const [crit, setCrit] = useState(false);
  const [pick, setPick] = useState(false);
  const cid = D.center?.id || 1;
  const criteria = D.criteria.filter((c) => c.active && (c.center_id == null || c.center_id === cid));
  const semStart = semesterStart(semesterOf(latest));
  const people = D.people.filter((p) => stageOf(p) && !p.archived);
  const cards = useMemo(() => people.map((p) => {
    const evs = D.evals.filter((e) => e.person_id === p.id).sort((a, b) => a.evaluated_on.localeCompare(b.evaluated_on) || a.id - b.id);
    const last = evs[evs.length - 1];
    return { p, evs, last, avg: last ? avgOf(last, criteria) : null, trend: evs.map((e) => avgOf(e, criteria)), f: personFacts(p, idx.byPerson[p.id], idx.held, latest, semStart) };
  }), [people, D.evals, criteria, idx, latest, semStart]); // eslint-disable-line

  if (!perm.profiles) return <div className="page"><div className="card empty">Leadership evaluations are visible to leaders and HQ.</div></div>;
  const sel = open && cards.find((c) => c.p.id === open);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Leadership</h1><p className="page-sub">Candidates (members) → potential leaders (in the leadership team) → leaders. Scored on the same areas each time so growth shows over months.</p></div>
        <div className="row">
          {perm.manage && <button className="btn ghost" onClick={() => setCrit(true)}>Criteria ({criteria.length})</button>}
          {perm.manage && <button className="btn lime" onClick={() => setPick(true)}><Icon.plus /> Add someone</button>}
        </div>
      </div>
      {cards.length === 0 && <div className="card empty">No potential leaders yet. Use “Add someone” to start a member on the leadership path, or change it from a person’s card.</div>}
      {[['potential', 'Potential leaders', 'Already in the leadership team – they count as leaders.'], ['candidate', 'Leadership candidates', 'Members being prepared to join the leadership team.']].map(([st, title, sub]) => {
        const group = cards.filter((c) => stageOf(c.p) === st);
        return group.length > 0 && (
      <section key={st} className="page" style={{ gap: 8 }}>
      <div><div className="card-title">{title} <span className="muted">({group.length})</span></div><div className="card-sub">{sub}</div></div>
      <div className="people-grid">
        {group.map(({ p, evs, last, avg, trend, f }) => (
          <button key={p.id} className="pcard lead-card" onClick={() => setOpen(p.id)}>
            <Initials name={p.name} category={p.category} />
            <span className="pinfo">
              <span className="pname">{p.full_name || p.name}</span>
              <span className="pmeta">
                <span className="dot" style={{ background: CAT_COLOR[p.category] }} />{STAGE_LABEL[stageOf(p)] || ONE[p.category]}
                <span>{pct(f.semRate)} this semester</span>
                {last ? <span>{evs.length} evaluation{evs.length > 1 ? 's' : ''} · last {etLabel(last.evaluated_on)}</span> : <span className="tag">not evaluated yet</span>}
                {last?.recommendation && <span className={`tag ${REC_TAG[last.recommendation]}`}>{last.recommendation}</span>}
              </span>
            </span>
            <span className="lead-score">
              <b>{avg ? avg.toFixed(1) : '–'}</b><small>/5</small>
              <Spark values={trend} />
            </span>
          </button>
        ))}
      </div>
      </section>
        );
      })}
      {sel && <PersonEval c={sel} criteria={criteria} perm={perm} profile={profile} today={today} cid={cid} idx={idx} latest={latest} onClose={() => setOpen(null)} reload={reload} setError={setError} openPerson={openPerson} />}
      {crit && <CriteriaSheet all={D.criteria.filter((c) => c.center_id == null || c.center_id === cid)} cid={cid} admin={perm.admin} onClose={() => setCrit(false)} reload={reload} setError={setError} />}
      {pick && <PickSheet D={D} onClose={() => setPick(false)} onPick={async (id) => {
        const { error } = await supabase.from('people').update({ leader_stage: 'candidate' }).eq('id', id);
        if (error) setError(`Not saved: ${error.message}`); setPick(false); reload();
      }} />}
    </div>
  );
}

function Spark({ values }) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return null;
  const w = 56, h = 18, x = (i) => (i / (v.length - 1)) * w, y = (s) => h - ((s - 1) / 4) * h;
  return (
    <svg width={w} height={h + 2} viewBox={`0 -1 ${w} ${h + 2}`} aria-label={`Trend ${v.map((s) => s.toFixed(1)).join(' → ')}`}>
      <polyline points={v.map((s, i) => `${x(i)},${y(s)}`).join(' ')} fill="none" stroke="var(--lime-strong)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(v.length - 1)} cy={y(v[v.length - 1])} r="2.5" fill="var(--lime-strong)" />
    </svg>
  );
}

function PersonEval({ c, criteria, perm, profile, today, cid, idx, latest, onClose, reload, setError, openPerson }) {
  const [stageOpen, setStageOpen] = useState(false);
  const { p, evs, f } = c;
  const [form, setForm] = useState(null);
  async function save(e) {
    e.preventDefault();
    const row = { center_id: p.center_id || cid, person_id: p.id, ...form, recommendation: form.recommendation || null };
    delete row.id;
    const { error } = form.id ? await supabase.from('evaluations').update(row).eq('id', form.id) : await supabase.from('evaluations').insert(row);
    if (error) return setError(`Not saved: ${error.message}`);
    setForm(null); reload();
  }
  const blank = { evaluated_on: today, evaluator: profile.full_name || '', scores: {}, strengths: '', growth: '', next_steps: '', recommendation: '' };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Drawer onClose={onClose}
      title={<div className="row" style={{ gap: 10 }}><Initials name={p.name} category={p.category} /><div><h3>{p.full_name || p.name}</h3><div className="small muted">{ONE[p.category]}{stageOf(p) ? ` · ${STAGE_LABEL[stageOf(p)]}` : ''} · {pct(f.semRate)} this semester</div></div></div>}
      footer={form ? <><button key="cancel" type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button><button key="save" type="submit" className="btn lime" form="eval-form">Save evaluation</button></>
        : <><button key="card" type="button" className="btn ghost" onClick={() => { onClose(); openPerson(p.id); }}>Attendance card</button>{perm.manage && <button key="new" type="button" className="btn lime" onClick={() => setForm(blank)}><Icon.plus width="16" height="16" /> New evaluation</button>}</>}>
      {form ? (
        <form id="eval-form" className="form" onSubmit={save}>
          <div className="row2">
            <label>Date<input type="date" value={form.evaluated_on} onChange={set('evaluated_on')} required /></label>
            <label>Evaluated by<input value={form.evaluator || ''} onChange={set('evaluator')} /></label>
          </div>
          <div className="form-section">Score each area · 1 = just starting, 5 = strong</div>
          {criteria.map((cr) => (
            <div key={cr.id} className="crit-row">
              <div><b>{cr.name}</b>{cr.description && <div className="tiny muted">{cr.description}</div>}</div>
              <div className="seg score-seg" role="radiogroup" aria-label={cr.name}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button type="button" key={n} role="radio" aria-checked={Number(form.scores[cr.id]) === n} className={Number(form.scores[cr.id]) === n ? 'on' : ''}
                    onClick={() => setForm({ ...form, scores: { ...form.scores, [cr.id]: Number(form.scores[cr.id]) === n ? undefined : n } })}>{n}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="form-section">Notes</div>
          <label>Strengths<textarea rows={2} value={form.strengths || ''} onChange={set('strengths')} /></label>
          <label>Areas to grow<textarea rows={2} value={form.growth || ''} onChange={set('growth')} /></label>
          <label>Next steps (mentoring, a task to try)<textarea rows={2} value={form.next_steps || ''} onChange={set('next_steps')} /></label>
          <label>Recommendation<select value={form.recommendation || ''} onChange={set('recommendation')}><option value="">—</option>{RECS.map((r) => <option key={r}>{r}</option>)}</select></label>
        </form>
      ) : <>
        {perm.manage && (
          <div className="stage-box">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span><b>Leadership stage:</b> {stageOf(p) ? STAGE_LABEL[stageOf(p)] : ONE[p.category]}</span>
              {!stageOpen && <button type="button" className="btn ghost small" onClick={() => setStageOpen(true)}>Change</button>}
            </div>
            {stageOpen && <LeaderStage p={p} idx={idx} latest={latest} reload={reload} setError={setError} onDone={() => { setStageOpen(false); if (!['candidate', 'potential'].includes(stageOf(p))) onClose(); }} />}
          </div>
        )}
        {evs.length === 0 ? <p className="muted">No evaluations yet.{perm.manage ? ' Start the first one with “New evaluation”.' : ''}</p> : (
        <>
          <div className="form-section">Progress</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable eval-table">
              <thead><tr><th>Area</th>{evs.map((e) => <th key={e.id}>{etLabel(e.evaluated_on)}<div className="tiny faint">{e.evaluated_on.slice(0, 4)}</div></th>)}</tr></thead>
              <tbody>
                {criteria.map((cr) => (
                  <tr key={cr.id}><td>{cr.name}</td>{evs.map((e) => { const v = Number(e.scores?.[cr.id]); return <td key={e.id}>{v ? <span className={`score s${v}`}>{v}</span> : <span className="faint">–</span>}</td>; })}</tr>
                ))}
                <tr className="total"><td>Average</td>{evs.map((e) => <td key={e.id}>{avgOf(e, criteria)?.toFixed(1) ?? '–'}</td>)}</tr>
              </tbody>
            </table>
          </div>
          {[...evs].reverse().map((e) => (
            <div key={e.id} className="eval-note">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>{etLabel(e.evaluated_on, true)}{e.evaluator ? ` · ${e.evaluator}` : ''}</b>
                <span className="row">{e.recommendation && <span className={`tag ${REC_TAG[e.recommendation]}`}>{e.recommendation}</span>}
                  {perm.manage && <button className="icon-btn" aria-label="Edit evaluation" onClick={() => setForm({ ...e })}><Icon.edit width="16" height="16" /></button>}</span>
              </div>
              {e.strengths && <p><span className="muted">Strengths: </span>{e.strengths}</p>}
              {e.growth && <p><span className="muted">To grow: </span>{e.growth}</p>}
              {e.next_steps && <p><span className="muted">Next: </span>{e.next_steps}</p>}
            </div>
          ))}
        </>
        )}
      </>}
    </Drawer>
  );
}

function CriteriaSheet({ all, cid, admin, onClose, reload, setError }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  async function run(q) { const { error } = await q; if (error) setError(`Not saved: ${error.message}`); else reload(); }
  return (
    <Sheet title="Evaluation criteria" onClose={onClose}>
      <p className="small muted" style={{ marginBottom: 10 }}>A starting set – replace it with the criteria from the leadership manual. HQ criteria (used by every center) can only be changed by the admin; you can add criteria for this center.</p>
      <ul className="hist">
        {all.sort((a, b) => a.sort - b.sort || a.id - b.id).map((c) => {
          const can = c.center_id != null || admin;
          return (
            <li key={c.id} style={{ opacity: c.active ? 1 : 0.5 }}>
              <span><b>{c.name}</b> {c.center_id == null && <span className="tag">HQ</span>}<div className="tiny muted">{c.description}</div></span>
              {can && <span className="row">
                <button className="link small" onClick={() => { const n = window.prompt('Name', c.name); if (n) run(supabase.from('eval_criteria').update({ name: n }).eq('id', c.id)); }}>Rename</button>
                <button className="link small" onClick={() => run(supabase.from('eval_criteria').update({ active: !c.active }).eq('id', c.id))}>{c.active ? 'Turn off' : 'Turn on'}</button>
              </span>}
            </li>
          );
        })}
      </ul>
      <form className="form" style={{ marginTop: 14 }} onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; run(supabase.from('eval_criteria').insert({ name: name.trim(), description: desc || null, center_id: admin ? null : cid, sort: all.length + 1 })); setName(''); setDesc(''); }}>
        <div className="row2"><label>New criterion<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>What it means<input value={desc} onChange={(e) => setDesc(e.target.value)} /></label></div>
        <button className="btn ghost">Add criterion{admin ? ' (HQ)' : ''}</button>
      </form>
    </Sheet>
  );
}

function PickSheet({ D, onClose, onPick }) {
  const [q, setQ] = useState('');
  const list = D.people.filter((p) => !p.archived && !stageOf(p) && ['Member', 'Active Informal Member'].includes(p.category))
    .filter((p) => !q || [p.name, p.full_name].some((v) => (v || '').toLowerCase().includes(q.toLowerCase())));
  return (
    <Sheet title="Add a leadership candidate" onClose={onClose}>
      <label className="search" style={{ marginBottom: 10 }}><Icon.search /><input autoFocus placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {list.map((p) => (
        <button key={p.id} className="list-row" style={{ border: 0, background: 'none', width: '100%', textAlign: 'left' }} onClick={() => onPick(p.id)}>
          <Initials name={p.name} category={p.category} />
          <span className="pinfo"><span className="pname">{p.full_name || p.name}</span><span className="pmeta">{ONE[p.category]}</span></span>
          <Icon.plus className="faint" />
        </button>
      ))}
    </Sheet>
  );
}
