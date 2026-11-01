import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, monthOf, addMonths, monthLabel, monthRange, ET_MONTHS, ET_MONTHS_AM, toEthiopian, addDays, weekdayOf,
  WEEKDAYS, sundaysOf, semesterOf, SEMESTERS, semesterStart, semName } from '../lib/ethiopian';
import { parseEvents } from '../lib/report';
import { Icon, Sheet } from './common';
import Grid from './Grid';
import { recordUpdate, recordInsert, recordDelete } from '../lib/undo';
import CalendarMonth from './CalendarMonth';
import Reconcile from './Reconcile';
import TeachingPlan from './TeachingPlan';
import { planMaps } from '../lib/teaching';

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
  const [tab0, setTab] = useState('month');
  const tabs = [['month', 'Month'], ['plan', 'Teaching plan'], ['evlist', 'Events'], ...(props.perm.studio ? [['events', 'HQ & our plan']] : [])];
  const tab = tabs.some(([k]) => k === tab0) ? tab0 : 'month';
  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Calendar</h1><p className="page-sub">{props.perm.hqView ? 'Sunday programs, events and the planned dates of each department.' : 'Sunday programs, events and every department plan, colour-coded by department.'}</p></div>
        <div className="seg">
          {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
      </div>
      {tab === 'month' ? <CalendarMonth {...props} /> : tab === 'events' ? <Reconcile {...props} /> : tab === 'evlist' ? <Events {...props} /> : <TeachingPlan {...props} />}
    </div>
  );
}

function usePlanFor(D) {
  return useMemo(() => {
    const { hq, own } = planMaps(D.plan, D.center?.id || 1);
    return (s) => own.get(s) || hq.get(s);
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
  const canEdit = (e) => (e.center_id == null ? perm.switchCenter : perm.manage);
  const editor = perm.manage || perm.switchCenter;
  const [view, setView] = useState(editor ? 'table' : 'list');
  async function gridSave(e, patch) {
    if (!canEdit(e)) return;
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, e[k] ?? null]));
    const { error } = await supabase.from('events').update(patch).eq('id', e.id);
    if (error) return setError(`Not saved: ${error.message}`);
    recordUpdate('events', e.id, before, patch, `event “${e.title}”`); reload();
  }
  async function gridAdd(row) {
    const { scope, ...rest } = row;
    const { data, error } = await supabase.from('events').insert({ ...rest, kind: rest.kind || 'Event', center_id: perm.switchCenter && scope !== 'center' ? null : cid }).select().single();
    if (error) { setError(`Not saved: ${error.message}`); return false; }
    recordInsert('events', data, `event “${data.title}”`); reload(); return true;
  }
  async function gridDelete(e0) {
    if (!canEdit(e0)) return;
    const e = { ...e0 };
    const { error } = await supabase.from('events').delete().eq('id', e.id);
    if (error) return setError(`Not deleted: ${error.message}`);
    recordDelete('events', e, `event “${e.title}”`); reload();
  }

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
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="seg"><button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List &amp; clashes</button></div>
        {editor && <span className="row"><button className="btn ghost" onClick={() => setPaste(true)}><Icon.book /> Paste a list</button></span>}
      </div>
      {view === 'table' && (
        <section className="card flush">
          <Grid canEdit={editor} rows={list} onSave={gridSave} onAdd={gridAdd} onDelete={gridDelete} addLabel="Add event" empty="No events this month."
            columns={[
              { key: 'starts_on', label: 'Starts', type: 'date', required: true, width: 150, show: canEdit },
              { key: 'ends_on', label: 'Ends', type: 'date', width: 150, show: canEdit },
              { key: 'title', label: 'Event', required: true, width: 220, show: canEdit },
              { key: 'kind', label: 'Kind', type: 'select', options: EVENT_KINDS.map((k) => [k, k]), width: 130, show: canEdit },
              { key: 'start_time', label: 'Time', width: 90, show: canEdit },
              { key: 'location', label: 'Where', width: 150, show: canEdit },
              ...(perm.switchCenter ? [{ key: 'scope', label: 'For', type: 'select', required: true, options: [['all', 'All centers'], ['center', D.center?.name || 'This center']], width: 130, show: () => false, render: (e) => (e.center_id == null ? 'All centers' : D.center?.name) }] : []),
              { key: 'notes', label: 'Notes', width: 200, show: canEdit },
            ]} />
        </section>
      )}
      {view === 'list' && <div className="dash-grid">
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
      </div>}
      {edit && <EventSheet ev={edit} canEdit={!edit.id || canEdit(edit)} admin={perm.switchCenter} cid={cid} others={mine} ctx={{ progBy, meetingWd, planFor }}
        onClose={() => setEdit(null)} onSave={save} onDelete={remove} />}
      {paste && <PasteEvents year={month.year} cid={cid} admin={perm.switchCenter} others={mine} ctx={{ progBy, meetingWd, planFor }} onClose={() => setPaste(false)}
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

