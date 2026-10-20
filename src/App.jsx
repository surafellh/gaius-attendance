import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, fetchAll } from './lib/supabase';
import { latestSunday, todayIso, semesterOf, semesterStart } from './lib/ethiopian';
import { indexAttendance, activeOn, weekSummary } from './lib/stats';
import { can, roleName } from './lib/roles';
import Dashboard from './views/Dashboard';
import Attendance from './views/Attendance';
import FollowUp from './views/FollowUp';
import People from './views/People';
import AccountPanel, { loadPrefs, applyPrefs } from './views/Account';
import Departments from './views/Departments';
import Users from './views/Users';
import Auth from './views/Auth';
import Meeting from './views/Meeting';
import CalendarPage from './views/CalendarPage';
import Leadership from './views/Leadership';
import ExportSheet from './views/ExportSheet';
import PlansPage from './views/Plans';
import Roadmap from './views/Roadmap';
import PersonSheet from './views/Person';
import { Icon, Mark, Sheet } from './views/common';

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(undefined);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setProfile(undefined); return; }
    supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile(data || null));
  }, [session]);

  if (!ready) return <div className="center muted">Loading…</div>;
  if (recovery) return <Auth recovery onRecovered={() => setTimeout(() => setRecovery(false), 1200)} />;
  if (!session) return <Auth />;
  if (profile === undefined) return <div className="center muted">Loading…</div>;
  if (!profile || !can(profile).read) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="brand"><Mark /><div><div className="brand-name">{profile?.role === 'former' ? 'Access closed' : 'Waiting for approval'}</div></div></div>
          <p className="muted">
            {profile?.role === 'former'
              ? 'Thank you for serving. Your account no longer has access; your records are kept.'
              : `Your account (${session.user.email}) is ready. The center leader or admin needs to approve it before you can see attendance.`}
          </p>
          <button className="btn ghost wide" style={{ marginTop: 18 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }
  return <Main profile={profile} />;
}

/* Tab groups: Home · Follow-up (people) · Coordination (programs & plans) · Admin */
const GROUPS = [
  ['home', 'Home', Icon.home, [['home', 'Dashboard']]],
  ['follow', 'Follow-up', Icon.people, [['attendance', 'Attendance'], ['people', 'People'], ['calls', 'Calls'], ['leadership', 'Leadership'], ['roadmap', 'Roadmap']]],
  ['coord', 'Coordination', Icon.cal, [['calendar', 'Calendar'], ['plans', 'Plans & budget'], ['meeting', 'Meetings'], ['departments', 'Departments']]],
  ['admin', 'Admin', Icon.shield, [['users', 'Users & access']], 'users'],
];
const groupOf = (tab) => GROUPS.find((g) => g[3].some(([k]) => k === tab)) || GROUPS[0];

function Main({ profile }) {
  const perm = can(profile);
  const [tab, setTab] = useState(() => { const p = loadPrefs(); applyPrefs(p); return p.start || 'home'; });
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [D, setD] = useState({ people: [], att: [], programs: [], departments: [], members: [], assignments: [], history: [], center: null, criteria: [], evals: [], events: [], meetings: [], agenda: [], plan: [], p2: true, plans: [], items: [], lessons: [], plessons: [], r2: true });
  const [personId, setPersonId] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [week, setWeek] = useState(null); // selected Sunday shared by dashboard & follow-up (null = latest)

  const load = useCallback(async () => {
    setError('');
    try {
      const q = (t, cols = '*') => fetchAll(() => supabase.from(t).select(cols));
      const [people, att, programs, departments, members, assignments, history, centers] = await Promise.all([
        q('people'), q('attendance', 'person_id,sunday,status,called,reason,category,active'), q('programs'), q('departments'),
        q('department_members'), q('assignments'), q('category_history'), q('centers'),
      ]);
      const center = centers.find((c) => c.id === (profile.center_id || 1)) || centers[0];
      // Phase 2 tables: the app still works if their SQL has not been run yet
      let p2 = { criteria: [], evals: [], events: [], meetings: [], agenda: [], plan: [], p2: true };
      try {
        const [criteria, evals, events, meetings, agenda, plan] = await Promise.all([
          q('eval_criteria'), q('evaluations'), q('events'), q('meetings'), q('agenda_items'), q('teaching_plan')]);
        p2 = { criteria: criteria.sort((a, b) => a.sort - b.sort || a.id - b.id), evals, events, meetings, agenda, plan, p2: true };
      } catch { p2.p2 = false; }
      // Release 2 tables: plans and the teaching roadmap
      try {
        const [plans, items, lessons, plessons] = await Promise.all([q('plans'), q('plan_items'), q('lessons'), q('person_lessons')]);
        Object.assign(p2, { plans: plans.sort((a, b) => a.sort - b.sort || a.id - b.id), items, lessons: lessons.sort((a, b) => a.sort - b.sort || a.id - b.id), plessons, r2: true });
      } catch { Object.assign(p2, { plans: [], items: [], lessons: [], plessons: [], r2: false }); }
      setD({
        people: people.filter((p) => (p.center_id || 1) === center?.id).sort((a, b) => (a.sn ?? 1e9) - (b.sn ?? 1e9)),
        att, programs, departments: departments.sort((a, b) => a.sort - b.sort), members, assignments, history, center, ...p2,
      });
    } catch (e) {
      setError(`Couldn't load data: ${e.message}. If this is the first time after the update, run the v2 SQL in Supabase.`);
    }
    setLoading(false);
  }, [profile.center_id]);
  useEffect(() => { load(); }, [load]);

  const idx = useMemo(() => indexAttendance(D.att), [D.att]);
  const today = todayIso();
  const latest = useMemo(() => {
    const past = idx.held.filter((s) => s <= today);
    return past[past.length - 1] || latestSunday();
  }, [idx, today]);
  const progBy = useMemo(() => Object.fromEntries(D.programs.map((p) => [p.sunday, p])), [D.programs]);
  const personBy = useMemo(() => Object.fromEntries(D.people.map((p) => [p.id, p])), [D.people]);
  const summaries = useMemo(() => Object.fromEntries(idx.held.map((s) => [s, weekSummary(idx.bySunday[s])])), [idx]);
  const calInfo = useCallback((s) => ({ rate: summaries[s]?.rate, present: summaries[s]?.present, program: progBy[s]?.kind }), [summaries, progBy]);

  /* who is on the list for Sunday s: recorded rows, or (not started yet) everyone eligible */
  const rosterFor = useCallback((s) => {
    const rows = idx.bySunday[s];
    if (rows?.length) {
      const have = new Set(rows.map((r) => r.person_id));
      const extra = D.people.filter((p) => !have.has(p.id) && !p.archived && p.category && p.week_joined === s);
      return [
        ...rows.filter((r) => personBy[r.person_id]).map((r) => ({ p: personBy[r.person_id], r })),
        ...extra.map((p) => ({ p, r: { person_id: p.id, sunday: s, category: p.category, active: true, status: null, virtual: true } })),
      ];
    }
    return D.people
      .filter((p) => !p.archived && p.category && (!p.week_joined || p.week_joined <= s))
      .map((p) => ({ p, r: { person_id: p.id, sunday: s, category: p.category, active: p.category === 'New Comer' ? activeOn(idx.byPerson[p.id], idx.held, s) : true, status: null, virtual: true } }));
  }, [idx, D.people, personBy]);

  const patchLocal = (rows) => setD((d) => {
    const key = (r) => `${r.person_id}|${r.sunday}`;
    const m = new Map(d.att.map((r) => [key(r), r]));
    for (const r of rows) m.set(key(r), { ...m.get(key(r)), ...r });
    return { ...d, att: [...m.values()] };
  });

  async function createRoll(s) {
    if (idx.bySunday[s]?.length) return true;
    const rows = rosterFor(s).map(({ r }) => ({
      person_id: r.person_id, sunday: s, category: r.category, active: r.active,
      status: r.category === 'New Comer' && !r.active ? 'Absent' : null,
    }));
    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'person_id,sunday', ignoreDuplicates: true });
    if (error) { setError(`Not saved: ${error.message}`); return false; }
    patchLocal(rows);
    return true;
  }

  async function saveMark(personId, s, patch) {
    if (!perm.mark) return;
    if (!idx.bySunday[s]?.length && !(await createRoll(s))) return;
    const prev = idx.byPerson[personId]?.[s];
    const p = personBy[personId];
    const row = {
      person_id: personId, sunday: s,
      category: prev?.category || p.category,
      active: prev?.active ?? (p.category === 'New Comer' ? activeOn(idx.byPerson[personId], idx.held, s) : true),
      status: prev?.status ?? null, called: prev?.called ?? false, reason: prev?.reason ?? null, ...patch,
    };
    patchLocal([row]);
    const { error } = await supabase.from('attendance').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'person_id,sunday' });
    if (error) { setError(`Not saved: ${error.message}`); load(); }
  }

  /* save many marks at once (Attendance page Save button) */
  async function saveMarks(list) {
    if (!perm.mark || !list.length) return true;
    for (const s of [...new Set(list.map((x) => x.sunday))]) if (!idx.bySunday[s]?.length && !(await createRoll(s))) return false;
    const rows = list.map(({ personId, sunday, status }) => {
      const prev = idx.byPerson[personId]?.[sunday];
      const p = personBy[personId];
      return {
        person_id: personId, sunday, status,
        category: prev?.category || p.category,
        active: prev?.active ?? (p.category === 'New Comer' ? activeOn(idx.byPerson[personId], idx.held, sunday) : true),
        called: prev?.called ?? false, reason: prev?.reason ?? null, updated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'person_id,sunday' });
    if (error) { setError(`Not saved: ${error.message}`); return false; }
    patchLocal(rows);
    return true;
  }

  async function saveProgram(s, fields) {
    const row = { center_id: D.center?.id || 1, sunday: s, ...fields, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('programs').upsert(row, { onConflict: 'center_id,sunday' });
    if (error) return setError(`Program not saved: ${error.message}`);
    setD((d) => ({ ...d, programs: [...d.programs.filter((p) => p.sunday !== s), row] }));
  }

  const ctx = {
    profile, perm, D, idx, latest, today, progBy, personBy, summaries, calInfo, rosterFor,
    saveMark, saveMarks, saveProgram, createRoll, reload: load, setError, openPerson: setPersonId, week, setWeek, openExport: (o) => setExporting(o || {}),
    semester: semesterOf(latest), semStart: semesterStart(semesterOf(latest)), go: (k) => goTab({ follow: 'calls', register: 'people', profiles: 'people' }[k] || k),
  };

  const alerts = useMemo(() => {
    const rows = idx.bySunday[latest] || [];
    return rows.filter((r) => r.status === 'Absent' && personBy[r.person_id] && r.category !== 'Inactive Informal Member' && !(r.category === 'New Comer' && !r.active)
      && idx.byPerson[r.person_id]?.[idx.held[idx.held.indexOf(latest) - 1]]?.status === 'Present').length;
  }, [idx, latest, personBy]);

  const groups = GROUPS.filter((g) => !g[4] || perm[g[4]]);
  const cur = groupOf(tab);
  const lastTab = useMemo(() => ({}), []);
  const goTab = (k) => { lastTab[groupOf(k)[0]] = k; setTab(k); window.scrollTo(0, 0); };
  const initials = (profile.full_name || profile.email || '?').trim()[0].toUpperCase();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Mark />
            <div>
              <div className="brand-name">Gaius {D.center?.name || ''}</div>
              <div className="brand-sub">{D.center?.name_am ? <span className="am">{D.center.name_am} · </span> : null}{profile.title || roleName(profile.role)}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="top-btn" onClick={() => setExporting({})} aria-label="Export a report"><Icon.download /><span className="desk-only">Export</span></button>
            <button className="avatar" onClick={() => setMenu(true)} aria-label="Account and settings">{initials}</button>
          </div>
        </div>
      </header>
      <nav className="nav" aria-label="Sections">
        {groups.map(([k, l, Ico, tabs]) => (
          <button key={k} className={cur[0] === k ? 'on' : ''} aria-current={cur[0] === k ? 'page' : undefined}
            onClick={() => goTab(lastTab[k] || tabs[0][0])}>
            <Ico />{l}{k === 'follow' && alerts ? <span className="badge">{alerts}</span> : null}
          </button>
        ))}
      </nav>
      {cur[3].length > 1 && (
        <div className="subnav" role="tablist" aria-label={cur[1]}>
          <div className="subnav-inner">
            {cur[3].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => goTab(k)}>
                {l}{k === 'calls' && alerts ? <span className="badge">{alerts}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}
      <main>
        {error && <div className="banner err" style={{ marginBottom: 12 }}>{error}</div>}
        {loading ? <div className="center muted">Loading Gaius {D.center?.name || ''}…</div> : (
          <>
            {tab === 'home' && <Dashboard {...ctx} />}
            {tab === 'attendance' && <Attendance {...ctx} />}
            {tab === 'calls' && <FollowUp {...ctx} />}
            {tab === 'people' && <People {...ctx} />}
            {tab === 'departments' && <Departments {...ctx} />}
            {tab === 'users' && <Users {...ctx} />}
            {tab === 'meeting' && <Meeting {...ctx} />}
            {tab === 'calendar' && <CalendarPage {...ctx} />}
            {tab === 'leadership' && <Leadership {...ctx} />}
            {tab === 'plans' && <PlansPage {...ctx} />}
            {tab === 'roadmap' && <Roadmap {...ctx} />}
            {['plans', 'roadmap', 'calendar'].includes(tab) && !D.r2 && <div className="banner err">Plans and the roadmap need the release 2 SQL to be run in Supabase once.</div>}
            {['meeting', 'calendar', 'leadership'].includes(tab) && !D.p2 && <div className="banner err">This part needs the Phase 2 SQL (v3_schema.sql) to be run in Supabase once.</div>}
          </>
        )}
      </main>

      {exporting && <ExportSheet ctx={ctx} initial={exporting} onClose={() => setExporting(null)} />}
      {personId && personBy[personId] && <PersonSheet {...ctx} person={personBy[personId]} onClose={() => setPersonId(null)} />}
      {menu && (
        <Sheet title="Account" onClose={() => setMenu(false)}>
          <AccountPanel profile={profile} perm={perm} onExport={() => { setMenu(false); setExporting({}); }} go={(k) => { setMenu(false); goTab(k); }} />
        </Sheet>
      )}
    </div>
  );
}
