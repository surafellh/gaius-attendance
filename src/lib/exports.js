// Reports for leaders and HQ: Excel (.xlsx) and PDF (printable page → "Save as PDF").
import { etLabel, fmtGreg, sundaysOfMonth, monthLabel, sundaysOf, semesterStart } from './ethiopian';
import { ONE, pct, weekSummary, stageOf, STAGE_LABEL } from './stats';

const GROUP_ORDER = ['Leader', 'Senior Leader', 'Member', 'Active Informal Member', 'Inactive Informal Member', 'New Comer'];

function sundayRows(ctx, sundays) {
  const { idx, progBy, D } = ctx;
  return sundays.filter((s) => idx.heldSet.has(s) || progBy[s]).map((s) => {
    const rows = idx.bySunday[s] || [];
    const w = weekSummary(rows);
    const p = progBy[s] || {};
    const first = D.people.filter((x) => x.week_joined === s).length;
    return [etLabel(s, true), fmtGreg(s) + ' ' + s.slice(0, 4), p.kind || '', p.topic || '', p.minister || '',
      w.present, w.countedPresent, w.counted, rows.length ? pct(w.rate) : '',
      w.byCat.Leader.present, w.byCat.Member.present, w.byCat['Active Informal Member'].present, w.byCat['New Comer'].present, first];
  });
}
const SUNDAY_HEAD = ['Sunday (E.C.)', 'Date', 'Program', 'Topic', 'Teacher / minister', 'Came', 'Expected came', 'Expected', 'Rate',
  'Leaders', 'Members', 'Active informal', 'New comers', 'First time'];

function peopleGrid(ctx, sundays) {
  const { idx, personBy } = ctx;
  const held = sundays.filter((s) => idx.heldSet.has(s));
  const map = new Map();
  for (const s of held) for (const r of idx.bySunday[s] || []) {
    if (!personBy[r.person_id]) continue;
    if (!map.has(r.person_id)) map.set(r.person_id, { p: personBy[r.person_id], cells: {} });
    const x = map.get(r.person_id); x.cells[s] = r; x.last = r;
  }
  const list = [...map.values()].sort((a, b) => GROUP_ORDER.indexOf(a.last.category) - GROUP_ORDER.indexOf(b.last.category)
    || (a.last.category === 'New Comer' ? (a.p.week_joined || '').localeCompare(b.p.week_joined || '') : 0) || (a.p.sn ?? 1e9) - (b.p.sn ?? 1e9));
  const n = {};
  const body = list.map((x) => {
    const c = x.last.category;
    n[c] = (n[c] || 0) + 1;
    const marks = held.map((s) => (x.cells[s]?.status === 'Present' ? 'P' : x.cells[s]?.status === 'Absent' ? 'A' : ''));
    const pres = marks.filter((m) => m === 'P').length, tot = marks.filter(Boolean).length;
    const grp = c === 'New Comer' ? `New comer (${x.last.active ? 'active' : 'inactive'})` : ONE[c];
    return [n[c], x.p.name, grp, x.p.invited_by || '', ...marks, pres, tot ? pct(pres / tot) : ''];
  });
  return { head: ['S.N', 'Name', 'Group', 'Invited by', ...held.map((s) => etLabel(s)), 'Came', '%'], body, held };
}

export function monthlyReport(ctx, month) {
  const sundays = sundaysOfMonth(month.year, month.month);
  const g = peopleGrid(ctx, sundays);
  const title = `Gaius ${ctx.D.center?.name || ''} – attendance ${monthLabel(month)}`;
  return {
    title, file: `Gaius_${ctx.D.center?.name || 'center'}_${monthLabel(month).replace(' ', '_')}`, landscape: true,
    sub: `${g.held.length} Sundays held · rate counts leaders, members, active informal members and active new comers`,
    sheets: [
      { name: 'Summary', head: SUNDAY_HEAD, body: sundayRows(ctx, sundays) },
      { name: 'Attendance', head: g.head, body: g.body },
    ],
  };
}

export function semesterReport(ctx, sem) {
  const sundays = sundaysOf(sem).filter((s) => s <= ctx.today);
  const g = peopleGrid(ctx, sundays);
  const sum = sundayRows(ctx, sundays);
  const people = g.body.map((r) => [r[0], r[1], r[2], r[3], r[r.length - 2], r.slice(4, -2).filter(Boolean).length, r[r.length - 1]]);
  const { idx } = ctx;
  const rates = g.held.map((s) => weekSummary(idx.bySunday[s]).rate).filter((v) => v != null);
  return {
    title: `Gaius ${ctx.D.center?.name || ''} – ${sem} semester report`, file: `Gaius_${ctx.D.center?.name || 'center'}_${sem.replace(' ', '_')}_report`,
    sub: `From ${etLabel(semesterStart(sem), true)} · ${g.held.length} Sundays held · average rate ${pct(rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null)}`,
    landscape: true,
    sheets: [
      { name: 'Programs & attendance', head: SUNDAY_HEAD, body: sum },
      { name: 'People', head: ['S.N', 'Name', 'Group', 'Invited by', 'Came', 'Of Sundays (since joining)', '%'], body: people },
      { name: 'Weekly grid', head: g.head, body: g.body, wide: true },
    ],
  };
}

export function profilesReport(ctx) {
  const { D, personBy } = ctx;
  const resp = (p) => D.assignments.find((a) => a.person_id === p.id && !a.until)?.leader_name || p.responsible || '';
  const list = D.people.filter((p) => !p.archived && p.category !== 'New Comer')
    .sort((a, b) => GROUP_ORDER.indexOf(a.category) - GROUP_ORDER.indexOf(b.category) || (a.sn ?? 1e9) - (b.sn ?? 1e9));
  const year = new Date().getFullYear();
  const body = list.map((p, i) => [i + 1, p.full_name || p.name, p.name, ONE[p.category] || '', STAGE_LABEL[stageOf(p)] || '', p.gender || '', p.phone || '',
    p.church || '', p.education || '', p.work || '', p.passion || '', p.area || '', p.birth_year ? year - p.birth_year : '', p.level || '',
    p.week_joined ? etLabel(p.week_joined, true) : '', (p.invited_by_id && personBy[p.invited_by_id]?.name) || p.invited_by || '', p.start_teaching || '', resp(p), p.notes || '']);
  return {
    title: `Gaius ${D.center?.name || ''} – member profiles`, file: `Gaius_${D.center?.name || 'center'}_profiles`, landscape: true,
    sub: `${list.length} leaders, members and informal members · HQ profile format`,
    sheets: [{ name: 'Profiles', head: ['No', 'Full name', 'Name on list', 'Group', 'Leadership', 'Gender', 'Phone', 'Church', 'Education', 'Work', 'Passion / talent',
      'Area', 'Age', 'Level', 'Joined', 'Invited by', 'First teaching', 'Responsible', 'Notes'], body }],
  };
}

export async function toExcel(rep) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sh of rep.sheets) {
    const ws = XLSX.utils.aoa_to_sheet([[rep.title], [rep.sub], [], sh.head, ...sh.body]);
    ws['!cols'] = sh.head.map((h, i) => ({ wch: Math.min(40, Math.max(String(h).length, ...sh.body.map((r) => String(r[i] ?? '').length)) + 2) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 4 };
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${rep.file}.xlsx`);
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Opens a print-ready page; the phone or computer's print dialog saves it as PDF (keeps Amharic text intact). */
export function toPdf(rep) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for this site to save the PDF.'); return; }
  const cell = (v) => (v === 'P' ? '<td class="P">✓</td>' : v === 'A' ? '<td class="A">✕</td>' : `<td>${esc(v)}</td>`);
  const tables = rep.sheets.map((sh) => `<h2>${esc(sh.name)}</h2><table class="${sh.head.length > 12 ? 'dense' : ''}"><thead><tr>${sh.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sh.body.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(rep.file)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Ethiopic:wght@400;700&family=Manrope:wght@400;700;800&display=swap" rel="stylesheet">
<style>@page{size:A4 ${rep.landscape ? 'landscape' : 'portrait'};margin:12mm}*{box-sizing:border-box}body{font-family:Manrope,'Noto Sans Ethiopic',system-ui,sans-serif;color:#172114;margin:0;padding:16px}
.band{height:6px;background:repeating-linear-gradient(90deg,#1a2e14 0 14px,#f6c343 14px 18px,#1a2e14 18px 22px,#fff 22px 26px,#1a2e14 26px 40px,#7ab52c 40px 46px);margin-bottom:12px}
header{background:#8dc63f;padding:12px 14px;border-radius:8px 8px 0 0}h1{font-size:18px;margin:0}.sub{font-size:11px;color:#26431d;margin-top:2px}
h2{font-size:13px;margin:16px 0 6px;color:#4f8a12;break-after:avoid}table{border-collapse:collapse;width:100%;font-size:9.5px}th,td{border:1px solid #dfe6d5;padding:3px 5px;text-align:left;vertical-align:top}
th{background:#eef7e0;font-weight:700}tbody tr:nth-child(even) td{background:#f8fbf4}table.dense{font-size:8px}td.P{color:#fff;background:#23964f!important;text-align:center}td.A{color:#d9533c;background:#fce9e4!important;text-align:center}
tr{break-inside:avoid}thead{display:table-header-group}.foot{font-size:9px;color:#5d6a57;margin-top:10px}.bar{position:sticky;top:0;background:#fff;padding:8px 0;display:flex;gap:8px}
.bar button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:10px 16px;background:#8dc63f;cursor:pointer}@media print{.bar{display:none}body{padding:0}}</style></head>
<body><div class="bar"><button onclick="print()">Save as PDF / Print</button><button onclick="close()" style="background:#eef2e8">Close</button></div>
<header><h1>${esc(rep.title)}</h1><div class="sub">${esc(rep.sub)}</div></header><div class="band"></div>${tables}
<p class="foot">Generated ${new Date().toLocaleString('en-GB')} · Gaius attendance app</p>
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))</script></body></html>`);
  w.document.close();
}
