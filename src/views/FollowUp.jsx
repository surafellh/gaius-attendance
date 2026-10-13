import { useState } from 'react';
import { etLabel } from '../lib/ethiopian';
import { FOLLOW_GROUPS, SHORT, pct } from '../lib/stats';
import { WeekPicker, Icon, Initials, CAT_COLOR } from './common';

const LISTS = [
  { key: 'dropped', label: 'Present last Sunday, absent this Sunday', short: 'Dropped off', accent: 'var(--warn)', test: (r) => r.lastWeek === 'Present' && r.thisWeek === 'Absent' },
  { key: 'consistent', label: '…of them were consistent attenders', short: 'Consistent ones', accent: 'var(--absent)', test: (r) => r.lastWeek === 'Present' && r.thisWeek === 'Absent' && r.consistent },
  { key: 'two', label: 'Absent 2 Sundays in a row', short: 'Absent 2 weeks', accent: 'var(--warn)', test: (r) => r.streak === 2 },
  { key: 'three', label: 'Absent 3 or more Sundays in a row', short: 'Absent 3+ weeks', accent: 'var(--absent)', test: (r) => r.streak >= 3 },
];

export default function FollowUp({ stats, sundays, weekPick, setWeekPick, att, saveMark, counts, openPerson }) {
  const [list, setList] = useState('dropped');
  const [group, setGroup] = useState('All');
  const { rows, thisWeek, lastWeek } = stats;
  const followed = rows.filter((r) => r.group);

  if (!thisWeek) return <div className="page"><div className="card empty">No attendance recorded yet this semester.</div></div>;

  const active = LISTS.find((l) => l.key === list);
  const order = (a, b) => FOLLOW_GROUPS.indexOf(a.group) - FOLLOW_GROUPS.indexOf(b.group) || a.name.localeCompare(b.name);
  const shown = followed
    .filter(active.test)
    .filter((r) => group === 'All' || r.group === group)
    .sort((a, b) => (list === 'three' ? b.streak - a.streak : 0) || (b.consistent - a.consistent) || order(a, b));
  const byGroup = FOLLOW_GROUPS.map((g) => ({ g, n: followed.filter((r) => r.group === g && active.test(r)).length }));
  const maxG = Math.max(1, ...byGroup.map((x) => x.n));
  const called = (r) => att[`${r.id}|${thisWeek}`]?.called;
  const calledCount = shown.filter(called).length;

  return (
    <div className="page">
      <WeekPicker sundays={sundays} value={weekPick} latest={stats.thisWeek} onChange={setWeekPick} held={stats.heldSet} counts={counts} allowLatest />

      <div className="fu-cards" role="tablist" aria-label="Follow-up lists">
        {LISTS.map((l) => (
          <button key={l.key} role="tab" aria-selected={list === l.key} className={`fu-card ${list === l.key ? 'on' : ''}`}
            style={{ '--accent': l.accent }} onClick={() => setList(l.key)}>
            <b>{followed.filter(l.test).length}</b>
            <span>{l.label}</span>
          </button>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{active.short} by group</div>
            <div className="card-sub">{etLabel(thisWeek, true)}{lastWeek ? ` compared with ${etLabel(lastWeek)}` : ''}. Tap a group to filter the list.</div>
          </div>
        </div>
        <div className="group-bars">
          {byGroup.map(({ g, n }) => (
            <button key={g} className="gb-row" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', opacity: group === 'All' || group === g ? 1 : 0.4 }}
              onClick={() => setGroup(group === g ? 'All' : g)} aria-pressed={group === g}>
              <span>{SHORT[g]}</span>
              <span className="gb-track"><span style={{ width: `${(n / maxG) * 100}%`, background: CAT_COLOR[g] }} /></span>
              <span className="num" style={{ textAlign: 'right' }}>{n}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card flush">
        <div className="card-head" style={{ padding: '14px 14px 0' }}>
          <div>
            <div className="card-title">{active.label}{group !== 'All' ? ` · ${SHORT[group]}` : ''}</div>
            <div className="card-sub">{shown.length ? `${calledCount} of ${shown.length} called so far` : ''}</div>
          </div>
          {group !== 'All' && <button className="btn ghost small" onClick={() => setGroup('All')}>Show all groups</button>}
        </div>
        {shown.length === 0 ? (
          <div className="empty">Nobody on this list for {etLabel(thisWeek)}.</div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {shown.map((r) => (
              <div className="fu-row" key={r.id}>
                <Initials name={r.name} category={r.category} />
                <button className="pinfo" onClick={() => openPerson(r.id)}>
                  <span className="pname">{r.name}</span>
                  <span className="pmeta">
                    <span>{SHORT[r.group]}</span>
                    {r.responsible && <span>with {r.responsible}</span>}
                    {r.consistent && <span className="tag bad">Was consistent</span>}
                    {r.streak >= 2 && <span className="tag">{r.streak} weeks</span>}
                    <span>{pct(r.pct)} this semester</span>
                  </span>
                </button>
                <label className="check small" title="Mark as called this week">
                  <input type="checkbox" checked={!!called(r)} onChange={(e) => saveMark(r.id, thisWeek, { called: e.target.checked })} />
                  <span className="sr-only">Called {r.name}</span>
                </label>
                {r.phone && r.phone.replace(/\D/g, '').length > 6
                  ? <a className="icon-btn call" href={`tel:${r.phone.replace(/\s/g, '')}`} aria-label={`Call ${r.name}`}><Icon.phone /></a>
                  : <span className="icon-btn" style={{ opacity: .3 }} title="No phone number"><Icon.phone /></span>}
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="muted small">Consistent means present 4 or more Sundays in a row at some point before this Sunday. Tick the box once you've called someone.</p>
    </div>
  );
}
