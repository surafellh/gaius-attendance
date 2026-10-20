import { useMemo, useState } from 'react';
import { monthOf, monthLabel, semesterOf, SEMESTERS, semesterStart, semesterEnd, semName, monthRange } from '../lib/ethiopian';
import { monthlyReport, semesterReport, profilesReport, programReport, tableText, toExcel, toPdf, REPORT_CATS, PROFILE_TABLES } from '../lib/exports';
import { Sheet, Icon } from './common';
import { planReport } from './Plans';

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
  const [span, setSpan] = useState('month');
  const [copied, setCopied] = useState('');
  const [cats, setCats] = useState(() => REPORT_CATS.map(([k]) => k));
  const [tables, setTables] = useState(() => PROFILE_TABLES.map(([k]) => k));
  const toggle = (set, k) => set((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
  const chosen = kind === 'profiles' ? tables : kind === 'programs' || kind === 'plansrep' ? ['x'] : cats;
  const build = () => {
    if (kind === 'month') { const [y, m] = month.split('-').map(Number); return monthlyReport(ctx, { year: y, month: m }, cats); }
    if (kind === 'semester') return semesterReport(ctx, sem, cats);
    if (kind === 'plansrep') {
      if (span === 'month') { const [y, m] = month.split('-').map(Number); const [a, b] = monthRange({ year: y, month: m }); return planReport(ctx.D, a, b, monthLabel({ year: y, month: m })); }
      return planReport(ctx.D, semesterStart(sem), semesterEnd(sem), semName(sem));
    }
    if (kind === 'programs') {
      if (span === 'month') { const [y, m] = month.split('-').map(Number); const [a, b] = monthRange({ year: y, month: m }); return programReport(ctx, a, b, monthLabel({ year: y, month: m })); }
      return programReport(ctx, semesterStart(sem), semesterEnd(sem), semName(sem));
    }
    return profilesReport(ctx, tables);
  };
  const KINDS = [['month', 'Monthly attendance', 'Each Sunday’s program and numbers, plus who came each Sunday'],
    ['semester', '6-month (semester) summary', 'Key numbers, each group, month by month, and the programs'],
    ['plansrep', 'Plans: done / not done', 'Each department’s plans for a month or a semester, with reasons for what was not done'],
    ['programs', 'Programs only', 'What each Sunday’s program was – no attendance numbers (e.g. for the service coordinator)'],
    ...(perm.profiles ? [['profiles', 'Member profiles', 'A table per group in the HQ profile format']] : [])];
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
        {(kind === 'programs' || kind === 'plansrep') && <div className="seg"><button type="button" className={span === 'month' ? 'on' : ''} onClick={() => setSpan('month')}>A month</button><button type="button" className={span === 'sem' ? 'on' : ''} onClick={() => setSpan('sem')}>A semester</button></div>}
        {(kind === 'month' || ((kind === 'programs' || kind === 'plansrep') && span === 'month')) && <label>Month<select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{monthLabel(m)}</option>)}</select></label>}
        {(kind === 'semester' || ((kind === 'programs' || kind === 'plansrep') && span === 'sem')) && <label>Semester<select value={sem} onChange={(e) => setSem(e.target.value)}>{sems.map((s) => <option key={s} value={s}>{semName(s)}</option>)}</select></label>}
        {kind !== 'programs' && kind !== 'plansrep' && <fieldset className="export-cats">
          <legend>{kind === 'profiles' ? 'Tables to include' : 'Groups to include'}</legend>
          {(kind === 'profiles' ? PROFILE_TABLES : REPORT_CATS).map(([k, l]) => (
            <label key={k} className="check"><input type="checkbox" checked={chosen.includes(k)} onChange={() => toggle(kind === 'profiles' ? setTables : setCats, k)} /> {l}</label>
          ))}
        </fieldset>}
        {kind === 'profiles' && <p className="small muted" style={{ margin: 0 }}>Includes phone numbers – share it only with the leaders and HQ.</p>}
        <div className="row2">
          <button type="button" className="btn lime" disabled={busy || !chosen.length} onClick={async () => { setBusy(true); try { await toExcel(build()); } finally { setBusy(false); } }}><Icon.grid width="18" height="18" /> Excel</button>
          <button type="button" className="btn ghost" disabled={!chosen.length} onClick={() => toPdf(build())}><Icon.book width="18" height="18" /> PDF</button>
        </div>
        <button type="button" className="btn ghost" disabled={!chosen.length} onClick={async () => {
          const rep = build(); const sh = rep.sheets[0];
          try { await navigator.clipboard.writeText(tableText(sh)); setCopied(`Copied “${sh.name}” – paste it into Excel, Sheets or Telegram.`); } catch { setCopied('Copy was blocked by the browser – use the PDF page’s Copy table button.'); }
        }}><Icon.copy width="18" height="18" /> Copy table</button>
        {copied && <p className="banner ok" style={{ margin: 0 }}>{copied}</p>}
        <p className="muted tiny" style={{ margin: 0 }}>PDF opens a print-ready page – choose “Save as PDF”. Amharic text stays intact.</p>
      </div>
    </Sheet>
  );
}
