import { useMemo, useState } from 'react';
import { etLabel } from '../lib/ethiopian';
import { pct, ONE, stageOf, STAGE_LABEL } from '../lib/stats';
import { lessonIndex } from '../lib/teaching';
import { Initials, MiniDots, Meter, Icon } from '../views/common';
import { followedPeople } from './hqData';
import { CenterTag } from './HqOverview';

const GROUPS = [['Leader', 'Leaders'], ['Member', 'Members'], ['Active Informal Member', 'Informal members']];

/* HQ people: leaders, members and informal members of every center in one list, with the roadmap lessons they took */
export default function HqPeople({ R, C, openPerson, perm }) {
  const [center, setCenter] = useState(null);
  const [group, setGroup] = useState(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('center');
  const [view, setView] = useState('list');   // list | roadmap | counts
  const all = useMemo(() => C.flatMap((x) => {
    const lessons = x.D.lessons.filter((l) => l.active && (l.center_id == null || l.center_id === x.c.id));
    const li = lessonIndex(x.D, lessons, x.idx, x.c.id);
    return followedPeople(x).map((y) => ({ ...y, lessons, took: lessons.filter((l) => li.took(y.p, l)).length, tookIds: new Set(lessons.filter((l) => li.took(y.p, l)).map((l) => l.id)) }));
  }), [C]);
  const shown = all.filter((y) => (!center || y.c.id === center) && (!group || y.p.category === group) && (!q || `${y.p.name} ${y.p.full_name || ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (sort === 'rate' ? (b.f.semRate ?? -1) - (a.f.semRate ?? -1) : sort === 'name' ? a.p.name.localeCompare(b.p.name) : a.c.id - b.c.id || GROUPS.findIndex((g) => g[0] === a.p.category) - GROUPS.findIndex((g) => g[0] === b.p.category) || a.p.name.localeCompare(b.p.name)));
  const n = (cid, g) => all.filter((y) => (!cid || y.c.id === cid) && (!g || y.p.category === g)).length;
  const hqLessons = (R.lessons || []).filter((l) => l.active && l.center_id == null);

  return (
    <div className="page hq-page">
      <div className="page-head">
        <div><h1 className="page-title">People</h1><p className="page-sub">Leaders, members and informal members of every center. Roadmap lessons stay with a person when their group changes.</p></div>
        <div className="seg"><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button><button className={view === 'roadmap' ? 'on' : ''} onClick={() => setView('roadmap')}>Roadmap</button><button className={view === 'counts' ? 'on' : ''} onClick={() => setView('counts')}>Counts</button></div>
      </div>

      {view === 'counts' ? (
        <section className="card flush">
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable left hq-table">
              <thead><tr><th>Center</th>{GROUPS.map(([k, l]) => <th key={k}>{l}</th>)}<th>Total</th><th>Leadership candidates</th><th>Potential leaders</th></tr></thead>
              <tbody>
                {C.map((x) => (
                  <tr key={x.c.id} className="click" onClick={() => { setCenter(x.c.id); setView('list'); }}>
                    <td><b>{x.c.name}</b></td>{GROUPS.map(([k]) => <td key={k} className="num">{n(x.c.id, k)}</td>)}<td className="num"><b>{n(x.c.id)}</b></td>
                    <td className="num">{x.D.people.filter((p) => !p.archived && stageOf(p) === 'candidate').length}</td><td className="num">{x.D.people.filter((p) => !p.archived && stageOf(p) === 'potential').length}</td>
                  </tr>
                ))}
                <tr className="total"><td>All centers</td>{GROUPS.map(([k]) => <td key={k} className="num">{n(null, k)}</td>)}<td className="num">{n()}</td><td /><td /></tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : <>
        <div className="hq-filters">
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            <button className={`chipbtn ${!center ? 'on' : ''}`} onClick={() => setCenter(null)}>All centers <span className="n">{n(null, group)}</span></button>
            {R.centers.map((c) => <button key={c.id} className={`chipbtn ${center === c.id ? 'on' : ''}`} onClick={() => setCenter(c.id)}>{c.name} <span className="n">{n(c.id, group)}</span></button>)}
          </div>
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            <button className={`chipbtn ${!group ? 'on' : ''}`} onClick={() => setGroup(null)}>Everyone</button>
            {GROUPS.map(([k, l]) => <button key={k} className={`chipbtn ${group === k ? 'on' : ''}`} onClick={() => setGroup(k)}>{l} <span className="n">{n(center, k)}</span></button>)}
          </div>
          <div className="row">
            <label className="search grow"><Icon.search width="18" height="18" /><input placeholder="Search a name" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            {view === 'list' && <select className="small-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort"><option value="center">By center</option><option value="name">By name</option><option value="rate">By attendance</option></select>}
          </div>
        </div>

        {view === 'list' ? (
          <section className="card flush">
            <div style={{ overflowX: 'auto' }}>
              <table className="gtable left hq-table">
                <thead><tr><th>Name</th><th>Center</th><th>Group</th><th>This semester</th><th className="desk-only">Sundays</th><th>Last came</th><th>Roadmap</th>{perm.profiles && <th className="desk-only">Phone</th>}</tr></thead>
                <tbody>
                  {shown.map((y) => (
                    <tr key={`${y.c.id}-${y.p.id}`} className="click" onClick={() => openPerson(y.c.id, y.p.id)}>
                      <td><span className="row" style={{ gap: 8 }}><Initials name={y.p.name} category={y.p.category} size={28} /><span><b>{y.p.name}</b>{stageOf(y.p) && <small className="muted" style={{ display: 'block' }}>{STAGE_LABEL[stageOf(y.p)]}</small>}</span></span></td>
                      <td><CenterTag R={R} c={y.c} /></td>
                      <td className="small">{ONE[y.p.category]}</td>
                      <td style={{ minWidth: 120 }}><Meter v={y.f.semRate} /></td>
                      <td className="desk-only"><MiniDots statuses={y.dots} /></td>
                      <td className="small muted">{y.f.lastSeen ? etLabel(y.f.lastSeen) : '–'}</td>
                      <td className="num small">{y.lessons.length ? `${y.took}/${y.lessons.length}` : '–'}</td>
                      {perm.profiles && <td className="desk-only small">{y.p.phone || ''}</td>}
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={8} className="muted small">Nobody matches.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="card flush">
            <div className="card-head pad"><div><div className="card-title">Roadmap · HQ lessons</div><div className="card-sub">✓ = took the lesson (ticked, attended the matching program, or their first teaching).</div></div></div>
            {hqLessons.length === 0 ? <p className="muted small pad">No HQ roadmap lessons yet.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table className="gtable hq-table roadmap-m">
                  <thead><tr><th className="stick left">Name</th><th>Center</th>{hqLessons.map((l) => <th key={l.id} title={l.name_am || l.name}>{l.name}</th>)}<th>Done</th></tr></thead>
                  <tbody>
                    {shown.map((y) => (
                      <tr key={`${y.c.id}-${y.p.id}`}>
                        <td className="stick left"><b>{y.p.name}</b><small className="muted" style={{ display: 'block' }}>{ONE[y.p.category]}</small></td>
                        <td><CenterTag R={R} c={y.c} /></td>
                        {hqLessons.map((l) => <td key={l.id} className="num">{y.tookIds.has(l.id) ? <span className="yes">✓</span> : <span className="faint">·</span>}</td>)}
                        <td className="num"><b>{hqLessons.filter((l) => y.tookIds.has(l.id)).length}</b>/{hqLessons.length}</td>
                      </tr>
                    ))}
                    <tr className="total"><td className="stick left">Took it</td><td />{hqLessons.map((l) => <td key={l.id} className="num">{pct(shown.length ? shown.filter((y) => y.tookIds.has(l.id)).length / shown.length : null)}</td>)}<td /></tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </>}
    </div>
  );
}
