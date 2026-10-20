import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, semesterOf, semName, todayIso } from '../lib/ethiopian';
import { CATEGORIES, ONE, SHORT, stageOf, STAGE_LABEL } from '../lib/stats';
import { setResponsible } from '../lib/changes';
import { ageOf, stayText, notesWithoutStay, stayNote } from '../lib/exports';
import { bestMatch } from '../lib/names';
import { Icon, CAT_COLOR, PersonInput } from './common';
import { NewPersonSheet } from './Register';
import { ProfileForm } from './Profiles';
import GroupSheet from './GroupSheet';
import { firstTeaching } from '../lib/teaching';
import { Sheet } from './common';

const FILTERS = [
  ['All', 'Everyone', () => true],
  ['Leader', 'Leaders', (p) => p.category === 'Leader'],
  ['Senior Leader', 'Senior leaders', (p) => p.category === 'Senior Leader'],
  ['Member', 'Members', (p) => p.category === 'Member'],
  ['Informal', 'Informal members', (p) => ['Active Informal Member', 'Inactive Informal Member'].includes(p.category)],
  ['New Comer', 'New comers', (p) => p.category === 'New Comer'],
  ['Path', 'Leadership path', (p) => !!stageOf(p)],
];
/* the profile columns, in the HQ order; [key, label, width, kind] */
const COLS = [
  ['gender', 'Sex', 70, 'sex'], ['phone', 'Phone', 140], ['invited_by', 'Invited by', 150, 'person'], ['week_joined', 'First Sunday', 130, 'joined'],
  ['full_name', 'Full name', 180], ['church', 'Church', 170], ['education', 'Education', 200], ['work', 'Work', 150], ['passion', 'Passion / talent', 150],
  ['area', 'Area', 130], ['birth_date', 'Date of birth', 140, 'date'], ['age', 'Age', 60, 'age'], ['level', 'Level', 70], ['start_teaching', 'First teaching', 140],
  ['stay', 'Time with us', 110, 'stay'], ['responsible', 'Responsible', 160, 'resp'], ['notes', 'Notes', 220, 'notes'],
];

export default function People({ D, idx, latest, perm, openPerson, createRoll, reload, setError, personBy }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [showLeft, setShowLeft] = useState(false);
  const [adding, setAdding] = useState(false);
  const [panel, setPanel] = useState(null);
  const [group, setGroup] = useState(null);
  const [saved, setSaved] = useState('');
  const [fill, setFill] = useState(false);
  const sem = semesterOf(todayIso());
  const leaders = D.people.filter((p) => ['Leader', 'Senior Leader'].includes(p.category) && !p.archived);
  const test = FILTERS.find((f) => f[0] === filter)[2];
  const list = useMemo(() => D.people
    .filter((p) => (showLeft ? p.archived : !p.archived))
    .filter(test)
    .filter((p) => !q || [p.name, p.full_name, p.phone, p.invited_by].some((v) => (v || '').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.sn ?? 1e9) - (b.sn ?? 1e9)), [D.people, showLeft, test, q]);
  const count = (t) => D.people.filter((p) => !p.archived && t(p)).length;
  const current = (p) => D.assignments.find((a) => a.person_id === p.id && !a.until);

  async function update(p, patch) {
    if (Object.entries(patch).every(([k, v]) => String(p[k] ?? '') === String(v ?? ''))) return;
    const { error } = await supabase.from('people').update(patch).eq('id', p.id);
    if (error) return setError(`Not saved: ${error.message}`);
    setSaved(`Saved ${p.name}`); setTimeout(() => setSaved(''), 1500);
    reload();
  }
  const dis = !perm.mark;

  function cell(p, [k, , , kind]) {
    if (kind === 'sex') return <select disabled={dis} value={p.gender || ''} onChange={(e) => update(p, { gender: e.target.value || null })}><option value="">–</option><option value="M">M</option><option value="F">F</option></select>;
    if (kind === 'age') { const a = ageOf(p); return <span className="cell-ro">{a === '' ? '' : `${p.birth_date ? '' : '~'}${a}`}</span>; }
    if (kind === 'stay') return <span className="cell-ro" title="From their first Sunday, or the Apr 2026 list moved forward to today">{stayText(p)}</span>;
    if (kind === 'notes') return <input disabled={dis} defaultValue={notesWithoutStay(p.notes)} onBlur={(e) => update(p, { notes: [e.target.value.trim(), stayNote(p.notes)].filter(Boolean).join('\n') || null })} />;
    if (kind === 'joined') return <span className="cell-ro">{p.week_joined ? etLabel(p.week_joined, true) : <span className="faint">before records</span>}</span>;
    if (kind === 'date') return <input type="date" disabled={dis} defaultValue={p.birth_date || ''} onBlur={(e) => update(p, { birth_date: e.target.value || null, ...(e.target.value ? { birth_year: Number(e.target.value.slice(0, 4)) } : {}) })} />;
    if (kind === 'person') return <InviterCell p={p} people={D.people} disabled={dis} onSave={(name, id) => update(p, { invited_by: name || null, invited_by_id: id || null })} />;
    if (kind === 'resp') {
      const c = current(p);
      return (
        <select disabled={!perm.manage} value={c?.leader_id || ''} onChange={async (e) => {
          try { await setResponsible(p, leaders.find((l) => String(l.id) === e.target.value), D.assignments); reload(); } catch (er) { setError(`Not saved: ${er.message}`); }
        }}>
          <option value="">–</option>{leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      );
    }
    return <input disabled={dis} defaultValue={p[k] || ''} onBlur={(e) => update(p, { [k]: e.target.value.trim() || null })} />;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">People</h1>
          <p className="page-sub">Everyone and their profile, like a spreadsheet: scroll sideways, the name stays put. Changes save when you leave a box. Responsible persons are for {semName(sem)}.</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {perm.mark && <button className="btn ghost" onClick={() => setFill(true)}><Icon.book width="18" height="18" /> Fill first teaching</button>}
          {perm.mark && <button className="btn lime" onClick={() => setAdding(true)}><Icon.plus /> Register someone</button>}
        </div>
      </div>
      <div className="toolbar row">
        <label className="search" style={{ flex: 1 }}>
          <Icon.search /><span className="sr-only">Search</span>
          <input placeholder="Search name, phone or who invited them…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="scroll-x">
        <div className="chips" style={{ flexWrap: 'nowrap' }}>
          {FILTERS.map(([k, l, t]) => <button key={k} className={`chipbtn ${filter === k && !showLeft ? 'on' : ''}`} onClick={() => { setFilter(k); setShowLeft(false); }}>{l} <span className="n">{count(t)}</span></button>)}
          <button className={`chipbtn ${showLeft ? 'on' : ''}`} onClick={() => setShowLeft(!showLeft)}>Left / archived</button>
        </div>
      </div>

      <div className="sheet-grid">
        <table className="xl">
          <thead>
            <tr>
              <th className="fz0">#</th>
              <th className="fz1">Name</th>
              <th style={{ minWidth: 150 }}>Group</th>
              {COLS.map(([k, l, w]) => <th key={k} style={{ minWidth: w }}>{l}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p, i) => (
              <tr key={p.id}>
                <td className="fz0">{i + 1}</td>
                <td className="fz1">
                  <span className="xl-name" style={{ '--c': CAT_COLOR[p.category] || 'var(--line)' }}>
                    <input disabled={dis} defaultValue={p.name} onBlur={(e) => update(p, { name: e.target.value.trim() || p.name })} aria-label="Name" />
                  </span>
                </td>
                <td>
                  <button className="group-btn" disabled={!perm.manage} onClick={() => setGroup(p)} style={{ '--c': CAT_COLOR[p.category] || 'var(--line)' }}>
                    <span className="dot" style={{ background: CAT_COLOR[p.category] || 'var(--line)' }} />{ONE[p.category] || '—'}
                    {p.category === 'New Comer' && <small>{p.nc_active ? 'active' : 'inactive'}</small>}
                    {stageOf(p) && <small>{STAGE_LABEL[stageOf(p)].split(' ')[0].toLowerCase()}</small>}
                  </button>
                </td>
                {COLS.map((c) => <td key={c[0]}>{cell(p, c)}</td>)}
                <td><button className="icon-btn" onClick={() => setPanel(p)} aria-label={`Open ${p.name}'s full profile`}><Icon.right /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">Nobody here.</div>}
      </div>
      <p className="muted tiny">{list.length} shown · numbers count this list from 1. Group changes and responsible persons keep their history (open a person’s card to see it).</p>
      {saved && <div className="toast">{saved}</div>}

      {fill && <FirstTeachingSheet D={D} idx={idx} onClose={() => setFill(false)} onDone={() => { setFill(false); reload(); }} setError={setError} />}
      {adding && <NewPersonSheet D={D} defaultSunday={latest} createRoll={createRoll} setError={setError} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
      {panel && <ProfileForm key={panel.id} person={panel} people={D.people} canEdit={perm.mark} setError={setError}
        onOpenCard={() => { const id = panel.id; setPanel(null); openPerson(id); }} onClose={() => setPanel(null)} onSaved={() => { setPanel(null); reload(); }} />}
      {group && <GroupSheet p={group} idx={idx} latest={latest} history={D.history} setError={setError} onClose={() => setGroup(null)} onDone={() => { setGroup(null); reload(); }} />}
    </div>
  );
}

function InviterCell({ p, people, disabled, onSave }) {
  const [v, setV] = useState(p.invited_by || '');
  const [id, setId] = useState(p.invited_by_id || null);
  const linked = id && people.find((x) => x.id === id);
  return (
    <span onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setTimeout(() => onSave(v.trim(), id || (v.trim() ? bestMatch(v, people.filter((x) => x.id !== p.id))?.id : null)), 160); }} className={`inv ${linked ? 'linked' : ''}`} title={linked ? `Linked to ${linked.full_name || linked.name}` : ''}>
      <PersonInput value={v} people={people.filter((x) => x.id !== p.id)} disabled={disabled} onChange={(t, pid) => { setV(t); setId(pid); }} />
    </span>
  );
}

/* first teaching: from the Sunday each person joined, the first Sunday they were present that had a teaching */
function FirstTeachingSheet({ D, idx, onClose, onDone, setError }) {
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const all = useMemo(() => D.people.filter((p) => !p.archived).map((p) => ({ p, ft: firstTeaching(p, D, idx) })), [D, idx]);
  const found = all.filter((x) => x.ft?.topic);
  const differs = (x) => (x.p.start_teaching || '').trim() && (x.p.start_teaching || '').trim() !== x.ft.topic;
  const [off, setOff] = useState(() => new Set());
  const todo = found.filter((x) => !off.has(x.p.id) && (!(x.p.start_teaching || '').trim() || (replace && differs(x)) || (!differs(x) && !x.p.start_teaching_on)));
  const unknown = all.filter((x) => x.ft?.unknown).length, none = all.filter((x) => x.ft?.none).length;
  async function save() {
    setBusy(true);
    for (const { p, ft } of todo) {
      const keep = (p.start_teaching || '').trim() && !(replace && differs({ p, ft }));
      const { error } = await supabase.from('people').update(keep ? { start_teaching_on: ft.sunday } : { start_teaching: ft.topic, start_teaching_on: ft.sunday }).eq('id', p.id);
      if (error) { setBusy(false); return setError(`Not saved (${p.name}): ${error.message}`); }
    }
    setBusy(false); onDone();
  }
  return (
    <Sheet title="Fill first teaching" onClose={onClose} wide>
      <div className="form">
        <p className="small muted" style={{ margin: 0 }}>From the Sunday each person joined, this goes forward to the first Sunday they were present that had a <b>teaching</b> (special programs, discussions, prayer and worship nights are skipped), using the program report and attendance.</p>
        <div className="glance"><div><b>{found.length}</b><span>found</span></div><div><b>{unknown}</b><span>joined before the program report – fill by hand</span></div><div><b>{none}</b><span>no teaching attended yet</span></div></div>
        <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Also replace ones already typed that are different</label>
        <div style={{ overflowX: 'auto', maxHeight: 380 }}>
          <table className="gtable left"><thead><tr><th /><th>Name</th><th>Joined</th><th>First teaching found</th><th>Now</th></tr></thead>
            <tbody>{found.map((x) => {
              const will = todo.includes(x);
              return (
                <tr key={x.p.id} className={will ? '' : 'skipped'}>
                  <td><input type="checkbox" checked={!off.has(x.p.id)} onChange={() => setOff((o) => { const n = new Set(o); n.has(x.p.id) ? n.delete(x.p.id) : n.add(x.p.id); return n; })} aria-label={x.p.name} /></td>
                  <td>{x.p.name}</td><td className="small">{etLabel(x.ft.joined, true)}</td>
                  <td className="am">{x.ft.topic}<div className="tiny muted">{etLabel(x.ft.sunday, true)}{x.ft.minister ? ` · ${x.ft.minister}` : ''}</div></td>
                  <td className="am small">{x.p.start_teaching || <span className="faint">empty</span>}{differs(x) && <span className="tag sun" style={{ marginLeft: 4 }}>different</span>}</td>
                </tr>
              );
            })}</tbody></table>
        </div>
        <button className="btn lime" disabled={!todo.length || busy} onClick={save}>{busy ? 'Saving…' : `Save ${todo.length} first teaching${todo.length === 1 ? '' : 's'}`}</button>
      </div>
    </Sheet>
  );
}
