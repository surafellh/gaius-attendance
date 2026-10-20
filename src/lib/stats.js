// Attendance rules for Gaius Gerji
// • Every Sunday stores a snapshot of each person's group and (for new comers) active flag,
//   so old percentages never change when someone's status changes later.
// • Headline = TOTAL PRESENT (everyone who came).
// • Rate only where we have a fixed list: leaders + members ("core rate"). Informal members and new comers are counted, not rated.
// • Follow-up lists (calls) cover leaders, members, active informal members and active new comers.
// • New comers: active from their first visit; 4 absences in a row → inactive; 3 Sundays in a row → active again.
// • Promising new comer: ≥50% of Sundays since joining AND at least one 4-in-a-row streak.

export const CATEGORIES = ['Leader', 'Senior Leader', 'Member', 'Active Informal Member', 'Inactive Informal Member', 'New Comer'];
export const CORE = ['Leader', 'Member'];
export const FOLLOWED = ['Leader', 'Member', 'Active Informal Member'];
export const FOLLOW_GROUPS = ['Leader', 'Member', 'Active Informal Member', 'Active New Comer'];
export const SHORT = {
  'Leader': 'Leaders', 'Senior Leader': 'Senior leaders', 'Member': 'Members',
  'Active Informal Member': 'Active informal', 'Inactive Informal Member': 'Inactive informal',
  'New Comer': 'New comers', 'Active New Comer': 'Active new comers', 'Inactive New Comer': 'Inactive new comers',
};
export const ONE = {
  'Leader': 'Leader', 'Senior Leader': 'Senior leader', 'Member': 'Member', 'Active Informal Member': 'Active informal',
  'Inactive Informal Member': 'Inactive informal', 'New Comer': 'New comer',
};
export const AM = {
  'Leader': 'መሪዎች', 'Senior Leader': 'ከፍተኛ መሪዎች', 'Member': 'አባላት', 'Active Informal Member': 'ንቁ መደበኛ ያልሆኑ',
  'Inactive Informal Member': 'ንቁ ያልሆኑ', 'New Comer': 'አዲስ መጪዎች', 'Active New Comer': 'ንቁ አዲስ መጪዎች',
};

/* followed = on the follow-up lists; inRate = part of the core rate */
export const counts = (r) => r && (FOLLOWED.includes(r.category) || (r.category === 'New Comer' && r.active));
export const inRate = (r) => r && CORE.includes(r.category);
export const groupOfRow = (r) => (r.category === 'New Comer' ? (r.active ? 'Active New Comer' : 'Inactive New Comer') : r.category);
export const pct = (v) => (v == null || Number.isNaN(v) ? '–' : `${Math.round(v * 100)}%`);

/* index attendance rows: bySunday[sunday] = rows[], byPerson[id] = { sunday: row } */
export function indexAttendance(rows) {
  const bySunday = {}, byPerson = {};
  for (const r of rows) {
    (bySunday[r.sunday] ||= []).push(r);
    (byPerson[r.person_id] ||= {})[r.sunday] = r;
  }
  const held = Object.keys(bySunday).filter((s) => bySunday[s].some((r) => r.status === 'Present')).sort();
  return { bySunday, byPerson, held, heldSet: new Set(held) };
}

/* new comer state machine: is the person active on Sunday `s` (decided from Sundays before it)? */
export function activeOn(personMarks = {}, held, s) {
  let state = null, ab = 0, pr = 0;
  for (const d of held) {
    if (d >= s) break;
    const st = personMarks[d]?.status;
    if (!st) continue;
    if (state === null) { if (st === 'Present') state = true; continue; }
    if (state) { ab = st === 'Absent' ? ab + 1 : 0; if (ab >= 4) { state = false; pr = 0; } }
    else { pr = st === 'Present' ? pr + 1 : 0; if (pr >= 3) { state = true; ab = 0; } }
  }
  if (state === null) return !Object.keys(personMarks).some((d) => d < s); // brand-new = active; never came = not
  return state;
}

/* one Sunday summary: total present (everyone) and the core rate (leaders + members) */
export function weekSummary(rows = []) {
  const byCat = {};
  for (const c of [...CATEGORIES, 'Active New Comer']) byCat[c] = { total: 0, present: 0 };
  let present = 0, counted = 0, countedPresent = 0;
  for (const r of rows) {
    const p = r.status === 'Present';
    if (p) present++;
    if (byCat[r.category]) { byCat[r.category].total++; if (p) byCat[r.category].present++; }
    if (r.category === 'New Comer' && r.active) { byCat['Active New Comer'].total++; if (p) byCat['Active New Comer'].present++; }
    if (inRate(r)) { counted++; if (p) countedPresent++; }
  }
  const m = byCat['Member'], l = byCat['Leader'];
  return {
    present, counted, countedPresent, rate: counted ? countedPresent / counted : null,
    memberRate: m.total ? m.present / m.total : null, leaderRate: l.total ? l.present / l.total : null, byCat,
    newComers: byCat['New Comer'].present, informal: byCat['Active Informal Member'].present + byCat['Inactive Informal Member'].present,
  };
}

/* per-person follow-up facts as of Sunday `s` */
export function personFacts(p, marks = {}, held, s, semesterStart) {
  const upto = held.filter((d) => d <= s);
  const mine = upto.filter((d) => marks[d]?.status);
  // absent streak ending at s
  let streak = 0;
  for (let i = upto.length - 1; i >= 0; i--) { if (marks[upto[i]]?.status === 'Absent') streak++; else break; }
  // consistent: 4+ present in a row before s
  let run = 0, best = 0, bestBefore = 0;
  for (const d of upto) {
    run = marks[d]?.status === 'Present' ? run + 1 : 0;
    best = Math.max(best, run);
    if (d < s) bestBefore = Math.max(bestBefore, run);
  }
  const sem = upto.filter((d) => !semesterStart || d >= semesterStart);
  const semPresent = sem.filter((d) => marks[d]?.status === 'Present').length;
  const semHeld = sem.filter((d) => marks[d]?.status).length || sem.length;
  const join = p.week_joined || mine[0];
  const since = join ? upto.filter((d) => d >= join) : [];
  const sincePresent = since.filter((d) => marks[d]?.status === 'Present').length;
  const prev = upto[upto.length - 2];
  const firstPresent = upto.find((d) => marks[d]?.status === 'Present');
  return {
    thisWeek: marks[s]?.status, lastWeek: prev ? marks[prev]?.status : undefined,
    streak, consistent: bestBefore >= 4, bestRun: best,
    semPresent, semRate: sem.length ? semPresent / (semHeld || 1) : null,
    sinceRate: since.length ? sincePresent / since.length : null, sinceCount: since.length, visits: upto.filter((d) => marks[d]?.status === 'Present').length,
    lastSeen: [...upto].reverse().find((d) => marks[d]?.status === 'Present'),
    firstPresent,
    promising: p.category === 'New Comer' && since.length >= 4 && sincePresent / since.length >= 0.5 && best >= 4,
  };
}

const DAY = 86400000;
const shift = (d, days) => new Date(Date.parse(d + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
export const SIX_MONTHS = 182;

/* Membership readiness for a new comer, as of Sunday s – two views:
   • since joining: Sundays they came ÷ Sundays held since their first visit (weekly follow-up; last semester doesn't matter)
   • review: Sundays they came ÷ every Sunday held in the review period from its first Sunday (a later joiner counts the
     weeks before joining as missed), so people who came at the very end can't outrank those who came all semester.
   Ready = 6 months since the first visit AND at least READY_RATE since joining. Leaders still decide. */
export const READY_RATE = 0.7;
export function readiness(p, marks = {}, held, s, periodStart) {
  const first = p.week_joined || held.find((d) => marks[d]?.status === 'Present');
  const sinceFirst = first ? held.filter((d) => d >= first && d <= s) : [];
  const sincePresent = sinceFirst.filter((d) => marks[d]?.status === 'Present').length;
  const period = periodStart ? held.filter((d) => d >= periodStart && d <= s) : [];
  const periodPresent = period.filter((d) => marks[d]?.status === 'Present').length;
  const sixEnd = first ? shift(first, SIX_MONTHS) : null;
  const sixDone = !!first && sixEnd <= s;
  const sinceRate = sinceFirst.length ? sincePresent / sinceFirst.length : null;
  return {
    first, weeksIn: sinceFirst.length, sincePresent, sinceRate, sixEnd, sixDone,
    periodPresent, periodHeld: period.length, periodRate: period.length ? periodPresent / period.length : null,
    ready: sixDone && sinceRate != null && sinceRate >= READY_RATE,
    // kept for older callers
    score: sinceRate, present: sincePresent, possible: sinceFirst.length,
  };
}

/* Leadership path: Member → candidate (still a member) → potential leader (joins the leadership team, group = Leader) → leader.
   Leaders can also join directly when HQ or Pastor Fitsum assigns them. */
export const stageOf = (p) => p?.leader_stage || (p?.potential_leader ? 'potential' : null);
export const STAGE_LABEL = { candidate: 'Leadership candidate', potential: 'Potential leader' };
export const JOIN_WAYS = ['Grew through the leadership path', 'Assigned by HQ', 'Appointed by Pastor Fitsum'];
