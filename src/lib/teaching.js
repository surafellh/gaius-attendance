// Teaching plan (by HQ / by the center), first teaching, and which roadmap lessons each person took.
import { etNewYear, toEthiopian, iso } from './ethiopian.js';

export const norm = (t) => (t || '').toLowerCase().replace(/[\s.,:;'"“”‘’!?()–—-]+/g, '');
export const sameTopic = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x)))); };

const srcOf = (r) => r.source || (r.center_id == null ? 'hq' : 'center');

/* per Sunday: HQ's plan for this center (a center-specific HQ row wins over an all-centers row) and the center's own */
export function planMaps(plan, cid) {
  const hq = new Map(), own = new Map();
  for (const r of plan) if (srcOf(r) === 'hq' && r.center_id == null) hq.set(r.sunday, r);
  for (const r of plan) if (srcOf(r) === 'hq' && r.center_id === cid) hq.set(r.sunday, r);
  for (const r of plan) if (srcOf(r) === 'center' && r.center_id === cid) own.set(r.sunday, r);
  return { hq, own };
}

/* ── dates typed in a sheet: "ጥቅምት 15", "Tikimt 15", "15 Tikimt", 2026-10-25, 25/10/2026, or an Excel date ───── */
const MONTHS = [
  ['መስከረም', 'meskerem', 'mes'], ['ጥቅምት', 'tikimt', 'tikemt', 'tik'], ['ኅዳር', 'ህዳር', 'hidar', 'hid'], ['ታኅሣሥ', 'ታህሳስ', 'ታሕሳስ', 'tahsas', 'tahesas', 'tah'],
  ['ጥር', 'tir'], ['የካቲት', 'yekatit', 'yek'], ['መጋቢት', 'megabit', 'meg'], ['ሚያዝያ', 'ሚያዚያ', 'miyazya', 'miyazia', 'miy'], ['ግንቦት', 'ginbot', 'gin'],
  ['ሰኔ', 'sene'], ['ሐምሌ', 'ሀምሌ', 'hamle', 'ham'], ['ነሐሴ', 'ነሀሴ', 'nehase', 'neh'], ['ጳጉሜ', 'ጳጉሜን', 'ጷጉሜ', 'ጷጉሜን', 'pagume', 'pag'],
];
export const etMonthIndex = (w) => MONTHS.findIndex((v) => v.some((n) => n === String(w).trim().toLowerCase()));
export function etDate(year, month, day) { return iso(etNewYear(year) + (month * 30 + day - 1) * 86400000); }

/* returns an ISO date or null. Ethiopian dates without a year use `year`. */
export function parseAnyDate(v, year) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v)) return iso(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === 'number' && v > 20000 && v < 80000) return iso(Date.UTC(1899, 11, 30) + v * 86400000); // Excel serial
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return iso(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^([^\d\s,]+)\s*(\d{1,2})(?:[,\s]+(\d{4}))?$/) || s.match(/^(\d{1,2})\s+([^\d\s,]+)(?:[,\s]+(\d{4}))?$/);
  if (m) {
    const [w, d] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    const mi = etMonthIndex(w);
    if (mi >= 0) return etDate(Number(m[3]) || year, mi, Number(d));
  }
  return null;
}
/* Ethiopian month names in a cell: "Tikimt, Hidar" → [1, 2] */
export function parseMonths(v) {
  return String(v || '').split(/[,;/]|\s+and\s+|\s+እና\s+/).map((x) => etMonthIndex(x.trim())).filter((i) => i >= 0);
}
export const yearOf = (d) => toEthiopian(d).year;

/* ── first teaching: from the Sunday someone joined, go forward to the first Sunday they were present
   that had a teaching (special programs, discussions, prayer… are skipped) ───────────────────── */
export function firstTeaching(p, D, idx) {
  const marks = idx.byPerson[p.id] || {};
  const progs = D.programs.filter((x) => x.kind === 'Teaching' && x.topic).map((x) => x.sunday).sort();
  const recorded = D.programs.map((x) => x.sunday).sort()[0];
  if (!recorded) return null;
  const joined = p.week_joined; // no first Sunday = they were here before the records began
  if (!joined || joined <= recorded) return { unknown: true, joined }; // joined before the program report started
  const s = progs.find((d) => d >= joined && marks[d]?.status === 'Present');
  if (!s) return { none: true, joined };
  const prog = D.programs.find((x) => x.sunday === s);
  return { sunday: s, topic: prog.topic, minister: prog.minister, joined };
}

/* ── roadmap: a lesson is taken when it was ticked, when the person was present on a Sunday whose topic
   is linked to the lesson, or when their first teaching is that lesson ─────────────────────── */
export function lessonIndex(D, lessons, idx, cid) {
  const links = (D.lessonTopics || []).filter((t) => t.center_id === cid);
  const topicsOf = new Map(lessons.map((l) => [l.id, links.filter((t) => t.lesson_id === l.id).map((t) => t.topic)]));
  const sundaysOf = new Map(lessons.map((l) => {
    const ts = topicsOf.get(l.id);
    return [l.id, D.programs.filter((x) => x.topic && ts.some((t) => norm(t) === norm(x.topic))).map((x) => x.sunday).sort()];
  }));
  const manual = new Map(D.plessons.map((x) => [`${x.person_id}|${x.lesson_id}`, x]));
  const names = (l) => [l.name, l.name_am, ...topicsOf.get(l.id)].filter(Boolean);
  return {
    topicsOf, sundaysOf, manual,
    took(p, l) {
      const k = `${p.id}|${l.id}`;
      if (manual.has(k)) return { how: 'ticked', on: manual.get(k).completed_on, x: manual.get(k) };
      const marks = idx.byPerson[p.id] || {};
      const s = sundaysOf.get(l.id).find((d) => marks[d]?.status === 'Present');
      if (s) return { how: 'attended', on: s };
      if (p.start_teaching && names(l).some((n) => sameTopic(n, p.start_teaching) || p.start_teaching.split(/[,،;/]/).some((t) => sameTopic(n, t)))) return { how: 'first', on: p.start_teaching_on };
      return null;
    },
  };
}

/* every program topic in the report, newest first, with how often and when it was given */
export function programTopics(D) {
  const m = new Map();
  for (const x of D.programs) {
    if (!x.topic || x.kind === 'No meeting') continue;
    const k = norm(x.topic);
    const e = m.get(k) || { topic: x.topic, kinds: new Set(), sundays: [] };
    e.kinds.add(x.kind || 'Program'); e.sundays.push(x.sunday);
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, kinds: [...e.kinds], sundays: e.sundays.sort() })).sort((a, b) => b.sundays[0].localeCompare(a.sundays[0]));
}
