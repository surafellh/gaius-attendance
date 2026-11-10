import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, semName, semesterStart, semesterEnd, toEthiopian, ET_MONTHS, ET_MONTHS_AM, semNo, semYear, semKey, monthRange } from '../lib/ethiopian';
import { parseAnyDate, parseMonths } from '../lib/teaching';
import { birr } from '../lib/plans';
import { readSheet, rowsUnder, col } from '../lib/exports';
import { Sheet, Icon } from './common';

/* the semester plan template: English and Amharic headings, so a plan typed in either language uploads */
const HEAD = ['Department / ክፍል', 'Activity / ተግባር', 'Details / ዝርዝር', 'When / መቼ', 'Dates or months / ቀን ወይም ወር', 'Budget / በጀት', 'Budget detail / የበጀት ዝርዝር', 'Responsible / ኃላፊ', 'Prepared by / ያዘጋጀው'];
const WHEN = [['On dates', 'በቀን', 'day'], ['Every week', 'በየሳምንቱ', 'week'], ['In months', 'በወር', 'month'], ['Any time', 'በማንኛውም ጊዜ', 'period']];
const semMonths = (sem) => (semNo(sem) === 1 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11, 12]);

export async function semesterTemplate(D, sem, centerName) {
  const XLSX = await import('xlsx');
  const d0 = D.departments[0], d1 = D.departments[1] || d0;
  const m = semMonths(sem);
  const rows = [
    [d0?.name_am || d0?.name || 'ክትትል', 'የአባላት ጥሪ ቀን – ምሳሌ (ይህን መስመር ያጥፉ)', 'ሁሉንም አባላት መጋበዝ', 'በቀን', `${ET_MONTHS_AM[m[1]]} 15, ${ET_MONTHS_AM[m[3]]} 20`, 1500, 'ትራንስፖርት እና መክሰስ', 'ክትትል ክፍል', ''],
    [d1?.name || 'Follow-up', 'Example – leaders prayer (delete this row)', 'Every Saturday morning', 'Every week', `${ET_MONTHS[m[0]]} 6`, '', '', 'Coordinator', ''],
    [d0?.name || 'Follow-up', 'Example – monthly teaching (delete this row)', '', 'In months', `${ET_MONTHS[m[1]]}, ${ET_MONTHS_AM[m[2]]}`, 3000, 'Hall rent', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet([[`Gaius ${centerName || ''} · semester plan · ${semName(sem)} · ${etLabel(semesterStart(sem), true)} – ${etLabel(semesterEnd(sem), true)} · one activity per row / በአንድ መስመር አንድ ተግባር`], HEAD, ...rows]);
  ws['!cols'] = [20, 38, 30, 16, 32, 12, 24, 18, 16].map((wch) => ({ wch }));
  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the plan', 'ዕቅዱን እንዴት እንደሚሞሉ'],
    ['One activity per row, under the headings on the “Plan” sheet.', 'በ“ዕቅድ” ገጽ ላይ በአንድ መስመር አንድ ተግባር ይጻፉ።'],
    ['Department: as on the “Lists” sheet (English or Amharic). A new department can be created when you upload.', 'ክፍል፡ በ“ዝርዝሮች” ገጽ እንዳለው (በእንግሊዝኛ ወይም በአማርኛ)።'],
    ['When: On dates / Every week / In months / Any time.', 'መቼ፡ በቀን / በየሳምንቱ / በወር / በማንኛውም ጊዜ'],
    ['Dates: Ethiopian dates like ጥቅምት 15 or Tikimt 15, separated by commas – or Excel dates.', 'ቀን፡ ለምሳሌ ጥቅምት 15፣ ኅዳር 20 – በኮማ ይለዩ።'],
    ['Months (for “In months”): month names like ኅዳር, ታኅሣሥ or Hidar, Tahsas.', 'ወር፡ ለምሳሌ ኅዳር፣ ታኅሣሥ'],
    ['Every week: the first date; it repeats every week to the end of the semester.', 'በየሳምንቱ፡ የመጀመሪያውን ቀን ይጻፉ – እስከ ሴሚስተሩ መጨረሻ ይደገማል።'],
    ['Budget: the total for the activity, numbers only. It is split over its dates.', 'በጀት፡ የተግባሩ ጠቅላላ በጀት (ቁጥር ብቻ)።'],
    ['Delete the example rows before uploading. After the upload, plans appear on the calendar and overlapping days are highlighted.', 'ምሳሌዎቹን ያጥፉ። ከተጫነ በኋላ ዕቅዶቹ በቀን መቁጠሪያው ላይ ይታያሉ።'],
  ]);
  help['!cols'] = [{ wch: 80 }, { wch: 70 }];
  const n = Math.max(D.departments.length, WHEN.length, m.length);
  const lists = XLSX.utils.aoa_to_sheet([['Departments', 'ክፍሎች', '', 'When', 'መቼ', '', 'Months this semester', 'ወሮች'],
    ...Array.from({ length: n }, (_, i) => [D.departments[i]?.name || '', D.departments[i]?.name_am || '', '', WHEN[i]?.[0] || '', WHEN[i]?.[1] || '', '', m[i] != null ? ET_MONTHS[m[i]] : '', m[i] != null ? ET_MONTHS_AM[m[i]] : ''])]);
  lists['!cols'] = [22, 22, 3, 14, 16, 3, 20, 16].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plan · ዕቅድ');
  XLSX.utils.book_append_sheet(wb, help, 'How to fill · አሞላል');
  XLSX.utils.book_append_sheet(wb, lists, 'Lists · ዝርዝሮች');
  XLSX.writeFile(wb, `Gaius_${centerName || 'center'}_semester_plan_${semName(sem).replace(/\W+/g, '_')}.xlsx`);
}

const norm = (v) => String(v || '').trim().toLowerCase();
function kindOf(w) {
  const t = norm(w);
  if (/week|ሳምንት/.test(t)) return 'week';
  if (/month|ወር/.test(t)) return 'month';
  if (/any|period|ጊዜ|ሴሚስተር/.test(t)) return 'period';
  return 'day';
}
function parseRow(r, sem, D, overlapAt) {
  const y = toEthiopian(semesterStart(sem)).year;
  const dates = r.kind === 'day' || r.kind === 'week' ? (r.rawDates instanceof Date || typeof r.rawDates === 'number' ? [r.rawDates] : String(r.rawDates || '').split(/[,;፣\n]+/).map((x) => x.trim()).filter(Boolean)).map((x) => parseAnyDate(x, y)) : [];
  const months = r.kind === 'month' ? parseMonths(String(r.rawDates || '').replace(/፣/g, ',')) : [];
  const problems = [];
  if (/example|ምሳሌ/i.test(r.title)) problems.push('example row');
  if (!r.title) problems.push('no activity');
  if (!r.dept && !r.newDept) problems.push(`department “${r.deptText}” not found`);
  if (r.kind === 'day' && (!dates.length || dates.some((d) => !d))) problems.push('a date was not understood');
  if (r.kind === 'month' && !months.length) problems.push('no months understood');
  if (dates.some((d) => d && (d < semesterStart(sem) || d > semesterEnd(sem)))) problems.push('a date is outside the semester');
  return { ...r, dates: dates.filter(Boolean), months, problems, use: r.use ?? !problems.length };
}

/* upload a filled semester plan: check each row, fix dates in place, create missing departments, see overlaps, then register */
export default function PlanUploadSheet({ D, sem: sem0, onClose, reload, setError, go, config }) {
  const [no, setNo] = useState(semNo(sem0));
  const [year, setYear] = useState(semYear(sem0));
  const sem = semKey(no, Number(year) || semYear(sem0));
  const [rows, setRows] = useState(null);
  const [makeDepts, setMakeDepts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const overlapAt = config?.calendar?.overlap || 2;
  const cid = D.center?.id || 1;
  const findDept = (v) => {
    const t = norm(v); if (!t) return null;
    return D.departments.find((d) => [d.name, d.name_am].some((n) => n && norm(n) === t))
      || D.departments.find((d) => [d.name, d.name_am].some((n) => n && (norm(n).includes(t) || t.includes(norm(n)))));
  };
  async function readFile(file) {
    try {
      const { head, rows: list } = rowsUnder(await readSheet(file), ['department', 'ክፍል']);
      const c = { d: col(head, 'department', 'ክፍል'), a: col(head, 'activity', 'plan', 'ተግባር', 'ዕቅድ'), de: col(head, 'detail', 'ዝርዝር'), w: col(head, 'when', 'መቼ'), x: col(head, 'dates', 'date', 'month', 'ቀን', 'ወር'),
        b: col(head, 'budget /', 'budget (', 'budget', 'በጀት'), bd: col(head, 'budget detail', 'የበጀት'), r: col(head, 'responsible', 'ኃላፊ', 'ተጠሪ'), p: col(head, 'prepared', 'ያዘጋጀው') };
      if (c.bd === c.b) c.bd = head.findIndex((h, i) => i !== c.b && /budget detail|የበጀት/i.test(h));
      if (c.d < 0 || c.a < 0) return setError('The sheet needs “Department / ክፍል” and “Activity / ተግባር” columns – use the template.');
      setRows(list.map(({ line, cells }) => {
        const get = (i) => (i >= 0 ? cells[i] : '');
        const deptText = String(get(c.d) || '').trim();
        return parseRow({ line, title: String(get(c.a) || '').trim(), deptText, dept: findDept(deptText), kind: kindOf(get(c.w)), rawDates: get(c.x), details: String(get(c.de) || ''),
          budget: Number(String(get(c.b) || '').replace(/[^\d.]/g, '')) || 0, budget_note: String(get(c.bd) || ''), responsible: String(get(c.r) || ''), prepared_by: String(get(c.p) || '') }, sem, D, overlapAt);
      }).filter((r) => r.title || r.deptText));
    } catch (e) { setError(`Couldn’t read the file: ${e.message}`); }
  }
  const missing = [...new Set((rows || []).filter((r) => !r.dept && r.deptText).map((r) => r.deptText))];
  const fix = (i, patch) => setRows(rows.map((x, k) => (k === i ? parseRow({ ...x, ...patch, use: undefined }, sem, D, overlapAt) : x)));
  // overlaps: the same day already has plans / events at this center, or other uploaded rows
  const existing = useMemo(() => {
    const m = {};
    for (const i of D.items || []) if ((i.center_id ?? 1) === cid && i.due_kind === 'day' && i.status !== 'cancelled') (m[i.due] ||= []).push(D.plans.find((p) => p.id === i.plan_id)?.title || 'plan');
    for (const e of D.events || []) if (e.center_id == null || e.center_id === cid) (m[e.starts_on] ||= []).push(e.title);
    return m;
  }, [D, cid]);
  const upDays = {};
  for (const r of (rows || []).filter((x) => x.use && x.kind === 'day')) for (const d of r.dates) (upDays[d] ||= []).push(r.title);
  const clashOf = (d) => [...(existing[d] || []), ...(upDays[d] || [])];
  const clashDays = Object.keys(upDays).filter((d) => clashOf(d).length >= overlapAt).sort();

  async function save() {
    setBusy(true);
    let n = 0; const made = {};
    try {
      if (makeDepts) for (const name of missing.filter((x) => rows.some((r) => r.use && r.deptText === x))) {
        const am = /[ሀ-፿]/.test(name);
        const { data, error } = await supabase.from('departments').insert({ center_id: cid, name: am ? name : name, name_am: am ? name : null, sort: 100 }).select().single();
        if (error) throw new Error(`Department “${name}” not created: ${error.message}`);
        made[name] = data;
      }
      for (const r of rows.filter((x) => x.use)) {
        const dept = r.dept || made[r.deptText];
        if (!dept) continue;
        await createPlanFrom(D, sem, { ...r, department_id: dept.id }, cid);
        n++; setDone({ n, total: rows.filter((x) => x.use).length });
      }
      setDone({ n, finished: true, clashes: clashDays });
      reload();
    } catch (e) { setError(`Upload stopped after ${n} plan${n === 1 ? '' : 's'}: ${e.message}`); }
    setBusy(false);
  }
  const usable = (rows || []).filter((r) => r.use && (r.dept || (makeDepts && r.deptText))).length;

  return (
    <Sheet title="Upload a semester plan" onClose={onClose} wide>
      <div className="form">
        <div className="row2">
          <label>Semester<select value={no} onChange={(e) => setNo(Number(e.target.value))}><option value={1}>Semester 1 (Meskerem – Yekatit)</option><option value={2}>Semester 2 (Megabit – Pagume)</option></select></label>
          <label>Ethiopian year<input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>{semName(sem)}: {etLabel(semesterStart(sem), true)} – {etLabel(semesterEnd(sem), true)}. 1. Download the template (English and Amharic). 2. Fill it – Amharic is fine. 3. Upload it, check the rows, register.</p>
        <div className="import-box">
          <button type="button" className="btn ghost" onClick={() => semesterTemplate(D, sem, D.center?.name)}><Icon.download width="18" height="18" /> Download the template</button>
          <label className="btn lime file-btn"><Icon.upload width="18" height="18" /> Upload the filled plan<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} /></label>
        </div>
        {done?.finished ? (
          <div className="banner ok">
            <b>{done.n} plan{done.n === 1 ? '' : 's'} registered for {semName(sem)}.</b> They are on the calendar now.
            {done.clashes.length > 0 && <div className="small">Overlapping days (highlighted on the calendar): {done.clashes.map((d) => etLabel(d)).join(', ')}.</div>}
            <div className="row" style={{ marginTop: 8 }}>{go && <button className="btn lime small" onClick={() => { onClose(); go('calendar'); }}>Open the calendar</button>}<button className="btn ghost small" onClick={onClose}>Close</button></div>
          </div>
        ) : rows && <>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="tag ok">{rows.filter((r) => r.use).length} ready</span>
            {rows.some((r) => r.problems.length) && <span className="tag bad">{rows.filter((r) => r.problems.length).length} to check</span>}
            {clashDays.length > 0 && <span className="tag sun">⚠ {clashDays.length} overlapping day{clashDays.length > 1 ? 's' : ''}</span>}
          </div>
          {missing.length > 0 && <label className="check"><input type="checkbox" checked={makeDepts} onChange={(e) => setMakeDepts(e.target.checked)} /> Create the departments that don’t exist yet: <b className="am">{missing.join(', ')}</b></label>}
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable left upload-table"><thead><tr><th /><th>Department</th><th>Activity</th><th>When</th><th>Dates or months <span className="tiny muted">(fix here)</span></th><th>Budget</th></tr></thead>
              <tbody>{rows.map((r, i) => {
                const cl = r.kind === 'day' ? r.dates.filter((d) => clashOf(d).length >= overlapAt) : [];
                return (
                  <tr key={i} className={r.use ? '' : 'skipped'}>
                    <td><input type="checkbox" checked={r.use} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, use: e.target.checked } : x)))} aria-label={`Use row ${r.line}`} /></td>
                    <td className="am">{r.dept ? (r.dept.name_am && /[ሀ-፿]/.test(r.deptText) ? r.dept.name_am : r.dept.name) : <span className={`tag ${makeDepts ? 'sun' : 'bad'}`}>{makeDepts ? 'new: ' : '? '}{r.deptText || '–'}</span>}</td>
                    <td className="am">{r.title}{r.responsible && <small className="muted" style={{ display: 'block' }}>{r.responsible}</small>}
                      {r.problems.filter((p) => !(makeDepts && p.startsWith('department'))).length > 0 && <div className="tiny" style={{ color: 'var(--absent)' }}>Row {r.line}: {r.problems.filter((p) => !(makeDepts && p.startsWith('department'))).join(', ')}</div>}
                      {cl.length > 0 && <div className="tiny" style={{ color: 'var(--warn)' }}>⚠ {cl.map((d) => `${etLabel(d)}: also ${clashOf(d).filter((t) => t !== r.title).slice(0, 3).join(', ')}`).join(' · ')}</div>}</td>
                    <td><select value={r.kind} onChange={(e) => fix(i, { kind: e.target.value })} aria-label="When">{WHEN.map(([l, am, k]) => <option key={k} value={k}>{l} · {am}</option>)}</select></td>
                    <td><input className="am" defaultValue={r.rawDates instanceof Date ? etLabel(parseAnyDate(r.rawDates)) : String(r.rawDates || '')} key={`${i}-${r.kind}`} aria-label={`Dates for row ${r.line}`}
                      onBlur={(e) => e.target.value !== String(r.rawDates || '') && fix(i, { rawDates: e.target.value })} />
                      <small className="muted" style={{ display: 'block' }}>{r.kind === 'month' ? r.months.map((m) => ET_MONTHS[m]).join(', ') : r.kind === 'period' ? 'Any time this semester' : r.kind === 'week' ? `Weekly from ${r.dates[0] ? etLabel(r.dates[0]) : 'the start'}` : r.dates.map((d) => etLabel(d)).join(', ')}</small></td>
                    <td className="num">{r.budget ? birr(r.budget) : '–'}</td>
                  </tr>
                );
              })}</tbody></table>
          </div>
          {clashDays.length > 0 && <p className="small" style={{ margin: 0, color: 'var(--warn)' }}>⚠ Overlapping days ({overlapAt}+ plans or events): {clashDays.map((d) => `${etLabel(d)} (${clashOf(d).length})`).join(', ')}. You can still register them – they are highlighted on the calendar.</p>}
          <button className="btn lime" disabled={!usable || busy} onClick={save}>{busy ? `Registering ${done?.n || 0}/${usable}…` : `Register ${usable || ''} plan${usable === 1 ? '' : 's'}`}</button>
        </>}
      </div>
    </Sheet>
  );
}

async function createPlanFrom(D, sem, r, cid) {
  const y = toEthiopian(semesterStart(sem)).year;
  let due = [];
  if (r.kind === 'day') due = r.dates.map((d) => [d, 'day']);
  if (r.kind === 'month') due = r.months.map((m) => [monthRange({ year: m >= 0 && m <= 3 ? y : y, month: Number(m) })[1], 'month']);
  if (r.kind === 'week') { for (let d = r.dates[0] || semesterStart(sem); d <= semesterEnd(sem); d = new Date(Date.parse(d + 'T00:00:00Z') + 7 * 864e5).toISOString().slice(0, 10)) due.push([d, 'week']); }
  if (r.kind === 'period') due = [[semesterEnd(sem), 'period']];
  if (!due.length) throw new Error(`Row ${r.line}: no date or month`);
  const base = { center_id: cid, department_id: r.department_id, semester: sem, title: r.title, details: r.details || null, budget: r.budget || 0, budget_note: r.budget_note || null,
    prepared_by: r.prepared_by || null, timing: { day: 'date', week: 'weekly', month: 'monthly', period: 'within' }[r.kind], sort: 1000 };
  let res = await supabase.from('plans').insert({ ...base, responsible: r.responsible || null }).select().single();
  if (res.error && /responsible/.test(res.error.message)) res = await supabase.from('plans').insert({ ...base, details: [base.details, r.responsible && `Responsible: ${r.responsible}`].filter(Boolean).join(' · ') || null }).select().single();
  if (res.error) throw res.error;
  const per = Math.round(((r.budget || 0) / due.length) * 100) / 100;
  const { error } = await supabase.from('plan_items').insert(due.map(([d, k]) => ({ plan_id: res.data.id, center_id: cid, due: d, due_kind: k, budget: per, status: 'planned' })));
  if (error) throw error;
}

/* ── HQ: its own semester plan (activities for all centers or one center) ───────────────────── */
const HQ_HEAD = ['Activity / ተግባር', 'Kind / ዓይነት', 'For (center or All) / ለማን', 'Responsible / ኃላፊ', 'Starts / ይጀምራል', 'Due / ያልቃል', 'Budget / በጀት', 'Notes / ማስታወሻ'];
export async function hqTemplate(R, sem, kinds) {
  const XLSX = await import('xlsx');
  const m = semMonths(sem);
  const ws = XLSX.utils.aoa_to_sheet([[`Gaius HQ · semester plan · ${semName(sem)} · one activity per row / በአንድ መስመር አንድ ተግባር · Dates like ጥቅምት 15 or Tikimt 15`], HQ_HEAD,
    ['የመሪዎች ስልጠና – ምሳሌ (ይህን መስመር ያጥፉ)', kinds[2] || 'Training', 'All', 'Director', `${ET_MONTHS_AM[m[1]]} 15`, `${ET_MONTHS_AM[m[1]]} 16`, 5000, ''],
    [`Example – visit ${R.centers[0]?.name || 'a center'} (delete this row)`, kinds[1] || 'Center visit', R.centers[0]?.name || '', 'HQ Follow-up', `${ET_MONTHS[m[2]]} 8`, '', '', '']]);
  ws['!cols'] = [40, 16, 20, 18, 16, 16, 12, 28].map((wch) => ({ wch }));
  const lists = XLSX.utils.aoa_to_sheet([['Kinds', 'Centers (or All / ሁሉም)'], ...Array.from({ length: Math.max(kinds.length, R.centers.length + 1) }, (_, i) => [kinds[i] || '', i === 0 ? 'All' : R.centers[i - 1]?.name || ''])]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'HQ plan · ዕቅድ');
  XLSX.utils.book_append_sheet(wb, lists, 'Lists · ዝርዝሮች');
  XLSX.writeFile(wb, `Gaius_HQ_semester_plan_${semName(sem).replace(/\W+/g, '_')}.xlsx`);
}
export function HqUploadSheet({ R, sem, onClose, reload, setError, kinds }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const y = toEthiopian(semesterStart(sem)).year;
  const centerOf = (v) => { const t = norm(v); if (!t || /^(all|ሁሉም|every|hq)/.test(t)) return null; return R.centers.find((c) => [c.name, c.name_am].some((n) => n && norm(n) === t)) || undefined; };
  async function readFile(file) {
    try {
      const { head, rows: list } = rowsUnder(await readSheet(file), ['activity', 'ተግባር']);
      const c = { a: col(head, 'activity', 'ተግባር'), k: col(head, 'kind', 'ዓይነት'), f: col(head, 'for', 'ለማን'), r: col(head, 'responsible', 'ኃላፊ'), s: col(head, 'starts', 'start', 'ይጀምራል'), d: col(head, 'due', 'end', 'ያልቃል'), b: col(head, 'budget', 'በጀት'), n: col(head, 'notes', 'ማስታወሻ') };
      if (c.a < 0) return setError('The sheet needs an “Activity / ተግባር” column – use the template.');
      setRows(list.map(({ line, cells }) => {
        const get = (i) => (i >= 0 ? cells[i] : '');
        const title = String(get(c.a) || '').trim();
        const ct = centerOf(get(c.f));
        const starts = parseAnyDate(get(c.s), y), due = parseAnyDate(get(c.d), y) || starts;
        const problems = [];
        if (/example|ምሳሌ/i.test(title)) problems.push('example row');
        if (!title) problems.push('no activity');
        if (ct === undefined) problems.push(`center “${get(c.f)}” not found`);
        if (get(c.s) && !starts) problems.push('start date not understood');
        return { line, title, kind: String(get(c.k) || 'Activity').trim(), center: ct || null, owner: String(get(c.r) || '').trim(), starts, due, budget: Number(String(get(c.b) || '').replace(/[^\d.]/g, '')) || null, notes: String(get(c.n) || '').trim() || null, problems, use: !problems.length };
      }).filter((r) => r.title));
    } catch (e) { setError(`Couldn’t read the file: ${e.message}`); }
  }
  async function save() {
    setBusy(true);
    const list = rows.filter((r) => r.use).map((r) => ({ title: r.title, kind: r.kind, center_id: r.center?.id ?? null, owner: r.owner || null, starts_on: r.starts, due: r.due, budget: r.budget, notes: r.notes, status: 'planned' }));
    const { error } = await supabase.from('hq_activities').insert(list);
    setBusy(false);
    if (error) return setError(`Not registered: ${error.message}`);
    setDone(list.length); reload();
  }
  return (
    <Sheet title="Upload an HQ semester plan" onClose={onClose} wide>
      <div className="form">
        <p className="small muted" style={{ margin: 0 }}>{semName(sem)}. Download the template, fill it in English or Amharic, upload it, check the rows and register. The plans go straight onto the HQ calendar.</p>
        <div className="import-box">
          <button className="btn ghost" onClick={() => hqTemplate(R, sem, kinds)}><Icon.download width="18" height="18" /> Download the template</button>
          <label className="btn lime file-btn"><Icon.upload width="18" height="18" /> Upload the filled plan<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} /></label>
        </div>
        {done != null ? <div className="banner ok"><b>{done} HQ plan{done === 1 ? '' : 's'} registered.</b> <button className="btn ghost small" onClick={onClose}>Close</button></div> : rows && <>
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable left"><thead><tr><th /><th>Activity</th><th>Kind</th><th>For</th><th>Responsible</th><th>Dates</th><th>Budget</th></tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className={r.use ? '' : 'skipped'}>
                  <td><input type="checkbox" checked={r.use} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, use: e.target.checked } : x)))} aria-label={`Use row ${r.line}`} /></td>
                  <td className="am">{r.title}{r.problems.length > 0 && <div className="tiny" style={{ color: 'var(--absent)' }}>Row {r.line}: {r.problems.join(', ')}</div>}</td>
                  <td className="small">{r.kind}</td><td>{r.center ? r.center.name : 'All centers'}</td><td className="small am">{r.owner}</td>
                  <td className="small">{r.starts ? etLabel(r.starts) : '–'}{r.due && r.due !== r.starts ? ` – ${etLabel(r.due)}` : ''}</td><td className="num">{r.budget ? birr(r.budget, 'ETB') : '–'}</td>
                </tr>
              ))}</tbody></table>
          </div>
          <button className="btn lime" disabled={busy || !rows.some((r) => r.use)} onClick={save}>{busy ? 'Registering…' : `Register ${rows.filter((r) => r.use).length} HQ plan${rows.filter((r) => r.use).length === 1 ? '' : 's'}`}</button>
        </>}
      </div>
    </Sheet>
  );
}
