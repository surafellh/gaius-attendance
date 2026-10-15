import { useMemo, useState } from 'react';
import { etLabel, semesterOf, semesterStart } from '../lib/ethiopian';
import { SHORT, pct, personFacts, counts, groupOfRow } from '../lib/stats';
import { WeekPicker, Icon, Initials, CAT_COLOR, MiniDots, telLink } from './common';

const GROUPS = ['Leader', 'Senior Leader', 'Member', 'Active Informal Member', 'Active New Comer', 'Inactive New Comer'];

export default function FollowUp({ idx, latest, week, setWeek, calInfo, D, personBy, saveMark, openPerson, perm }) {
  const leaderName = (a) => (a.leader_id && personBy[a.leader_id]?.name) || a.leader_name || '—';
  const sel = week || latest;
  const [list, setList] = useState('dropped');
  const [group, setGroup] = useState('All');
  const [openLeader, setOpenLeader] = useState(null);
  const hi = idx.held.indexOf(sel);
  const last6 = idx.held.slice(Math.max(0, hi - 5), hi + 1);
  const monthAgo = idx.held[Math.max(0, hi - 4)];
  const semStart = semesterStart(semesterOf(sel));

  const people = useMemo(() => (idx.bySunday[sel] || []).filter((r) => personBy[r.person_id]).map((r) => {
    const p = personBy[r.person_id];
    const marks = idx.byPerson[p.id] || {};
    return { p, r, f: personFacts(p, marks, idx.held, sel, semStart), dots: last6.map((s) => marks[s]?.status), wasActive: marks[monthAgo]?.active };
  }), [idx, sel, personBy, semStart, monthAgo, last6.join()]); // eslint-disable-line

  const LISTS = [
    { key: 'dropped', label: 'Came last Sunday, missed this one', accent: 'var(--warn)', test: (x) => counts(x.r) && x.f.lastWeek === 'Present' && x.f.thisWeek === 'Absent' },
    { key: 'consistent', label: '…of them were coming 4+ weeks in a row', accent: 'var(--absent)', test: (x) => counts(x.r) && x.f.lastWeek === 'Present' && x.f.thisWeek === 'Absent' && x.f.consistent },
    { key: 'two', label: 'Missed 2 Sundays in a row', accent: 'var(--warn)', test: (x) => counts(x.r) && x.f.streak === 2 },
    { key: 'three', label: 'Missed 3 or more in a row', accent: 'var(--absent)', test: (x) => counts(x.r) && x.f.streak >= 3 },
    { key: 'inactive', label: 'New comers who went inactive this month', accent: 'var(--c-newcomer)', test: (x) => x.r.category === 'New Comer' && !x.r.active && x.wasActive },
    { key: 'promising', label: 'Promising new comers to encourage', accent: 'var(--lime-2)', test: (x) => x.f.promising },
  ];
  const active = LISTS.find((l) => l.key === list);
  const shown = people.filter(active.test).filter((x) => group === 'All' || groupOfRow(x.r) === group)
    .sort((a, b) => (b.f.consistent - a.f.consistent) || (b.f.streak - a.f.streak) || GROUPS.indexOf(groupOfRow(a.r)) - GROUPS.indexOf(groupOfRow(b.r)) || a.p.name.localeCompare(b.p.name));
  const calledCount = shown.filter((x) => x.r.called).length;

  // by responsible leader
  const byLeader = useMemo(() => {
    const cur = D.assignments.filter((a) => !a.until);
    const m = new Map();
    for (const a of cur) {
      const x = people.find((y) => y.p.id === a.person_id);
      if (!x) continue;
      const k = leaderName(a);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return [...m.entries()].map(([name, xs]) => ({
      name, xs, absent: xs.filter((x) => x.r.status === 'Absent' && counts(x.r)).length, called: xs.filter((x) => x.r.called).length,
    })).sort((a, b) => b.absent - a.absent);
  }, [D.assignments, people]); // eslint-disable-line
  const reasons = people.filter((x) => x.r.reason);

  return (
    <div className="page">
      <WeekPicker value={week} latest={latest} onChange={setWeek} held={idx.held} info={calInfo} allowLatest />

      <div className="fu-cards" role="tablist" aria-label="Follow-up lists">
        {LISTS.map((l) => (
          <button key={l.key} role="tab" aria-selected={list === l.key} className={`fu-card ${list === l.key ? 'on' : ''}`} style={{ '--accent': l.accent }} onClick={() => setList(l.key)}>
            <b>{people.filter(l.test).length}</b><span>{l.label}</span>
          </button>
        ))}
      </div>

      <section className="card flush">
        <div className="card-head" style={{ padding: '14px 14px 0' }}>
          <div>
            <div className="card-title">{active.label}</div>
            <div className="card-sub">{etLabel(sel, true)} · {shown.length ? `${calledCount} of ${shown.length} called so far` : 'Nobody on this list'}</div>
          </div>
        </div>
        <div className="scroll-x" style={{ padding: '10px 14px 4px' }}>
          <div className="chips" style={{ flexWrap: 'nowrap' }}>
            {['All', ...GROUPS].map((g) => (
              <button key={g} className={`chipbtn ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>
                {g !== 'All' && <span className="dot" style={{ background: CAT_COLOR[g] }} />}{g === 'All' ? 'All groups' : SHORT[g]}
                <span className="n">{people.filter(active.test).filter((x) => g === 'All' || groupOfRow(x.r) === g).length}</span>
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? <div className="empty">Nobody here for {etLabel(sel)}.</div> : shown.map((x) => <Row key={x.p.id} x={x} sel={sel} saveMark={saveMark} openPerson={openPerson} canMark={perm.mark} />)}
      </section>

      <div className="dash-grid">
        <section className="card">
          <div className="card-head"><div><div className="card-title">By responsible leader</div><div className="card-sub">Who each leader follows up, absences on {etLabel(sel)} and calls made.</div></div></div>
          {byLeader.length === 0 && <p className="muted small">No responsible persons assigned yet. Assign them from a person's card (Manage).</p>}
          {byLeader.map((l) => (
            <div key={l.name}>
              <button className="list-row" style={{ border: 0, background: 'none', width: '100%', textAlign: 'left', borderBottom: '1px solid var(--line-2)' }} onClick={() => setOpenLeader(openLeader === l.name ? null : l.name)} aria-expanded={openLeader === l.name}>
                <span className="pinfo"><span className="pname">{l.name}</span><span className="pmeta">{l.xs.length} people</span></span>
                {l.absent > 0 && <span className="tag bad">{l.absent} absent</span>}
                <span className="tag ok">{l.called} called</span>
                <span className="faint">{openLeader === l.name ? '▾' : '▸'}</span>
              </button>
              {openLeader === l.name && l.xs.map((x) => <Row key={x.p.id} x={x} sel={sel} saveMark={saveMark} openPerson={openPerson} canMark={perm.mark} />)}
            </div>
          ))}
        </section>
        <section className="card">
          <div className="card-head"><div><div className="card-title">Reasons and notes</div><div className="card-sub">What people told us for {etLabel(sel)}.</div></div></div>
          {reasons.length === 0 ? <p className="muted small">No reasons recorded yet. Add one from a person's card after calling them.</p> : (
            <ul className="hist">{reasons.map((x) => <li key={x.p.id}><button className="link" style={{ padding: 0 }} onClick={() => openPerson(x.p.id)}>{x.p.name}</button><span className="muted">{x.r.reason}</span></li>)}</ul>
          )}
        </section>
      </div>
      <p className="muted tiny">Inactive informal members and inactive new comers are not in the absence lists; leaders still call them, but they don't weigh on the attendance rate.</p>
    </div>
  );
}

function Row({ x, sel, saveMark, openPerson, canMark }) {
  const tel = telLink(x.p.phone);
  const g = groupOfRow(x.r);
  return (
    <div className="list-row">
      <Initials name={x.p.name} category={g} />
      <button className="pinfo" onClick={() => openPerson(x.p.id)}>
        <span className="pname">{x.p.name}</span>
        <span className="pmeta">
          <span>{SHORT[g]}</span>
          {x.p.responsible && <span>with {x.p.responsible}</span>}
          {x.f.consistent && x.f.thisWeek === 'Absent' && <span className="tag bad">was consistent</span>}
          {x.f.streak >= 2 && <span className="tag">{x.f.streak} weeks</span>}
          {x.r.category === 'New Comer' && <span>{pct(x.f.sinceRate)} since first visit</span>}
          <MiniDots statuses={x.dots} />
        </span>
      </button>
      <label className="check" title="Called this week">
        <input type="checkbox" disabled={!canMark} checked={!!x.r.called} onChange={(e) => saveMark(x.p.id, sel, { called: e.target.checked })} />
        <span className="sr-only">Called {x.p.name}</span>
      </label>
      {tel ? <a className="icon-btn call" href={tel} aria-label={`Call ${x.p.name}`}><Icon.phone /></a> : <span className="icon-btn" style={{ opacity: .3 }} title="No phone number"><Icon.phone /></span>}
    </div>
  );
}
