import { indexAttendance, weekSummary } from './stats';
import { latestSunday } from './ethiopian';

/* everything the app shows is for one center; HQ roles can switch center (or see all centers on the Centers page) */
export function scopeToCenter(R, cid) {
  const inC = (x) => (x.center_id ?? 1) === cid;
  const people = R.people.filter(inC);
  const pid = new Set(people.map((p) => p.id));
  const departments = R.departments.filter(inC);
  const did = new Set(departments.map((d) => d.id));
  const plans = (R.plans || []).filter(inC);
  const planIds = new Set(plans.map((p) => p.id));
  return {
    ...R, all: R, people,
    att: R.att.filter((r) => pid.has(r.person_id)),
    programs: R.programs.filter(inC), departments,
    members: R.members.filter((m) => did.has(m.department_id)),
    assignments: R.assignments.filter((a) => pid.has(a.person_id)), history: R.history.filter((h) => pid.has(h.person_id)),
    center: R.centers.find((c) => c.id === cid) || R.centers[0] || null,
    evals: (R.evals || []).filter(inC), meetings: (R.meetings || []).filter(inC), agenda: (R.agenda || []).filter(inC),
    plans, items: (R.items || []).filter((i) => planIds.has(i.plan_id)), plessons: (R.plessons || []).filter((x) => pid.has(x.person_id)),
    lessonTopics: (R.lessonTopics || []).filter(inC),
    reconcile: (R.reconcile || []).filter(inC), assets: (R.assets || []).filter(inC), ledger: (R.ledger || []).filter(inC),
    messages: (R.messages || []).filter((m) => m.center_id == null || m.center_id === cid),
  };
}

/* everything one center's pages need, without hooks – the HQ side builds this for every center at once */
export function centerCtx(R, cid, today) {
  const D = scopeToCenter(R, cid);
  const idx = indexAttendance(D.att);
  const past = idx.held.filter((s) => s <= today);
  const latest = past[past.length - 1] || latestSunday();
  const progBy = Object.fromEntries(D.programs.map((p) => [p.sunday, p]));
  const personBy = Object.fromEntries(D.people.map((p) => [p.id, p]));
  const summaries = Object.fromEntries(idx.held.map((s) => [s, weekSummary(idx.bySunday[s])]));
  const calInfo = (s) => ({ rate: summaries[s]?.rate, present: summaries[s]?.present, program: progBy[s]?.kind });
  const rosterFor = (s) => (idx.bySunday[s] || []).filter((r) => personBy[r.person_id]).map((r) => ({ p: personBy[r.person_id], r }));
  return { D, idx, latest, progBy, personBy, summaries, calInfo, rosterFor };
}
