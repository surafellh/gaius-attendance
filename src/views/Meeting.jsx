import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, nextWeekday, daysBetween, addDays, WEEKDAYS, WEEKDAYS_AM, semesterOf, semesterStart, toEthiopian, monthRange, ET_MONTHS } from '../lib/ethiopian';
import { personFacts, counts } from '../lib/stats';
import { Icon, Sheet } from './common';
import { requestFor } from './Plans';
import { monthName } from '../lib/plans';

export const meetingInfo = (center, today) => {
  const wd = center?.meeting_weekday ?? 3;
  const time = center?.meeting_time || '18:00';
  const next = nextWeekday(wd, today);
  return { wd, time, next, inDays: daysBetween(today, next), last: addDays(next, -7) };
};
export const whenText = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

export default function Meeting({ D, idx, latest, today, perm, personBy, progBy, reload, setError, go }) {
  const m = meetingInfo(D.center, today);
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const agenda = D.agenda.filter((a) => (a.center_id || 1) === (D.center?.id || 1));
  const open = agenda.filter((a) => a.status === 'open').sort((a, b) => (a.due || '9') .localeCompare(b.due || '9') || a.id - b.id);
  const done = agenda.filter((a) => a.status !== 'open').sort((a, b) => (b.done_on || '').localeCompare(a.done_on || ''));
  const meeting = D.meetings.find((x) => x.meets_on === m.next && (x.center_id || 1) === (D.center?.id || 1));
  const leaders = D.people.filter((p) => ['Leader', 'Senior Leader'].includes(p.category) && !p.archived);

  // suggestions taken from the data
  const suggestions = useMemo(() => {
    const out = [];
    const rows = idx.bySunday[latest] || [];
    const semStart = semesterStart(semesterOf(latest));
    const facts = rows.filter((r) => personBy[r.person_id] && counts(r)).map((r) => ({ p: personBy[r.person_id], f: personFacts(personBy[r.person_id], idx.byPerson[r.person_id], idx.held, latest, semStart) }));
    const three = facts.filter((x) => x.f.streak >= 3);
    if (three.length) out.push({ title: `Follow up ${three.length} people who missed 3+ Sundays`, details: three.map((x) => x.p.name).join(', ') });
    const promising = D.people.filter((p) => p.category === 'New Comer' && !p.archived && personFacts(p, idx.byPerson[p.id], idx.held, latest, semStart).promising);
    if (promising.length) out.push({ title: `Encourage ${promising.length} promising new comers toward membership`, details: promising.map((p) => p.name).join(', ') });
    const soon = D.events.filter((e) => e.starts_on >= today && e.starts_on <= addDays(today, 21));
    for (const e of soon) out.push({ title: `Prepare: ${e.title} (${etLabel(e.starts_on)})`, details: e.location ? `At ${e.location}` : null });
    const nextSun = nextWeekday(0, addDays(today, 1));
    if (!progBy[nextSun]) {
      const plan = D.plan.find((x) => x.sunday === nextSun);
      out.push({ title: `Program for Sunday ${etLabel(nextSun)}`, details: plan ? `HQ plan: ${[plan.topic, plan.teacher].filter(Boolean).join(' – ')}` : 'No program or plan recorded yet' });
    }
    // last meeting of the Ethiopian month: budget request and the month's plan review
    const e = toEthiopian(m.next);
    if (e.month < 12 && e.day >= 23 && D.plans?.length) {
      const nk = `${e.month === 12 ? e.year + 1 : e.year}-${String((e.month + 1) % 13).padStart(2, '0')}`;
      const { needs } = requestFor(D, nk);
      const total = needs.reduce((n, i) => n + Number(i.budget), 0);
      if (needs.length) out.push({ title: `Budget request for ${monthName(nk)}: ${needs.length} plans, ${total.toLocaleString()} birr – give to Admin & Finance`, details: 'Plans & budget → Month-end request' });
      const [mf, mt] = monthRange({ year: e.year, month: e.month });
      const mine = D.items.filter((i) => i.due >= mf && i.due <= mt);
      if (mine.length) out.push({ title: `Review ${ET_MONTHS[e.month]} plans: ${mine.filter((i) => i.status === 'done').length} done, ${mine.filter((i) => i.status === 'not_done').length} not done, ${mine.filter((i) => i.status === 'planned').length} not marked`, details: 'Including the plans that need no budget' });
    }
    return out.filter((sg) => !open.some((a) => a.title === sg.title));
  }, [idx, latest, personBy, D, progBy, today, open, m.next]); // eslint-disable-line

  async function add(item) {
    const { error } = await supabase.from('agenda_items').insert({ center_id: D.center?.id || 1, raised_on: today, ...item });
    if (error) return setError(`Not saved: ${error.message}`);
    reload();
  }
  async function update(id, patch) {
    const { error } = await supabase.from('agenda_items').update(patch).eq('id', id);
    if (error) return setError(`Not saved: ${error.message}`);
    reload();
  }
  async function saveNotes(fields) {
    const { error } = await supabase.from('meetings').upsert({ center_id: D.center?.id || 1, meets_on: m.next, ...fields }, { onConflict: 'center_id,meets_on' });
    if (error) return setError(`Not saved: ${error.message}`);
    reload();
  }

  return (
    <div className="page">
      <section className="meet-hero">
        <div className="meet-date"><small>{WEEKDAYS[m.wd].slice(0, 3)}</small><b>{etLabel(m.next).split(' ')[1]}</b><small>{etLabel(m.next).split(' ')[0].slice(0, 3)}</small></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="meet-k">Next leaders’ meeting · <span className="am">{WEEKDAYS_AM[m.wd]}</span></div>
          <div className="meet-t">{WEEKDAYS[m.wd]}, {etLabel(m.next, true)} · {m.time}</div>
          <div className="meet-s">{fmtGreg(m.next)} · {whenText(m.inDays)} · {open.length} open agenda item{open.length === 1 ? '' : 's'}</div>
        </div>
        <button className="btn lime" onClick={() => downloadIcs(D.center, m)}><Icon.bell width="18" height="18" /> Remind me weekly</button>
      </section>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head">
            <div><div className="card-title">Agenda</div><div className="card-sub">Open items stay on the list until they’re done – nothing gets lost between meetings.</div></div>
            {perm.mark && <button className="btn small lime" onClick={() => setAdding(true)}><Icon.plus width="16" height="16" /> Add</button>}
          </div>
          {open.length === 0 && <p className="muted small">Nothing open. Add an item or pick one of the suggestions.</p>}
          <ol className="agenda">
            {open.map((a, i) => {
              const carried = a.raised_on && a.raised_on <= m.last;
              const late = a.due && a.due < today;
              return (
                <li key={a.id}>
                  <span className="ag-n">{i + 1}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ag-t">{a.title}</div>
                    {a.details && <div className="small muted">{a.details}</div>}
                    <div className="pmeta" style={{ marginTop: 4 }}>
                      {a.owner && <span className="tag"><Icon.user width="11" height="11" /> {a.owner}</span>}
                      {a.due && <span className={`tag ${late ? 'bad' : 'sun'}`}>due {etLabel(a.due)}</span>}
                      {carried && <span className="tag">carried over since {etLabel(a.raised_on)}</span>}
                    </div>
                  </div>
                  {perm.mark && <button className="btn ghost small" onClick={() => setClosing(a)}>Close</button>}
                </li>
              );
            })}
          </ol>
          {done.length > 0 && <button className="link small" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} closed items ({done.length})</button>}
          {showDone && (
            <ul className="hist">
              {done.slice(0, 40).map((a) => (
                <li key={a.id}><span><b>{a.title}</b>{a.outcome ? ` – ${a.outcome}` : ''}{a.status === 'dropped' ? ' (dropped)' : ''}</span>
                  <span className="muted">{a.done_on ? etLabel(a.done_on, true) : ''}{perm.mark && <> · <button className="link small" style={{ padding: 0 }} onClick={() => update(a.id, { status: 'open', done_on: null })}>reopen</button></>}</span></li>
              ))}
            </ul>
          )}
        </section>

        <div className="page" style={{ gap: 16 }}>
          <section className="card">
            <div className="card-head"><div><div className="card-title">Suggested from this week</div><div className="card-sub">From attendance, follow-up, the calendar and the teaching plan.</div></div></div>
            {suggestions.length === 0 && <p className="muted small">Nothing to suggest right now.</p>}
            {suggestions.map((sg) => (
              <div key={sg.title} className="list-row" style={{ padding: '10px 0' }}>
                <span className="pinfo"><span className="pname" style={{ whiteSpace: 'normal' }}>{sg.title}</span>{sg.details && <span className="pmeta" style={{ whiteSpace: 'normal' }}>{sg.details}</span>}</span>
                {perm.mark && <button className="btn ghost small" onClick={() => add({ title: sg.title, details: sg.details })}>Add</button>}
              </div>
            ))}
          </section>
          <section className="card">
            <div className="card-head"><div><div className="card-title">Notes for {etLabel(m.next)}</div><div className="card-sub">Who came and what was decided.</div></div></div>
            <form className="form" key={meeting?.id || m.next} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.target); saveNotes({ attendees: f.get('attendees') || null, notes: f.get('notes') || null }); }}>
              <label>Who came<input name="attendees" disabled={!perm.mark} defaultValue={meeting?.attendees || ''} placeholder="Names, or e.g. 9 of 12 leaders" /></label>
              <label>Notes and decisions<textarea name="notes" rows={4} disabled={!perm.mark} defaultValue={meeting?.notes || ''} /></label>
              {perm.mark && <button className="btn ghost">Save notes</button>}
            </form>
            {D.meetings.filter((x) => x.meets_on < m.next && x.notes).sort((a, b) => b.meets_on.localeCompare(a.meets_on)).slice(0, 4).map((x) => (
              <details key={x.id} className="small" style={{ marginTop: 10 }}><summary><b>{etLabel(x.meets_on, true)}</b>{x.attendees ? ` · ${x.attendees}` : ''}</summary><p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{x.notes}</p></details>
            ))}
          </section>
          <p className="muted tiny">The meeting day and time are set under Users &amp; settings. <button className="link tiny" style={{ padding: 0 }} onClick={() => go('users')}>Change</button></p>
        </div>
      </div>

      {adding && <AgendaSheet leaders={leaders} onClose={() => setAdding(false)} onSave={(f) => { setAdding(false); add(f); }} />}
      {closing && (
        <Sheet title={`Close: ${closing.title}`} onClose={() => setClosing(null)}>
          <form className="form" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.target); update(closing.id, { status: e.nativeEvent.submitter?.value || 'done', outcome: f.get('outcome') || null, done_on: today }); setClosing(null); }}>
            <label>What happened<textarea name="outcome" rows={3} placeholder="Decision or result" /></label>
            <div className="row2">
              <button className="btn lime" name="status" value="done">Done</button>
              <button className="btn ghost" name="status" value="dropped">Drop it</button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}

function AgendaSheet({ leaders, onClose, onSave }) {
  const [f, setF] = useState({ title: '', details: '', owner: '', due: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title="Add to the agenda" onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (f.title.trim()) onSave({ title: f.title.trim(), details: f.details || null, owner: f.owner || null, due: f.due || null }); }}>
        <label>Item<input autoFocus value={f.title} onChange={set('title')} required placeholder="e.g. Plan the Hidar retreat" /></label>
        <label>Details<textarea rows={3} value={f.details} onChange={set('details')} /></label>
        <div className="row2">
          <label>Who takes it<input list="ag-leaders" value={f.owner} onChange={set('owner')} /></label>
          <label>Due date<input type="date" value={f.due} onChange={set('due')} /></label>
        </div>
        <datalist id="ag-leaders">{leaders.map((l) => <option key={l.id} value={l.name} />)}</datalist>
        <button className="btn lime wide">Add item</button>
      </form>
    </Sheet>
  );
}

/* A weekly calendar entry with a 2-hour alarm, so phones remind leaders every week. */
function downloadIcs(center, m) {
  const [hh, mm] = (m.time || '18:00').split(':').map(Number);
  const d = m.next.replace(/-/g, '');
  const t = (h, mi) => `${String(h).padStart(2, '0')}${String(mi).padStart(2, '0')}00`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gaius//Attendance//EN', 'BEGIN:VEVENT',
    `UID:gaius-leaders-${center?.id || 1}@gaius`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Africa/Addis_Ababa:${d}T${t(hh, mm)}`, `DTEND;TZID=Africa/Addis_Ababa:${d}T${t(hh + 2, mm)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][m.wd]}`,
    `SUMMARY:Gaius ${center?.name || ''} leaders' meeting`, 'DESCRIPTION:Agenda: open the Gaius app → Meeting',
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', "DESCRIPTION:Leaders' meeting in 2 hours", 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'gaius-leaders-meeting.ics';
  a.click();
}
