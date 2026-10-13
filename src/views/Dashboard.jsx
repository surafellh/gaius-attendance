import { useMemo, useState } from 'react';
import { etLabel, fmtGreg, toEthiopian, ET_MONTHS, ET_MONTHS_AM } from '../lib/ethiopian';
import { CATEGORIES, SHORT, pct, weeklyByCategory } from '../lib/stats';
import { WeekPicker, Meter, CAT_COLOR, Initials } from './common';
import { StackedBars, RateLines, Spark } from './Charts';

const RATE_SERIES = [
  { key: 'Leader', label: 'Leaders' },
  { key: 'Senior Leader', label: 'Senior leaders' },
  { key: 'Member', label: 'Members' },
  { key: 'Active Informal Member', label: 'Active informal' },
  { key: 'Active New Comer', label: 'Active new comers' },
];

const RANK_GROUPS = [
  ['Member', 'Members'], ['Leader', 'Leaders'], ['Active Informal Member', 'Active informal'], ['Active New Comer', 'New comers'],
];

export default function Dashboard({ roster, sundays, mark, stats, weekPick, setWeekPick, counts, openPerson }) {
  const [hidden, setHidden] = useState(() => new Set());
  const [mode, setMode] = useState('count');
  const [rankGroup, setRankGroup] = useState('Member');
  const [rankDir, setRankDir] = useState('top');
  const [showAll, setShowAll] = useState(false);

  const weekly = useMemo(() => {
    const w = weeklyByCategory({ people: roster, sundays, mark, heldSet: stats.heldSet });
    return w.map((row) => {
      const rates = {};
      for (const s of RATE_SERIES) {
        const group = roster.filter((p) => (s.key === 'Active New Comer' ? p.category === 'New Comer' && p.nc_active : p.category === s.key));
        const marked = group.filter((p) => mark(p.id, row.sunday));
        rates[s.key] = marked.length ? marked.filter((p) => mark(p.id, row.sunday) === 'Present').length / marked.length : null;
      }
      return { ...row, rates };
    });
  }, [roster, sundays, mark, stats.heldSet]);

  const held = weekly.filter((w) => w.held);
  const cur = weekly.find((w) => w.sunday === stats.thisWeek);
  const curIdx = held.indexOf(cur);
  const prev = curIdx > 0 ? held[curIdx - 1] : null;
  const upto = held.slice(0, curIdx + 1);
  const avg = upto.length ? upto.reduce((n, w) => n + w.total, 0) / upto.length : 0;

  const months = useMemo(() => {
    const m = new Map();
    for (const w of upto) {
      const k = toEthiopian(w.sunday).month;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(w);
    }
    return [...m.entries()].map(([k, list]) => ({
      k, name: ET_MONTHS[k], am: ET_MONTHS_AM[k], list,
      avg: list.reduce((n, w) => n + w.total, 0) / list.length,
      cats: Object.fromEntries(CATEGORIES.map((c) => [c, list.reduce((n, w) => n + w[c], 0) / list.length])),
      first: list.reduce((n, w) => n + w.firstTimers, 0),
    }));
  }, [upto]);

  if (!cur) {
    return <div className="page"><div className="card empty">No attendance recorded yet this semester. Mark the first Sunday on the Attendance page and the dashboard fills in.</div></div>;
  }

  const toggle = (c) => setHidden((h) => { const n = new Set(h); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const delta = (a, b) => (b == null ? null : a - b);
  const Delta = ({ d, suffix = '' }) => d == null ? null : (
    <span className={`delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}`}>{d > 0 ? '▲' : d < 0 ? '▼' : '='} {Math.abs(Math.round(d * 10) / 10)}{suffix}</span>
  );

  const ranked = stats.rows
    .filter((r) => r.group === rankGroup && (rankGroup === 'Active New Comer' ? r.sixPct != null : r.pct != null))
    .map((r) => ({ ...r, score: rankGroup === 'Active New Comer' ? r.sixPct : r.pct }))
    .sort((a, b) => (rankDir === 'top' ? b.score - a.score || b.present - a.present : a.score - b.score || a.present - b.present) || a.name.localeCompare(b.name));
  const rankShown = showAll ? ranked : ranked.slice(0, 5);
  const firstTimers = roster.filter((p) => p.week_joined === cur.sunday);
  const e = toEthiopian(cur.sunday);
  const dVsLast = delta(cur.total, prev?.total);
  const dVsAvg = cur.total - avg;

  return (
    <div className="page">
      <WeekPicker sundays={sundays} value={weekPick} latest={stats.thisWeek} onChange={setWeekPick}
        held={stats.heldSet} counts={counts} allowLatest />

      <div className="dash-grid">
        <section className="hero">
          <div className="hero-top">
            <div>
              <div className="hero-week">{etLabel(cur.sunday, true)}<span className="am">{ET_MONTHS_AM[e.month]}</span></div>
              <div className="hero-date">{fmtGreg(cur.sunday)}, Sunday {sundays.indexOf(cur.sunday) + 1} of {sundays.length}</div>
            </div>
          </div>
          <div className="hero-num">{cur.total}<span>present</span></div>
          <div className="hero-deltas">
            {dVsLast != null && <span className={`chip ${dVsLast > 0 ? 'up' : dVsLast < 0 ? 'down' : ''}`}>{dVsLast > 0 ? '▲' : dVsLast < 0 ? '▼' : '='} {Math.abs(dVsLast)} vs last Sunday</span>}
            <span className={`chip ${dVsAvg > 0 ? 'up' : dVsAvg < 0 ? 'down' : ''}`}>{dVsAvg >= 0 ? '+' : '−'}{Math.abs(dVsAvg).toFixed(1)} vs semester avg {avg.toFixed(1)}</span>
          </div>
          <Spark values={held.map((w) => w.total)} selectedIdx={curIdx} onPick={(i) => setWeekPick(i === held.length - 1 ? null : held[i].sunday)} />
        </section>

        <section className="tiles" aria-label="By category – tap to show or hide in the chart">
          {CATEGORIES.map((c) => (
            <button key={c} className={`tile ${hidden.has(c) ? 'off' : ''}`} onClick={() => toggle(c)} aria-pressed={!hidden.has(c)}>
              <span className="tile-label"><span className="dot" style={{ background: CAT_COLOR[c] }} />{SHORT[c]}</span>
              <span className="tile-val"><b>{cur[c]}</b><Delta d={delta(cur[c], prev?.[c])} /></span>
              <span className="small muted">avg {(upto.reduce((n, w) => n + w[c], 0) / upto.length).toFixed(1)} this semester</span>
            </button>
          ))}
        </section>

        <section className="card span2">
          <div className="card-head">
            <div>
              <div className="card-title">{mode === 'count' ? 'Who came each Sunday' : 'Attendance rate by group'}</div>
              <div className="card-sub">{mode === 'count' ? 'Tap a bar to open that Sunday. Tap a category to hide it.' : 'Share of people marked who were present.'}</div>
            </div>
            <div className="seg" role="tablist">
              <button className={mode === 'count' ? 'on' : ''} onClick={() => setMode('count')}>People</button>
              <button className={mode === 'rate' ? 'on' : ''} onClick={() => setMode('rate')}>Rate</button>
            </div>
          </div>
          {mode === 'count'
            ? <StackedBars weeks={held} cats={CATEGORIES} hidden={hidden} selected={cur.sunday} onSelect={(s) => setWeekPick(s === held[held.length - 1].sunday ? null : s)} />
            : <RateLines weeks={held} series={RATE_SERIES} hidden={hidden} selected={cur.sunday} onSelect={(s) => setWeekPick(s === held[held.length - 1].sunday ? null : s)} />}
          <div className="legend">
            {(mode === 'count' ? CATEGORIES.map((c) => [c, SHORT[c]]) : RATE_SERIES.map((s) => [s.key, s.label])).map(([k, l]) => (
              <button key={k} className={hidden.has(k) ? 'off' : ''} onClick={() => toggle(k)} aria-pressed={!hidden.has(k)}>
                <span className="dot" style={{ background: CAT_COLOR[k] }} />{l}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Monthly average</div>
              <div className="card-sub">People present per Sunday</div>
            </div>
          </div>
          <div className="month-cards">
            {months.map((m) => (
              <div className="month-card" key={m.k}>
                <div className="mc-name">{m.name} <span className="mc-am am">{m.am}</span></div>
                <div className="mc-val">{m.avg.toFixed(1)}</div>
                <div className="mc-sub">{m.list.length} Sunday{m.list.length > 1 ? 's' : ''}, {m.first} first-timer{m.first === 1 ? '' : 's'}</div>
                <div className="progress" title={CATEGORIES.map((c) => `${SHORT[c]} ${m.cats[c].toFixed(1)}`).join(', ')}>
                  {CATEGORIES.map((c) => m.cats[c] ? <span key={c} style={{ flex: m.cats[c], background: CAT_COLOR[c] }} /> : null)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">First-time comers</div>
              <div className="card-sub">{firstTimers.length ? `${firstTimers.length} joined on ${etLabel(cur.sunday)}` : `Nobody new on ${etLabel(cur.sunday)}`}</div>
            </div>
          </div>
          {firstTimers.length > 0 && (
            <div className="names">
              {firstTimers.map((p) => <button key={p.id} className="name-chip" onClick={() => openPerson(p.id)}>{p.name}</button>)}
            </div>
          )}
        </section>

        <section className="card span2">
          <div className="card-head">
            <div>
              <div className="card-title">{rankDir === 'top' ? 'Most faithful' : 'Needs attention'}</div>
              <div className="card-sub">
                {rankGroup === 'Active New Comer'
                  ? 'New comers are ranked on the Sundays since they joined (6-month score), so a first visit can’t top the list.'
                  : `Present ÷ all ${stats.heldToW} Sundays held this semester.`}
              </div>
            </div>
            <div className="seg">
              <button className={rankDir === 'top' ? 'on' : ''} onClick={() => setRankDir('top')}>Top</button>
              <button className={rankDir === 'bottom' ? 'on' : ''} onClick={() => setRankDir('bottom')}>Lowest</button>
            </div>
          </div>
          <div className="scroll-x" style={{ marginBottom: 8 }}>
            <div className="seg">
              {RANK_GROUPS.map(([k, l]) => <button key={k} className={rankGroup === k ? 'on' : ''} onClick={() => { setRankGroup(k); setShowAll(false); }}>{l}</button>)}
            </div>
          </div>
          <ol className="rank-list">
            {rankShown.map((r, i) => (
              <li key={r.id} className="rank-item" onClick={() => openPerson(r.id)}>
                <span className="rank-pos">{i + 1}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Initials name={r.name} category={r.category} />
                  <span className="rank-name">{r.name}<small>{r.present} of {stats.heldToW} Sundays{r.responsible ? `, with ${r.responsible}` : ''}</small></span>
                </span>
                <Meter v={r.score} color={rankDir === 'top' ? 'var(--present)' : 'var(--absent)'} />
              </li>
            ))}
          </ol>
          {ranked.length > 5 && (
            <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show top 5 only' : `Show all ${ranked.length}`}</button>
          )}
        </section>
      </div>
    </div>
  );
}
