import { useMemo } from 'react';
import { etLabel, toEthiopian, ET_MONTHS } from '../lib/ethiopian';
import { CATEGORIES, SHORT, pct, weeklyByCategory } from '../lib/stats';
import { WeekChips, Stat } from './common';

const COLORS = {
  'Leader': '#2f6f5e', 'Senior Leader': '#8a5a2b', 'Member': '#4a7fb5',
  'Active Informal Member': '#a3739e', 'Inactive Informal Member': '#b9b2a6', 'New Comer': '#d99a3c',
};

export default function Dashboard({ roster, sundays, mark, stats, weekPick, setWeekPick }) {
  const weekly = useMemo(() => weeklyByCategory({ people: roster, sundays, mark, heldSet: stats.heldSet }),
    [roster, sundays, mark, stats.heldSet]);
  const held = weekly.filter((w) => w.held && sundays.indexOf(w.sunday) <= stats.w);
  const cur = held[held.length - 1];
  const prev = held[held.length - 2];
  const d = (k) => (cur && prev ? cur[k] - prev[k] : null);
  const avg = (k, list = held) => (list.length ? list.reduce((n, w) => n + w[k], 0) / list.length : 0);
  const max = Math.max(1, ...weekly.map((w) => w.total));

  // monthly averages
  const months = useMemo(() => {
    const m = new Map();
    for (const w of held) {
      const name = ET_MONTHS[toEthiopian(w.sunday).month];
      if (!m.has(name)) m.set(name, []);
      m.get(name).push(w);
    }
    return [...m.entries()].map(([name, list]) => ({ name, list }));
  }, [held]);

  const ranked = (group, dir, key = 'pct') => stats.rows
    .filter((r) => r.group === group && r[key] != null)
    .sort((a, b) => (dir === 'top' ? b[key] - a[key] : a[key] - b[key]) || (dir === 'top' ? (b.sixPct || 0) - (a.sixPct || 0) : 0) || a.name.localeCompare(b.name))
    .slice(0, 5);

  if (!cur) return <div className="page"><p className="muted">No attendance recorded yet this semester.</p></div>;

  return (
    <div className="page">
      <WeekChips sundays={sundays} value={weekPick} onChange={setWeekPick} held={stats.heldSet}
        latestLabel={weekPick ? '' : etLabel(stats.thisWeek)} />

      <h2 className="h">Week of {etLabel(cur.sunday, true)}</h2>
      <div className="stats-grid">
        <Stat label="Total present" value={cur.total} delta={d('total')} tone="main" />
        <Stat label="Leaders" value={cur['Leader']} delta={d('Leader')} />
        <Stat label="Members" value={cur['Member']} delta={d('Member')} />
        <Stat label="Active informal" value={cur['Active Informal Member']} delta={d('Active Informal Member')} />
        <Stat label="New comers" value={cur['New Comer']} delta={d('New Comer')} />
        <Stat label="First-time comers" value={cur.firstTimers} delta={d('firstTimers')} />
      </div>
      <p className="muted small">Semester average so far: <b>{avg('total').toFixed(1)}</b> present per Sunday over {held.length} Sundays.</p>

      <section className="card">
        <h3 className="sec-title">Weekly attendance by category</h3>
        <div className="bars">
          {weekly.filter((w) => w.held).map((w) => (
            <div key={w.sunday} className={`bar-col ${w.sunday === cur.sunday ? 'cur' : ''}`} title={`${etLabel(w.sunday)}: ${w.total}`}>
              <span className="bar-total">{w.total}</span>
              <div className="bar-stack" style={{ height: `${(w.total / max) * 160}px` }}>
                {CATEGORIES.map((c) => w[c] ? <div key={c} style={{ flex: w[c], background: COLORS[c] }} /> : null)}
              </div>
              <span className="bar-label">{etLabel(w.sunday).replace(/(\w{3})\w*/, '$1')}</span>
            </div>
          ))}
        </div>
        <div className="legend">
          {CATEGORIES.map((c) => <span key={c}><i style={{ background: COLORS[c] }} />{SHORT[c]}</span>)}
        </div>
      </section>

      <section className="card">
        <h3 className="sec-title">Monthly averages</h3>
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>Month</th>{CATEGORIES.map((c) => <th key={c}>{SHORT[c]}</th>)}<th>Total</th><th>First-timers</th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.name}>
                  <td>{m.name} <span className="muted">({m.list.length})</span></td>
                  {CATEGORIES.map((c) => <td key={c}>{avg(c, m.list).toFixed(1)}</td>)}
                  <td><b>{avg('total', m.list).toFixed(1)}</b></td>
                  <td>{m.list.reduce((n, w) => n + w.firstTimers, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="muted small">Rankings use the whole semester so far: Present ÷ all Sundays held ({stats.heldToW}). The 6-month score for new comers counts only Sundays since they joined.</p>
      <div className="rank-grid">
        <Rank title="Top 5 — Members" rows={ranked('Member', 'top')} />
        <Rank title="Bottom 5 — Members" rows={ranked('Member', 'bottom')} />
        <Rank title="Top 5 — Active New Comers" rows={ranked('Active New Comer', 'top')} six />
        <Rank title="Bottom 5 — Leaders" rows={ranked('Leader', 'bottom')} />
      </div>
    </div>
  );
}

function Rank({ title, rows, six }) {
  return (
    <section className="card">
      <h3 className="sec-title">{title}</h3>
      <table className="tbl compact">
        <thead><tr><th>Name</th><th>Semester</th>{six && <th>6-month</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td><Meter v={r.pct} /></td>
              {six && <td><Meter v={r.sixPct} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Meter({ v }) {
  return (
    <span className="meter"><span className="track"><span style={{ width: `${(v || 0) * 100}%` }} /></span><b>{pct(v)}</b></span>
  );
}
