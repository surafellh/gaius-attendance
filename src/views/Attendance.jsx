import { useMemo, useState } from 'react';
import { etLabel, fmtGreg, sundaysOfMonth, monthOf, addMonths, monthLabel, ET_MONTHS_AM, toEthiopian } from '../lib/ethiopian';
import { SHORT, pct, weekSummary, counts } from '../lib/stats';
import { Icon, Sheet, CAT_COLOR, CalendarSheet } from './common';
import { NewPersonSheet } from './Register';
import { parseReport } from '../lib/report';

const GROUPS = [
  ['Leader', 'Leaders'], ['Senior Leader', 'Senior leaders'], ['Member', 'Members'],
  ['Active Informal Member', 'Active informal members'], ['Inactive Informal Member', 'Inactive informal members'],
  ['New Comer', 'New comers'],
];
export const PROGRAM_KINDS = ['Teaching', 'Devotion', 'Discussion', 'Worship night', 'Prayer', 'Training', 'Special program', 'Fellowship / get-together', 'Outreach', 'Department program', 'No meeting'];

export default function Attendance({ latest, today, rosterFor, idx, saveMark, createRoll, saveProgram, progBy, perm, openPerson, D, calInfo, reload, setError, openExport }) {
  const [month, setMonth] = useState(() => monthOf(latest));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState({ 'Inactive Informal Member': false });
  const [progFor, setProgFor] = useState(null);
  const [cal, setCal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [report, setReport] = useState(false);

  const sundays = sundaysOfMonth(month.year, month.month);
  const rosters = useMemo(() => Object.fromEntries(sundays.map((s) => [s, rosterFor(s)])), [sundays.join(), rosterFor]); // eslint-disable-line

  const { groups, colStats } = useMemo(() => {
    const people = new Map();
    for (const s of sundays) for (const { p, r } of rosters[s]) {
      if (!people.has(p.id)) people.set(p.id, { p, cells: {} });
      people.get(p.id).cells[s] = r;
    }
    const lastCol = (x) => { for (let i = sundays.length - 1; i >= 0; i--) if (x.cells[sundays[i]] && (sundays[i] <= today || i === 0)) return x.cells[sundays[i]]; return Object.values(x.cells)[0]; };
    const g = {};
    for (const x of people.values()) {
      if (q && !x.p.name.toLowerCase().includes(q.toLowerCase())) continue;
      const r = lastCol(x);
      x.active = r.active;
      (g[r.category] ||= []).push(x);
    }
    for (const k of Object.keys(g)) g[k].sort(k === 'New Comer'
      ? (a, b) => (a.p.week_joined || '0').localeCompare(b.p.week_joined || '0') || (a.p.sn ?? 1e9) - (b.p.sn ?? 1e9)
      : (a, b) => (a.p.sn ?? 1e9) - (b.p.sn ?? 1e9));
    const cs = Object.fromEntries(sundays.map((s) => [s, weekSummary(rosters[s].map(({ r }) => r))]));
    return { groups: g, colStats: cs };
  }, [rosters, sundays.join(), q, today]); // eslint-disable-line

  const e0 = { year: month.year, month: month.month };
  const canPrev = month.year > 2018 || month.month > 2;

  return (
    <div className="page">
      <div className="month-bar">
        <button className="arrow" disabled={!canPrev} onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><Icon.left /></button>
        <button className="current" onClick={() => setCal(true)}>
          <span className="w-main">{monthLabel(e0)} <span className="am muted" style={{ fontWeight: 600 }}>{ET_MONTHS_AM[month.month]}</span></span>
          <span className="w-sub">{sundays.length ? `${fmtGreg(sundays[0])} – ${fmtGreg(sundays[sundays.length - 1])} · ${sundays.length} Sundays` : 'No Sundays'}</span>
        </button>
        <button className="arrow" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><Icon.right /></button>
      </div>

      <div className="toolbar row">
        <label className="search">
          <Icon.search /><span className="sr-only">Search</span>
          <input placeholder="Find a person…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {perm.mark && <button className="btn ghost" onClick={() => setReport(true)}><Icon.book /> Paste report</button>}
        <button className="btn ghost" onClick={() => openExport({ kind: 'month', month })} aria-label="Export this month"><Icon.grid /> <span className="desk-only">Export</span></button>
      </div>

      <div className="grid-wrap">
        <table className="att">
          <thead>
            <tr>
              <th className="sncol">S.N</th>
              <th className="namecol" style={{ padding: '8px 12px', fontSize: '.78rem', color: 'var(--muted)', fontWeight: 600 }}>Name <span className="desk-only">· tap a Sunday for its program</span></th>
              {sundays.map((s) => {
                const p = progBy[s];
                const e = toEthiopian(s);
                return (
                  <th key={s}>
                    <button className={`colhead ${s === latest ? 'sel' : ''} ${s > today ? 'future' : ''}`} onClick={() => setProgFor(s)} aria-label={`Program for ${etLabel(s, true)}`}>
                      <b>{e.day}</b>
                      <small>{fmtGreg(s)}</small>
                      <span className={`kind ${p?.kind === 'No meeting' ? 'none' : p?.kind ? 'set' : ''}`}>{p?.kind ? p.kind.split(' ')[0] : '+ program'}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map(([k, label]) => {
              const list = groups[k];
              if (!list?.length) return null;
              const collapsed = open[k] === false && !q;
              return [
                <tr key={k} className="group-row" style={{ '--gc': CAT_COLOR[k] }}>
                  <td className="sncol" />
                  <td className="namecol">
                    <button className="gname" style={{ border: 0, width: '100%', cursor: 'pointer' }} onClick={() => setOpen((o) => ({ ...o, [k]: o[k] === false }))} aria-expanded={!collapsed}>
                      <span className="dot" style={{ background: CAT_COLOR[k] }} />{label} <span className="muted">({list.length}{k === 'New Comer' ? ` · ${list.filter((x) => x.active).length} active` : ''})</span>
                      <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>{collapsed ? '▸' : '▾'}</span>
                    </button>
                  </td>
                  {sundays.map((s) => {
                    const rows = list.map((x) => x.cells[s]).filter(Boolean);
                    const pr = rows.filter((r) => r.status === 'Present').length;
                    return <td key={s} className="gstat">{s <= today && rows.length ? `${pr}/${rows.length}` : ''}</td>;
                  })}
                </tr>,
                ...(collapsed ? [] : list.map((x, i) => (
                  <tr key={x.p.id} className={k.startsWith('Inactive') || (k === 'New Comer' && !x.active) ? 'inactive-row' : ''}>
                    <td className="sncol">{i + 1}</td>
                    <td className="namecol">
                      <button className="pname-cell" style={{ '--band-c': CAT_COLOR[k === 'New Comer' && !x.active ? 'Inactive New Comer' : k] }} onClick={() => openPerson(x.p.id)}>
                        <span className="pn"><span className="pn-t">{x.p.name}</span>{k === 'New Comer' && <span className={`nc-tag ${x.active ? 'on' : ''}`}>{x.active ? 'active' : 'inactive'}</span>}</span>
                        {(x.p.invited_by || (k === 'New Comer' && x.p.week_joined)) && <span className="ps">{[x.p.invited_by && `via ${x.p.invited_by}`, k === 'New Comer' && x.p.week_joined && `since ${etLabel(x.p.week_joined)}`].filter(Boolean).join(' · ')}</span>}
                      </button>
                    </td>
                    {sundays.map((s) => {
                      const r = x.cells[s];
                      if (!r) return <td key={s}><span className="cell" aria-hidden="true" /></td>;
                      const st = r.status;
                      const auto = st === 'Absent' && r.category === 'New Comer' && !r.active;
                      const disabled = !perm.mark || s > today || progBy[s]?.kind === 'No meeting';
                      return (
                        <td key={s}>
                          <span className={`cell ${st === 'Present' ? 'P' : st === 'Absent' ? (auto ? 'A auto' : 'A') : 'E'} ${disabled ? 'off' : ''}`}>
                            <span>{st === 'Present' ? '✓' : st === 'Absent' ? '✕' : ''}</span>
                            {(r.called || r.reason) && <i className="flag" title={r.reason || 'Called'} />}
                            {!disabled && (
                              <select value={st || ''} aria-label={`${x.p.name}, ${etLabel(s)}`}
                                onChange={(e) => saveMark(x.p.id, s, { status: e.target.value || null })}>
                                <option value="">— Not marked</option>
                                <option value="Present">✓ Present</option>
                                <option value="Absent">✕ Absent</option>
                              </select>
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))),
              ];
            })}
            <tr className="foot">
              <td className="sncol" />
              <td className="namecol">Attendance rate</td>
              {sundays.map((s) => <td key={s}>{s <= today && colStats[s].present ? pct(colStats[s].rate) : '–'}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid-legend">
        <span className="row"><span className="cell P"><span>✓</span></span>Present</span>
        <span className="row"><span className="cell A"><span>✕</span></span>Absent</span>
        <span className="row"><span className="cell A auto"><span>✕</span></span>Inactive new comer (absent unless they come)</span>
        <span className="row"><span className="cell E"><span /></span>Not marked yet</span>
      </div>
      <p className="muted tiny">Tap a box and choose Present or Absent from the list, so a stray tap never changes anything. The rate counts leaders, members, active informal members and active new comers (not senior leaders).</p>

      {perm.mark && <button className="btn lime fab" onClick={() => setAdding(true)}><Icon.plus /> New comer</button>}

      {cal && <CalendarSheet value={sundays[0]} info={calInfo} allowFuture title="Jump to a month" onClose={() => setCal(false)} onPick={(s) => setMonth(monthOf(s))} />}
      {progFor && <ProgramSheet sunday={progFor} program={progBy[progFor]} departments={D.departments} canEdit={perm.mark} stats={colStats[progFor]}
        onClose={() => setProgFor(null)} onSave={(f) => { saveProgram(progFor, f); setProgFor(null); }} />}
      {report && <ReportSheet year={month.year} progBy={progBy} saveProgram={saveProgram} onClose={() => setReport(false)} />}
      {adding && <NewPersonSheet D={D} defaultSunday={sundays.filter((s) => s <= today).pop() || latest} createRoll={createRoll}
        onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} setError={setError} />}
    </div>
  );
}

export function ProgramSheet({ sunday, program, departments, canEdit, stats, onClose, onSave }) {
  const [f, setF] = useState({
    kind: program?.kind || 'Teaching', topic: program?.topic || '', minister: program?.minister || '',
    planned_by: program?.planned_by || 'HQ', department_id: program?.department_id || '', notes: program?.notes || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title={`Program · ${etLabel(sunday, true)}`} onClose={onClose}>
      {stats?.present > 0 && <p className="banner ok" style={{ marginBottom: 14 }}>{stats.present} came · attendance rate {pct(stats.rate)}</p>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, department_id: f.department_id || null }); }}>
        <div className="row2">
          <label>What kind of program
            <select disabled={!canEdit} value={f.kind} onChange={set('kind')}>{PROGRAM_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
          </label>
          <label>Planned by
            <select disabled={!canEdit} value={f.planned_by} onChange={set('planned_by')}>
              <option>HQ</option><option>Center</option><option>Department</option>
            </select>
          </label>
        </div>
        {f.planned_by === 'Department' && (
          <label>Department
            <select disabled={!canEdit} value={f.department_id} onChange={set('department_id')}>
              <option value="">Choose…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        {f.kind !== 'No meeting' && <>
          <label>{f.kind === 'Teaching' ? 'Teaching topic' : 'Title or topic'}<input disabled={!canEdit} value={f.topic} onChange={set('topic')} placeholder={f.kind === 'Teaching' ? 'e.g. ተሃድሶ – Restoration, part 2' : ''} /></label>
          <label>Teacher / minister<input disabled={!canEdit} value={f.minister} onChange={set('minister')} /></label>
        </>}
        <label>Notes<textarea disabled={!canEdit} value={f.notes} onChange={set('notes')} placeholder={f.kind === 'No meeting' ? 'e.g. Timket holiday' : 'Anything worth remembering'} /></label>
        {canEdit && <button className="btn lime wide">Save program</button>}
      </form>
    </Sheet>
  );
}


function ReportSheet({ year, progBy, saveProgram, onClose }) {
  const [y, setY] = useState(year);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const { rows, skipped } = parseReport(text, Number(y));
  async function save() {
    setBusy(true);
    for (const r of rows) {
      const { sunday, isSunday, label, ...f } = r; // eslint-disable-line no-unused-vars
      await saveProgram(sunday, f);
    }
    setBusy(false); setDone(rows.length);
  }
  return (
    <Sheet title="Paste a program report" onClose={onClose} wide>
      <div className="form">
        <p className="small muted">One line per Sunday: <b>month day - teacher/minister - program - topic</b>, in Amharic or English. Headings and blank lines are skipped. Existing records for those Sundays are replaced.</p>
        <label>Ethiopian year<input inputMode="numeric" value={y} onChange={(e) => setY(e.target.value)} style={{ maxWidth: 120 }} /></label>
        <label>Report<textarea rows={7} value={text} onChange={(e) => { setText(e.target.value); setDone(0); }} placeholder={'መስከረም 10 - ፓ/ር ፍፄ - ትምህርት - ትንቢተ ሚልክያስ'} /></label>
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable left">
              <thead><tr><th>Sunday</th><th>Program</th><th>Topic</th><th>Teacher / minister</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.sunday}>
                  <td>{etLabel(r.sunday, true)} <span className="muted tiny">{fmtGreg(r.sunday)}</span>{!r.isSunday && <span className="tag bad">not a Sunday</span>}{progBy[r.sunday] && <span className="tag sun">replaces</span>}</td>
                  <td>{r.kind}</td><td className="am">{r.topic || '–'}</td><td className="am">{r.minister || '–'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {skipped.length > 0 && text && <p className="tiny muted">Skipped: {skipped.join(' · ')}</p>}
        {done > 0 ? <div className="banner ok">Saved {done} Sunday{done > 1 ? 's' : ''}.</div>
          : <button className="btn lime" disabled={!rows.length || busy} onClick={save}>{busy ? 'Saving…' : `Save ${rows.length || ''} program${rows.length === 1 ? '' : 's'}`}</button>}
      </div>
    </Sheet>
  );
}
