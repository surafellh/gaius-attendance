import { useState } from 'react';
import { etLabel, monthOf, monthRange, addMonths, monthLabel, ET_MONTHS_AM, fmtGreg, toEthiopian, ET_MONTHS, addDays, weekdayOf, WEEKDAYS } from '../lib/ethiopian';
import { birr } from '../lib/plans';
import { gridOps } from '../views/Finance';
import { EVENT_KINDS } from '../views/CalendarPage';
import TeachingPlan from '../views/TeachingPlan';
import Grid from '../views/Grid';
import { Icon, Sheet } from '../views/common';
import { agenda, colorOf } from './hqData';
import { HqUploadSheet } from '../views/PlanUpload';
import { semesterOf } from '../lib/ethiopian';
import { CenterTag } from './HqOverview';

export const ACT_KINDS = ['Activity', 'Center visit', 'Training', 'Meeting', 'Event', 'Report', 'Retreat', 'Other'];
const ACT_STATUS = [['planned', 'Planned'], ['in_progress', 'In progress'], ['done', 'Done'], ['postponed', 'Postponed'], ['cancelled', 'Cancelled']];

/* HQ plans: HQ's own plans & activities, HQ events, one calendar of every center's planned dates, and the teaching plan */
export default function HqPlans({ R, C, today, perm, reload, setError }) {
  const [tab, setTab] = useState('mine');
  const TABS = [['mine', 'HQ plans & activities'], ['calendar', 'Calendar · all centers'], ['events', 'HQ events'], ['teaching', 'Teaching plan']];
  return (
    <div className="page hq-page">
      <div className="page-head">
        <div><h1 className="page-title">Plans</h1><p className="page-sub">What HQ itself plans and does, and every center’s planned dates in one calendar.</p></div>
      </div>
      <div className="seg wrap" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'mine' && <Activities R={R} today={today} perm={perm} reload={reload} setError={setError} />}
      {tab === 'calendar' && <AllCalendar R={R} today={today} />}
      {tab === 'events' && <HqEvents R={R} today={today} perm={perm} reload={reload} setError={setError} />}
      {tab === 'teaching' && <Teaching R={R} C={C} today={today} perm={perm} reload={reload} setError={setError} />}
    </div>
  );
}

function Activities({ R, today, perm, reload, setError }) {
  const [filter, setFilter] = useState('open');
  const [forC, setForC] = useState('');
  const [upload, setUpload] = useState(false);   // '' = all, 'hq' = for every center, or a center id
  if (!R.r6) return <div className="banner err">HQ plans need the release 6 SQL (v9_hq.sql) to be run in Supabase once.</div>;
  const all = (R.activities || []).slice().sort((a, b) => (a.starts_on || a.due || '9').localeCompare(b.starts_on || b.due || '9') || a.id - b.id);
  const rows = all.filter((a) => (filter === 'open' ? !['done', 'cancelled'].includes(a.status) : filter === 'done' ? a.status === 'done' : true))
    .filter((a) => (!forC ? !a.center_id || R.centers.some((c) => c.id === a.center_id) : forC === 'hq' ? !a.center_id : a.center_id === Number(forC)));
  const late = all.filter((a) => a.due && a.due < today && !['done', 'cancelled'].includes(a.status)).length;
  const budget = all.filter((a) => a.status !== 'cancelled').reduce((n, a) => n + Number(a.budget || 0), 0);
  const ops = gridOps('hq_activities', () => ({}), (r) => `HQ plan “${r.title}”`, reload, setError);
  return (
    <>
      <div className="kpis hq-mini">
        <div className="kpi"><span className="kpi-label">Open</span><span className="kpi-val">{all.filter((a) => !['done', 'cancelled'].includes(a.status)).length}</span><span className="kpi-foot">planned or in progress</span></div>
        <div className="kpi"><span className="kpi-label">Done</span><span className="kpi-val">{all.filter((a) => a.status === 'done').length}</span><span className="kpi-foot">of {all.filter((a) => a.status !== 'cancelled').length}</span></div>
        <div className="kpi"><span className="kpi-label">Past the date</span><span className="kpi-val" style={{ color: late ? 'var(--absent)' : undefined }}>{late}</span><span className="kpi-foot">not done yet</span></div>
        <div className="kpi"><span className="kpi-label">Budget</span><span className="kpi-val small-val">{birr(budget)}</span><span className="kpi-foot">HQ plans</span></div>
      </div>
      <section className="card flush">
        <div className="card-head pad">
          <div><div className="card-title">HQ plans &amp; activities</div><div className="card-sub">Center visits, trainings, meetings, reports… Pick a center or leave it for all centers. {perm.hqEdit ? 'Type straight into the table.' : ''}</div></div>
          <select className="small-select" value={forC} onChange={(e) => setForC(e.target.value)} aria-label="For which center"><option value="">Every plan</option><option value="hq">For all centers / HQ</option>{R.centers.map((c) => <option key={c.id} value={c.id}>For {c.name}</option>)}</select>
          <div className="seg"><button className={filter === 'open' ? 'on' : ''} onClick={() => setFilter('open')}>Open</button><button className={filter === 'done' ? 'on' : ''} onClick={() => setFilter('done')}>Done</button><button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button></div>
        </div>
        <Grid canEdit={perm.hqEdit} rows={rows} {...ops} onAdd={(row) => ops.onAdd({ ...row, status: row.status || 'planned' })} addLabel="Add an HQ plan" empty="No HQ plans yet."
          columns={[
            { key: 'title', label: 'Plan / activity', required: true, width: 230 },
            { key: 'kind', label: 'Kind', type: 'select', options: ACT_KINDS.map((k) => [k, k]), width: 130 },
            { key: 'center_id', label: 'For', type: 'select', options: R.centers.map((c) => [c.id, c.name]), width: 120 },
            { key: 'owner', label: 'Responsible', width: 140 },
            { key: 'starts_on', label: 'Starts', type: 'date', width: 150 },
            { key: 'due', label: 'Due', type: 'date', width: 150 },
            { key: 'budget', label: 'Budget (birr)', type: 'number', width: 110 },
            { key: 'status', label: 'Status', type: 'select', options: ACT_STATUS, width: 120 },
            { key: 'notes', label: 'Notes', width: 200 },
          ]} />
        <p className="tiny muted pad">“For” left empty = HQ / every center. Centers see the plans meant for them.{perm.hqEdit ? ' ' : ''}{perm.hqEdit && <button className="link small" onClick={() => setUpload(true)}>Upload a whole semester plan from Excel (English or Amharic)</button>}</p>
        {upload && <HqUploadSheet R={R} sem={semesterOf(today)} kinds={ACT_KINDS} onClose={() => setUpload(false)} reload={reload} setError={setError} />}
      </section>
    </>
  );
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TYPE_LABEL = { hq: 'HQ plan', event: 'Event', plan: 'Center plan' };

/* one calendar for HQ and every center: a month grid (or a list), coloured by center, overlaps highlighted */
function AllCalendar({ R, today }) {
  const [month, setMonth] = useState(() => monthOf(today));
  const [view, setView] = useState('grid');
  const [types, setTypes] = useState({ hq: true, event: true, plan: true });
  const [only, setOnly] = useState(null);
  const [day, setDay] = useState(null);
  const overlapAt = R.config?.calendar?.overlap || 2;
  const [from, to] = monthRange(month);
  const all = agenda(R, from, to).filter((u) => types[u.type] && (!only || (only === 'hq' ? !u.c : u.c?.id === only)));
  const loose = all.filter((u) => u.kind === 'month' || u.kind === 'period');    // "during the month" / "any time" plans
  const list = all.filter((u) => !loose.includes(u));
  const days = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const on = (d) => list.filter((u) => u.date === d || (u.end && u.date < d && u.end >= d && u.type !== 'hq'));
  const cells = [...Array(weekdayOf(from)).fill(null), ...days]; while (cells.length % 7) cells.push(null);
  // overlap: two or more things the same day for the same center (or for HQ / every center)
  // weekly plans repeat every week, so they are shown but not counted as overlaps
  const clashOf = (d) => { const by = {}; for (const u of on(d)) { if (u.kind === 'week') continue; const k = u.c?.id ?? 'hq'; by[k] = (by[k] || 0) + 1; } return Object.entries(by).filter(([, n]) => n >= overlapAt); };
  const clashDays = days.filter((d) => clashOf(d).length);
  const color = (u) => (u.c ? colorOf(R, u.c.id) : '#0f1f17');
  const busiest = Math.max(1, ...days.map((d) => on(d).length));
  return (
    <>
      <div className="month-bar">
        <button className="arrow" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><Icon.left /></button>
        <div className="current"><span className="w-main">{monthLabel(month)} <span className="am muted" style={{ fontWeight: 600 }}>{ET_MONTHS_AM[month.month]}</span></span><span className="w-sub">{fmtGreg(from)} – {fmtGreg(to)} · {list.length} item{list.length === 1 ? '' : 's'}</span></div>
        <button className="arrow" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><Icon.right /></button>
      </div>
      <div className="hq-cal-tools">
        <div className="seg"><button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>Month</button><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button></div>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {[['hq', 'HQ plans'], ['event', 'Events'], ['plan', 'Center plans']].map(([k, l]) => <button key={k} className={`chipbtn ${types[k] ? 'on' : ''}`} onClick={() => setTypes({ ...types, [k]: !types[k] })}><span className={`type-dot ${k}`} />{l}</button>)}
        </div>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          <button className={`chipbtn ${!only ? 'on' : ''}`} onClick={() => setOnly(null)}>Everyone</button>
          <button className={`chipbtn ${only === 'hq' ? 'on' : ''}`} onClick={() => setOnly('hq')}>HQ</button>
          {R.centers.map((c) => <button key={c.id} className={`chipbtn ${only === c.id ? 'on' : ''}`} style={{ '--cc': colorOf(R, c.id) }} onClick={() => setOnly(only === c.id ? null : c.id)}><i className="cdot" />{c.name}</button>)}
        </div>
      </div>
      {clashDays.length > 0 && (
        <div className="banner warn clash-banner"><span><b>{clashDays.length} day{clashDays.length > 1 ? 's' : ''} with overlapping plans</b> – {overlapAt}+ things the same day for one center:</span>
          <span className="clash-days">{clashDays.map((d) => <button key={d} className="chipbtn tiny-chip" onClick={() => setDay(d)}>⚠ {etLabel(d)} · {clashOf(d).map(([k]) => (k === 'hq' ? 'HQ' : R.centers.find((c) => String(c.id) === k)?.name)).join(', ')}</button>)}</span>
        </div>
      )}
      {loose.length > 0 && (
        <div className="cal-strips"><div className="cal-strip"><b>During {monthLabel(month).split(' ')[0]}</b>
          <div className="strip-items">{loose.map((u) => <span key={u.key} className="hq-chip plan" style={{ '--cc': color(u), display: 'inline-block', maxWidth: 280 }}><span className="am">{u.title}</span>{u.c ? ` · ${u.c.name}` : ''}</span>)}</div>
        </div></div>
      )}
      {view === 'grid' ? (
        <div className="hq-cal" role="grid" aria-label={monthLabel(month)}>
          {WD.map((w, i) => <div key={w} className={`cal-wd ${i === 0 ? 'sun' : ''}`}>{w}</div>)}
          {cells.map((d, k) => {
            if (!d) return <div key={k} className="hq-cal-cell empty" />;
            const items = on(d), cl = clashOf(d).length > 0;
            return (
              <button key={d} className={`hq-cal-cell ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${cl ? 'clash' : ''} ${weekdayOf(d) === 0 ? 'sun' : ''}`} onClick={() => setDay(d)}
                style={items.length ? { '--heat': items.length / busiest } : undefined} aria-label={`${etLabel(d, true)}: ${items.length} item${items.length === 1 ? '' : 's'}`}>
                <span className="hq-cal-num"><b>{toEthiopian(d).day}</b><small>{fmtGreg(d)}</small>{cl && <span className="clash-badge">⚠</span>}</span>
                {items.slice(0, 3).map((u) => <span key={u.key} className={`hq-chip ${u.type}`} style={{ '--cc': color(u) }}><span className="am">{u.title}</span></span>)}
                {items.length > 3 && <span className="hq-more">+{items.length - 3} more</span>}
                <span className="hq-cal-dots">{items.map((u) => <i key={u.key} style={{ background: color(u) }} />)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <section className="card">
          {days.filter((d) => on(d).length).length === 0 ? <p className="muted small">Nothing this month.</p> : days.filter((d) => on(d).length).map((d) => <DayRow key={d} d={d} items={on(d)} R={R} today={today} clash={clashOf(d).length > 0} />)}
        </section>
      )}
      <div className="legend" style={{ marginTop: 8 }}>
        <span className="lg"><span className="type-dot hq" /> HQ plan</span><span className="lg"><span className="type-dot event" /> Event</span><span className="lg"><span className="type-dot plan" /> Center plan</span>
        <span className="lg"><span className="clash-badge">⚠</span> overlapping</span>
      </div>
      {day && (
        <Sheet title={etLabel(day, true)} onClose={() => setDay(null)}>
          <p className="small muted" style={{ marginTop: 0 }}>{WEEKDAYS[weekdayOf(day)]} · {fmtGreg(day)} {day.slice(0, 4)}</p>
          {on(day).length === 0 ? <p className="muted">Nothing on this day.</p> : <DayRow d={day} items={on(day)} R={R} today={today} clash={clashOf(day).length > 0} />}
        </Sheet>
      )}
    </>
  );
}

function DayRow({ d, items, R, today, clash }) {
  const e = toEthiopian(d);
  return (
    <div className={`hq-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${clash ? 'clash' : ''}`}>
      <div className="hq-day-date"><small>{ET_MONTHS[e.month].slice(0, 3)}</small><b>{e.day}</b></div>
      <ul>{items.map((u) => (
        <li key={u.key}><span className={`type-dot ${u.type}`} title={TYPE_LABEL[u.type]} />
          <span className="grow"><span className="am">{u.title}</span>{u.sub && <small className="muted" style={{ display: 'block' }}>{TYPE_LABEL[u.type]} · {u.sub}{u.end && u.end !== u.date ? ` · until ${etLabel(u.end)}` : ''}</small>}</span>
          {u.c ? <CenterTag R={R} c={u.c} /> : <span className="ctag hq">HQ</span>}{Number(u.budget) ? <span className="tiny muted num">{birr(u.budget, u.c?.currency)}</span> : null}</li>
      ))}</ul>
    </div>
  );
}

function HqEvents({ R, today, perm, reload, setError }) {
  const rows = (R.events || []).filter((e) => e.center_id == null).sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const ops = gridOps('events', () => ({ center_id: null }), (r) => `HQ event “${r.title}”`, reload, setError);
  return (
    <section className="card flush">
      <div className="card-head pad"><div><div className="card-title">HQ events</div><div className="card-sub">Events for every center – they appear on each center’s calendar. Upcoming: {rows.filter((e) => (e.ends_on || e.starts_on) >= today).length}.</div></div></div>
      <Grid canEdit={perm.hqEdit} rows={rows} {...ops} addLabel="Add an HQ event" empty="No HQ events yet."
        columns={[
          { key: 'starts_on', label: 'Starts', type: 'date', required: true, width: 150 },
          { key: 'ends_on', label: 'Ends', type: 'date', width: 150 },
          { key: 'title', label: 'Event', required: true, width: 230 },
          { key: 'kind', label: 'Kind', type: 'select', options: EVENT_KINDS.map((k) => [k, k]), width: 130 },
          { key: 'start_time', label: 'Time', width: 90 },
          { key: 'location', label: 'Where', width: 150 },
          { key: 'notes', label: 'Notes', width: 200 },
        ]} />
    </section>
  );
}

function Teaching({ R, C, today, perm, reload, setError }) {
  const [cid, setCid] = useState(R.centers[0]?.id);
  const x = C.find((y) => y.c.id === cid) || C[0];
  if (!x) return null;
  return (
    <>
      <div className="chips" style={{ flexWrap: 'wrap', margin: '4px 0 10px' }}>
        {R.centers.map((c) => <button key={c.id} className={`chipbtn ${cid === c.id ? 'on' : ''}`} onClick={() => setCid(c.id)}>{c.name}</button>)}
      </div>
      <TeachingPlan key={x.c.id} D={x.D} latest={x.latest} today={today} perm={{ ...perm, switchCenter: perm.hqEdit, manage: false, mark: false }} progBy={x.progBy} reload={reload} setError={setError} />
    </>
  );
}
