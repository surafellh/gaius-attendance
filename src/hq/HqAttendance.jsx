import { useMemo, useState } from 'react';
import { etLabel, toEthiopian, ET_MONTHS } from '../lib/ethiopian';
import { pct, SHORT } from '../lib/stats';
import { Initials, MiniDots, PeriodPicker, periodOf, telLink, Icon } from '../views/common';
import { followedPeople, FOLLOW_LISTS, sundayNumbers } from './hqData';
import { CenterTag } from './HqOverview';

/* HQ attendance: every center's Sundays side by side, then the follow-up lists of all centers together */
export default function HqAttendance({ R, C, today, period, setPeriod, openPerson, openCenter, perm }) {
  const P = periodOf(period);
  const years = [...new Set([...C.flatMap((x) => x.idx.held.map((s) => toEthiopian(s).year)), toEthiopian(today).year])].sort((a, b) => b - a);
  const [show, setShow] = useState('present');        // present | rate
  const [list, setList] = useState('dropped');
  const [only, setOnly] = useState(null);
  const sundays = [...new Set(C.flatMap((x) => x.idx.held.filter((s) => s >= P.from && s <= P.to && s <= today)))].sort().reverse();
  const followed = useMemo(() => C.flatMap(followedPeople), [C]);
  const cur = FOLLOW_LISTS.find((l) => l.key === list);
  const people = followed.filter((y) => cur.test(y) && (!only || y.c.id === only)).sort((a, b) => a.c.id - b.c.id || a.p.name.localeCompare(b.p.name));
  const count = (l, cid) => followed.filter((y) => l.test(y) && (!cid || y.c.id === cid)).length;

  return (
    <div className="page hq-page">
      <div className="page-head">
        <div><h1 className="page-title">Attendance</h1><p className="page-sub">Every center, every Sunday. Follow-up counts leaders, members and informal members only; totals count everyone.</p></div>
      </div>

      <section className="card">
        <div className="card-head"><div><div className="card-title">Follow-up · each center’s latest Sunday</div><div className="card-sub">Tap a number to see who.</div></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left hq-table fu-matrix">
            <thead><tr><th>Center</th><th>Sunday</th>{FOLLOW_LISTS.map((l) => <th key={l.key}>{l.label}</th>)}</tr></thead>
            <tbody>
              {C.map((x) => (
                <tr key={x.c.id}>
                  <td><b>{x.c.name}</b></td><td className="muted small">{sundayNumbers(x).recorded ? etLabel(x.latest) : '–'}</td>
                  {FOLLOW_LISTS.map((l) => { const n = count(l, x.c.id); return <td key={l.key} className="num"><button className={`cellbtn ${list === l.key && only === x.c.id ? 'on' : ''}`} style={{ '--accent': l.accent }} onClick={() => { setList(l.key); setOnly(x.c.id); }} disabled={!n}>{n}</button></td>; })}
                </tr>
              ))}
              <tr className="total"><td>All centers</td><td />{FOLLOW_LISTS.map((l) => <td key={l.key} className="num"><button className={`cellbtn ${list === l.key && !only ? 'on' : ''}`} style={{ '--accent': l.accent }} onClick={() => { setList(l.key); setOnly(null); }}>{count(l)}</button></td>)}</tr>
            </tbody>
          </table>
        </div>
        <h3 className="section-h small">{cur.label} · {only ? R.centers.find((c) => c.id === only)?.name : 'all centers'} <span className="muted">({people.length})</span></h3>
        {people.length === 0 ? <p className="muted small">Nobody.</p> : (
          <div className="people-grid">{people.map((y) => (
            <div key={`${y.c.id}-${y.p.id}`} className="list-row">
              <Initials name={y.p.name} category={y.p.category} />
              <button className="pinfo" onClick={() => openPerson(y.c.id, y.p.id)}>
                <span className="pname">{y.p.name}</span>
                <span className="pmeta"><CenterTag R={R} c={y.c} /> {SHORT[y.p.category] || y.p.category} · semester {pct(y.f.semRate)}{y.f.lastSeen ? ` · last came ${etLabel(y.f.lastSeen)}` : ''}</span>
                <MiniDots statuses={y.dots} />
              </button>
              {perm.profiles && y.p.phone && <a className="icon-btn" href={telLink(y.p.phone)} aria-label={`Call ${y.p.name}`}><Icon.phone width="18" height="18" /></a>}
            </div>
          ))}</div>
        )}
      </section>

      <div className="period-float hq-period">
        <span className="pf-label">Sundays in</span>
        <PeriodPicker value={period} onChange={setPeriod} years={years} />
        <b className="pf-now">{P.label}</b>
      </div>

      <section className="card flush">
        <div className="card-head pad"><div><div className="card-title">Sunday by Sunday · {P.label}</div><div className="card-sub">Newest first. Tap a center name for its report.</div></div>
          <div className="seg"><button className={show === 'present' ? 'on' : ''} onClick={() => setShow('present')}>Present</button><button className={show === 'rate' ? 'on' : ''} onClick={() => setShow('rate')}>L+M rate</button><button className={show === 'groups' ? 'on' : ''} onClick={() => setShow('groups')}>By group</button></div></div>
        <div className="hq-matrix-wrap">
          <table className="gtable hq-matrix">
            <thead><tr><th className="stick">Sunday</th>{C.map((x) => <th key={x.c.id}><button className="link" onClick={() => openCenter(x.c.id)}>{x.c.name}</button></th>)}<th>All</th></tr></thead>
            <tbody>
              {sundays.length === 0 && <tr><td colSpan={C.length + 2} className="muted small">No Sundays recorded in this period.</td></tr>}
              {sundays.map((s, i) => {
                const e = toEthiopian(s); const newMonth = i === 0 || toEthiopian(sundays[i - 1]).month !== e.month;
                const all = C.reduce((t, x) => t + (x.summaries[s]?.present || 0), 0);
                return (
                  <tr key={s} className={newMonth ? 'month-start' : ''}>
                    <td className="stick"><b>{etLabel(s)}</b>{newMonth && <small className="muted" style={{ display: 'block' }}>{ET_MONTHS[e.month]} {e.year}</small>}</td>
                    {C.map((x) => {
                      const w = x.summaries[s];
                      if (!w) return <td key={x.c.id} className="faint num">–</td>;
                      const L = w.byCat.Leader, M = w.byCat.Member;
                      return (
                        <td key={x.c.id} className="num" style={{ background: w.rate != null ? `rgba(35,150,79,${0.08 + 0.4 * w.rate})` : undefined }}>
                          {show === 'present' ? <b>{w.present}</b> : show === 'rate' ? pct(w.rate) : <span className="grp-cell">L {L.present}/{L.total} · M {M.present}/{M.total} · I {w.informal}</span>}
                        </td>
                      );
                    })}
                    <td className="num"><b>{all}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
