import { useState } from 'react';
import { etLabel, monthOf, monthRange, addMonths, monthLabel, ET_MONTHS_AM, fmtGreg, toEthiopian, ET_MONTHS } from '../lib/ethiopian';
import { birr } from '../lib/plans';
import { gridOps } from '../views/Finance';
import { EVENT_KINDS } from '../views/CalendarPage';
import TeachingPlan from '../views/TeachingPlan';
import Grid from '../views/Grid';
import { Icon } from '../views/common';
import { agenda } from './hqData';
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
  if (!R.r6) return <div className="banner err">HQ plans need the release 6 SQL (v9_hq.sql) to be run in Supabase once.</div>;
  const all = (R.activities || []).slice().sort((a, b) => (a.starts_on || a.due || '9').localeCompare(b.starts_on || b.due || '9') || a.id - b.id);
  const rows = all.filter((a) => (filter === 'open' ? !['done', 'cancelled'].includes(a.status) : filter === 'done' ? a.status === 'done' : true));
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
        <p className="tiny muted pad">“For” left empty = HQ / every center. Centers see the plans meant for them.</p>
      </section>
    </>
  );
}

function AllCalendar({ R, today }) {
  const [month, setMonth] = useState(() => monthOf(today));
  const [types, setTypes] = useState({ hq: true, event: true, plan: true });
  const [only, setOnly] = useState(null);
  const [from, to] = monthRange(month);
  const list = agenda(R, from, to).filter((u) => types[u.type] && (!only || (only === 'hq' ? !u.c : u.c?.id === only)));
  const days = [...new Set(list.map((u) => u.date))];
  return (
    <>
      <div className="month-bar">
        <button className="arrow" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><Icon.left /></button>
        <div className="current"><span className="w-main">{monthLabel(month)} <span className="am muted" style={{ fontWeight: 600 }}>{ET_MONTHS_AM[month.month]}</span></span><span className="w-sub">{fmtGreg(from)} – {fmtGreg(to)} · {list.length} item{list.length === 1 ? '' : 's'}</span></div>
        <button className="arrow" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><Icon.right /></button>
      </div>
      <div className="hq-filters">
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {[['hq', 'HQ plans'], ['event', 'Events'], ['plan', 'Center planned dates']].map(([k, l]) => <button key={k} className={`chipbtn ${types[k] ? 'on' : ''}`} onClick={() => setTypes({ ...types, [k]: !types[k] })}>{l}</button>)}
        </div>
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          <button className={`chipbtn ${!only ? 'on' : ''}`} onClick={() => setOnly(null)}>Everyone</button>
          <button className={`chipbtn ${only === 'hq' ? 'on' : ''}`} onClick={() => setOnly('hq')}>HQ</button>
          {R.centers.map((c) => <button key={c.id} className={`chipbtn ${only === c.id ? 'on' : ''}`} onClick={() => setOnly(c.id)}>{c.name}</button>)}
        </div>
      </div>
      <section className="card">
        {days.length === 0 ? <p className="muted small">Nothing this month.</p> : days.map((d) => {
          const e = toEthiopian(d);
          return (
            <div key={d} className={`hq-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`}>
              <div className="hq-day-date"><small>{ET_MONTHS[e.month].slice(0, 3)}</small><b>{e.day}</b></div>
              <ul>{list.filter((u) => u.date === d).map((u) => (
                <li key={u.key}><span className={`type-dot ${u.type}`} title={u.type === 'hq' ? 'HQ plan' : u.type === 'event' ? 'Event' : 'Center planned date'} />
                  <span className="grow"><span className="am">{u.title}</span>{u.sub && <small className="muted" style={{ display: 'block' }}>{u.sub}{u.end && u.end !== u.date ? ` · until ${etLabel(u.end)}` : ''}</small>}</span>
                  {u.c ? <CenterTag R={R} c={u.c} /> : <span className="ctag hq">HQ</span>}{Number(u.budget) ? <span className="tiny muted num">{birr(u.budget)}</span> : null}</li>
              ))}</ul>
            </div>
          );
        })}
      </section>
    </>
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
