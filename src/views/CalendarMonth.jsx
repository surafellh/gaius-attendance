import { useMemo, useState } from 'react';
import { etLabel, fmtGreg, monthOf, addMonths, monthLabel, monthRange, ET_MONTHS_AM, toEthiopian, addDays, weekdayOf } from '../lib/ethiopian';
import { deptColor, deptName, STATUS, itemsBetween, itemState, itemWhen } from '../lib/plans';
import { Icon, Sheet } from './common';
import { ItemSheet } from './Plans';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const mark = { done: '✓', not_done: '✕', cancelled: '–' };

/* Month calendar: Sunday programs, events and department plans, colour-coded by department */
export default function CalendarMonth({ D, today, perm, progBy, reload, setError }) {
  const [month, setMonth] = useState(() => monthOf(today));
  const [off, setOff] = useState(() => new Set());
  const [item, setItem] = useState(null);
  const [day, setDay] = useState(null);
  const [from, to] = monthRange(month);
  const cid = D.center?.id || 1;
  const all = useMemo(() => itemsBetween(D, from, to).filter((i) => !off.has(i.plan.department_id)), [D, from, to, off]);
  const dayItems = all.filter((i) => i.due_kind === 'day');
  const weekly = all.filter((i) => i.due_kind === 'week');
  const period = itemsBetween(D, from, addDays(to, 200)).filter((i) => i.due_kind === 'period' && !off.has(i.plan.department_id) && from <= i.due);
  const events = D.events.filter((e) => (e.center_id == null || e.center_id === cid) && e.starts_on <= to && (e.ends_on || e.starts_on) >= from);
  const depts = D.departments.filter((d) => D.plans.some((p) => p.department_id === d.id));
  const lead = weekdayOf(from);
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const cells = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const onDay = (d) => ({
    prog: weekdayOf(d) === 0 ? progBy[d] : null,
    events: events.filter((e) => e.starts_on <= d && (e.ends_on || e.starts_on) >= d),
    items: dayItems.filter((i) => i.due === d),
  });
  const weeklyPlans = [...new Map(weekly.map((i) => [i.plan_id, i.plan])).values()];
  const toggle = (id) => setOff((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <div className="month-bar">
        <button className="arrow" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><Icon.left /></button>
        <div className="current">
          <span className="w-main">{monthLabel(month)} <span className="am muted" style={{ fontWeight: 600 }}>{ET_MONTHS_AM[month.month]}</span></span>
          <span className="w-sub">{fmtGreg(from)} – {fmtGreg(to)} · {dayItems.length + all.filter((i) => i.due_kind === 'month').length} plans · {events.length} events</span>
        </div>
        <button className="arrow" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><Icon.right /></button>
      </div>

      <div className="scroll-x"><div className="chips" style={{ flexWrap: 'nowrap' }}>
        {depts.map((d) => <button key={d.id} className={`chipbtn dept-chip ${off.has(d.id) ? 'off' : ''}`} style={{ '--dc': deptColor(D, d.id) }} onClick={() => toggle(d.id)}><span className="dot" style={{ background: deptColor(D, d.id) }} />{d.name}</button>)}
      </div></div>

      {(all.some((i) => i.due_kind === 'month') || weeklyPlans.length > 0) && (
        <div className="cal-strips">
          {all.some((i) => i.due_kind === 'month') && (
            <div className="cal-strip"><b>During {monthLabel(month).split(' ')[0]}</b>
              <div className="strip-items">{all.filter((i) => i.due_kind === 'month').map((i) => <PlanChip key={i.id} i={i} D={D} today={today} onClick={() => setItem(i)} />)}</div>
            </div>
          )}
          {weeklyPlans.length > 0 && (
            <div className="cal-strip"><b>Every week</b>
              <div className="strip-items">{weeklyPlans.map((p) => (
                <span key={p.id} className="weekly" style={{ '--dc': deptColor(D, p.department_id) }}>
                  <span className="am">{p.title}</span>
                  {weekly.filter((i) => i.plan_id === p.id).map((i) => <button key={i.id} className={`idot ${itemState(i, today)}`} title={`${etLabel(i.due)} – ${STATUS[i.status][0]}`} onClick={() => setItem(i)} />)}
                </span>
              ))}</div>
            </div>
          )}
        </div>
      )}

      <div className="cal-grid" role="grid" aria-label={monthLabel(month)}>
        {WD.map((w, i) => <div key={w} className={`cal-wd ${i === 0 ? 'sun' : ''}`}>{w}</div>)}
        {cells.map((d, k) => {
          if (!d) return <div key={k} className="cal-cell empty" />;
          const x = onDay(d);
          const e = toEthiopian(d);
          return (
            <div key={d} className={`cal-cell ${weekdayOf(d) === 0 ? 'sun' : ''} ${d === today ? 'today' : ''}`} onClick={() => setDay(d)} role="gridcell" tabIndex={0} onKeyDown={(ev) => ev.key === 'Enter' && setDay(d)}>
              <div className="cal-num"><b>{e.day}</b><small>{fmtGreg(d)}</small></div>
              {x.prog?.kind && <span className={`cal-chip prog ${x.prog.kind === 'No meeting' ? 'none' : ''}`}>{x.prog.kind}</span>}
              {x.events.map((ev) => <span key={ev.id} className="cal-chip event am">{ev.title}</span>)}
              {x.items.map((i) => <PlanChip key={i.id} i={i} D={D} today={today} small onClick={(evt) => { evt.stopPropagation(); setItem(i); }} />)}
              <span className="cal-dots">{x.items.map((i) => <i key={i.id} style={{ background: deptColor(D, i.plan.department_id) }} />)}{x.events.length > 0 && <i className="ev" />}</span>
            </div>
          );
        })}
      </div>

      <section className="card">
        <div className="card-head"><div><div className="card-title">This month, day by day</div><div className="card-sub">Tap a plan to mark it done / not done or move it.</div></div></div>
        <ul className="ev-list">
          {days.filter((d) => onDay(d).items.length || onDay(d).events.length || onDay(d).prog?.kind).map((d) => {
            const x = onDay(d);
            return (
              <li key={d} className="agenda-day">
                <span className="prog-date"><small>{WD[weekdayOf(d)]}</small><b>{toEthiopian(d).day}</b></span>
                <span className="agenda-items">
                  {x.prog?.kind && <span className="cal-chip prog">{x.prog.kind}{x.prog.topic ? ` · ${x.prog.topic}` : ''}</span>}
                  {x.events.map((ev) => <span key={ev.id} className="cal-chip event am">{ev.title}</span>)}
                  {x.items.map((i) => <PlanChip key={i.id} i={i} D={D} today={today} onClick={() => setItem(i)} />)}
                </span>
              </li>
            );
          })}
        </ul>
        {period.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Any time this semester: {[...new Set(period.map((i) => i.plan.title))].join(' · ')}</p>}
      </section>

      {item && <ItemSheet item={item} D={D} perm={perm} onClose={() => setItem(null)} reload={reload} setError={setError} />}
      {day && (
        <Sheet title={etLabel(day, true)} onClose={() => setDay(null)}>
          <p className="small muted">{fmtGreg(day)} {day.slice(0, 4)}</p>
          {(() => { const x = onDay(day); return (
            <div className="agenda-items">
              {x.prog?.kind && <span className="cal-chip prog">{x.prog.kind}{x.prog.topic ? ` · ${x.prog.topic}` : ''}{x.prog.minister ? ` – ${x.prog.minister}` : ''}</span>}
              {x.events.map((ev) => <span key={ev.id} className="cal-chip event am">{ev.title}{ev.location ? ` · ${ev.location}` : ''}</span>)}
              {x.items.map((i) => <PlanChip key={i.id} i={i} D={D} today={today} onClick={() => { setDay(null); setItem(i); }} />)}
              {!x.prog?.kind && !x.events.length && !x.items.length && <p className="muted">Nothing on this day.</p>}
            </div>
          ); })()}
        </Sheet>
      )}
    </>
  );
}

function PlanChip({ i, D, today, onClick, small }) {
  const st = itemState(i, today);
  return (
    <button className={`cal-chip plan ${st} ${small ? 'sm' : ''}`} style={{ '--dc': deptColor(D, i.plan.department_id) }} onClick={onClick}
      title={`${deptName(D, i.plan.department_id)} · ${i.plan.title} · ${itemWhen(i)} · ${STATUS[i.status][0]}`}>
      {mark[i.status] && <b>{mark[i.status]}</b>}<span className="am">{i.label || i.plan.title}</span>
    </button>
  );
}
