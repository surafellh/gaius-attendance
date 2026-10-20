import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, monthOf, addMonths, monthLabel, monthRange, ET_MONTHS, ET_MONTHS_AM, toEthiopian, addDays, weekdayOf,
  WEEKDAYS, sundaysOf, semesterOf, SEMESTERS, semesterStart, semName } from '../lib/ethiopian';
import { parseEvents, parseReport } from '../lib/report';
import { Icon, Sheet } from './common';
import CalendarMonth from './CalendarMonth';

export const EVENT_KINDS = ['Event', 'Retreat', 'Conference', 'Training', 'Outreach', 'Worship night', 'Holiday', 'Fellowship', 'HQ meeting', 'Other'];
const span = (e) => [e.starts_on, e.ends_on && e.ends_on > e.starts_on ? e.ends_on : e.starts_on];
const daysIn = ([a, b]) => { const out = []; for (let d = a; d <= b && out.length < 60; d = addDays(d, 1)) out.push(d); return out; };

/* what an event runs into: other events, Sunday gatherings, the leaders' meeting */
export function clashes(ev, events, { progBy, meetingWd, planFor }) {
  const [a, b] = span(ev);
  const out = [];
  for (const o of events) {
    if (o.id === ev.id) continue;
    const [c, d] = span(o);
    if (c <= b && a <= d) out.push(`Same time as “${o.title}” (${etLabel(c)}${d !== c ? '–' + etLabel(d).split(' ')[1] : ''})`);
  }
  for (const d of daysIn([a, b])) {
    const wd = weekdayOf(d);
    if (wd === 0) {
      const p = progBy[d]; const pl = planFor?.(d);
      out.push(`Falls on Sunday ${etLabel(d)}${p?.kind ? ` – ${p.kind}${p.topic ? ': ' + p.topic : ''}` : pl?.topic ? ` – HQ plan: ${pl.topic}` : ' – the weekly gathering'}`);
    }
    if (wd === meetingWd) out.push(`Falls on the leaders’ meeting day (${WEEKDAYS[wd]} ${etLabel(d)})`);
  }
  return out;
}

export default function CalendarPage(props) {
  const [tab, setTab] = useState('month');
  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Calendar</h1><p className="page-sub">Sunday programs, events and every department plan, colour-coded by department.</p></div>
        <div className="seg">
          <button className={tab === 'month' ? 'on' : ''} onClick={() => setTab('month')}>Month</button>
          <button className={tab === 'events' ? 'on' : ''} onClick={() => setTab('events')}>Events</button>
          <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>Teaching plan</button>
        </div>
      </div>
      {tab === 'month' ? <CalendarMonth {...props} /> : tab === 'events' ? <Events {...props} /> : <Plan {...props} />}
    </div>
  );
}

function usePlanFor(D) {
  return useMemo(() => {
    const cid = D.center?.id || 1;
    const m = new Map();
    for (const r of D.plan) if (r.center_id == null) m.set(r.sunday, r);
    for (const r of D.plan) if (r.center_id === cid) m.set(r.sunday, r);
    return (s) => m.get(s);
  }, [D.plan, D.center]);
}

function Events({ D, latest, today, perm, progBy, reload, setError }) {
  const [month, setMonth] = useState(() => monthOf(today));
  const [edit, setEdit] = useState(null);
  const [paste, setPaste] = useState(false);
  const planFor = usePlanFor(D);
  const meetingWd = D.center?.meeting_weekday ?? 3;
  const cid = D.center?.id || 1;
  const mine = D.events.filter((e) => e.center_id == null || e.center_id === cid);
  const [from, to] = monthRange(month);
  const list = mine.filter((e) => { const [a, b] = span(e); return a <= to && b >= from; }).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const upcoming = mine.filter((e) => span(e)[1] >= today).sort((a, b) => a.starts_on.localeCompare(b.starts_on)).slice(0, 6);
  const canEdit = (e) => perm.manage && (e.center_id != null || perm.admin);

  async function save(f) {
    const row = { ...f, ends_on: f.ends_on || null, start_time: f.start_time || null, location: f.location || null, notes: f.notes || null };
    const { error } = f.id ? await supabase.from('events').update(row).eq('id', f.id) : await supabase.from('events').insert(row);
    if (error) return setError(`Not saved: ${error.message}`);
    setEdit(null); reload();
  }
  async function remove(id) {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) return setError(`Not deleted: ${error.message}`);
    setEdit(null); reload();
  }

  return (
    <>
      <div className="month-bar">
        <button className="arrow" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><Icon.left /></button>
        <div className="current">
          <span className="w-main">{monthLabel(month)} <span className="am muted" style={{ fontWeight: 600 }}>{ET_MONTHS_AM[month.month]}</span></span>
          <span className="w-sub">{fmtGreg(from)} – {fmtGreg(to)} · {list.length} event{list.length === 1 ? '' : 's'}</span>
        </div>
        <button className="arrow" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><Icon.right /></button>
      </div>
      {perm.manage && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setPaste(true)}><Icon.book /> Paste a list</button>
          <button className="btn lime" onClick={() => setEdit({ title: '', kind: 'Event', starts_on: from > today ? from : today, ends_on: '', start_time: '', location: '', notes: '', center_id: cid })}><Icon.plus /> Add event</button>
        </div>
      )}
      <div className="dash-grid">
        <section className="card">
          <div className="card-head"><div><div className="card-title">{ET_MONTHS[month.month]} {month.year}</div><div className="card-sub">Clashes with Sundays, the leaders’ meeting or other events are flagged.</div></div></div>
          {list.length === 0 && <p className="muted small">No events this month.</p>}
          <ul className="ev-list">{list.map((e) => <EventRow key={e.id} e={e} warn={clashes(e, mine, { progBy, meetingWd, planFor })} onClick={() => setEdit(e)} />)}</ul>
        </section>
        <section className="card">
          <div className="card-head"><div><div className="card-title">Coming up</div><div className="card-sub">The next events from today.</div></div></div>
          {upcoming.length === 0 && <p className="muted small">Nothing scheduled yet.</p>}
          <ul className="ev-list">{upcoming.map((e) => <EventRow key={e.id} e={e} compact warn={[]} onClick={() => { setMonth(monthOf(e.starts_on)); }} />)}</ul>
        </section>
      </div>
      {edit && <EventSheet ev={edit} canEdit={!edit.id || canEdit(edit)} admin={perm.admin} cid={cid} others={mine} ctx={{ progBy, meetingWd, planFor }}
        onClose={() => setEdit(null)} onSave={save} onDelete={remove} />}
      {paste && <PasteEvents year={month.year} cid={cid} admin={perm.admin} others={mine} ctx={{ progBy, meetingWd, planFor }} onClose={() => setPaste(false)}
        onSaved={() => { setPaste(false); reload(); }} setError={setError} />}
    </>
  );
}

function EventRow({ e, warn, onClick, compact }) {
  const s = toEthiopian(e.starts_on);
  const multi = e.ends_on && e.ends_on > e.starts_on;
  return (
    <li>
      <button className="ev-row" onClick={onClick}>
        <span className="prog-date"><small>{ET_MONTHS[s.month].slice(0, 3)}</small><b>{s.day}{multi ? '+' : ''}</b></span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="prog-title am">{e.title}</span>
          <span className="prog-meta" style={{ display: 'block' }}>
            {[e.kind, multi && `until ${etLabel(e.ends_on)}`, e.start_time, e.location, `${fmtGreg(e.starts_on)}`].filter(Boolean).join(' · ')}
            {e.center_id == null && <span className="tag lime" style={{ marginLeft: 6 }}>All centers</span>}
          </span>
          {!compact && warn.map((w) => <span key={w} className="ev-warn">⚠ {w}</span>)}
        </span>
      </button>
    </li>
  );
}

function EventSheet({ ev, canEdit, admin, cid, others, ctx, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ ...ev, ends_on: ev.ends_on || '', start_time: ev.start_time || '', location: ev.location || '', notes: ev.notes || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const warn = f.starts_on ? clashes({ ...f, id: ev.id }, others, ctx) : [];
  return (
    <Sheet title={ev.id ? 'Event' : 'New event'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); const { id, title, kind, starts_on, ends_on, start_time, location, notes, center_id } = f; onSave({ id, title: title.trim(), kind, starts_on, ends_on, start_time, location, notes, center_id }); }}>
        <label>Title<input disabled={!canEdit} value={f.title} onChange={set('title')} required placeholder="e.g. የመሪዎች ስልጠና" /></label>
        <div className="row2">
          <label>Kind<select disabled={!canEdit} value={f.kind || 'Event'} onChange={set('kind')}>{EVENT_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
          <label>For<select disabled={!canEdit || !admin} value={f.center_id == null ? 'all' : 'center'} onChange={(e) => setF({ ...f, center_id: e.target.value === 'all' ? null : cid })}>
            <option value="center">This center</option><option value="all">All centers (HQ)</option></select></label>
        </div>
        <div className="row2">
          <label>Starts {f.starts_on && <span className="faint">{etLabel(f.starts_on, true)}</span>}<input type="date" disabled={!canEdit} value={f.starts_on} onChange={set('starts_on')} required /></label>
          <label>Ends (optional) {f.ends_on && <span className="faint">{etLabel(f.ends_on)}</span>}<input type="date" disabled={!canEdit} value={f.ends_on} min={f.starts_on} onChange={set('ends_on')} /></label>
        </div>
        <div className="row2">
          <label>Time<input disabled={!canEdit} value={f.start_time} onChange={set('start_time')} placeholder="e.g. 2:00 PM" /></label>
          <label>Place<input disabled={!canEdit} value={f.location} onChange={set('location')} /></label>
        </div>
        <label>Notes<textarea disabled={!canEdit} rows={3} value={f.notes} onChange={set('notes')} /></label>
        {warn.length > 0 && <div className="banner warn">{warn.map((w) => <div key={w}>⚠ {w}</div>)}</div>}
        {canEdit && (
          <div className="row-actions">
            {ev.id ? <button type="button" className="btn danger small" onClick={() => window.confirm('Delete this event?') && onDelete(ev.id)}>Delete</button> : <span />}
            <button className="btn lime">Save event</button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

function PasteEvents({ year, cid, admin, others, ctx, onClose, onSaved, setError }) {
  const [y, setY] = useState(year);
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const { rows, skipped } = parseEvents(text, Number(y));
  async function save() {
    setBusy(true);
    const { error } = await supabase.from('events').insert(rows.map(({ label, ...r }) => ({ ...r, kind: 'Event', center_id: all ? null : cid }))); // eslint-disable-line no-unused-vars
    setBusy(false);
    if (error) return setError(`Not saved: ${error.message}`);
    onSaved();
  }
  return (
    <Sheet title="Paste an events list" onClose={onClose} wide>
      <div className="form">
        <p className="small muted">One event per line: <b>month day - title - place</b>. A range works too: <span className="am">ህዳር 20-22 - Retreat - Bishoftu</span>. Amharic or English month names.</p>
        <div className="row2">
          <label>Ethiopian year<input inputMode="numeric" value={y} onChange={(e) => setY(e.target.value)} /></label>
          {admin && <label>For<select value={all ? 'all' : 'center'} onChange={(e) => setAll(e.target.value === 'all')}><option value="center">This center</option><option value="all">All centers (HQ)</option></select></label>}
        </div>
        <label>List<textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'ጥቅምት 15 - የመሪዎች ስልጠና - ቢሾፍቱ\nህዳር 20-22 - የወጣቶች ኮንፈረንስ'} /></label>
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable left">
              <thead><tr><th>Date</th><th>Event</th><th>Place</th><th>Check</th></tr></thead>
              <tbody>{rows.map((r, i) => {
                const w = clashes({ ...r, id: -1 - i }, others, ctx);
                return <tr key={i}><td>{etLabel(r.starts_on, true)}{r.ends_on ? ` – ${etLabel(r.ends_on)}` : ''} <span className="muted tiny">{fmtGreg(r.starts_on)}</span></td><td className="am">{r.title}</td><td className="am">{r.location || '–'}</td>
                  <td className="tiny">{w.length ? <span className="tag sun" title={w.join('\n')}>⚠ {w.length} clash{w.length > 1 ? 'es' : ''}</span> : <span className="tag ok">clear</span>}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}
        {skipped.length > 0 && text && <p className="tiny muted">Skipped: {skipped.join(' · ')}</p>}
        <button className="btn lime" disabled={!rows.length || busy} onClick={save}>{busy ? 'Saving…' : `Save ${rows.length || ''} event${rows.length === 1 ? '' : 's'}`}</button>
      </div>
    </Sheet>
  );
}

/* ── teaching plan vs what happened ─────────────────────────────── */
function Plan({ D, latest, today, perm, progBy, reload, setError }) {
  const [sem, setSem] = useState(semesterOf(today));
  const [edit, setEdit] = useState(null);
  const [paste, setPaste] = useState(false);
  const planFor = usePlanFor(D);
  const sundays = sundaysOf(sem);
  const cid = D.center?.id || 1;
  const rows = sundays.map((s) => {
    const plan = planFor(s), act = progBy[s];
    let status;
    if (act?.kind === 'No meeting') status = ['No meeting', 'bad'];
    else if (!plan) status = act?.kind ? ['No plan', ''] : s <= today ? ['Nothing recorded', ''] : ['', ''];
    else if (!act?.kind) status = s <= today ? ['Not recorded', 'sun'] : ['Planned', 'lime'];
    else status = same(plan.topic, act.topic) ? ['As planned', 'ok'] : ['Changed', 'sun'];
    return { s, plan, act, status };
  });
  const planned = rows.filter((r) => r.plan && r.s <= today);
  const asPlanned = planned.filter((r) => r.status[0] === 'As planned').length;
  const semIdx = SEMESTERS.indexOf(sem);

  async function savePlan(f) {
    const row = { center_id: f.center_id, sunday: f.sunday, series: f.series || null, topic: f.topic || null, teacher: f.teacher || null, notes: f.notes || null };
    const existing = D.plan.find((p) => p.sunday === f.sunday && (p.center_id ?? null) === (f.center_id ?? null));
    const { error } = existing ? await supabase.from('teaching_plan').update(row).eq('id', existing.id) : await supabase.from('teaching_plan').insert(row);
    if (error) return setError(`Not saved: ${error.message}`);
    setEdit(null); reload();
  }

  return (
    <>
      <div className="month-bar">
        <button className="arrow" disabled={semIdx <= 0} onClick={() => setSem(SEMESTERS[semIdx - 1])} aria-label="Previous semester"><Icon.left /></button>
        <div className="current">
          <span className="w-main">{semName(sem)}</span>
          <span className="w-sub">{fmtGreg(semesterStart(sem))} · {sundays.length} Sundays · {planned.length ? `${asPlanned} of ${planned.length} planned Sundays taught as planned` : 'no plan entered yet'}</span>
        </div>
        <button className="arrow" disabled={semIdx >= SEMESTERS.length - 1} onClick={() => setSem(SEMESTERS[semIdx + 1])} aria-label="Next semester"><Icon.right /></button>
      </div>
      {perm.manage && <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setPaste(true)}><Icon.book /> Paste a plan</button></div>}
      <section className="card flush">
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left plan-table">
            <thead><tr><th>Sunday</th><th>HQ / center plan</th><th>What happened</th><th className="desk-only" /></tr></thead>
            <tbody>
              {rows.map(({ s, plan, act, status }) => (
                <tr key={s} className={s === latest ? 'sel' : ''} onClick={() => perm.manage && setEdit({ sunday: s, center_id: plan ? plan.center_id ?? null : perm.admin ? null : cid, series: plan?.series || '', topic: plan?.topic || '', teacher: plan?.teacher || '', notes: plan?.notes || '' })}>
                  <td style={{ whiteSpace: 'nowrap' }}><b>{etLabel(s)}</b><div className="tiny muted">{fmtGreg(s)}</div>{status[0] && <div className="mob-only"><span className={`tag ${status[1]}`}>{status[0]}</span></div>}</td>
                  <td className="am">{plan ? <>{plan.series && <span className="tag">{plan.series}</span>} {plan.topic}<div className="tiny muted">{plan.teacher}{plan.center_id == null ? ' · HQ' : ''}</div></> : <span className="faint">—</span>}</td>
                  <td className="am">{act?.kind ? <>{act.kind === 'Teaching' ? '' : <span className="tag">{act.kind}</span>} {act.topic}<div className="tiny muted">{act.minister}</div></> : <span className="faint">—</span>}</td>
                  <td className="desk-only">{status[0] && <span className={`tag ${status[1]}`}>{status[0]}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted tiny">What happened comes from the programs recorded on the Attendance page. {perm.manage ? 'Tap a row to set its plan.' : ''}</p>
      {edit && (
        <Sheet title={`Plan · ${etLabel(edit.sunday, true)}`} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); savePlan({ ...edit, ...f, center_id: f.scope === 'all' ? null : cid }); }}>
            <div className="row2">
              <label>Series<input name="series" defaultValue={edit.series} placeholder="e.g. ተሃድሶ" /></label>
              <label>Teacher<input name="teacher" defaultValue={edit.teacher} /></label>
            </div>
            <label>Topic<input name="topic" defaultValue={edit.topic} /></label>
            <label>Notes<textarea name="notes" rows={2} defaultValue={edit.notes} /></label>
            <label>Plan for<select name="scope" defaultValue={edit.center_id == null ? 'all' : 'center'} disabled={!perm.admin}><option value="all">All centers (HQ plan)</option><option value="center">This center only</option></select></label>
            <button className="btn lime wide">Save plan</button>
          </form>
        </Sheet>
      )}
      {paste && <PastePlan year={toEthiopian(semesterStart(sem)).year} admin={perm.admin} cid={cid} D={D} onClose={() => setPaste(false)} onSaved={() => { setPaste(false); reload(); }} setError={setError} />}
    </>
  );
}
const norm = (t) => (t || '').toLowerCase().replace(/[\s.,:;–-]+/g, '');
const same = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

function PastePlan({ year, admin, cid, D, onClose, onSaved, setError }) {
  const [y, setY] = useState(year);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { rows, skipped } = parseReport(text, Number(y));
  async function save() {
    setBusy(true);
    const center_id = admin ? null : cid;
    for (const r of rows) {
      const row = { center_id, sunday: r.sunday, topic: r.topic || null, teacher: r.minister || null, series: r.kind !== 'Teaching' && r.kind !== 'Special program' ? r.kind : null };
      const ex = D.plan.find((p) => p.sunday === r.sunday && (p.center_id ?? null) === center_id);
      const { error } = ex ? await supabase.from('teaching_plan').update(row).eq('id', ex.id) : await supabase.from('teaching_plan').insert(row);
      if (error) { setBusy(false); return setError(`Not saved: ${error.message}`); }
    }
    setBusy(false); onSaved();
  }
  return (
    <Sheet title="Paste a teaching plan" onClose={onClose} wide>
      <div className="form">
        <p className="small muted">Same format as the monthly report: <b>month day - teacher - program - topic</b>. {admin ? 'Saved as the HQ plan for all centers.' : 'Saved for this center.'}</p>
        <label>Ethiopian year<input inputMode="numeric" value={y} onChange={(e) => setY(e.target.value)} style={{ maxWidth: 120 }} /></label>
        <label>Plan<textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'ጥቅምት 08 - ፓ/ር ፍፄ - ትምህርት - ትንቢተ ሚልክያስ'} /></label>
        {rows.length > 0 && (
          <table className="gtable left"><thead><tr><th>Sunday</th><th>Topic</th><th>Teacher</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.sunday}><td>{etLabel(r.sunday, true)}{!r.isSunday && <span className="tag bad">not a Sunday</span>}</td><td className="am">{r.topic || r.kind}</td><td className="am">{r.minister || '–'}</td></tr>)}</tbody></table>
        )}
        {skipped.length > 0 && text && <p className="tiny muted">Skipped: {skipped.join(' · ')}</p>}
        <button className="btn lime" disabled={!rows.length || busy} onClick={save}>{busy ? 'Saving…' : `Save ${rows.length || ''} Sunday${rows.length === 1 ? '' : 's'}`}</button>
      </div>
    </Sheet>
  );
}
