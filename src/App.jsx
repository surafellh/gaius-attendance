import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, fetchAll } from './lib/supabase';
import { sundaysOf, currentSemester, previousSemester, SEMESTERS } from './lib/ethiopian';
import { categoryFor, buildStats } from './lib/stats';
import MarkView from './views/Mark';
import FollowUp from './views/FollowUp';
import Dashboard from './views/Dashboard';
import People, { Editor } from './views/People';
import Users from './views/Users';
import Auth from './views/Auth';
import { Icon, Mark, PersonSheet, Sheet } from './views/common';

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
  if (!profile || profile.role === 'pending') {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="brand"><Mark /><div><div className="brand-name">Waiting for approval</div></div></div>
          <p className="muted">Your account ({session.user.email}) is ready. An admin needs to approve it before you can see attendance. Ask them to open the Users page.</p>
          <button className="btn ghost wide" style={{ marginTop: 18 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>
    );
  }
  return <Main profile={profile} />;
}

function Main({ profile }) {
  const [tab, setTab] = useState('mark');
  const [semester, setSemester] = useState(() => {
    const cur = currentSemester();
    return SEMESTERS.includes(cur) ? cur : SEMESTERS[2];
  });
  const [people, setPeople] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [att, setAtt] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekPick, setWeekPick] = useState(null);
  const [personId, setPersonId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(false);
  const isAdmin = profile.role === 'admin';

  const sundays = useMemo(() => sundaysOf(semester), [semester]);
  const allSundays = useMemo(() => [...sundaysOf(previousSemester(semester)), ...sundays], [semester, sundays]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [p, s, a] = await Promise.all([
        fetchAll(() => supabase.from('people').select('*').order('sn')),
        fetchAll(() => supabase.from('person_status').select('*')),
        fetchAll(() => supabase.from('attendance').select('*')
          .gte('sunday', allSundays[0]).lte('sunday', allSundays[allSundays.length - 1])),
      ]);
      setPeople(p); setStatuses(s);
      const map = {};
      for (const r of a) map[`${r.person_id}|${r.sunday}`] = r;
      setAtt(map);
    } catch (e) { setError(`Couldn't load data: ${e.message}`); }
    setLoading(false);
  }, [allSundays]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const roster = useMemo(() => people
    .map((p) => ({ ...p, category: categoryFor(p.id, semester, statuses, SEMESTERS) }))
    .filter((p) => p.category), [people, statuses, semester]);

  const mark = useCallback((id, s) => att[`${id}|${s}`]?.status || undefined, [att]);

  const weekIdx = weekPick ? sundays.indexOf(weekPick) : -1;
  const stats = useMemo(() => buildStats({
    people: roster, sundays, allSundays, mark, weekIdx: weekIdx >= 0 ? weekIdx : undefined,
  }), [roster, sundays, allSundays, mark, weekIdx]);

  // present totals per Sunday – drives the calendar heat in the week picker
  const counts = useMemo(() => {
    const c = {};
    for (const r of Object.values(att)) if (r.status === 'Present') c[r.sunday] = (c[r.sunday] || 0) + 1;
    return c;
  }, [att]);

  async function saveMark(personId, sunday, patch) {
    const key = `${personId}|${sunday}`;
    const prev = att[key];
    const next = { person_id: personId, sunday, status: null, called: false, reason: null, ...prev, ...patch };
    setAtt((m) => ({ ...m, [key]: next }));
    const { error } = await supabase.from('attendance').upsert({
      person_id: personId, sunday, status: next.status, called: next.called, reason: next.reason,
      updated_at: new Date().toISOString(),
    });
    if (error) { setAtt((m) => ({ ...m, [key]: prev })); setError(`Not saved: ${error.message}`); }
  }

  const openPerson = (id) => setPersonId(id);
  const ctx = {
    profile, isAdmin, semester, sundays, allSundays, roster, people, statuses, att, mark, stats, counts,
    saveMark, reload: load, weekPick, setWeekPick, openPerson, setEditing,
  };

  const alerts = stats.rows.filter((r) => r.group && ((r.lastWeek === 'Present' && r.thisWeek === 'Absent') || r.streak >= 3)).length;
  const tabs = [
    ['mark', 'Attendance', Icon.roll],
    ['follow', 'Follow-up', Icon.bell, alerts],
    ['dash', 'Dashboard', Icon.chart],
    ['people', 'People', Icon.people],
    ...(isAdmin ? [['users', 'Users', Icon.shield]] : []),
  ];

  const person = personId && (stats.rows.find((r) => r.id === personId)
    || (() => { const p = people.find((x) => x.id === personId); return p && { ...p, category: null }; })());
  const initials = (profile.full_name || profile.email || '?').trim()[0].toUpperCase();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Mark />
            <div>
              <div className="brand-name">Gaius Gerji</div>
              <div className="brand-sub">Sunday attendance</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label className="sem-select">
              <span className="sr-only">Semester</span>
              <select value={semester} onChange={(e) => { setSemester(e.target.value); setWeekPick(null); }}>
                {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
              </select>
              <Icon.down width="16" height="16" />
            </label>
            <button className="avatar" onClick={() => setMenu(true)} aria-label="Account">{initials}</button>
          </div>
        </div>
      </header>
      <nav className="nav" aria-label="Sections">
        {tabs.map(([k, l, Ico, badge]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); window.scrollTo(0, 0); }} aria-current={tab === k ? 'page' : undefined}>
            <Ico />{l}{badge ? <span className="badge">{badge}</span> : null}
          </button>
        ))}
      </nav>
      <main>
        {error && <div className="banner err" style={{ marginBottom: 12 }}>{error}</div>}
        {loading ? <div className="center muted">Loading {semester}…</div> : (
          <>
            {tab === 'mark' && <MarkView {...ctx} />}
            {tab === 'follow' && <FollowUp {...ctx} />}
            {tab === 'dash' && <Dashboard {...ctx} />}
            {tab === 'people' && <People {...ctx} />}
            {tab === 'users' && <Users />}
          </>
        )}
      </main>

      {person && (
        <PersonSheet person={person} sundays={sundays} mark={mark} att={att} onClose={() => setPersonId(null)}
          onEdit={isAdmin ? () => { setEditing(people.find((p) => p.id === person.id)); setPersonId(null); } : undefined} />
      )}
      {editing && (
        <Editor person={editing} statuses={statuses} people={people} semester={semester} isAdmin={isAdmin}
          onClose={() => setEditing(null)} saved={() => { setEditing(null); load(); }} />
      )}
      {menu && (
        <Sheet title="Account" onClose={() => setMenu(false)}>
          <p><b>{profile.full_name}</b></p>
          <p className="muted small" style={{ marginBottom: 16 }}>{profile.email} · {profile.role === 'admin' ? 'Admin' : 'Leader'}</p>
          <button className="btn ghost wide" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </Sheet>
      )}
    </div>
  );
}
