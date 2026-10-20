import { useMemo, useState } from 'react';
import { monthOf, monthLabel, semesterOf, SEMESTERS, semesterStart, semesterEnd, semName, monthRange, yearRange, toEthiopian, etLabel, addDays } from '../lib/ethiopian';
import { monthlyReport, semesterReport, profilesReport, programReport, tableText, toExcel, toPdf, REPORT_CATS, PROFILE_TABLES } from '../lib/exports';
import { attendanceHistory, callsHistory, changesHistory, roadmapReport, eventsHistory, meetingsHistory, financeHistory, everything } from '../lib/history';
import { Sheet, Icon } from './common';
import { planReport, plansList } from './Plans';
import { teachingReport } from './TeachingPlan';

/* which period a download covers: a month, a semester, a year, everything, or your own dates */
function usePeriod(ctx, initial) {
  const { idx, today, D } = ctx;
  const first = useMemo(() => [idx.held[0], ...D.programs.map((p) => p.sunday)].filter(Boolean).sort()[0] || today, [idx.held, D.programs, today]);
  const months = useMemo(() => {
    const seen = new Map();
    for (let d = first; d <= today; d = addDays(d, 7)) { const m = monthOf(d); seen.set(`${m.year}-${m.month}`, m); }
    const m = monthOf(today); seen.set(`${m.year}-${m.month}`, m);
    return [...seen.values()].reverse();
  }, [first, today]);
  const years = [...new Set(months.map((m) => m.year))];
  const sems = SEMESTERS.filter((s) => semesterStart(s) <= today && semesterEnd(s) >= first).reverse();
  const [span, setSpan] = useState('month');
  const [month, setMonth] = useState(() => { const m = initial.month || monthOf(ctx.latest); return `${m.year}-${m.month}`; });
  const [sem, setSem] = useState(initial.sem || semesterOf(ctx.latest));
  const [year, setYear] = useState(toEthiopian(ctx.latest).year);
  const [from, setFrom] = useState(first);
  const [to, setTo] = useState(today);
  const range = () => {
    if (span === 'month') { const [y, m] = month.split('-').map(Number); return [...monthRange({ year: y, month: m }), monthLabel({ year: y, month: m })]; }
    if (span === 'sem') return [semesterStart(sem), semesterEnd(sem), semName(sem)];
    if (span === 'year') return [...yearRange(Number(year)), `${year} E.C.`];
    if (span === 'all') return [first, today, 'all time'];
    return [from, to, `${etLabel(from, true)} to ${etLabel(to, true)}`];
  };
  const ui = (
    <div className="period-pick">
      <div className="seg">{[['month', 'Month'], ['sem', 'Semester'], ['year', 'Year'], ['all', 'All time'], ['custom', 'Dates']].map(([k, l]) => <button key={k} type="button" className={span === k ? 'on' : ''} onClick={() => setSpan(k)}>{l}</button>)}</div>
      {span === 'month' && <label>Month<select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{monthLabel(m)}</option>)}</select></label>}
      {span === 'sem' && <label>Semester<select value={sem} onChange={(e) => setSem(e.target.value)}>{sems.map((s) => <option key={s} value={s}>{semName(s)}</option>)}</select></label>}
      {span === 'year' && <label>Ethiopian year<select value={year} onChange={(e) => setYear(e.target.value)}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>}
      {span === 'all' && <p className="small muted" style={{ margin: 0 }}>Everything since {etLabel(first, true)}.</p>}
      {span === 'custom' && <div className="row2"><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>}
    </div>
  );
  return { range, ui, sem, setSem, month, setMonth, months, sems };
}

export default function ExportSheet({ ctx, onClose, initial = {} }) {
  const { today, perm } = ctx;
  const P = usePeriod(ctx, initial);
  const [kind, setKind] = useState(initial.kind || 'month');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [cats, setCats] = useState(() => REPORT_CATS.map(([k]) => k));
  const [tables, setTables] = useState(() => PROFILE_TABLES.map(([k]) => k));
  const [planSem, setPlanSem] = useState(initial.sem || semesterOf(today));
  const planSems = SEMESTERS.filter((s) => semesterStart(s) <= addDays(today, 400)).reverse();
  const toggle = (set, k) => set((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));

  const REPORTS = [
    ['month', 'Monthly attendance', 'Each Sunday’s program and numbers, plus who came each Sunday', 'monthpick'],
    ['semester', '6-month (semester) summary', 'Key numbers, each group, month by month, and the programs', 'sempick'],
    ['plansrep', 'Plans: done / not done', 'Department performance and every activity with its status and reason', 'period'],
    ['planslist', 'Plans list', 'The semester’s plans in the import-template layout', 'plansem'],
    ['teachplan', 'Teaching plan', 'By HQ, by the center and what happened, for a semester', 'plansem'],
    ['programs', 'Programs only', 'What each Sunday’s program was – no numbers', 'period'],
    ...(perm.profiles ? [['profiles', 'Member profiles', 'A table per group in the HQ profile format', null]] : []),
  ];
  const HISTORY = [
    ['history', 'Attendance history', 'Who came each Sunday over any period – a year or all time', 'period'],
    ['calls', 'Follow-up calls', 'Every absence, whether they were called and the reason', 'period'],
    ['changes', 'Group & responsible changes', 'Who moved group (e.g. new comer → member) and who followed whom', 'period'],
    ['roadmap', 'Teaching roadmap', 'Each person’s first teaching and the lessons they took', null],
    ['events', 'Events', 'HQ and center events', 'period'],
    ['meetings', 'Leaders’ meetings', 'Meetings, agenda items and decisions', 'period'],
    ...(perm.finance ? [['finance', 'Money & assets', 'Money in and out, and the assets list', 'period']] : []),
    ['everything', 'Everything', 'All of the above in one Excel workbook', 'period'],
  ];
  const meta = [...REPORTS, ...HISTORY].find((k) => k[0] === kind) || REPORTS[0];
  const chosen = kind === 'profiles' ? tables : ['month', 'semester', 'history'].includes(kind) ? cats : ['x'];

  const build = () => {
    const [a, b, label] = P.range();
    switch (kind) {
      case 'month': { const [y, m] = P.month.split('-').map(Number); return monthlyReport(ctx, { year: y, month: m }, cats); }
      case 'semester': return semesterReport(ctx, P.sem, cats);
      case 'plansrep': return planReport(ctx.D, a, b, label);
      case 'planslist': return plansList(ctx.D, planSem);
      case 'teachplan': return teachingReport(ctx.D, planSem, ctx.progBy, today);
      case 'programs': return programReport(ctx, a, b, label);
      case 'profiles': return profilesReport(ctx, tables);
      case 'history': return attendanceHistory(ctx, a, b, label, cats);
      case 'calls': return callsHistory(ctx, a, b, label);
      case 'changes': return changesHistory(ctx, a, b, label);
      case 'roadmap': return roadmapReport(ctx);
      case 'events': return eventsHistory(ctx, a, b, label);
      case 'meetings': return meetingsHistory(ctx, a, b, label);
      case 'finance': return financeHistory(ctx, a, b, label);
      default: return everything(ctx, a, b, label, { finance: perm.finance });
    }
  };
  const Kind = ([k, l, d]) => (
    <button key={k} type="button" className={`export-kind ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)} aria-pressed={kind === k}><b>{l}</b><span>{d}</span></button>
  );
  return (
    <Sheet title="Downloads" onClose={onClose}>
      <div className="form">
        <div className="dl-group">Reports</div>
        <div className="export-kinds">{REPORTS.map(Kind)}</div>
        <div className="dl-group">History &amp; records</div>
        <div className="export-kinds">{HISTORY.map(Kind)}</div>
        <div className="form-section">{meta[1]}</div>
        {meta[3] === 'period' && P.ui}
        {meta[3] === 'monthpick' && <label>Month<select value={P.month} onChange={(e) => P.setMonth(e.target.value)}>{P.months.map((m) => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{monthLabel(m)}</option>)}</select></label>}
        {meta[3] === 'sempick' && <label>Semester<select value={P.sem} onChange={(e) => P.setSem(e.target.value)}>{P.sems.map((s) => <option key={s} value={s}>{semName(s)}</option>)}</select></label>}
        {meta[3] === 'plansem' && <label>Semester<select value={planSem} onChange={(e) => setPlanSem(e.target.value)}>{planSems.map((s) => <option key={s} value={s}>{semName(s)}</option>)}</select></label>}
        {['month', 'semester', 'history', 'profiles'].includes(kind) && <fieldset className="export-cats">
          <legend>{kind === 'profiles' ? 'Tables to include' : 'Groups to include'}</legend>
          {(kind === 'profiles' ? PROFILE_TABLES : REPORT_CATS).map(([k, l]) => (
            <label key={k} className="check"><input type="checkbox" checked={chosen.includes(k)} onChange={() => toggle(kind === 'profiles' ? setTables : setCats, k)} /> {l}</label>
          ))}
        </fieldset>}
        {kind === 'profiles' && <p className="small muted" style={{ margin: 0 }}>Includes phone numbers – share it only with the leaders and HQ.</p>}
        {kind === 'everything' && <p className="small muted" style={{ margin: 0 }}>One workbook, one tab per table. For a long period the PDF can be very long – Excel is better.</p>}
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
