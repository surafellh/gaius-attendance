// Reports for leaders and HQ: Excel (.xlsx) and PDF (print-ready page → "Save as PDF").
// Reports show what leaders need – the data in the app is more complete than any report.
import { etLabel, fmtGreg, sundaysOfMonth, monthLabel, sundaysOf, semesterStart, semesterEnd, toEthiopian, ET_MONTHS, shortEt, semName } from './ethiopian';
import { pct, readiness } from './stats';

/* report groups, in order; "active" comes from that Sunday's snapshot */
export const REPORT_CATS = [
  ['Leader', 'Leaders', (r) => r.category === 'Leader'],
  ['Member', 'Members', (r) => r.category === 'Member'],
  ['Active Informal Member', 'Informal members', (r) => r.category === 'Active Informal Member'],
  ['Active New Comer', 'Active new comers', (r) => r.category === 'New Comer' && r.active],
];
const catsOf = (keys) => REPORT_CATS.filter(([k]) => keys.includes(k));
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const one = (v) => (v == null ? '' : Math.round(v * 10) / 10);
const center = (ctx) => ctx.D.center?.name || '';

/* one Sunday, counted only over the chosen groups */
function sundayStats(ctx, s, cats) {
  const rows = (ctx.idx.bySunday[s] || []).filter((r) => ctx.personBy[r.person_id]);
  const by = cats.map(([, , test]) => {
    const g = rows.filter(test);
    return { total: g.length, present: g.filter((r) => r.status === 'Present').length };
  });
  const present = by.reduce((n, x) => n + x.present, 0);
  // everyone who came, and the core rate (leaders + members) – the same numbers as the dashboard
  const all = rows.filter((r) => r.status === 'Present').length;
  const core = rows.filter((r) => r.category === 'Leader' || r.category === 'Member');
  const corePresent = core.filter((r) => r.status === 'Present').length;
  return { present, all, rate: core.length ? corePresent / core.length : null, by };
}
const held = (ctx, sundays) => sundays.filter((s) => ctx.idx.heldSet.has(s));

function summaryTable(ctx, sundays, cats) {
  const head = ['Sunday', 'Date', 'Program', 'Topic', 'Teacher / minister', 'Total present', 'Leaders & members rate', ...cats.map(([, l]) => l)];
  const body = sundays.filter((s) => ctx.idx.heldSet.has(s) || ctx.progBy[s]).map((s) => {
    const p = ctx.progBy[s] || {};
    const st = sundayStats(ctx, s, cats);
    const on = ctx.idx.heldSet.has(s);
    return [etLabel(s), fmtGreg(s), p.kind || '', p.topic || '', p.minister || '', on ? st.all : '', on ? pct(st.rate) : '', ...st.by.map((x) => (on ? x.present : ''))];
  });
  return { name: 'Summary', head, body };
}

/* person × Sunday grid with a heading row per group */
function gridTable(ctx, sundays, cats) {
  const hs = held(ctx, sundays);
  const last = hs[hs.length - 1];
  const body = [];
  for (const [k, label, test] of cats) {
    const rows = (ctx.idx.bySunday[last] || []).filter((r) => ctx.personBy[r.person_id] && test(r)).map((r) => ctx.personBy[r.person_id])
      .sort((a, b) => (k === 'Active New Comer' ? (a.week_joined || '').localeCompare(b.week_joined || '') : 0) || (a.sn ?? 1e9) - (b.sn ?? 1e9));
    if (!rows.length) continue;
    body.push({ group: `${label} (${rows.length})` });
    rows.forEach((p, i) => {
      const marks = hs.map((s) => { const st = ctx.idx.byPerson[p.id]?.[s]?.status; return st === 'Present' ? 'P' : st === 'Absent' ? 'A' : ''; });
      const pres = marks.filter((m) => m === 'P').length, tot = marks.filter(Boolean).length;
      body.push([i + 1, p.name, ...marks, pres, tot ? pct(pres / tot) : '']);
    });
  }
  return { name: 'Attendance', head: ['S.N', 'Name', ...hs.map((s) => shortEt(s)), 'Total', '%'], marks: [2, 2 + hs.length], body };
}

/* program report only – what happened each Sunday, no numbers (e.g. for the service coordinator) */
export function programReport(ctx, from, to, label) {
  const sundays = Object.keys(ctx.progBy).concat(ctx.idx.held).filter((s) => s >= from && s <= to);
  const body = [...new Set(sundays)].sort().map((s) => { const p = ctx.progBy[s] || {}; return [etLabel(s), fmtGreg(s), p.kind || '', p.topic || '', p.minister || '', p.notes || '']; });
  return {
    title: `Gaius ${center(ctx)} – programs, ${label}`, file: `Gaius_${center(ctx)}_programs_${label.replace(/\W+/g, '_')}`,
    sub: `${body.filter((r) => r[2] && r[2] !== 'No meeting').length} programs`,
    sheets: [{ name: 'Programs', head: ['Sunday', 'Date', 'Program', 'Topic', 'Teacher / minister', 'Notes'], body }],
  };
}

export function monthlyReport(ctx, month, keys) {
  const cats = catsOf(keys);
  const sundays = sundaysOfMonth(month.year, month.month);
  const hs = held(ctx, sundays);
  const st = hs.map((s) => sundayStats(ctx, s, cats));
  return {
    title: `Gaius ${center(ctx)} – ${monthLabel(month)} attendance`,
    file: `Gaius_${center(ctx)}_${monthLabel(month).replace(' ', '_')}`,
    sub: `${hs.length} Sundays · average ${one(avg(st.map((x) => x.all)))} present · leaders & members rate ${pct(avg(st.map((x) => x.rate).filter((v) => v != null)))}`,
    sheets: [summaryTable(ctx, sundays, cats), gridTable(ctx, sundays, cats)],
  };
}

export function semesterReport(ctx, sem, keys) {
  const cats = catsOf(keys);
  const sundays = sundaysOf(sem).filter((s) => s <= ctx.today);
  const hs = held(ctx, sundays);
  const st = Object.fromEntries(hs.map((s) => [s, sundayStats(ctx, s, cats)]));
  const avgPresent = avg(hs.map((s) => st[s].all)), avgRate = avg(hs.map((s) => st[s].rate).filter((v) => v != null));
  const best = [...hs].sort((a, b) => st[b].all - st[a].all)[0], low = [...hs].sort((a, b) => st[a].all - st[b].all)[0];
  const from = semesterStart(sem), to = semesterEnd(sem);
  const firstTime = ctx.D.people.filter((p) => p.week_joined && p.week_joined >= from && p.week_joined <= to).length;
  const becameMembers = ctx.D.history.filter((h) => h.category === 'Member' && h.since >= from && h.since <= to && h.note !== 'from sheet').length;
  const progs = hs.filter((s) => ctx.progBy[s]?.kind && ctx.progBy[s].kind !== 'No meeting').length;
  const last = hs[hs.length - 1];

  const overview = { name: 'Overview', head: ['', ''], body: [
    ['Sundays held', hs.length],
    ['Average total present', one(avgPresent)],
    ['Leaders & members rate', pct(avgRate)],
    ['Highest Sunday', best ? `${etLabel(best)} – ${st[best].all} present` : ''],
    ['Lowest Sunday', low ? `${etLabel(low)} – ${st[low].all} present` : ''],
    ['First-time visitors', firstTime],
    ['New comers who became members', becameMembers],
    ['Sundays with a program recorded', `${progs} of ${hs.length}`],
  ] };
  const byCat = { name: 'By group', head: ['Group', 'People now', 'Average present', 'Average rate'], body: cats.map(([, l], i) => {
    const pres = hs.map((s) => st[s].by[i].present);
    const rate = hs.map((s) => (st[s].by[i].total ? st[s].by[i].present / st[s].by[i].total : null)).filter((v) => v != null);
    return [l, last ? st[last].by[i].total : '', one(avg(pres)), pct(avg(rate))];
  }) };
  const months = [];
  for (const s of hs) { const e = toEthiopian(s); let m = months[months.length - 1]; if (!m || m.month !== e.month) { m = { month: e.month, list: [] }; months.push(m); } m.list.push(s); }
  const byMonth = { name: 'By month', head: ['Month', 'Sundays', 'Average total present', 'Leaders & members rate', ...cats.map(([, l]) => l)], body: months.map((m) => [
    ET_MONTHS[m.month], m.list.length, one(avg(m.list.map((s) => st[s].all))), pct(avg(m.list.map((s) => st[s].rate).filter((v) => v != null))),
    ...cats.map((_, i) => one(avg(m.list.map((s) => st[s].by[i].present))))]) };
  const programs = { name: 'Programs', head: ['Sunday', 'Program', 'Topic', 'Teacher / minister', 'Total present', 'L+M rate'],
    body: sundays.filter((s) => ctx.idx.heldSet.has(s) || ctx.progBy[s]).map((s) => {
      const p = ctx.progBy[s] || {};
      return [etLabel(s), p.kind || '', p.topic || '', p.minister || '', st[s]?.all ?? '', st[s] ? pct(st[s].rate) : ''];
    }) };
  return {
    title: `Gaius ${center(ctx)} – ${semName(sem)} summary`, file: `Gaius_${center(ctx)}_${sem.replace(' ', '_')}_summary`,
    sub: `${etLabel(from, true)} – ${etLabel(last || to, true)} · ${cats.map(([, l]) => l).join(', ')}`,
    sheets: [overview, byCat, byMonth, programs],
  };
}

/* age: exact from date of birth; otherwise estimated from birth year (mid-year), so it moves on by itself */
export function ageOf(p, today = new Date()) {
  if (p.birth_date) {
    const b = new Date(p.birth_date + 'T00:00:00');
    let a = today.getFullYear() - b.getFullYear();
    if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) a--;
    return a;
  }
  if (!p.birth_year) return '';
  return Math.floor((today - new Date(p.birth_year, 6, 1)) / (365.25 * 864e5));
}

export const PROFILE_TABLES = [
  ['Leader', 'Leaders'], ['Senior Leader', 'Senior leaders'], ['Member', 'Members'], ['Active Informal Member', 'Informal members'], ['Active New Comer', 'Active new comers (top 6)'],
];
export function profilesReport(ctx, keys) {
  const { D, idx, latest } = ctx;
  const head = ['No', 'Full name', 'Gender', 'Phone', 'Church', 'Education', 'Work', 'Passion / talent', 'Area', 'Age', 'Time with us', 'Level', 'Joined', 'First teaching'];
  const row = (p, i) => [i + 1, p.full_name || p.name, p.gender || '', p.phone || '', p.church || '', p.education || '', p.work || '', p.passion || '', p.area || '',
    ageOf(p), stayText(p), p.level || '', p.week_joined ? etLabel(p.week_joined, true) : '', p.start_teaching || ''];
  const live = D.people.filter((p) => !p.archived);
  const sheets = PROFILE_TABLES.filter(([k]) => keys.includes(k)).map(([k, label]) => {
    let list;
    if (k === 'Active New Comer') {
      list = (idx.bySunday[latest] || []).filter((r) => r.category === 'New Comer' && r.active).map((r) => live.find((p) => p.id === r.person_id)).filter(Boolean)
        .map((p) => ({ p, s: readiness(p, idx.byPerson[p.id], idx.held, latest).score ?? 0 })).sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.p);
    } else list = live.filter((p) => p.category === k).sort((a, b) => (a.sn ?? 1e9) - (b.sn ?? 1e9));
    return { name: label, head, body: list.map(row) };
  });
  return {
    title: `Gaius ${center(ctx)} – member profiles`, file: `Gaius_${center(ctx)}_profiles`,
    sub: `As of ${etLabel(ctx.today, true)} · active new comers ranked by attendance over the last 6 months`, sheets,
  };
}

/* ── writers ───────────────────────────────────────────────────── */
export async function toExcel(rep) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sh of rep.sheets) {
    const body = sh.body.map((r) => (Array.isArray(r) ? r : [r.group]));
    const aoa = [[rep.title], [rep.sub], [], ...(sh.head.some(Boolean) ? [sh.head] : []), ...body];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = sh.head.map((h, i) => {
      if (sh.marks && i >= sh.marks[0] && i < sh.marks[1]) return { wch: 8 };
      const w = Math.max(String(h).length, ...body.filter((r) => r.length > 1).map((r) => String(r[i] ?? '').length));
      return { wch: Math.min(38, w + 2) };
    });
    XLSX.utils.book_append_sheet(wb, ws, sh.name.replace(/[\\/?*[\]:]/g, '').slice(0, 31));
  }
  XLSX.writeFile(wb, `${rep.file}.xlsx`);
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Opens a print-ready page; the phone or computer's print dialog saves it as PDF (keeps Amharic text intact). */
export function toPdf(rep) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for this site to save the PDF.'); return; }
  const wide = rep.sheets.some((sh) => sh.head.length > 9);
  const table = (sh) => {
    const isMark = (i) => sh.marks && i >= sh.marks[0] && i < sh.marks[1];
    const hasHead = sh.head.some(Boolean);
    const th = hasHead ? `<thead><tr>${sh.head.map((h, i) => (isMark(i) ? `<th class="mk">${esc(h).replace(' ', '<br>')}</th>` : `<th>${esc(h)}</th>`)).join('')}</tr></thead>` : '';
    const tr = sh.body.map((r) => (Array.isArray(r)
      ? `<tr>${r.map((v, i) => (isMark(i) ? `<td class="mk ${v}">${v === 'P' ? '✓' : v === 'A' ? '✕' : ''}</td>` : `<td>${esc(v)}</td>`)).join('')}</tr>`
      : `<tr class="grp"><td colspan="${sh.head.length}">${esc(r.group)}</td></tr>`)).join('');
    return `<h2>${esc(sh.name)} <button class="cp" onclick="cp(this)">Copy table</button></h2><textarea hidden>${esc(tableText(sh))}</textarea><table class="${sh.marks ? 'grid' : ''} ${hasHead ? '' : 'kv'}">${th}<tbody>${tr || `<tr><td>Nobody in this group.</td></tr>`}</tbody></table>`;
  };
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(rep.file)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Ethiopic:wght@400;700&family=Manrope:wght@400;700;800&display=swap" rel="stylesheet">
<style>@page{size:A4 ${wide ? 'landscape' : 'portrait'};margin:12mm}*{box-sizing:border-box}body{font-family:Manrope,'Noto Sans Ethiopic',system-ui,sans-serif;color:#172114;margin:0;padding:16px}
.band{height:6px;background:repeating-linear-gradient(90deg,#1a2e14 0 14px,#f6c343 14px 18px,#1a2e14 18px 22px,#fff 22px 26px,#1a2e14 26px 40px,#7ab52c 40px 46px);margin-bottom:10px}
header{background:#8dc63f;padding:12px 14px;border-radius:8px 8px 0 0}h1{font-size:18px;margin:0}.sub{font-size:11px;color:#26431d;margin-top:2px}
h2{font-size:13px;margin:16px 0 6px;color:#4f8a12;break-after:avoid}table{border-collapse:collapse;font-size:10px;margin-bottom:4px}th,td{border:1px solid #dfe6d5;padding:3px 6px;text-align:left;vertical-align:top}
th{background:#eef7e0;font-weight:700}tbody tr:nth-child(even) td{background:#f8fbf4}
table.kv td:first-child{font-weight:700;background:#f6fbef;min-width:200px}table.kv td{font-size:11px;padding:5px 8px}
table.grid{font-size:9.5px}table.grid td:nth-child(2){white-space:nowrap;min-width:110px}
th.mk{width:30px;min-width:30px;max-width:30px;padding:2px 1px;text-align:center;font-size:8px;line-height:1.1}
td.mk{width:30px;max-width:30px;padding:2px 0;text-align:center;font-weight:700}td.mk.P{color:#fff;background:#23964f!important}td.mk.A{color:#d9533c;background:#fce9e4!important}
tr.grp td{background:#1a2e14!important;color:#fff;font-weight:800;font-size:10px;padding:4px 8px}
tr{break-inside:avoid}thead{display:table-header-group}.foot{font-size:9px;color:#5d6a57;margin-top:10px}.bar{position:sticky;top:0;background:#fff;padding:8px 0;display:flex;gap:8px}
h2 .cp{font:inherit;font-size:10px;font-weight:700;border:1px solid #c9d9b6;background:#fff;border-radius:8px;padding:2px 8px;margin-left:8px;cursor:pointer}@media print{h2 .cp{display:none}}.bar button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:10px 16px;background:#8dc63f;cursor:pointer}@media print{.bar{display:none}body{padding:0}}</style></head>
<body><div class="bar"><button onclick="print()">Save as PDF / Print</button><button onclick="close()" style="background:#eef2e8">Close</button></div>
<header><h1>${esc(rep.title)}</h1><div class="sub">${esc(rep.sub)}</div></header><div class="band"></div>${rep.sheets.map(table).join('')}
<p class="foot">Generated ${new Date().toLocaleString('en-GB')} · Gaius attendance app</p>
<script>function cp(b){navigator.clipboard.writeText(b.parentNode.nextElementSibling.value).then(()=>{b.textContent='Copied ✓'})}</script></body></html>`);
  w.document.close();
}

/* tab-separated text: pastes straight into Excel, Google Sheets or a Telegram message */
export function tableText(sh) {
  const rows = [sh.head, ...sh.body.map((r) => (Array.isArray(r) ? r.map((v) => (v === 'P' ? '✓' : v === 'A' ? '✕' : v)) : [r.group]))];
  return rows.map((r) => r.map((v) => String(v ?? '').replace(/\t|\n/g, ' ')).join('\t')).join('\n');
}

/* time with Gaius: from the first Sunday if we have it, otherwise from the "Years of stay (Apr 2026 list)" note,
   moved forward to today so it never goes stale */
const STAY_RE = /Years of stay \(Apr 2026 list\):\s*([^\n;]+)/i;
export function stayMonths(p, today = new Date()) {
  const now = today.getFullYear() * 12 + today.getMonth() + today.getDate() / 31;
  const m = (p.notes || '').match(STAY_RE);
  let fromNote = null;
  if (m) {
    const t = m[1].toLowerCase().replace('½', ' 1/2');
    const num = (x) => x.split(/\s+/).reduce((n, w) => n + (w.includes('/') ? Number(w.split('/')[0]) / Number(w.split('/')[1]) : Number(w) || 0), 0);
    const y = t.match(/([\d\s/]+)\s*y/), mo = t.match(/([\d\s/]+)\s*mo/), wk = t.match(/([\d\s/]+)\s*w/);
    const months = y ? num(y[1].trim()) * 12 : mo ? num(mo[1].trim()) : wk ? num(wk[1].trim()) / 4.3 : null;
    if (months != null) fromNote = months + (now - (2026 * 12 + 3 + 15 / 31)); // list was made mid-April 2026
  }
  const j = p.week_joined ? new Date(p.week_joined + 'T00:00:00') : null;
  const fromJoin = j ? now - (j.getFullYear() * 12 + j.getMonth() + j.getDate() / 31) : null;
  return fromJoin != null && (fromNote == null || fromJoin >= fromNote - 1) ? fromJoin : fromNote;
}
export function stayText(p) {
  const m = stayMonths(p);
  if (m == null) return '';
  const y = Math.floor(m / 12), mo = Math.floor(m % 12);
  return y ? `${y} yr${y > 1 ? 's' : ''}${mo ? ` ${mo} mo` : ''}` : mo ? `${mo} month${mo > 1 ? 's' : ''}` : 'under a month';
}
export const notesWithoutStay = (n) => (n || '').replace(STAY_RE, '').replace(/^\s*[;\n]\s*|\s*[;\n]\s*$/g, '').trim();
export const stayNote = (n) => (n || '').match(STAY_RE)?.[0] || '';
