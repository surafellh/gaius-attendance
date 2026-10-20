import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, toEthiopian, sundaysOf, semesterOf, SEMESTERS, semesterStart, semesterEnd, semName, semKey, semNo, semYear, addDays, ET_MONTHS_AM, weekdayOf, pad } from '../lib/ethiopian';
import { parseReport } from '../lib/report';
import { planMaps, sameTopic, parseAnyDate } from '../lib/teaching';
import { toExcel, toPdf, readSheet, rowsUnder, col, downloadTemplate } from '../lib/exports';
import { Icon, Sheet } from './common';

const srcOf = (r) => r.source || (r.center_id == null ? 'hq' : 'center');

/* status of a Sunday: what happened against the center's plan (or HQ's when the center has none) */
function statusOf(s, h, o, act, today) {
  const plan = o || h;
  if (act?.kind === 'No meeting') return ['No meeting', 'bad'];
  if (!plan) return act?.kind ? ['No plan', ''] : s <= today ? ['Nothing recorded', ''] : ['', ''];
  if (!act?.kind) return s <= today ? ['Not recorded', 'sun'] : ['Planned', 'lime'];
  return sameTopic(plan.topic, act.topic) ? ['As planned', 'ok'] : ['Changed', 'sun'];
}

export function teachingRows(D, sem, progBy, today) {
  const { hq, own } = planMaps(D.plan, D.center?.id || 1);
  return sundaysOf(sem).map((s) => {
    const h = hq.get(s), o = own.get(s), act = progBy[s];
    return { s, h, o, act, status: statusOf(s, h, o, act, today), differs: !!(h && o && h.topic && o.topic && !sameTopic(h.topic, o.topic)) };
  });
}
export function teachingReport(D, sem, progBy, today) {
  const rows = teachingRows(D, sem, progBy, today);
  const t = (r) => (r ? [r.series, r.topic].filter(Boolean).join(' – ') + (r.teacher ? ` (${r.teacher})` : '') : '');
  return {
    title: `Gaius ${D.center?.name || ''} – teaching plan, ${semName(sem)}`, file: `Gaius_${D.center?.name || ''}_teaching_plan_${sem.replace(' ', '_')}`,
    sub: `${rows.filter((r) => r.h).length} Sundays planned by HQ · ${rows.filter((r) => r.o).length} by the center · ${rows.filter((r) => r.status[0] === 'As planned').length} taught as planned`,
    sheets: [{ name: 'Teaching plan', head: ['Sunday', 'Date', 'By HQ', 'By the center', 'What happened', 'Status'],
      body: rows.map((r) => [etLabel(r.s), fmtGreg(r.s), t(r.h), t(r.o), r.act?.kind ? `${r.act.kind === 'Teaching' ? '' : r.act.kind + ': '}${r.act.topic || ''}${r.act.minister ? ` (${r.act.minister})` : ''}` : '', r.status[0] + (r.differs ? ' · center differs from HQ' : '')]) }],
  };
}

export default function TeachingPlan({ D, latest, today, perm, progBy, reload, setError }) {
  const [sem, setSem] = useState(semesterOf(today));
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(false);
  const cid = D.center?.id || 1;
  const canHq = perm.switchCenter, canOwn = perm.manage;
  const sems = SEMESTERS.filter((s) => semesterStart(s) <= addDays(today, 400)).reverse();
  const rows = useMemo(() => teachingRows(D, sem, progBy, today), [D, sem, progBy, today]);
  const planned = rows.filter((r) => (r.o || r.h) && r.s <= today);
  const asPlanned = planned.filter((r) => r.status[0] === 'As planned').length;
  const show = (r, who) => (r ? <>{r.series && <span className="tag">{r.series}</span>} <span className="am">{r.topic}</span><div className="tiny muted am">{r.teacher}{who === 'hq' && r.center_id == null ? ' · all centers' : ''}</div></> : <span className="faint">—</span>);

  return (
    <>
      <div className="month-bar">
        <div className="current" style={{ textAlign: 'left' }}>
          <select className="small-select" value={sem} onChange={(e) => setSem(e.target.value)} aria-label="Semester">{sems.map((s) => <option key={s} value={s}>{semName(s)}</option>)}</select>
          <span className="w-sub">{fmtGreg(semesterStart(sem))} – {fmtGreg(semesterEnd(sem))} · {rows.length} Sundays · {planned.length ? `${asPlanned} of ${planned.length} planned Sundays taught as planned` : 'nothing planned yet'}</span>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn ghost" onClick={() => toExcel(teachingReport(D, sem, progBy, today))}><Icon.download width="18" height="18" /> Excel</button>
        <button className="btn ghost" onClick={() => toPdf(teachingReport(D, sem, progBy, today))}><Icon.book width="18" height="18" /> PDF</button>
        {(canHq || canOwn) && <button className="btn lime" onClick={() => setAdding(true)}><Icon.plus /> Add a plan</button>}
      </div>
      <section className="card flush">
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left plan-table">
            <thead><tr><th>Sunday</th><th>By HQ</th><th>By the center</th><th>What happened</th><th className="desk-only" /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.s} className={r.s === latest ? 'sel' : ''} onClick={() => (canHq || canOwn) && setEdit(r)} style={{ cursor: canHq || canOwn ? 'pointer' : undefined }}>
                  <td style={{ whiteSpace: 'nowrap' }}><b>{etLabel(r.s)}</b><div className="tiny muted">{fmtGreg(r.s)}</div>{r.status[0] && <div className="mob-only"><span className={`tag ${r.status[1]}`}>{r.status[0]}</span></div>}</td>
                  <td className="tp-hq">{show(r.h, 'hq')}</td>
                  <td>{show(r.o)}{r.differs && <div><span className="tag sun">differs from HQ</span></div>}</td>
                  <td className="am">{r.act?.kind ? <>{r.act.kind === 'Teaching' ? '' : <span className="tag">{r.act.kind}</span>} {r.act.topic}<div className="tiny muted">{r.act.minister}</div></> : <span className="faint">—</span>}</td>
                  <td className="desk-only">{r.status[0] && <span className={`tag ${r.status[1]}`}>{r.status[0]}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted tiny">HQ can plan a different teaching for each center. What happened comes from the programs recorded on the Attendance page.{canHq || canOwn ? ' Tap a Sunday to change it.' : ''}</p>
      {edit && <SundaySheet r={edit} D={D} cid={cid} canHq={canHq} canOwn={canOwn} onClose={() => setEdit(null)} reload={reload} setError={setError} />}
      {adding && <AddPlanSheet D={D} cid={cid} sem={sem} canHq={canHq} canOwn={canOwn} onClose={() => setAdding(false)} onSaved={(s) => { setAdding(false); setSem(s); reload(); }} setError={setError} />}
    </>
  );
}

/* write one Sunday's row for HQ (this center or all centers) or for the center */
async function saveRow(D, { sunday, source, center_id, series, topic, teacher, notes }) {
  const row = { sunday, source, center_id, series: series || null, topic: topic || null, teacher: teacher || null, notes: notes || null };
  const ex = D.plan.find((p) => p.sunday === sunday && srcOf(p) === source && (p.center_id ?? null) === (center_id ?? null));
  if (!topic && !series && !teacher && !notes) return ex ? supabase.from('teaching_plan').delete().eq('id', ex.id) : { error: null };
  return ex ? supabase.from('teaching_plan').update(row).eq('id', ex.id) : supabase.from('teaching_plan').insert(row);
}

function SundaySheet({ r, D, cid, canHq, canOwn, onClose, reload, setError }) {
  const [hqAll, setHqAll] = useState(r.h ? r.h.center_id == null : false);
  async function submit(e, source) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const center_id = source === 'hq' && hqAll ? null : cid;
    // moving an HQ row between "this center" and "all centers": clear the old one
    if (source === 'hq' && r.h && (r.h.center_id ?? null) !== center_id) await supabase.from('teaching_plan').delete().eq('id', r.h.id);
    const { error } = await saveRow(D, { sunday: r.s, source, center_id, ...f });
    if (error) return setError(`Not saved: ${error.message}`);
    reload(); onClose();
  }
  const part = ({ source, row, title, can }) => (
    <form key={source} className="form tp-part" onSubmit={(e) => submit(e, source)}>
      <div className="form-section">{title}</div>
      <div className="row2">
        <label>Series<input name="series" defaultValue={row?.series || ''} disabled={!can} placeholder="e.g. ተሃድሶ" /></label>
        <label>Teacher<input name="teacher" defaultValue={row?.teacher || ''} disabled={!can} /></label>
      </div>
      <label>Topic<input name="topic" defaultValue={row?.topic || ''} disabled={!can} /></label>
      <label>Notes<input name="notes" defaultValue={row?.notes || ''} disabled={!can} /></label>
      {source === 'hq' && can && <label className="check"><input type="checkbox" checked={hqAll} onChange={(e) => setHqAll(e.target.checked)} /> Same for every center</label>}
      {can && <button className="btn lime">Save {source === 'hq' ? 'HQ plan' : 'center plan'}</button>}
      {can && <p className="tiny muted" style={{ margin: 0 }}>Empty the fields and save to remove it.</p>}
    </form>
  );
  return (
    <Sheet title={`Sunday ${etLabel(r.s, true)}`} onClose={onClose}>
      {part({ source: 'hq', row: r.h, title: `By HQ – for ${hqAll ? 'every center' : D.center?.name}`, can: canHq })}
      {part({ source: 'center', row: r.o, title: `By the center – ${D.center?.name}`, can: canOwn })}
    </Sheet>
  );
}

/* ── add a plan for any semester: Excel (with a template of that semester's Sundays) or paste ── */
function AddPlanSheet({ D, cid, sem, canHq, canOwn, onClose, onSaved, setError }) {
  const [no, setNo] = useState(semNo(sem));
  const [year, setYear] = useState(semYear(sem));
  const [source, setSource] = useState(canOwn && !canHq ? 'center' : 'hq');
  const [all, setAll] = useState(false);
  const [mode, setMode] = useState('excel');
  const [text, setText] = useState('');
  const [rows, setRows] = useState([]);
  const [skipped, setSkipped] = useState([]);
  const [busy, setBusy] = useState(false);
  const key = semKey(no, Number(year));
  const valid = Number(year) >= 2000 && Number(year) <= 2100;
  const from = valid ? semesterStart(key) : null, to = valid ? semesterEnd(key) : null;
  const center_id = source === 'hq' && all ? null : cid;
  const who = source === 'hq' ? `HQ plan for ${all ? 'every center' : D.center?.name}` : `${D.center?.name}’s own plan`;

  async function template() {
    const sundays = sundaysOf(key);
    const { hq, own } = planMaps(D.plan, cid);
    const m = source === 'hq' ? hq : own;
    await downloadTemplate(`Teaching_plan_${semName(key).replace(/\W+/g, '_')}`, 'Teaching plan',
      `Teaching plan · ${semName(key)} · fill Topic (and Series, Teacher). Dates can be Ethiopian (ጥቅምት 15 / Tikimt 15) or 2026-10-25. Empty rows are skipped.`,
      ['Date', 'Gregorian', 'Series', 'Topic', 'Teacher', 'Notes'],
      sundays.map((s) => { const e = toEthiopian(s); const x = m.get(s); return [`${ET_MONTHS_AM[e.month]} ${pad(e.day)}`, s, x?.series || '', x?.topic || '', x?.teacher || '', x?.notes || '']; }),
      [14, 12, 18, 40, 22, 24]);
  }
  async function readFile(file) {
    try {
      const { head, rows: list } = rowsUnder(await readSheet(file), ['date', 'ቀን']);
      const c = { d: col(head, 'date', 'ቀን'), g: col(head, 'gregorian'), se: col(head, 'series', 'ተከታታይ'), t: col(head, 'topic', 'ርዕስ'), te: col(head, 'teacher', 'minister', 'አስተማሪ'), n: col(head, 'note') };
      if (c.d < 0 || c.t < 0) return setError('The sheet needs a “Date” and a “Topic” column – use the template.');
      const out = [], bad = [];
      for (const { line, cells } of list) {
        const get = (i) => (i >= 0 ? String(cells[i] ?? '').trim() : '');
        if (!get(c.t) && !get(c.se)) continue;
        const d = parseAnyDate(cells[c.d], Number(year)) || (c.g >= 0 ? parseAnyDate(cells[c.g], Number(year)) : null);
        if (!d) { bad.push(`row ${line}: date “${get(c.d)}” not understood`); continue; }
        out.push({ sunday: d, isSunday: weekdayOf(d) === 0, series: get(c.se), topic: get(c.t), teacher: get(c.te), notes: get(c.n) });
      }
      setRows(out); setSkipped(bad);
    } catch (e) { setError(`Couldn’t read the file: ${e.message}`); }
  }
  const pasted = mode === 'paste' ? parseReport(text, Number(year)) : null;
  const list = mode === 'paste' ? pasted.rows.map((r) => ({ sunday: r.sunday, isSunday: r.isSunday, series: r.kind !== 'Teaching' && r.kind !== 'Special program' ? r.kind : '', topic: r.topic, teacher: r.minister, notes: '' })) : rows;
  const outside = list.filter((r) => from && (r.sunday < from || r.sunday > to)).length;

  async function save() {
    setBusy(true);
    for (const r of list) {
      const { error } = await saveRow(D, { ...r, source, center_id });
      if (error) { setBusy(false); return setError(`Not saved (${etLabel(r.sunday)}): ${error.message}`); }
    }
    setBusy(false); onSaved(key);
  }

  return (
    <Sheet title="Add a teaching plan" onClose={onClose} wide>
      <div className="form">
        <div className="row3">
          <label>Semester<select value={no} onChange={(e) => setNo(Number(e.target.value))}><option value={1}>Semester 1 (Meskerem – Yekatit)</option><option value={2}>Semester 2 (Megabit – Pagume)</option></select></label>
          <label>Ethiopian year<input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></label>
          <label>Plan by<select value={source} onChange={(e) => setSource(e.target.value)}>{canHq && <option value="hq">HQ</option>}{canOwn && <option value="center">The center</option>}</select></label>
        </div>
        {source === 'hq' && <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Same plan for every center (otherwise only {D.center?.name})</label>}
        <p className="small muted" style={{ margin: 0 }}>{valid ? `${semName(key)}: ${etLabel(from, true)} – ${etLabel(to, true)}` : 'Type a year'} · saved as the {who}. Sundays already planned are replaced.</p>
        <div className="seg"><button type="button" className={mode === 'excel' ? 'on' : ''} onClick={() => setMode('excel')}>Excel file</button><button type="button" className={mode === 'paste' ? 'on' : ''} onClick={() => setMode('paste')}>Paste text</button></div>
        {mode === 'excel' ? (
          <div className="import-box">
            <button type="button" className="btn ghost" disabled={!valid} onClick={template}><Icon.download width="18" height="18" /> Download template ({sundaysOf(key).length} Sundays)</button>
            <label className="btn lime file-btn"><Icon.grid width="18" height="18" /> Choose the filled Excel file<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} /></label>
          </div>
        ) : (
          <label>Plan, one Sunday per line<textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'ጥቅምት 08 - ፓ/ር ፍፄ - ትምህርት - ትንቢተ ሚልክያስ'} /></label>
        )}
        {list.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable left"><thead><tr><th>Sunday</th><th>Series</th><th>Topic</th><th>Teacher</th></tr></thead>
              <tbody>{list.map((r, i) => <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{etLabel(r.sunday, true)}{!r.isSunday && <span className="tag bad">not a Sunday</span>}{from && (r.sunday < from || r.sunday > to) && <span className="tag sun">other semester</span>}</td><td className="am">{r.series}</td><td className="am">{r.topic}</td><td className="am">{r.teacher || '–'}</td></tr>)}</tbody></table>
          </div>
        )}
        {(mode === 'paste' ? pasted.skipped.filter(() => text) : skipped).length > 0 && <p className="tiny muted">Skipped: {(mode === 'paste' ? pasted.skipped : skipped).join(' · ')}</p>}
        {outside > 0 && <p className="banner warn" style={{ margin: 0 }}>{outside} row{outside > 1 ? 's are' : ' is'} outside {semName(key)} – check the year.</p>}
        <button className="btn lime" disabled={!list.length || busy} onClick={save}>{busy ? 'Saving…' : `Save ${list.length || ''} Sunday${list.length === 1 ? '' : 's'}`}</button>
      </div>
    </Sheet>
  );
}
