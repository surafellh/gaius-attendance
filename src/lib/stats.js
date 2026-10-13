// Attendance calculations – mirror the Google Sheet's Calc / Follow-up logic
export const CATEGORIES = ['Leader','Senior Leader','Member','Active Informal Member','Inactive Informal Member','New Comer'];
export const FOLLOW_GROUPS = ['Leader','Senior Leader','Member','Active Informal Member','Active New Comer'];
export const SHORT = {
  'Leader': 'Leaders', 'Senior Leader': 'Senior Leaders', 'Member': 'Members',
  'Active Informal Member': 'Active Informal', 'Inactive Informal Member': 'Inactive Informal',
  'New Comer': 'New Comers', 'Active New Comer': 'Active New Comers',
};

// category of a person for a semester: that semester's status, else the latest earlier one
export function categoryFor(personId, semester, statuses, semesterOrder) {
  const own = statuses.filter((s) => s.person_id === personId);
  const exact = own.find((s) => s.semester === semester);
  if (exact) return exact.category;
  const idx = semesterOrder.indexOf(semester);
  const earlier = own
    .filter((s) => semesterOrder.indexOf(s.semester) <= idx)
    .sort((a, b) => semesterOrder.indexOf(b.semester) - semesterOrder.indexOf(a.semester));
  return earlier[0]?.category || null;
}

export function groupOf(person) {
  if (person.category === 'New Comer') return person.nc_active ? 'Active New Comer' : null;
  return FOLLOW_GROUPS.includes(person.category) ? person.category : null;
}

/**
 * people: [{id,name,category,nc_active,week_joined,responsible}]
 * mark(personId, sunday) -> 'Present' | 'Absent' | undefined
 * sundays: semester sundays (ISO), allSundays: previous + current (ISO, ascending)
 */
export function buildStats({ people, sundays, allSundays, mark, weekIdx }) {
  const presentCount = (s) => people.reduce((n, p) => n + (mark(p.id, s) === 'Present' ? 1 : 0), 0);
  const heldSet = new Set(allSundays.filter((s) => presentCount(s) > 0));
  const held = sundays.filter((s) => heldSet.has(s));
  const lastHeldIdx = sundays.reduce((m, s, i) => (heldSet.has(s) ? i : m), -1);
  const w = weekIdx ?? lastHeldIdx;
  const thisWeek = w >= 0 ? sundays[w] : null;
  const lastWeek = w >= 1 ? sundays[w - 1] : null;
  const heldToW = sundays.filter((s, i) => i <= w && heldSet.has(s));

  const rows = people.map((p) => {
    const present = heldToW.filter((s) => mark(p.id, s) === 'Present').length;
    // absent streak ending this week
    let streak = 0;
    for (let i = w; i >= 0; i--) { if (mark(p.id, sundays[i]) === 'Absent') streak++; else break; }
    // consistent = 4+ Present in a row at some point before this week (incl. previous semester)
    const before = allSundays.filter((s) => thisWeek && s < thisWeek && heldSet.has(s));
    let run = 0, best = 0;
    for (const s of before) { run = mark(p.id, s) === 'Present' ? run + 1 : 0; best = Math.max(best, run); }
    // 6-month score since joining (182 days, across semesters)
    // no recorded join week (existing people): count from their first Sunday with any mark
    const join = p.week_joined || allSundays.find((x) => heldSet.has(x) && mark(p.id, x)) || allSundays[0];
    const end = new Date(Date.parse(join) + 182 * 86400000).toISOString().slice(0, 10);
    const win = allSundays.filter((s) => heldSet.has(s) && s >= join && s < end && (!thisWeek || s <= thisWeek));
    const sixPresent = win.filter((s) => mark(p.id, s) === 'Present').length;
    return {
      ...p,
      group: groupOf(p),
      present,
      pct: heldToW.length ? present / heldToW.length : null,
      thisWeek: thisWeek ? mark(p.id, thisWeek) : undefined,
      lastWeek: lastWeek ? mark(p.id, lastWeek) : undefined,
      streak,
      consistent: best >= 4,
      sixPct: win.length ? sixPresent / win.length : null,
    };
  });

  return { rows, held, heldSet, w, thisWeek, lastWeek, heldToW: heldToW.length };
}

export function weeklyByCategory({ people, sundays, mark, heldSet }) {
  return sundays.map((s) => {
    const row = { sunday: s, held: heldSet.has(s), total: 0, newcomers: 0 };
    for (const c of CATEGORIES) row[c] = 0;
    for (const p of people) {
      if (mark(p.id, s) === 'Present' && p.category) { row[p.category]++; row.total++; }
    }
    row.firstTimers = people.filter((p) => p.week_joined === s).length;
    return row;
  });
}

export const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
