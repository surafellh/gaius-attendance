import { useMemo, useState } from 'react';
import { monthOf, monthLabel, semesterOf, SEMESTERS, semesterStart } from '../lib/ethiopian';
import { monthlyReport, semesterReport, profilesReport, toExcel, toPdf } from '../lib/exports';
import { Sheet, Icon } from './common';

export default function ExportSheet({ ctx, onClose, initial = {} }) {
  const { idx, today, perm } = ctx;
  const months = useMemo(() => {
    const seen = new Map();
    for (const s of idx.held) { const m = monthOf(s); seen.set(`${m.year}-${m.month}`, m); }
    return [...seen.values()].reverse();
  }, [idx.held]);
  const sems = SEMESTERS.filter((s) => semesterStart(s) <= today).reverse();
  const [kind, setKind] = useState(initial.kind || 'month');
  const [month, setMonth] = useState(() => { const m = initial.month || monthOf(ctx.latest); return `${m.year}-${m.month}`; });
  const [sem, setSem] = useState(initial.sem || semesterOf(ctx.latest));
  const [busy, setBusy] = useState(false);
  const build = () => {
    if (kind === 'month') { const [y, m] = month.split('-').map(Number); return monthlyReport(ctx, { year: y, month: m }); }
    if (kind === 'semester') return semesterReport(ctx, sem);
    return profilesReport(ctx);
  };
  const KINDS = [['month', 'Monthly attendance', 'Each Sunday’s program and numbers, plus the person-by-Sunday grid'],
    ['semester', '6-month (semester) report', 'Programs and attendance for the semester, each person’s rate, and the weekly grid'],
    ...(perm.profiles ? [['profiles', 'Member profiles', 'Leaders, members and informal members in the HQ profile format']] : [])];
  return (
    <Sheet title="Export a report" onClose={onClose}>
      <div className="form">
        <div className="export-kinds">
          {KINDS.map(([k, l, d]) => (
            <button key={k} type="button" className={`export-kind ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)} aria-pressed={kind === k}>
              <b>{l}</b><span>{d}</span>
            </button>
          ))}
        </div>
        {kind === 'month' && <label>Month<select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{monthLabel(m)}</option>)}</select></label>}
        {kind === 'semester' && <label>Semester<select value={sem} onChange={(e) => setSem(e.target.value)}>{sems.map((s) => <option key={s}>{s}</option>)}</select></label>}
        {kind === 'profiles' && <p className="small muted" style={{ margin: 0 }}>Includes phone numbers – share it only with the leaders and HQ.</p>}
        <div className="row2">
          <button type="button" className="btn lime" disabled={busy} onClick={async () => { setBusy(true); try { await toExcel(build()); } finally { setBusy(false); } }}><Icon.grid width="18" height="18" /> Excel</button>
          <button type="button" className="btn ghost" onClick={() => toPdf(build())}><Icon.book width="18" height="18" /> PDF</button>
        </div>
        <p className="muted tiny" style={{ margin: 0 }}>PDF opens a print-ready page – choose “Save as PDF”. Amharic text stays intact.</p>
      </div>
    </Sheet>
  );
}
