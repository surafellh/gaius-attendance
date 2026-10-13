import { useState } from 'react';
import { etLabel } from '../lib/ethiopian';
import { FOLLOW_GROUPS, SHORT, pct } from '../lib/stats';
import { WeekChips } from './common';

export default function FollowUp({ stats, sundays, weekPick, setWeekPick, att, saveMark }) {
  const [group, setGroup] = useState('All');
  const { rows, thisWeek, lastWeek } = stats;
  const inGroup = rows.filter((r) => r.group && (group === 'All' || r.group === group));
  const order = (a, b) => FOLLOW_GROUPS.indexOf(a.group) - FOLLOW_GROUPS.indexOf(b.group) || a.name.localeCompare(b.name);

  const dropped = inGroup.filter((r) => r.lastWeek === 'Present' && r.thisWeek === 'Absent')
    .sort((a, b) => (b.consistent - a.consistent) || order(a, b));
  const two = inGroup.filter((r) => r.streak === 2).sort(order);
  const three = inGroup.filter((r) => r.streak >= 3).sort((a, b) => b.streak - a.streak || order(a, b));

  const all = rows.filter((r) => r.group);
  const byGroup = FOLLOW_GROUPS.map((g) => {
    const l = all.filter((r) => r.group === g);
    return {
      g,
      dropped: l.filter((r) => r.lastWeek === 'Present' && r.thisWeek === 'Absent').length,
      consistent: l.filter((r) => r.lastWeek === 'Present' && r.thisWeek === 'Absent' && r.consistent).length,
      two: l.filter((r) => r.streak === 2).length,
      three: l.filter((r) => r.streak >= 3).length,
    };
  });

  if (!thisWeek) return <div className="page"><p className="muted">No attendance recorded yet this semester.</p></div>;

  const called = (r) => att[`${r.id}|${thisWeek}`]?.called;
  const CallCell = ({ r }) => (
    <span className="call-cell">
      {r.phone && r.phone.length > 5 && <a href={`tel:${r.phone.replace(/\s/g, '')}`} className="icon-btn" title={r.phone}>☎</a>}
      <label className="check small" title="Mark as called this week">
        <input type="checkbox" checked={!!called(r)} onChange={(e) => saveMark(r.id, thisWeek, { called: e.target.checked })} />
        called
      </label>
    </span>
  );

  return (
    <div className="page">
      <WeekChips sundays={sundays} value={weekPick} onChange={setWeekPick} held={stats.heldSet}
        latestLabel={weekPick ? '' : etLabel(thisWeek)} />
      <p className="muted small">
        Comparing <b>{etLabel(thisWeek)}</b>{lastWeek && <> with <b>{etLabel(lastWeek)}</b></>}.
        “Consistent” = present 4+ Sundays in a row at some point before this week.
      </p>

      <div className="stats-grid four">
        <Card label="Present last week → absent this week" value={byGroup.reduce((n, x) => n + x.dropped, 0)} tone="warn" />
        <Card label="…of them consistent attenders" value={byGroup.reduce((n, x) => n + x.consistent, 0)} tone="alert" />
        <Card label="Absent 2 weeks in a row" value={byGroup.reduce((n, x) => n + x.two, 0)} tone="warn" />
        <Card label="Absent 3+ weeks in a row" value={byGroup.reduce((n, x) => n + x.three, 0)} tone="alert" />
      </div>

      <div className="card">
        <table className="tbl compact">
          <thead><tr><th>Group</th><th>Present → Absent</th><th>…consistent</th><th>Absent 2</th><th>Absent 3+</th></tr></thead>
          <tbody>
            {byGroup.map((x) => (
              <tr key={x.g}><td>{SHORT[x.g]}</td><td>{x.dropped}</td><td>{x.consistent}</td><td>{x.two}</td><td>{x.three}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="seg">
        {['All', ...FOLLOW_GROUPS].map((g) => (
          <button key={g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{g === 'All' ? 'All' : SHORT[g]}</button>
        ))}
      </div>

      <Section title="1 · Present last week, absent this week" count={dropped.length}>
        {dropped.map((r) => (
          <Row key={r.id} r={r} right={<>{r.consistent && <em className="tag alert">Consistent</em>}<span className="muted">{pct(r.pct)}</span></>}>
            <CallCell r={r} />
          </Row>
        ))}
      </Section>

      <Section title="2 · Absent 2 weeks in a row" count={two.length}>
        {two.map((r) => (
          <Row key={r.id} r={r} right={r.consistent ? <em className="tag alert">Was consistent</em> : null}><CallCell r={r} /></Row>
        ))}
      </Section>

      <Section title="3 · Absent 3+ weeks in a row" count={three.length}>
        {three.map((r) => (
          <Row key={r.id} r={r} right={<span className="tag">{r.streak} weeks</span>}><CallCell r={r} /></Row>
        ))}
      </Section>
    </div>
  );
}

function Card({ label, value, tone }) {
  return <div className={`stat ${tone}`}><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>;
}

function Section({ title, count, children }) {
  return (
    <section className="card">
      <h3 className="sec-title">{title} <span className="pill">{count}</span></h3>
      {count ? <ul className="fu-list">{children}</ul> : <p className="muted">None this week 🎉</p>}
    </section>
  );
}

function Row({ r, right, children }) {
  return (
    <li className="fu-row">
      <div>
        <div className="pname">{r.name}</div>
        <div className="pmeta"><em>{SHORT[r.group]}</em>{r.responsible && <em>· {r.responsible}</em>}</div>
      </div>
      <div className="fu-right">{right}{children}</div>
    </li>
  );
}
