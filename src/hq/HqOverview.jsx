import { useMemo, useState } from 'react';
import { etLabel, toEthiopian } from '../lib/ethiopian';
import { pct } from '../lib/stats';
import { Delta, Meter, Initials, PeriodPicker, periodOf, Icon, MiniDots } from '../views/common';
import { StackedBars, RateLines } from '../views/Charts';
import { sundayNumbers, periodNumbers, followedPeople, promising, colorOf } from './hqData';

/* HQ home: the whole ministry on one screen – every center side by side, no switching */
export default function HqOverview({ R, C, today, period, setPeriod, openCenter, openPerson, go, upcoming }) {
  const P = periodOf(period);
  const years = useMemo(() => [...new Set([...C.flatMap((x) => x.idx.held.map((s) => toEthiopian(s).year)), toEthiopian(today).year])].sort((a, b) => b - a), [C, today]);
  const [hidden, setHidden] = useState(() => new Set());
  const [rankBy, setRankBy] = useState('Member');
  const [dir, setDir] = useState('top');
  const [only, setOnly] = useState(null);         // a center picked in the ranking (null = all)

  const now = C.map((x) => ({ x, n: sundayNumbers(x), p: periodNumbers(x, P) }));
  const sum = (k) => now.reduce((t, r) => t + (r.n[k] || 0), 0);
  const recorded = now.filter((r) => r.n.recorded);
  const lastAll = recorded.map((r) => r.n.s).sort().pop();
  const prevTotal = recorded.reduce((t, r) => t + (r.n.prevPresent || 0), 0);

  // charts: every Sunday in the period, each center a colour
  const sundays = [...new Set(now.flatMap((r) => r.p.weeks))].sort();
  const bars = sundays.map((s) => ({ sunday: s, values: Object.fromEntries(C.map((x) => [x.c.id, x.summaries[s]?.present || 0])) }));
  const lines = sundays.map((s) => ({ sunday: s, values: Object.fromEntries(C.filter((x) => x.summaries[s]?.rate != null).map((x) => [x.c.id, x.summaries[s].rate])) }));
  const monthKeys = [...new Map(now.flatMap((r) => r.p.months.map((m) => [m.k, m.name]))).entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // faithful / needs encouragement across every center: leaders and members only
  const ranked = useMemo(() => C.filter((x) => !only || x.c.id === only).flatMap((x) => {
    const weeks = x.idx.held.filter((s) => s >= P.from && s <= P.to && s <= today);
    return x.D.people.filter((p) => !p.archived && p.category === rankBy).map((p) => {
      const m = x.idx.byPerson[p.id] || {};
      const held = weeks.filter((s) => m[s]?.status);
      const came = held.filter((s) => m[s].status === 'Present').length;
      return { p, c: x.c, held: held.length, came, v: held.length ? came / held.length : null, dots: weeks.slice(-12).map((s) => m[s]?.status) };
    });
  }).filter((r) => r.v != null && r.held >= 2).sort((a, b) => (dir === 'top' ? b.v - a.v : a.v - b.v) || b.held - a.held).slice(0, 10), [C, only, rankBy, dir, P.from, P.to, today]);
  const promise = C.flatMap((x) => promising(x, 6)).sort((a, b) => b.r.sinceRate - a.r.sinceRate).slice(0, 8);
  const followed = C.flatMap(followedPeople);
  const needCall = followed.filter((y) => y.f.lastWeek === 'Present' && y.f.thisWeek === 'Absent');
  const three = followed.filter((y) => y.f.streak >= 3);

  return (
    <div className="page hq-page">
      <div className="hq-hello">
        <div>
          <h1 className="page-title">The ministry today</h1>
          <p className="page-sub">{R.centers.length} centers · last Sunday recorded {lastAll ? etLabel(lastAll, true) : '–'}. Leaders, members and informal members by name; totals count everyone.</p>
        </div>
      </div>

      <section className="kpis hq-kpis" aria-label="All centers, last Sunday">
        <div className="kpi hero"><span className="kpi-label">Total present</span><span className="kpi-val">{sum('present')}</span><span className="kpi-foot"><Delta d={recorded.length ? sum('present') - prevTotal : null} /> vs the Sunday before · all centers</span></div>
        <Kpi label="Leaders" color="var(--c-leader)" v={<>{sum('leaders')}<small>/{sum('leadersTotal')}</small></>} foot={pct(sum('leadersTotal') ? sum('leaders') / sum('leadersTotal') : null) + ' came'} />
        <Kpi label="Members" color="var(--c-member)" v={<>{sum('members')}<small>/{sum('membersTotal')}</small></>} foot={pct(sum('membersTotal') ? sum('members') / sum('membersTotal') : null) + ' came'} />
        <Kpi label="Informal members" color="var(--c-active)" v={sum('informal')} foot="present" />
        <Kpi label="Others" color="var(--c-newcomer)" v={sum('others')} foot="senior leaders & new comers" />
        <Kpi label="First-time comers" color="var(--lime-strong)" v={sum('firstTime')} foot="came for the first time" />
      </section>

      <section className="card flush hq-board">
        <div className="card-head pad"><div><div className="card-title">Every center, last Sunday</div><div className="card-sub">Tap a center for its full report.</div></div>
          <button className="btn ghost small" onClick={() => go('attendance')}>Need a call: <b>{needCall.length}</b> <Icon.right width="14" height="14" /></button></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left hq-table">
            <thead><tr><th>Center</th><th>Sunday</th><th>Present</th><th>Leaders</th><th>Members</th><th>Informal</th><th>Others</th><th>First time</th><th>L+M rate</th><th>Need a call</th><th className="desk-only">{P.label} · avg</th></tr></thead>
            <tbody>
              {now.map(({ x, n, p }) => (
                <tr key={x.c.id} onClick={() => openCenter(x.c.id)} className="click">
                  <td><span className="ctr"><i style={{ background: colorOf(R, x.c.id) }} /><b>{x.c.name}</b><span className="am muted tiny">{x.c.name_am}</span></span></td>
                  {n.recorded ? <>
                    <td className="muted small">{etLabel(n.s)}</td>
                    <td className="num"><b>{n.present}</b> <Delta d={n.prevPresent != null ? n.present - n.prevPresent : null} /></td>
                    <td className="num">{n.leaders}<span className="faint">/{n.leadersTotal}</span></td>
                    <td className="num">{n.members}<span className="faint">/{n.membersTotal}</span></td>
                    <td className="num">{n.informal}</td><td className="num">{n.others}</td><td className="num">{n.firstTime}</td>
                    <td className="num"><span className="bar-inline"><span style={{ width: `${(n.rate || 0) * 100}%` }} /></span>{pct(n.rate)}</td>
                    <td className="num">{n.dropped ? <span className="tag bad">{n.dropped}</span> : <span className="faint">0</span>}</td>
                  </> : <td colSpan={9} className="muted small">No attendance recorded yet</td>}
                  <td className="num desk-only">{p.avg != null ? p.avg.toFixed(1) : '–'}</td>
                </tr>
              ))}
              <tr className="total"><td>All centers</td><td /><td className="num">{sum('present')}</td><td className="num">{sum('leaders')}/{sum('leadersTotal')}</td><td className="num">{sum('members')}/{sum('membersTotal')}</td>
                <td className="num">{sum('informal')}</td><td className="num">{sum('others')}</td><td className="num">{sum('firstTime')}</td><td className="num">{pct((sum('leaders') + sum('members')) / Math.max(1, sum('leadersTotal') + sum('membersTotal')))}</td><td className="num">{needCall.length}</td>
                <td className="num desk-only">{now.reduce((t, r) => t + (r.p.avg || 0), 0).toFixed(1)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="period-float hq-period">
        <span className="pf-label">Charts &amp; lists for</span>
        <PeriodPicker value={period} onChange={setPeriod} years={years} />
        <b className="pf-now">{P.label}</b>
      </div>

      <div className="dash-grid">
        <section className="card span2">
          <div className="card-head"><div><div className="card-title">Present each Sunday · {P.label}</div><div className="card-sub">Stacked by center. Tap a center below to hide it.</div></div></div>
          {sundays.length ? <StackedBars weeks={bars} keys={C.map((x) => x.c.id)} labels={Object.fromEntries(C.map((x) => [x.c.id, x.c.name]))} colors={Object.fromEntries(C.map((x) => [x.c.id, colorOf(R, x.c.id)]))} hidden={hidden} /> : <p className="muted small">No Sundays recorded in this period.</p>}
          <div className="legend">{C.map((x) => (
            <button key={x.c.id} className={hidden.has(x.c.id) ? 'off' : ''} onClick={() => setHidden((h) => { const s = new Set(h); s.has(x.c.id) ? s.delete(x.c.id) : s.add(x.c.id); return s; })}>
              <span className="dot" style={{ background: colorOf(R, x.c.id) }} />{x.c.name}
            </button>
          ))}</div>
        </section>

        <section className="card">
          <div className="card-head"><div><div className="card-title">Leaders &amp; members rate</div><div className="card-sub">Each center, each Sunday · {P.label}</div></div></div>
          {sundays.length ? <RateLines weeks={lines} series={C.filter((x) => x.idx.held.length).map((x) => ({ key: x.c.id, label: x.c.name, color: colorOf(R, x.c.id) }))} /> : <p className="muted small">No Sundays in this period.</p>}
        </section>

        <section className="card">
          <div className="card-head"><div><div className="card-title">Month by month</div><div className="card-sub">Average present per Sunday · {P.label}</div></div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable heat">
              <thead><tr><th>Center</th>{monthKeys.map(([k, name]) => <th key={k}>{name.slice(0, 3)}</th>)}<th>Avg</th></tr></thead>
              <tbody>{now.map(({ x, p }) => {
                const max = Math.max(1, ...now.flatMap((r) => r.p.months.map((m) => m.avg)));
                return (
                  <tr key={x.c.id}><td><b>{x.c.name}</b></td>
                    {monthKeys.map(([k]) => { const m = p.months.find((y) => y.k === k); return <td key={k} className="num" style={m ? { background: `rgba(122,181,44,${0.12 + 0.6 * (m.avg / max)})` } : undefined}>{m ? m.avg.toFixed(0) : <span className="faint">–</span>}</td>; })}
                    <td className="num"><b>{p.avg != null ? p.avg.toFixed(1) : '–'}</b></td></tr>
                );
              })}</tbody>
            </table>
          </div>
        </section>

        <section className="card span2">
          <div className="card-head">
            <div><div className="card-title">{dir === 'top' ? 'Most faithful' : 'Needs encouragement'} · {rankBy === 'Leader' ? 'leaders' : 'members'} · {P.label}</div><div className="card-sub">Across {only ? R.centers.find((c) => c.id === only)?.name : 'every center'}: Sundays present ÷ Sundays on the list (at least 2).</div></div>
            <div className="seg"><button className={dir === 'top' ? 'on' : ''} onClick={() => setDir('top')}>Top</button><button className={dir === 'bottom' ? 'on' : ''} onClick={() => setDir('bottom')}>Lowest</button></div>
          </div>
          <div className="rank-tools">
            <div className="chips"><button className={`chipbtn ${rankBy === 'Member' ? 'on' : ''}`} onClick={() => setRankBy('Member')}>Members</button><button className={`chipbtn ${rankBy === 'Leader' ? 'on' : ''}`} onClick={() => setRankBy('Leader')}>Leaders</button></div>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              <button className={`chipbtn ${!only ? 'on' : ''}`} onClick={() => setOnly(null)}>All centers</button>
              {R.centers.map((c) => <button key={c.id} className={`chipbtn ${only === c.id ? 'on' : ''}`} onClick={() => setOnly(c.id)}>{c.name}</button>)}
            </div>
          </div>
          {ranked.length === 0 ? <p className="muted small">Nobody to rank in this period.</p> : (
            <ol className="rank-list two-col">
              {ranked.map((r, i) => (
                <li key={r.p.id} className="rank-item" onClick={() => openPerson(r.c.id, r.p.id)}>
                  <span className="rank-pos">{i + 1}</span>
                  <span className="row" style={{ minWidth: 0 }}><Initials name={r.p.name} category={r.p.category} />
                    <span className="rank-name">{r.p.name}<small><CenterTag R={R} c={r.c} /> {r.came} of {r.held} Sundays</small><MiniDots statuses={r.dots} /></span></span>
                  <Meter v={r.v} color={dir === 'top' ? 'var(--present)' : 'var(--absent)'} />
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card">
          <div className="card-head"><div><div className="card-title">Promising members</div><div className="card-sub">New comers coming most faithfully since their first visit (4+ Sundays), every center.</div></div></div>
          {promise.length === 0 ? <p className="muted small">No new comers with 4 or more Sundays yet.</p> : (
            <ol className="rank-list">{promise.map((v, i) => (
              <li key={v.p.id} className="rank-item">
                <span className="rank-pos">{i + 1}</span>
                <span className="row" style={{ minWidth: 0 }}><Initials name={v.p.name} category="New Comer" /><span className="rank-name">{v.p.name}{v.r.ready && <span className="tag ok" style={{ marginLeft: 6 }}>ready</span>}<small><CenterTag R={R} c={v.c} /> {v.r.sincePresent} of {v.r.weeksIn} Sundays</small></span></span>
                <Meter v={v.r.sinceRate} />
              </li>
            ))}</ol>
          )}
        </section>

        <section className="card">
          <div className="card-head"><div><div className="card-title">Coming up</div><div className="card-sub">HQ plans and every center’s planned dates, next 30 days.</div></div><button className="btn ghost small" onClick={() => go('plans')}>All plans</button></div>
          {upcoming.length === 0 ? <p className="muted small">Nothing planned in the next 30 days.</p> : (
            <ul className="hq-agenda">{upcoming.slice(0, 8).map((u) => (
              <li key={u.key}><span className="when">{etLabel(u.date)}</span><span className="what am">{u.title}</span>{u.c ? <CenterTag R={R} c={u.c} /> : <span className="ctag hq">HQ</span>}</li>
            ))}</ul>
          )}
          {three.length > 0 && <p className="small" style={{ marginTop: 10 }}><span className="tag bad">{three.length}</span> leaders, members or informal members have missed 3+ Sundays in a row. <button className="link small" onClick={() => go('attendance')}>See who</button></p>}
        </section>
      </div>
    </div>
  );
}

export function CenterTag({ R, c }) {
  return <span className="ctag" style={{ '--cc': colorOf(R, c.id) }}>{c.name}</span>;
}
function Kpi({ label, v, foot, color }) {
  return <div className="kpi"><span className="kpi-label">{color && <span className="dot" style={{ background: color }} />}{label}</span><span className="kpi-val">{v}</span><span className="kpi-foot">{foot}</span></div>;
}
