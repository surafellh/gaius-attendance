import { useMemo, useState } from 'react';
import { etLabel, fmtGreg, toEthiopian, ET_MONTHS, ET_MONTHS_AM, semesterOf, semNo, semYear } from '../lib/ethiopian';
import { pct, counts, readiness, READY_RATE } from '../lib/stats';
import { WeekPicker, Meter, Delta, CAT_COLOR, Initials, Icon, PeriodPicker, periodOf } from './common';
import { StackedBars, RateLines } from './Charts';
import { meetingInfo, whenText } from './Meeting';

/* bars: everyone who came, by group (new comers and informal members each as one group) */
const BAR_KEYS = ['Leader', 'Senior Leader', 'Member', 'Informal', 'New Comer'];
const BAR_LABELS = { 'Leader': 'Leaders', 'Senior Leader': 'Senior leaders', 'Member': 'Members', 'Informal': 'Informal members', 'New Comer': 'New comers' };
const barKey = (r) => (r.category === 'Active Informal Member' || r.category === 'Inactive Informal Member' ? 'Informal' : r.category);
const RANK_GROUPS = [['Member', 'Members'], ['Leader', 'Leaders'], ['Active Informal Member', 'Informal members'], ['New Comer', 'New comers']];

export default function Dashboard({ idx, summaries, latest, week, setWeek, calInfo, progBy, D, personBy, openPerson, go, today, perm }) {
  const sel = week || latest;
  const [period, setPeriod] = useState(() => ({ kind: 'sem', no: semNo(semesterOf(sel)), year: semYear(semesterOf(sel)) }));
  const P = periodOf(period);
  const [hidden, setHidden] = useState(() => new Set());
  const [rankGroup, setRankGroup] = useState('Member');
  const [rankDir, setRankDir] = useState('top');
  const [ncView, setNcView] = useState('since');
  const [expanded, setExpanded] = useState(false);

  const heldIdx = idx.held.indexOf(sel);
  const prevS = heldIdx > 0 ? idx.held[heldIdx - 1] : null;
  const cur = summaries[sel];
  const prev = prevS ? summaries[prevS] : null;
  const years = useMemo(() => [...new Set(idx.held.map((s) => toEthiopian(s).year))].sort((a, b) => b - a), [idx.held]);

  const weeks = useMemo(() => idx.held.filter((s) => s >= P.from && s <= P.to), [idx.held, P.from, P.to]);
  const avgPresent = weeks.length ? weeks.reduce((n, s) => n + summaries[s].present, 0) / weeks.length : null;
  const coreRates = weeks.map((s) => summaries[s].rate).filter((v) => v != null);
  const avgCore = coreRates.length ? coreRates.reduce((a, b) => a + b, 0) / coreRates.length : null;
  const pick = (s) => setWeek(s === latest ? null : s);

  const rateWeeks = weeks.map((s) => ({ sunday: s, note: noteOf(progBy[s]), values: { rate: summaries[s].rate, members: summaries[s].memberRate, leaders: summaries[s].leaderRate } }));
  const barWeeks = weeks.map((s) => {
    const v = {};
    for (const r of idx.bySunday[s] || []) if (r.status === 'Present') { const k = barKey(r); v[k] = (v[k] || 0) + 1; }
    return { sunday: s, values: v, note: noteOf(progBy[s]) };
  });

  const rows = idx.bySunday[sel] || [];
  const dropped = rows.filter((r) => counts(r) && personBy[r.person_id] && r.status === 'Absent' && idx.byPerson[r.person_id]?.[prevS]?.status === 'Present').length;
  const firstTimers = D.people.filter((p) => p.week_joined === sel).length;

  // new comers in the period
  const pipeline = useMemo(() => {
    const inP = (d) => d && d >= P.from && d <= P.to;
    const first = D.people.filter((p) => inP(p.week_joined) && p.week_joined <= sel);
    const cameBack = first.filter((p) => weeks.some((s) => s > p.week_joined && idx.byPerson[p.id]?.[s]?.status === 'Present'));
    const ncRows = rows.filter((r) => r.category === 'New Comer' && r.active);
    const ready = ncRows.map((r) => personBy[r.person_id]).filter(Boolean).filter((p) => readiness(p, idx.byPerson[p.id], idx.held, sel).ready);
    const becameMembers = D.history.filter((h) => h.category === 'Member' && inP(h.since) && h.note !== 'from sheet').length;
    return { first: first.length, cameBack: cameBack.length, activeNow: ncRows.length, ready, becameMembers };
  }, [idx, D.people, D.history, P.from, P.to, sel, weeks, rows, personBy]);

  // month by month inside the period
  const months = useMemo(() => {
    const m = new Map();
    for (const s of weeks) { const e = toEthiopian(s); const k = `${e.year}-${e.month}`; if (!m.has(k)) m.set(k, { k, name: ET_MONTHS[e.month], am: ET_MONTHS_AM[e.month], list: [] }); m.get(k).list.push(s); }
    return [...m.values()].map((x) => {
      const r = x.list.map((s) => summaries[s].rate).filter((v) => v != null);
      return { ...x, present: x.list.reduce((n, s) => n + summaries[s].present, 0) / x.list.length, rate: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null };
    });
  }, [weeks, summaries]);

  // ranking over the period
  const isNC = rankGroup === 'New Comer';
  const ranked = useMemo(() => {
    const last = weeks.filter((s) => s <= sel).pop() || weeks[weeks.length - 1];
    if (!last) return { list: [], tooNew: [] };
    const list = (idx.bySunday[last] || []).filter((r) => personBy[r.person_id] && (isNC ? r.category === 'New Comer' && r.active : r.category === rankGroup)).map((r) => {
      const p = personBy[r.person_id];
      const marks = idx.byPerson[p.id] || {};
      if (isNC) {
        const x = readiness(p, marks, idx.held, last, P.from);
        const score = ncView === 'since' ? x.sinceRate : x.periodRate;
        const sub = ncView === 'since'
          ? `${x.sincePresent} of ${x.weeksIn} Sundays since ${x.first ? etLabel(x.first) : 'first visit'} · ${x.sixDone ? '6 months reached' : `6 months on ${etLabel(x.sixEnd, true)}`}`
          : `${x.periodPresent} of ${x.periodHeld} Sundays from ${etLabel(P.from)}${x.first > P.from ? ` (joined ${etLabel(x.first)})` : ''}`;
        return { p, score, sub, ready: x.ready, six: x.sixDone, weeks: x.weeksIn };
      }
      const held = weeks.filter((s) => s <= last && marks[s]?.status);
      const present = held.filter((s) => marks[s].status === 'Present').length;
      return { p, score: held.length ? present / held.length : null, sub: `${present} of ${held.length} Sundays · ${P.label}` };
    }).filter((x) => x.score != null);
    const tooNew = isNC && ncView === 'since' ? list.filter((x) => x.weeks < 4) : [];
    const main = list.filter((x) => !tooNew.includes(x))
      .sort((a, b) => (rankDir === 'top' ? b.score - a.score : a.score - b.score) || (b.weeks || 0) - (a.weeks || 0) || a.p.name.localeCompare(b.p.name));
    return { list: main, tooNew };
  }, [idx, sel, weeks, personBy, rankGroup, rankDir, isNC, ncView, P.from, P.label]);

  // programs inside the period
  const progWeeks = useMemo(() => {
    const extra = Object.keys(progBy).filter((d) => d >= P.from && d <= P.to && d <= today && !idx.heldSet.has(d));
    return [...new Set([...weeks, ...extra])].sort().reverse();
  }, [weeks, progBy, P.from, P.to, idx.heldSet, today]);

  if (!cur) return <div className="page"><div className="card empty">No attendance recorded yet. Start on the Attendance page.</div></div>;
  const toggle = (k) => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const leaders = cur.byCat.Leader, members = cur.byCat.Member;
  const shown = expanded ? ranked.list : ranked.list.slice(0, 8);

  return (
    <div className="page">
      <section className="dash-bar">
        <div className="dash-bar-left">
          <WeekPicker value={week} latest={latest} onChange={setWeek} held={idx.held} info={calInfo} allowLatest />
          {week && <button className="chip-back" onClick={() => setWeek(null)}>Viewing {etLabel(sel)} · back to latest <Icon.x width="14" height="14" /></button>}
        </div>
      </section>
      <div className="period-float">
        <span className="pf-label">Charts &amp; lists for</span>
        <PeriodPicker value={period} onChange={(v) => { setPeriod(v); setExpanded(false); }} years={years} />
        <b className="pf-now">{P.label}</b>
      </div>

      {perm.mark && <Reminders D={D} today={today} go={go} />}

      <section className="kpis" aria-label={`Summary for ${etLabel(sel, true)}`}>
        <div className="kpi hero">
          <span className="kpi-label">Total present · {etLabel(sel)}</span>
          <span className="kpi-val">{cur.present}</span>
          <span className="kpi-foot"><Delta d={prev ? cur.present - prev.present : null} /> vs last Sunday</span>
        </div>
        <Kpi label="Leaders & members rate" val={<>{pct(cur.rate)}<small>{cur.countedPresent}/{cur.counted}</small></>} foot={<><Delta d={prev && prev.rate != null && cur.rate != null ? (cur.rate - prev.rate) * 100 : null} suffix=" pts" /> vs last Sunday</>} />
        <Kpi label="Leaders" color={CAT_COLOR.Leader} val={<>{leaders.present}<small>/{leaders.total}</small></>} foot={`${pct(cur.leaderRate)} came`} />
        <Kpi label="Members" color={CAT_COLOR.Member} val={<>{members.present}<small>/{members.total}</small></>} foot={`${pct(cur.memberRate)} came`} />
        <Kpi label="Informal & new comers" color={CAT_COLOR['New Comer']} val={cur.informal + cur.newComers} foot={`${cur.informal} informal · ${cur.newComers} new comers · ${firstTimers} first time`} />
        <button className="kpi" onClick={() => go('calls')} style={{ cursor: 'pointer' }}>
          <span className="kpi-label"><span className="dot" style={{ background: 'var(--absent)' }} />Need a call</span>
          <span className="kpi-val">{dropped}</span>
          <span className="kpi-foot">came last week, missed this one ›</span>
        </button>
      </section>

      <div className="dash-grid">
        <section className="card span2">
          <div className="card-head">
            <div>
              <div className="card-title">Who came each Sunday · {P.label}</div>
              <div className="card-sub">Average {avgPresent != null ? avgPresent.toFixed(1) : '–'} people over {weeks.length} Sundays. Tap a bar to see that Sunday; tap a group to hide it.</div>
            </div>
          </div>
          {weeks.length ? <StackedBars weeks={barWeeks} keys={BAR_KEYS} labels={BAR_LABELS} hidden={hidden} selected={sel} onSelect={pick} /> : <p className="muted small">No Sundays recorded in this period.</p>}
          <div className="legend">
            {BAR_KEYS.map((k) => (
              <button key={k} className={hidden.has(k) ? 'off' : ''} onClick={() => toggle(k)} aria-pressed={!hidden.has(k)}>
                <span className="dot" style={{ background: CAT_COLOR[k] }} />{BAR_LABELS[k]}
              </button>
            ))}
          </div>
        </section>

        <section className="card span2">
          <div className="card-head">
            <div>
              <div className="card-title">Leaders & members rate</div>
              <div className="card-sub">The groups with a fixed list. Average {pct(avgCore)} in {P.label}. Informal members and new comers are counted above, not rated.</div>
            </div>
          </div>
          {weeks.length > 0 && <RateLines weeks={rateWeeks} selected={sel} onSelect={pick} series={[
            { key: 'rate', label: 'Leaders & members', color: 'var(--lime-strong)', width: 3 },
            { key: 'members', label: 'Members', color: 'var(--c-member)' },
            { key: 'leaders', label: 'Leaders', color: 'var(--c-leader)', dash: '5 4' },
          ]} />}
          <div className="legend">
            <span className="lg"><i className="ln" style={{ background: 'var(--lime-strong)' }} />Leaders & members</span>
            <span className="lg"><i className="ln" style={{ background: 'var(--c-member)' }} />Members</span>
            <span className="lg"><i className="ln" style={{ background: 'var(--c-leader)' }} />Leaders</span>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><div><div className="card-title">Groups on {etLabel(sel)}</div><div className="card-sub">Compared with the 4 Sundays before.</div></div></div>
          <table className="gtable">
            <thead><tr><th>Group</th><th>Came</th><th>Rate</th><th>4-wk avg</th></tr></thead>
            <tbody>
              {[['Leader', 'Leaders', true], ['Member', 'Members', true], ['Senior Leader', 'Senior leaders'], ['Active Informal Member', 'Active informal'], ['Inactive Informal Member', 'Inactive informal'], ['New Comer', 'New comers']].map(([k, l, rated]) => {
                const c = cur.byCat[k];
                const prev4 = idx.held.slice(Math.max(0, heldIdx - 4), heldIdx).map((s) => summaries[s].byCat[k]);
                const avg4 = prev4.length ? prev4.reduce((n, x) => n + (rated ? (x.total ? x.present / x.total : 0) : x.present), 0) / prev4.length : null;
                const r = c.total ? c.present / c.total : null;
                return (
                  <tr key={k}>
                    <td><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: CAT_COLOR[k] }} />{l}</span></td>
                    <td className="num">{rated ? `${c.present}/${c.total}` : c.present}</td>
                    <td className="num">{rated ? <><span className="bar-inline"><span style={{ width: `${(r || 0) * 100}%` }} /></span>{pct(r)}</> : <span className="faint">–</span>}</td>
                    <td className="num">{avg4 == null ? '–' : rated ? <>{pct(avg4)} <Delta d={r != null ? (r - avg4) * 100 : null} /></> : <>{avg4.toFixed(1)} <Delta d={c.present - avg4} /></>}</td>
                  </tr>
                );
              })}
              <tr className="total"><td>Total present</td><td className="num">{cur.present}</td><td className="num">{pct(cur.rate)}<span className="tiny muted"> L+M</span></td><td /></tr>
            </tbody>
          </table>
        </section>

        <section className="card">
          <div className="card-head"><div><div className="card-title">New comers · {P.label}</div><div className="card-sub">Ready = 6 months since the first visit and at least {Math.round(READY_RATE * 100)}% since then. Leaders still decide.</div></div></div>
          <div className="funnel">
            {[['First-time visitors', pipeline.first], ['Came back again', pipeline.cameBack], ['Active new comers now', pipeline.activeNow], ['Ready for membership', pipeline.ready.length], ['Became members', pipeline.becameMembers]].map(([l, n], i, arr) => (
              <div className="funnel-row" key={l}>
                <span>{l}</span>
                <span className="funnel-track"><span style={{ width: `${(n / Math.max(1, ...arr.map((a) => a[1]))) * 100}%`, opacity: 1 - i * 0.12 }} /></span>
                <b className="num">{n}</b>
              </div>
            ))}
          </div>
          {pipeline.ready.length > 0 && (
            <div className="chips" style={{ marginTop: 12 }}>
              {pipeline.ready.map((p) => <button key={p.id} className="chipbtn" onClick={() => openPerson(p.id)}>{p.name}</button>)}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head"><div><div className="card-title">Programs · {P.label}</div><div className="card-sub">{progWeeks.filter((s) => progBy[s]?.kind && progBy[s].kind !== 'No meeting').length} programs recorded.</div></div></div>
          <ul className="prog-list scroll-y">
            {progWeeks.map((s) => {
              const p = progBy[s]; const e = toEthiopian(s);
              return (
                <li className="prog-item" key={s}>
                  <span className="prog-date"><small>{ET_MONTHS[e.month].slice(0, 3)}</small><b>{e.day}</b></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="prog-title">{p?.kind ? <><span className={`tag ${p.kind === 'No meeting' ? 'bad' : 'lime'}`}>{p.kind}</span> <span className="am">{p.topic || ''}</span></> : <span className="faint">No program recorded</span>}</span>
                    <span className="prog-meta" style={{ display: 'block' }}>{[p?.minister && `by ${p.minister}`, p?.planned_by && `${p.planned_by} plan`].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="num" style={{ textAlign: 'right' }}>{summaries[s] ? <><b>{summaries[s].present}</b><span className="tiny muted" style={{ display: 'block' }}>present</span></> : <span className="tiny muted">–</span>}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <div className="card-head"><div><div className="card-title">Month by month</div><div className="card-sub">Average per Sunday in {P.label}.</div></div></div>
          <table className="gtable">
            <thead><tr><th>Month</th><th className="hide-sm">Sundays</th><th>Total present</th><th>L+M rate</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.k}>
                  <td>{m.name} <span className="am muted tiny hide-sm">{m.am}</span></td>
                  <td className="num hide-sm">{m.list.length}</td>
                  <td className="num">{m.present.toFixed(1)}</td>
                  <td className="num">{pct(m.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card span2">
          <div className="card-head">
            <div>
              <div className="card-title">{isNC ? (ncView === 'since' ? 'New comers since they joined' : 'Membership review') : rankDir === 'top' ? 'Most faithful' : 'Needs encouragement'} · {P.label}</div>
              <div className="card-sub">{isNC
                ? (ncView === 'since' ? 'Weekly follow-up: each person from their own first Sunday. Fewer than 4 Sundays is too early to rank.'
                  : `For deciding membership: every Sunday from ${etLabel(P.from)} counts, so someone who joined late can't outrank someone who came all along.`)
                : 'Present ÷ Sundays they were on the list in this period.'}</div>
            </div>
            <div className="seg">
              <button className={rankDir === 'top' ? 'on' : ''} onClick={() => setRankDir('top')}>Top</button>
              <button className={rankDir === 'bottom' ? 'on' : ''} onClick={() => setRankDir('bottom')}>Lowest</button>
            </div>
          </div>
          <div className="rank-tools">
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              {RANK_GROUPS.map(([k, l]) => <button key={k} className={`chipbtn ${rankGroup === k ? 'on' : ''}`} onClick={() => { setRankGroup(k); setExpanded(false); }}>{l}</button>)}
            </div>
            {isNC && (
              <div className="seg">
                <button className={ncView === 'since' ? 'on' : ''} onClick={() => setNcView('since')}>Since joining</button>
                <button className={ncView === 'review' ? 'on' : ''} onClick={() => setNcView('review')}>Membership review</button>
              </div>
            )}
          </div>
          {ranked.list.length === 0 && <p className="muted small">Nobody to rank for this period.</p>}
          <ol className="rank-list">
            {shown.map(({ p, score, sub, ready, six }, i) => (
              <li key={p.id} className="rank-item" onClick={() => openPerson(p.id)}>
                <span className="rank-pos">{i + 1}</span>
                <span className="row" style={{ minWidth: 0 }}>
                  <Initials name={p.name} category={p.category} />
                  <span className="rank-name">{p.name}{ready ? <span className="tag ok" style={{ marginLeft: 6 }}>ready</span> : six ? <span className="tag lime" style={{ marginLeft: 6 }}>6 months</span> : null}<small>{sub}</small></span>
                </span>
                <Meter v={score} color={rankDir === 'top' ? 'var(--present)' : 'var(--absent)'} />
              </li>
            ))}
          </ol>
          {ranked.list.length > 8 && <button className="btn ghost wide" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `Show all ${ranked.list.length}`}</button>}
          {ranked.tooNew.length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Too early to rank (under 4 Sundays): {ranked.tooNew.map((x) => x.p.name).join(', ')}</p>}
        </section>
      </div>
      <p className="muted tiny">Each Sunday keeps the group people had on that day, so past numbers don't change later. {fmtGreg(sel)}.</p>
    </div>
  );
}

function Kpi({ label, val, foot, color }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{color && <span className="dot" style={{ background: color }} />}{label}</span>
      <span className="kpi-val">{val}</span>
      <span className="kpi-foot">{foot}</span>
    </div>
  );
}
const noteOf = (p) => (p?.kind ? `${p.kind}${p.topic ? ': ' + p.topic : ''}${p.minister ? ' – ' + p.minister : ''}` : null);

function Reminders({ D, today, go }) {
  if (!D.p2) return null;
  const m = meetingInfo(D.center, today);
  const openItems = D.agenda.filter((a) => a.status === 'open' && (a.center_id || 1) === (D.center?.id || 1)).length;
  const next = D.events.filter((e) => (e.ends_on || e.starts_on) >= today && (e.center_id == null || e.center_id === D.center?.id))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0];
  return (
    <div className="dash-reminders">
      <button onClick={() => go('meeting')}>
        <span className="ic"><Icon.list /></span>
        <span className="pinfo"><span className="pname">Leaders’ meeting {whenText(m.inDays)} · {m.time}</span><span className="pmeta">{etLabel(m.next, true)} · {openItems} open agenda item{openItems === 1 ? '' : 's'}</span></span>
      </button>
      {next && (
        <button onClick={() => go('calendar')}>
          <span className="ic"><Icon.cal /></span>
          <span className="pinfo"><span className="pname am">{next.title}</span><span className="pmeta">{etLabel(next.starts_on, true)} · {whenText(Math.max(0, Math.round((Date.parse(next.starts_on) - Date.parse(today)) / 864e5)))}{next.location ? ` · ${next.location}` : ''}</span></span>
        </button>
      )}
    </div>
  );
}
