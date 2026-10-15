import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, groupByMonth, sundaysOf, semesterOf, semesterStart, SEMESTERS, ET_MONTHS_AM } from '../lib/ethiopian';
import { CATEGORIES, ONE, pct, personFacts } from '../lib/stats';
import { Sheet, Initials, Icon, CAT_COLOR, telLink } from './common';
import { ProfileForm } from './Profiles';

export default function PersonSheet({ person: p, onClose, idx, latest, today, D, perm, saveMark, reload, setError, personBy }) {
  const [sem, setSem] = useState(semesterOf(latest));
  const [showProfile, setShowProfile] = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [manage, setManage] = useState(false);
  const marks = idx.byPerson[p.id] || {};
  const f = personFacts(p, marks, idx.held, latest, semesterStart(semesterOf(latest)));
  const s = sundaysOf(sem);
  const rec = marks[latest] || {};
  const history = D.history.filter((h) => h.person_id === p.id).sort((a, b) => (a.since < b.since ? 1 : -1));
  const assigns = D.assignments.filter((a) => a.person_id === p.id).sort((a, b) => ((a.since || '') < (b.since || '') ? 1 : -1));
  const current = assigns.find((a) => !a.until);
  const depts = D.members.filter((m) => m.person_id === p.id && !m.until).map((m) => ({ ...m, d: D.departments.find((d) => d.id === m.department_id) })).filter((m) => m.d);
  const leaders = D.people.filter((x) => ['Leader', 'Senior Leader'].includes(x.category) && !x.archived);
  const tel = telLink(p.phone);
  const si = SEMESTERS.indexOf(sem);

  return (
    <Sheet onClose={onClose} head={
      <div className="p-head">
        <Initials name={p.name} category={p.category} />
        <div style={{ minWidth: 0 }}>
          <h3>{p.name}</h3>
          <div className="pmeta">
            <span className="dot" style={{ background: CAT_COLOR[p.category] }} />{ONE[p.category] || 'No group'}
            {p.category === 'New Comer' && <span className={`tag ${p.nc_active ? 'ok' : ''}`}>{p.nc_active ? 'active' : 'inactive'}</span>}
            {f.promising && <span className="tag lime">promising</span>}
            {p.potential_leader && <span className="tag sun"><Icon.star width="11" height="11" /> potential leader</span>}
            {p.archived && <span className="tag bad">left</span>}
          </div>
        </div>
      </div>
    }>
      <div className="p-stats">
        <div className="p-stat"><b>{pct(f.semRate)}</b><span>This semester ({f.semPresent})</span></div>
        <div className="p-stat"><b>{f.streak}</b><span>Sundays missed in a row</span></div>
        <div className="p-stat"><b>{pct(f.sinceRate)}</b><span>Since first visit ({f.visits} visits)</span></div>
      </div>

      <dl className="kv">
        <dt>Phone</dt><dd>{tel ? <a href={tel}>{p.phone}</a> : <span className="faint">not saved</span>}</dd>
        <dt>First Sunday</dt><dd>{p.week_joined ? `${etLabel(p.week_joined, true)} (${fmtGreg(p.week_joined)})` : <span className="faint">before records</span>}</dd>
        <dt>Invited by</dt><dd>{p.invited_by_id && personBy[p.invited_by_id] ? personBy[p.invited_by_id].name : p.invited_by || <span className="faint">—</span>}</dd>
        <dt>Responsible</dt><dd>{current?.leader_name || p.responsible || <span className="faint">not assigned</span>}</dd>
        <dt>Last seen</dt><dd>{f.lastSeen ? etLabel(f.lastSeen, true) : <span className="faint">—</span>}</dd>
        {depts.length > 0 && <><dt>Departments</dt><dd>{depts.map((m) => `${m.d.name}${m.role === 'leader' ? ' (leads)' : ''}`).join(', ')}</dd></>}
      </dl>

      {perm.mark && latest <= today && (
        <>
          <div className="section-title">Follow-up for {etLabel(latest)} <span className="tag">{rec.status || 'not marked'}</span></div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="check"><input type="checkbox" checked={!!rec.called} onChange={(e) => saveMark(p.id, latest, { called: e.target.checked })} /> Called</label>
            <input className="grow" defaultValue={rec.reason || ''} placeholder="Reason or note, e.g. exams, travelling" aria-label="Reason"
              onBlur={(e) => e.target.value !== (rec.reason || '') && saveMark(p.id, latest, { reason: e.target.value || null })} />
            {tel && <a className="icon-btn call" href={tel} aria-label={`Call ${p.name}`}><Icon.phone /></a>}
          </div>
        </>
      )}

      <div className="section-title">
        <span>Attendance · {sem}</span>
        <span className="row">
          <button className="icon-btn" disabled={si <= 0} onClick={() => setSem(SEMESTERS[si - 1])} aria-label="Previous semester"><Icon.left /></button>
          <button className="icon-btn" disabled={si >= SEMESTERS.length - 1 || SEMESTERS[si + 1] > semesterOf(today)} onClick={() => setSem(SEMESTERS[si + 1])} aria-label="Next semester"><Icon.right /></button>
        </span>
      </div>
      <div className="strip">
        {groupByMonth(s).map((m) => [
          <div key={m.month} className="strip-month">{m.name} <span className="am">{ET_MONTHS_AM[m.month]}</span></div>,
          ...m.days.map(({ sunday, day }) => {
            const r = marks[sunday];
            const cls = r?.status === 'Present' ? 'P' : r?.status === 'Absent' ? 'A' : sunday > today ? 'F' : 'N';
            return (
              <div key={sunday} className="strip-cell" title={`${etLabel(sunday)}: ${r?.status || (idx.heldSet.has(sunday) ? 'not marked' : 'no record')}${r?.reason ? ' – ' + r.reason : ''}`}>
                <i className={cls}>{cls === 'P' ? '✓' : cls === 'A' ? '✕' : ''}</i><small>{day}</small>
              </div>
            );
          }),
        ])}
      </div>

      <div className="section-title">
        <span>Profile</span>
        {!showProfile && <button className="btn ghost small" onClick={() => setShowProfile(true)}><Icon.eye width="16" height="16" /> Show details</button>}
      </div>
      {showProfile && (
        <>
          <dl className="kv">
            {[['Full name', p.full_name], ['Gender', p.gender], ['Age', p.birth_year ? new Date().getFullYear() - p.birth_year : null], ['Church', p.church], ['Education', p.education],
              ['Work', p.work], ['Passion / talent', p.passion], ['Area', p.area], ['Level', p.level], ['First teaching', p.start_teaching], ['Notes', p.notes]].map(([k, v]) => (
              <span key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || <span className="faint">—</span>}</dd></span>
            ))}
          </dl>
          {perm.mark && <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setEditProfile(true)}><Icon.edit width="16" height="16" /> Edit profile</button>}
        </>
      )}

      {(history.length > 0 || assigns.length > 0) && (
        <>
          <div className="section-title">History</div>
          <ul className="hist">
            {history.map((h) => <li key={`h${h.id}`}><span>Group: <b>{ONE[h.category] || h.category}</b></span><span className="muted">since {etLabel(h.since, true)}</span></li>)}
            {assigns.map((a) => <li key={`a${a.id}`}><span>Responsible: <b>{a.leader_name}</b></span><span className="muted">{a.since ? etLabel(a.since) : '…'} – {a.until ? etLabel(a.until) : 'now'}</span></li>)}
          </ul>
        </>
      )}

      {perm.manage && (
        <>
          <div className="section-title"><span>Manage</span>{!manage && <button className="btn ghost small" onClick={() => setManage(true)}>Change group or responsible</button>}</div>
          {manage && <Manage p={p} idx={idx} latest={latest} leaders={leaders} current={current} reload={reload} setError={setError} onDone={() => setManage(false)} />}
        </>
      )}
      {editProfile && <ProfileForm person={p} people={D.people} canEdit={perm.mark} onClose={() => setEditProfile(false)} onSaved={() => { setEditProfile(false); reload(); }} setError={setError} />}
    </Sheet>
  );
}

function Manage({ p, idx, latest, leaders, current, reload, setError, onDone }) {
  const [cat, setCat] = useState(p.category || 'New Comer');
  const [from, setFrom] = useState(latest);
  const [lead, setLead] = useState(current?.leader_id || '');
  const [potential, setPotential] = useState(!!p.potential_leader);
  const [busy, setBusy] = useState(false);
  const recent = useMemo(() => idx.held.slice(-8).reverse(), [idx.held]);

  async function save() {
    setBusy(true);
    try {
      if (cat !== p.category) {
        const { error } = await supabase.from('people').update({ category: cat, nc_active: cat === 'New Comer' ? true : p.nc_active }).eq('id', p.id);
        if (error) throw error;
        // keep weekly records from the chosen Sunday in step with the new group
        await supabase.from('attendance').update({ category: cat, active: true }).eq('person_id', p.id).gte('sunday', from);
        await supabase.from('category_history').update({ since: from }).eq('person_id', p.id).eq('category', cat).gte('since', from);
      }
      const leader = leaders.find((l) => String(l.id) === String(lead));
      if (String(lead || '') !== String(current?.leader_id || '')) {
        const today = new Date().toISOString().slice(0, 10);
        if (current) await supabase.from('assignments').update({ until: today }).eq('id', current.id);
        if (leader) await supabase.from('assignments').insert({ person_id: p.id, leader_id: leader.id, leader_name: leader.name, since: today });
        await supabase.from('people').update({ responsible: leader?.name || null }).eq('id', p.id);
      }
      if (potential !== !!p.potential_leader) await supabase.from('people').update({ potential_leader: potential }).eq('id', p.id);
      reload(); onDone();
    } catch (e) { setError(`Not saved: ${e.message}`); }
    setBusy(false);
  }
  async function archive() {
    if (!window.confirm(`Mark ${p.name} as left? They disappear from new Sundays but all records stay.`)) return;
    await supabase.from('people').update({ archived: !p.archived }).eq('id', p.id);
    reload(); onDone();
  }
  return (
    <div className="form">
      <div className="row2">
        <label>Group<select value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{ONE[c]}</option>)}</select></label>
        <label>Counts from Sunday<select value={from} onChange={(e) => setFrom(e.target.value)} disabled={cat === p.category}>{recent.map((s) => <option key={s} value={s}>{etLabel(s, true)}</option>)}</select></label>
      </div>
      <label>Responsible person (follow-up)
        <select value={lead} onChange={(e) => setLead(e.target.value)}>
          <option value="">Not assigned</option>
          {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={potential} onChange={(e) => setPotential(e.target.checked)} /> Being considered as a potential leader</label>
      <p className="muted tiny">Earlier groups and responsible persons stay in the history.</p>
      <div className="row-actions">
        <button type="button" className="btn danger small" onClick={archive}>{p.archived ? 'Bring back' : 'Mark as left'}</button>
        <button type="button" className="btn lime" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
