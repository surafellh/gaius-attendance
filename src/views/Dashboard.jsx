import { useMemo, useState } from 'react';
import { etLabel, fmtGreg, toEthiopian, ET_MONTHS, ET_MONTHS_AM, semesterStart, semesterOf } from '../lib/ethiopian';
import { CATEGORIES, SHORT, pct, personFacts, counts } from '../lib/stats';
import { WeekPicker, Meter, Delta, CAT_COLOR, Initials, Icon } from './common';
import { StackedBars, RateLines } from './Charts';

const BAR_KEYS = ['Leader', 'Senior Leader', 'Member', 'Active Informal Member', 'Inactive Informal Member', 'Active New Comer', 'Inactive New Comer'];
const BAR_LABELS = { ...SHORT, 'Active New Comer': 'New comers (active)', 'Inactive New Comer': 'New comers (inactive)' };
const GROUP_ROWS = [
  ['Leader', 'Leaders'], ['Senior Leader', 'Senior leaders'], ['Member', 'Members'], ['Active Informal Member', 'Active informal'],
  ['Active New Comer', 'Active new comers'],
];

export default function Dashboard({ idx, summaries, latest, week, setWeek, calInfo, progBy, D, personBy, openPerson, go }) {
  const [range, setRange] = useState('semester');
  const [hidden, setHidden] = useState(() => new Set());
  const [rankGroup, setRankGroup] = useState('Member');
  const [rankDir, setRankDir] = useState('top');
  const sel = week || latest;
  const heldIdx = idx.held.indexOf(sel);
  const prevS = heldIdx > 0 ? idx.held[heldIdx - 1] : null;
  const cur = summaries[sel];
  const prev = prevS ? summaries[prevS] : null;
  const sem = semesterOf(sel);
  const semStart = semesterStart(sem);

  const rangeWeeks = useMemo(() => {
    const upto = idx.held.filter((s) => s <= sel);
    if (range === 'semester') return upto.filter((s) => s >= semStart);
    if (range === 'year') return upto.slice(-52);
    return upto;
  }, [idx.held, sel, range, semStart]);

  const avgRate = rangeWeeks.length ? rangeWeeks.reduce((n, s) => n + (summaries[s].rate || 0), 0) / rangeWeeks.length : null;
  const avgPresent = rangeWeeks.length ? rangeWeeks.reduce((n, s) => n + summaries[s].present, 0) / rangeWeeks.length : null;

  const rateWeeks = rangeWeeks.map((s) => ({
    sunday: s, note: noteOf(progBy[s]),
    values: { rate: summaries[s].rate, members: summaries[s].memberRate, leaders: lr(summaries[s]) },
  }));
  const barWeeks = rangeWeeks.map((s) => {
    const rows = idx.bySunday[s] || [];
    const v = {};
    for (const r of rows) if (r.status === 'Present') {
      const k = r.category === 'New Comer' ? (r.active ? 'Active New Comer' : 'Inactive New Comer') : r.category;
      v[k] = (v[k] || 0) + 1;
    }
    return { sunday: s, values: v, note: noteOf(progBy[s]) };
  });

  // follow-up numbers for the selected Sunday
  const rows = idx.bySunday[sel] || [];
  const followRows = rows.filter((r) => counts(r) && personBy[r.person_id]);
  const dropped = followRows.filter((r) => r.status === 'Absent' && idx.byPerson[r.person_id]?.[prevS]?.status === 'Present').length;
  const firstTimers = D.people.filter((p) => p.week_joined === sel).length;
  const ncPresent = rows.filter((r) => r.category === 'New Comer' && r.status === 'Present').length;
  const leaders = cur ? { p: cur.byCat['Leader'].present + cur.byCat['Senior Leader'].present, t: cur.byCat['Leader'].total + cur.byCat['Senior Leader'].total } : null;

  // new comer pipeline this semester
  const pipeline = useMemo(() => {
    const semHeld = idx.held.filter((s) => s >= semStart && s <= sel);
    const ncs = D.people.filter((p) => {
      const marks = idx.byPerson[p.id] || {};
      return semHeld.some((s) => marks[s]?.category === 'New Comer' && marks[s]?.status === 'Present');
    });
    const firstThisSem = D.people.filter((p) => p.week_joined && p.week_joined >= semStart && p.week_joined <= sel);
    const facts = ncs.map((p) => ({ p, f: personFacts(p, idx.byPerson[p.id], idx.held, sel, semStart) }));
    const cameBack = firstThisSem.filter((p) => semHeld.filter((s) => s > p.week_joined && idx.byPerson[p.id]?.[s]?.status === 'Present').length > 0);
    const activeNow = (idx.bySunday[sel] || []).filter((r) => r.category === 'New Comer' && r.active).length;
    const promising = facts.filter(({ p, f }) => p.category === 'New Comer' && f.promising);
    const becameMembers = D.history.filter((h) => h.category === 'Member' && h.since >= semStart && h.note !== 'from sheet').length;
    return { ncs: ncs.length, first: firstThisSem.length, cameBack: cameBack.length, activeNow, promising, becameMembers };
  }, [idx, D.people, D.history, semStart, sel]);

  // monthly averages in range
  const months = useMemo(() => {
    const m = new Map();
    for (const s of rangeWeeks) {
      const e = toEthiopian(s); const k = `${e.year}-${String(e.month).padStart(2, '0')}`;
      if (!m.has(k)) m.set(k, { k, name: ET_MONTHS[e.month], am: ET_MONTHS_AM[e.month], year: e.year, list: [] });
      m.get(k).list.push(s);
    }
    return [...m.values()].map((x) => ({
      ...x,
      present: x.list.reduce((n, s) => n + summaries[s].present, 0) / x.list.length,
      rate: x.list.reduce((n, s) => n + (summaries[s].rate || 0), 0) / x.list.length,
      members: x.list.reduce((n, s) => n + (summaries[s].memberRate || 0), 0) / x.list.length,
    }));
  }, [rangeWeeks, summaries]);

  // ranking over the semester
  const ranked = useMemo(() => {
    const list = (idx.bySunday[sel] || []).filter((r) => personBy[r.person_id] && (rankGroup === 'Active New Comer' ? r.category === 'New Comer' && r.active : r.category === rankGroup));
    return list.map((r) => {
      const p = personBy[r.person_id];
      const f = personFacts(p, idx.byPerson[p.id], idx.held, sel, semStart);
      return { p, f, score: rankGroup === 'Active New Comer' ? f.sinceRate : f.semRate };
    }).filter((x) => x.score != null)
      .sort((a, b) => (rankDir === 'top' ? b.score - a.score : a.score - b.score) || a.p.name.localeCompare(b.p.name))
      .slice(0, 6);
  }, [idx, sel, personBy, rankGroup, rankDir, semStart]);

  if (!cur) return <div className="page"><div className="card empty">No attendance recorded yet. Start on the Attendance page.</div></div>;
  const prog = progBy[sel];
  const toggle = (k) => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const pick = (s) => setWeek(s === latest ? null : s);

  return (
    <div className="page">
      <WeekPicker value={week} latest={latest} onChange={setWeek} held={idx.held} info={calInfo} allowLatest />

      <section className="kpis" aria-label={`Summary for ${etLabel(sel, true)}`}>
        <div className="kpi hero">
          <span className="kpi-label">Attendance rate</span>
          <span className="kpi-val">{pct(cur.rate)}<small>{cur.countedPresent}/{cur.counted}</small></span>
          <span className="kpi-foot"><Delta d={prev ? (cur.rate - prev.rate) * 100 : null} suffix=" pts" /> vs last Sunday</span>
        </div>
        <Kpi label="People present" val={cur.present} foot={<><Delta d={prev ? cur.present - prev.present : null} /> vs last Sunday</>} />
        <Kpi label="Members present" color={CAT_COLOR.Member} val={<>{cur.byCat.Member.present}<small>/{cur.byCat.Member.total}</small></>} foot={`${pct(cur.memberRate)} of members`} />
        <Kpi label="Leaders present" color={CAT_COLOR.Leader} val={<>{leaders.p}<small>/{leaders.t}</small></>} foot={`${pct(leaders.t ? leaders.p / leaders.t : null)} of leaders`} />
        <Kpi label="New comers" color={CAT_COLOR['New Comer']} val={ncPresent} foot={`${firstTimers} first time · ${cur.byCat['Active New Comer'].total} active`} />
        <button className="kpi" onClick={() => go('follow')} style={{ cursor: 'pointer' }}>
          <span className="kpi-label"><span className="dot" style={{ background: 'var(--absent)' }} />Need a call</span>
          <span className="kpi-val">{dropped}</span>
          <span className="kpi-foot">came last week, missed this one ›</span>
        </button>
      </section>

      <div className="dash-grid">
        <section className="card span2">
          <div className="card-head">
            <div>
              <div className="card-title">Attendance rate</div>
              <div className="card-sub">Share of the people we expect (leaders, members, active informal and active new comers) who came. Average {pct(avgRate)} over {rangeWeeks.length} Sundays.</div>
            </div>
            <div className="seg">
              {[['semester', 'Semester'], ['year', '12 months'], ['all', 'All']].map(([k, l]) => <button key={k} className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>)}
            </div>
          </div>
          <RateLines weeks={rateWeeks} selected={sel} onSelect={pick} series={[
            { key: 'rate', label: 'Overall', color: 'var(--lime-strong)', width: 3 },
            { key: 'members', label: 'Members', color: 'var(--c-member)' },
            { key: 'leaders', label: 'Leaders', color: 'var(--c-leader)', dash: '5 4' },
          ]} />
          <div className="legend">
            <span className="lg"><i className="ln" style={{ background: 'var(--lime-strong)' }} />Overall</span>
            <span className="lg"><i className="ln" style={{ background: 'var(--c-member)' }} />Members</span>
            <span className="lg"><i className="ln" style={{ background: 'var(--c-leader)' }} />Leaders (incl. senior)</span>
          </div>
        </section>

        <section className="card span2">
          <div className="card-head">
            <div>
              <div className="card-title">Who came each Sunday</div>
              <div className="card-sub">Average {avgPresent?.toFixed(1)} people. Tap a bar to open that Sunday; tap a group below to hide it.</div>
            </div>
          </div>
          <StackedBars weeks={barWeeks} keys={BAR_KEYS} labels={BAR_LABELS} hidden={hidden} selected={sel} onSelect={pick} />
          <div className="legend">
            {BAR_KEYS.map((k) => (
              <button key={k} className={hidden.has(k) ? 'off' : ''} onClick={() => toggle(k)} aria-pressed={!hidden.has(k)}>
                <span className="dot" style={{ background: CAT_COLOR[k] }} />{BAR_LABELS[k]}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Groups on {etLabel(sel)}</div>
              <div className="card-sub">Present compared with the 4 Sundays before.</div>
            </div>
          </div>
          <table className="gtable">
            <thead><tr><th>Group</th><th>Present</th><th>Rate</th><th>4-wk avg</th></tr></thead>
            <tbody>
              {GROUP_ROWS.map(([k, l]) => {
                const c = cur.byCat[k];
                const prev4 = idx.held.slice(Math.max(0, heldIdx - 4), heldIdx).map((s) => summaries[s].byCat[k]).filter((x) => x.total);
                const avg4 = prev4.length ? prev4.reduce((n, x) => n + x.present / x.total, 0) / prev4.length : null;
                const r = c.total ? c.present / c.total : null;
                return (
                  <tr key={k}>
                    <td><span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: CAT_COLOR[k] }} />{l}</span></td>
                    <td className="num">{c.present}/{c.total}</td>
                    <td className="num"><span className="bar-inline"><span style={{ width: `${(r || 0) * 100}%` }} /></span>{pct(r)}</td>
                    <td className="num">{pct(avg4)} <Delta d={r != null && avg4 != null ? (r - avg4) * 100 : null} /></td>
                  </tr>
                );
              })}
              <tr className="total"><td>Expected total</td><td className="num">{cur.countedPresent}/{cur.counted}</td><td className="num">{pct(cur.rate)}</td><td /></tr>
            </tbody>
          </table>
          <p className="muted tiny" style={{ marginTop: 8 }}>Inactive informal members and inactive new comers ({cur.byCat['Inactive Informal Member'].present + (cur.byCat['New Comer'].present - cur.byCat['Active New Comer'].present)} came) are welcome but not counted in the rate.</p>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">New comers this semester</div>
              <div className="card-sub">From first visit toward membership (6 months of steady coming).</div>
            </div>
          </div>
          <div className="funnel">
            {[
              ['First-time visitors', pipeline.first],
              ['Came back again', pipeline.cameBack],
              ['Active new comers now', pipeline.activeNow],
              ['Promising (50%+ & 4 in a row)', pipeline.promising.length],
              ['Became members', pipeline.becameMembers],
            ].map(([l, n], i, arr) => (
              <div className="funnel-row" key={l}>
                <span>{l}</span>
                <span className="funnel-track"><span style={{ width: `${(n / Math.max(1, ...arr.map((a) => a[1]))) * 100}%`, opacity: 1 - i * 0.12 }} /></span>
                <b className="num">{n}</b>
              </div>
            ))}
          </div>
          {pipeline.promising.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="card-sub" style={{ marginBottom: 6 }}>Promising – encourage them toward membership</div>
              <div className="chips">
                {pipeline.promising.map(({ p, f }) => <button key={p.id} className="chipbtn" onClick={() => openPerson(p.id)}>{p.name} <span className="n">{pct(f.sinceRate)}</span></button>)}
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Programs</div>
              <div className="card-sub">What we did and how many came. Record programs on the Attendance page.</div>
            </div>
          </div>
          <ul className="prog-list">
            {rangeWeeks.slice(-6).reverse().map((s) => {
              const p = progBy[s]; const e = toEthiopian(s);
              return (
                <li className="prog-item" key={s}>
                  <span className="prog-date"><small>{ET_MONTHS[e.month].slice(0, 3)}</small><b>{e.day}</b></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="prog-title">{p?.kind ? `${p.kind}${p.topic ? ': ' + p.topic : ''}` : <span className="faint">No program recorded</span>}</span>
                    <span className="prog-meta" style={{ display: 'block' }}>{p?.minister ? `by ${p.minister}` : ''}{p?.planned_by ? ` · ${p.planned_by} plan` : ''}</span>
                  </span>
                  <span className="num" style={{ textAlign: 'right' }}><b>{summaries[s].present}</b><span className="tiny muted" style={{ display: 'block' }}>{pct(summaries[s].rate)}</span></span>
                </li>
              );
            })}
          </ul>
          {prog?.kind === 'No meeting' && <p className="small muted">No meeting on this Sunday.</p>}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Month by month</div>
              <div className="card-sub">Average per Sunday.</div>
            </div>
          </div>
          <table className="gtable">
            <thead><tr><th>Month</th><th>Sundays</th><th>Present</th><th>Rate</th><th>Members</th></tr></thead>
            <tbody>
              {months.slice(-8).map((m) => (
                <tr key={m.k}>
                  <td>{m.name} <span className="am muted tiny">{m.am}</span>{range !== 'semester' && <span className="tiny muted"> {m.year}</span>}</td>
                  <td className="num">{m.list.length}</td>
                  <td className="num">{m.present.toFixed(1)}</td>
                  <td className="num"><span className="bar-inline"><span style={{ width: `${m.rate * 100}%` }} /></span>{pct(m.rate)}</td>
                  <td className="num">{pct(m.members)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card span2">
          <div className="card-head">
            <div>
              <div className="card-title">{rankDir === 'top' ? 'Most faithful this semester' : 'Needs encouragement'}</div>
              <div className="card-sub">{rankGroup === 'Active New Comer' ? 'New comers are ranked on Sundays since their first visit.' : `Present ÷ Sundays held since ${etLabel(semStart)}.`}</div>
            </div>
            <div className="seg">
              <button className={rankDir === 'top' ? 'on' : ''} onClick={() => setRankDir('top')}>Top</button>
              <button className={rankDir === 'bottom' ? 'on' : ''} onClick={() => setRankDir('bottom')}>Lowest</button>
            </div>
          </div>
          <div className="scroll-x" style={{ marginBottom: 8 }}>
            <div className="chips" style={{ flexWrap: 'nowrap' }}>
              {[['Member', 'Members'], ['Leader', 'Leaders'], ['Active Informal Member', 'Active informal'], ['Active New Comer', 'Active new comers']].map(([k, l]) => (
                <button key={k} className={`chipbtn ${rankGroup === k ? 'on' : ''}`} onClick={() => setRankGroup(k)}>{l}</button>
              ))}
            </div>
          </div>
          <ol className="rank-list">
            {ranked.map(({ p, f, score }, i) => (
              <li key={p.id} className="rank-item" onClick={() => openPerson(p.id)}>
                <span className="rank-pos">{i + 1}</span>
                <span className="row" style={{ minWidth: 0 }}>
                  <Initials name={p.name} category={p.category} />
                  <span className="rank-name">{p.name}<small>{f.semPresent} Sundays this semester{p.responsible ? ` · with ${p.responsible}` : ''}</small></span>
                </span>
                <Meter v={score} color={rankDir === 'top' ? 'var(--present)' : 'var(--absent)'} />
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="muted tiny">Each Sunday keeps the group and active status people had on that day, so past numbers don't change when someone's status changes later. {fmtGreg(sel)}.</p>
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
const lr = (s) => { const t = s.byCat['Leader'].total + s.byCat['Senior Leader'].total; return t ? (s.byCat['Leader'].present + s.byCat['Senior Leader'].present) / t : null; };
const noteOf = (p) => (p?.kind ? `${p.kind}${p.topic ? ': ' + p.topic : ''}${p.minister ? ' – ' + p.minister : ''}` : null);

