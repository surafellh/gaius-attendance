import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, fetchAll } from './lib/supabase';
import { latestSunday, todayIso, semesterOf, semesterStart } from './lib/ethiopian';
import { indexAttendance, activeOn, weekSummary } from './lib/stats';
import { can, roleName } from './lib/roles';
import Dashboard from './views/Dashboard';
import Attendance from './views/Attendance';
import FollowUp from './views/FollowUp';
import Register from './views/Register';
import Profiles from './views/Profiles';
import Departments from './views/Departments';
import Users from './views/Users';
import Auth from './views/Auth';
import PersonSheet from './views/Person';
import { Icon, Mark, Sheet } from './views/common';

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) { setProfile(undefined); return; }
    supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile(data || null));
  }, [session]);

  if (!ready) return <div className="center muted">Loading…</div>;
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

const TABS = [
  ['home', 'Dashboard', Icon.home],
  ['attendance', 'Attendance', Icon.grid],
  ['follow', 'Follow-up', Icon.bell],
  ['register', 'People', Icon.people],
  ['profiles', 'Profiles', Icon.card, 'wide-only'],
  ['departments', 'Departments', Icon.layers, 'wide-only'],
  ['users', 'Users', Icon.shield, 'wide-only'],
];

function Main({ profile }) {
  const perm = can(profile);
  const [tab, setTab] = useState('home');
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [D, setD] = useState({ people: [], att: [], programs: [], departments: [], members: [], assignments: [], history: [], center: null });
  const [personId, setPersonId] = useState(null);
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
      setD({
        people: people.filter((p) => (p.center_id || 1) === center?.id).sort((a, b) => (a.sn ?? 1e9) - (b.sn ?? 1e9)),
        att, programs, departments: departments.sort((a, b) => a.sort - b.sort), members, assignments, history, center,
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

  async function saveProgram(s, fields) {
    const row = { center_id: D.center?.id || 1, sunday: s, ...fields, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('programs').upsert(row, { onConflict: 'center_id,sunday' });
    if (error) return setError(`Program not saved: ${error.message}`);
    setD((d) => ({ ...d, programs: [...d.programs.filter((p) => p.sunday !== s), row] }));
  }

  const ctx = {
    profile, perm, D, idx, latest, today, progBy, personBy, summaries, calInfo, rosterFor,
    saveMark, saveProgram, createRoll, reload: load, setError, openPerson: setPersonId, week, setWeek,
    semester: semesterOf(latest), semStart: semesterStart(semesterOf(latest)), go: setTab,
  };

  const alerts = useMemo(() => {
    const rows = idx.bySunday[latest] || [];
    return rows.filter((r) => r.status === 'Absent' && personBy[r.person_id] && r.category !== 'Inactive Informal Member' && !(r.category === 'New Comer' && !r.active)
      && idx.byPerson[r.person_id]?.[idx.held[idx.held.indexOf(latest) - 1]]?.status === 'Present').length;
  }, [idx, latest, personBy]);

  const tabs = TABS.filter(([k]) => k !== 'users' || perm.users);
  const initials = (profile.full_name || profile.email || '?').trim()[0].toUpperCase();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Mark />
            <div>
              <div className="brand-name">Gaius {D.center?.name || ''}</div>
              <div className="brand-sub">Sunday attendance & follow-up</div>
            </div>
          </div>
          <div className="row">
            {D.center && <span className="center-pill am">{D.center.name_am || D.center.name}</span>}
            <button className="avatar" onClick={() => setMenu(true)} aria-label="Account">{initials}</button>
          </div>
        </div>
      </header>
      <nav className="nav" aria-label="Sections">
        {tabs.map(([k, l, Ico, cls]) => (
          <button key={k} className={`${tab === k ? 'on' : ''} ${cls || ''}`} onClick={() => { setTab(k); window.scrollTo(0, 0); }} aria-current={tab === k ? 'page' : undefined}>
            <Ico />{l}{k === 'follow' && alerts ? <span className="badge">{alerts}</span> : null}
          </button>
        ))}
        <button className={`more-btn ${['profiles', 'departments', 'users'].includes(tab) ? 'on' : ''}`} onClick={() => setMore(true)}><Icon.more />More</button>
      </nav>
      <main>
        {error && <div className="banner err" style={{ marginBottom: 12 }}>{error}</div>}
        {loading ? <div className="center muted">Loading Gaius {D.center?.name || ''}…</div> : (
          <>
            {tab === 'home' && <Dashboard {...ctx} />}
            {tab === 'attendance' && <Attendance {...ctx} />}
            {tab === 'follow' && <FollowUp {...ctx} />}
            {tab === 'register' && <Register {...ctx} />}
            {tab === 'profiles' && <Profiles {...ctx} />}
            {tab === 'departments' && <Departments {...ctx} />}
            {tab === 'users' && <Users {...ctx} />}
          </>
        )}
      </main>

      {personId && personBy[personId] && <PersonSheet {...ctx} person={personBy[personId]} onClose={() => setPersonId(null)} />}
      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="page" style={{ gap: 8 }}>
            {[['profiles', 'Profiles', Icon.card, 'Members, leaders, potential leaders – HQ profile format'],
              ['departments', 'Departments', Icon.layers, 'Who leads and serves in each department'],
              ...(perm.users ? [['users', 'Users & settings', Icon.shield, 'Access levels, leaders’ meeting day']] : [])].map(([k, l, Ico, sub]) => (
              <button key={k} className="pcard" onClick={() => { setTab(k); setMore(false); window.scrollTo(0, 0); }}>
                <span className="icon-btn"><Ico /></span>
                <span className="pinfo"><span className="pname">{l}</span><span className="pmeta">{sub}</span></span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {menu && (
        <Sheet title="Account" onClose={() => setMenu(false)}>
          <p><b>{profile.full_name}</b></p>
          <p className="muted small" style={{ marginBottom: 16 }}>{profile.email} · {roleName(profile.role)}{profile.title ? ` · ${profile.title}` : ''}</p>
          <button className="btn ghost wide" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </Sheet>
      )}
    </div>
  );
}
