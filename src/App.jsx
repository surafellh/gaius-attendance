import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, fetchAll } from './lib/supabase';
import { sundaysOf, currentSemester, previousSemester, SEMESTERS } from './lib/ethiopian';
import { categoryFor, buildStats } from './lib/stats';
import Mark from './views/Mark';
import FollowUp from './views/FollowUp';
import Dashboard from './views/Dashboard';
import People from './views/People';
import Users from './views/Users';
import Auth from './views/Auth';


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
      <div className="center">
        <div className="card narrow">
          <h2>Waiting for approval</h2>
          <p className="muted">Your account ({session.user.email}) is created. An admin needs to approve it before you can see attendance.</p>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
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

  const sundays = useMemo(() => sundaysOf(semester), [semester]);
  const allSundays = useMemo(() => [...sundaysOf(previousSemester(semester)), ...sundays], [semester, sundays]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
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
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [allSundays]);

  useEffect(() => { load(); }, [load]);

  const roster = useMemo(() => people
    .map((p) => ({ ...p, category: categoryFor(p.id, semester, statuses, SEMESTERS) }))
    .filter((p) => p.category), [people, statuses, semester]);

  const mark = useCallback((id, s) => att[`${id}|${s}`]?.status || undefined, [att]);

  const weekIdx = weekPick ? sundays.indexOf(weekPick) : -1;
  const stats = useMemo(() => buildStats({
    people: roster, sundays, allSundays, mark, weekIdx: weekIdx >= 0 ? weekIdx : undefined,
  }), [roster, sundays, allSundays, mark, weekIdx]);

  async function saveMark(personId, sunday, patch) {
    const key = `${personId}|${sunday}`;
    const prev = att[key];
    const next = { person_id: personId, sunday, status: null, called: false, reason: null, ...prev, ...patch };
    setAtt((m) => ({ ...m, [key]: next }));
    const { error } = await supabase.from('attendance').upsert({
      person_id: personId, sunday, status: next.status, called: next.called, reason: next.reason,
      updated_at: new Date().toISOString(),
    });
    if (error) { setAtt((m) => ({ ...m, [key]: prev })); window.alert(error.message); }
  }

  const ctx = {
    profile, semester, sundays, allSundays, roster, people, statuses, att, mark, stats,
    saveMark, reload: load, weekPick, setWeekPick,
  };

  const tabs = [
    ['mark', 'Attendance'], ['follow', 'Follow-up'], ['dash', 'Dashboard'], ['people', 'People'],
    ...(profile.role === 'admin' ? [['users', 'Users']] : []),
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">GG</span>
          <div>
            <div className="title">Gaius Gerji Center</div>
            <div className="sub">Attendance follow-up</div>
          </div>
        </div>
        <div className="top-right">
          <select aria-label="Semester" value={semester} onChange={(e) => { setSemester(e.target.value); setWeekPick(null); }}>
            {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button className="btn ghost small" onClick={() => supabase.auth.signOut()} title={profile.email}>Sign out</button>
        </div>
      </header>
      <nav className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      <main>
        {error && <div className="banner err">{error}</div>}
        {loading ? <div className="center muted">Loading…</div> : (
          <>
            {tab === 'mark' && <Mark {...ctx} />}
            {tab === 'follow' && <FollowUp {...ctx} />}
            {tab === 'dash' && <Dashboard {...ctx} />}
            {tab === 'people' && <People {...ctx} />}
            {tab === 'users' && <Users />}
          </>
        )}
      </main>
    </div>
  );
}
