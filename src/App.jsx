import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, fetchAll } from './lib/supabase';
import { latestSunday, todayIso, semesterOf, semesterStart, etLabel } from './lib/ethiopian';
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
import Landing from './views/Landing';
import Backup from './views/Backup';
import { undo, redo, useUndo, recordMarks, setUndoReload, record } from './lib/undo';
import Meeting from './views/Meeting';
import CalendarPage from './views/CalendarPage';
import Leadership from './views/Leadership';
import ExportSheet from './views/ExportSheet';
import PlansPage from './views/Plans';
import Roadmap from './views/Roadmap';
import Messages from './views/Messages';
import Finance from './views/Finance';
import HqApp from './hq/HqApp';
import PersonSheet from './views/Person';
import { Icon, Mark, Sheet } from './views/common';
import { scopeToCenter } from './lib/scope';

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
  if (!session) return <Landing />;
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

/* The menu: five sections, each with a few tabs. Messages, downloads, undo, studio and app admin sit in the header. */
function sectionsFor(perm) {
  return [
    ['home', 'Home', Icon.home, [['home', 'Dashboard']]],
    ['att', 'Attendance', Icon.check, [['attendance', 'Sunday sheet'], ...(perm.hqView ? [] : [['calls', 'Calls']])]],
    ['people', 'People', Icon.people, [['people', 'Everyone'], ...(perm.profiles ? [['leadership', 'Leadership']] : []), ['roadmap', 'Roadmap']]],
    ['plans', 'Plans', Icon.cal, [['calendar', 'Calendar'], ['plans', perm.hqView ? 'Plans & budget' : 'Plans & budget'], ['meeting', 'Meetings'], ...(perm.studio ? [['departments', 'Departments']] : [])]],
    ...(perm.finance ? [['finance', 'Finance', Icon.card, [['finance', 'Admin & finance']]]] : []),
  ];
}
const HEADER_TABS = ['messages', 'users'];
const VIEW_KEY = 'gaius-studio';
const SIDE_KEY = 'gaius-side';

function Main({ profile: realProfile }) {
  const [viewAs, setViewAs] = useState(null);          // admin only: see the app as another role
  const profile = viewAs ? { ...realProfile, role: viewAs } : realProfile;
  const [studio, setStudio] = useState(() => { try { return localStorage.getItem(VIEW_KEY) === '1'; } catch { return false; } });
  const [side, setSideState] = useState(() => { try { return localStorage.getItem(SIDE_KEY) || 'hq'; } catch { return 'hq'; } });
  const setSide = (v) => { setSideState(v); try { localStorage.setItem(SIDE_KEY, v); } catch { /* private mode */ } window.scrollTo(0, 0); };
  const perm = can(profile, { studio, side });
  const [tab, setTab] = useState(() => { const p = loadPrefs(); applyPrefs(p); return p.start || 'home'; });
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [centerId, setCenterId] = useState(realProfile.center_id || 1);
  const [R, setR] = useState({ centers: [], people: [], att: [], programs: [], departments: [], members: [], assignments: [], history: [], center: null, criteria: [], evals: [], events: [], meetings: [], agenda: [], plan: [], p2: true, plans: [], items: [], lessons: [], plessons: [], r2: true, reconcile: [], messages: [], reads: [], assets: [], ledger: [], r3: true, lessonTopics: [], r4: true, site: {} });
  const [personId, setPersonId] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [week, setWeek] = useState(null); // selected Sunday shared by dashboard & follow-up (null = latest)
  const U = useUndo();
  const flash = (t) => { setToast(t); setTimeout(() => setToast(''), 2200); };
  const doUndo = async (fn, word) => { try { const l = await fn(); if (l) flash(`${word}: ${l}`); } catch (e) { setError(`Couldn’t ${word.toLowerCase()}: ${e.message}`); } };

  const load = useCallback(async () => {
    setError('');
    try {
      const q = (t, cols = '*') => fetchAll(() => supabase.from(t).select(cols));
      const [people, att, programs, departments, members, assignments, history, centers] = await Promise.all([
        q('people'), q('attendance', 'person_id,sunday,status,called,reason,category,active'), q('programs'), q('departments'),
        q('department_members'), q('assignments'), q('category_history'), q('centers'),
      ]);
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
      // Release 3 tables: HQ ↔ center, admin & finance
      try {
        const [reconcile, messages, reads, assets, ledger] = await Promise.all([q('hq_reconcile'), q('messages'), q('message_reads'), q('assets'), q('ledger')]);
        Object.assign(p2, { reconcile, messages: messages.sort((a, b) => a.created_at.localeCompare(b.created_at)), reads, assets, ledger, r3: true });
      } catch { Object.assign(p2, { reconcile: [], messages: [], reads: [], assets: [], ledger: [], r3: false }); }
      // Release 4: roadmap lessons linked to program topics
      try { Object.assign(p2, { lessonTopics: await q('lesson_topics'), r4: true }); } catch { Object.assign(p2, { lessonTopics: [], r4: false }); }
      try { Object.assign(p2, { activities: await q('hq_activities'), r6: true }); } catch { Object.assign(p2, { activities: [], r6: false }); }
      try { const rows = await q('site_info'); Object.assign(p2, { site: Object.fromEntries(rows.map((r) => [r.key, r.value])), r5: true }); } catch { Object.assign(p2, { site: {}, r5: false }); }
      setR({
        centers: centers.sort((a, b) => a.id - b.id), people: people.sort((a, b) => (a.sn ?? 1e9) - (b.sn ?? 1e9)),
        att, programs, departments: departments.sort((a, b) => a.sort - b.sort), members, assignments, history, ...p2,
      });
    } catch (e) {
      setError(`Couldn't load data: ${e.message}. If this is the first time after the update, run the v2 SQL in Supabase.`);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setUndoReload(load); }, [load]);
  useEffect(() => { // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo (outside text boxes)
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(undo, 'Undone'); }
      if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); doUndo(redo, 'Redone'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line
  const D = useMemo(() => scopeToCenter(R, centerId), [R, centerId]);

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

  const patchLocal = (rows) => setR((d) => {
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
    const prev0 = idx.byPerson[personId]?.[s];
    const prev = prev0 ? { ...prev0 } : undefined;
    const p = personBy[personId];
    const row = {
      person_id: personId, sunday: s,
      category: prev?.category || p.category,
      active: prev?.active ?? (p.category === 'New Comer' ? activeOn(idx.byPerson[personId], idx.held, s) : true),
      status: prev?.status ?? null, called: prev?.called ?? false, reason: prev?.reason ?? null, ...patch,
    };
    patchLocal([row]);
    const { error } = await supabase.from('attendance').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'person_id,sunday' });
    if (error) { setError(`Not saved: ${error.message}`); load(); return; }
    recordMarks([{ person_id: personId, sunday: s, row: prev || null }], [row], `${p.name}, ${etLabel(s)}`);
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
    const befores = list.map(({ personId, sunday }) => { const r = idx.byPerson[personId]?.[sunday]; return { person_id: personId, sunday, row: r ? { ...r } : null }; });
    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'person_id,sunday' });
    if (error) { setError(`Not saved: ${error.message}`); return false; }
    patchLocal(rows);
    recordMarks(befores, rows, `${rows.length} attendance mark${rows.length > 1 ? 's' : ''}`);
    return true;
  }

  async function saveProgram(s, fields) {
    const row = { center_id: D.center?.id || 1, sunday: s, ...fields, updated_at: new Date().toISOString() };
    const before = D.programs.find((p) => p.sunday === s);
    const { error } = await supabase.from('programs').upsert(row, { onConflict: 'center_id,sunday' });
    if (error) return setError(`Program not saved: ${error.message}`);
    const keys = Object.keys(fields);
    const put = (v) => async () => { const { error: e } = await supabase.from('programs').upsert(v, { onConflict: 'center_id,sunday' }); if (e) throw e; };
    record({ label: `program ${etLabel(s)}`, undo: before ? put({ center_id: row.center_id, sunday: s, ...Object.fromEntries(keys.map((k) => [k, before[k] ?? null])) })
      : async () => { const { error: e } = await supabase.from('programs').delete().eq('center_id', row.center_id).eq('sunday', s); if (e) throw e; }, redo: put(row) });
    setR((d) => ({ ...d, programs: [...d.programs.filter((p) => !(p.sunday === s && (p.center_id || 1) === row.center_id)), row] }));
  }

  const ctx = {
    profile, perm, realProfile, studio, D, idx, latest, today, progBy, personBy, summaries, calInfo, rosterFor,
    saveMark, saveMarks, saveProgram, createRoll, reload: load, setError, openPerson: setPersonId, week, setWeek, openExport: (o) => setExporting(o || {}),
    semester: semesterOf(latest), semStart: semesterStart(semesterOf(latest)), go: (k) => goTab({ follow: 'calls', register: 'people', profiles: 'people' }[k] || k),
  };

  const alerts = useMemo(() => {
    const rows = idx.bySunday[latest] || [];
    return rows.filter((r) => r.status === 'Absent' && personBy[r.person_id] && r.category !== 'Inactive Informal Member' && !(r.category === 'New Comer' && !r.active)
      && idx.byPerson[r.person_id]?.[idx.held[idx.held.indexOf(latest) - 1]]?.status === 'Present').length;
  }, [idx, latest, personBy]);

  const groups = sectionsFor(perm);
  const allTabs = groups.flatMap((g) => g[3].map(([k]) => k));
  const shownTab = allTabs.includes(tab) || HEADER_TABS.includes(tab) ? tab : groups[0][3][0][0];
  const cur = HEADER_TABS.includes(shownTab) ? null : groups.find((g) => g[3].some(([k]) => k === shownTab));
  const unread = (D.messages || []).filter((m) => (perm.switchCenter ? !m.from_hq : m.from_hq) && !(D.reads || []).some((x) => x.message_id === m.id)).length;
  const lastTab = useMemo(() => ({}), []);
  const goTab = (k) => { const g = groups.find((x) => x[3].some(([t]) => t === k)); if (g) lastTab[g[0]] = k; setTab(k); window.scrollTo(0, 0); };
  const initials = (realProfile.full_name || realProfile.email || '?').trim()[0].toUpperCase();
  const switchCenter = (id) => { setCenterId(id); setWeek(null); setPersonId(null); };
  const setMode = (v) => { setStudio(v); try { localStorage.setItem(VIEW_KEY, v ? '1' : ''); } catch { /* private mode */ } };
  const tab2 = shownTab;
  const pickViewAs = (r) => { setViewAs(r); setTab('home'); };

  if (perm.hqSide) {
    return <HqApp R={R} today={today} profile={profile} realProfile={realProfile} perm={perm} reload={load} setError={setError} error={error} loading={loading} Logo={Logo}
      onCenterSide={realProfile.role === 'admin' && !viewAs ? () => setSide('center') : null} viewAs={viewAs} setViewAs={pickViewAs} studio={studio} setMode={setMode} />;
  }

  return (
    <div className={`app ${perm.studio ? 'studio' : 'general'}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Logo site={R.site} />
            <div>
              <div className="brand-name">Gaius {D.center?.name || ''}</div>
              <div className="brand-sub">{D.center?.name_am ? <span className="am">{D.center.name_am} · </span> : null}{profile.title && !viewAs ? profile.title : roleName(profile.role)}</div>
            </div>
          </div>
          <nav className="menubar" aria-label="Sections">
            {groups.map(([k, l, Ico, tabs]) => (
              <button key={k} className={cur?.[0] === k ? 'on' : ''} aria-current={cur?.[0] === k ? 'page' : undefined} onClick={() => goTab(lastTab[k] || tabs[0][0])}>
                <Ico />{l}{k === 'att' && alerts && !perm.hqView ? <span className="badge">{alerts}</span> : null}
              </button>
            ))}
          </nav>
          <div className="top-actions">
            {perm.switchCenter && R.centers.length > 1 && (
              <select className="center-switch" value={centerId} onChange={(e) => switchCenter(Number(e.target.value))} aria-label="Center">
                {R.centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {realProfile.role === 'admin' && !viewAs && <button className="side-switch light" onClick={() => setSide('hq')} title="Switch to the HQ side: every center at once"><Icon.layers /><span className="desk-only">HQ side</span></button>}
            {perm.edit && (
              <span className="undo-group">
                <button className="top-icon" disabled={!U.canUndo || U.busy} onClick={() => doUndo(undo, 'Undone')} title={U.canUndo ? `Undo: ${U.undoLabel} (Ctrl+Z)` : 'Nothing to undo'} aria-label="Undo"><Icon.undo /></button>
                <button className="top-icon" disabled={!U.canRedo || U.busy} onClick={() => doUndo(redo, 'Redone')} title={U.canRedo ? `Redo: ${U.redoLabel} (Ctrl+Y)` : 'Nothing to redo'} aria-label="Redo"><Icon.redo /></button>
              </span>
            )}
            <button className={`top-icon ${tab2 === 'messages' ? 'on' : ''}`} onClick={() => goTab('messages')} aria-label="Messages" title="Messages">
              <Icon.mail />{unread ? <span className="dot-badge">{unread}</span> : null}
            </button>
            <button className="top-icon hide-phone" onClick={() => setExporting({})} aria-label="Downloads and reports" title="Downloads"><Icon.download /></button>
            {perm.canStudio && (
              <button className={`mode-toggle ${perm.studio ? 'on' : ''}`} onClick={() => setMode(!studio)} title={perm.studio ? 'Studio mode: every detail. Tap for the simple view.' : 'Simple view. Tap for Studio mode (every detail).'} aria-pressed={perm.studio}>
                <Icon.layers /><span className="desk-only">{perm.studio ? 'Studio' : 'Simple'}</span>
              </button>
            )}
            {(perm.users || realProfile.role === 'admin') && <button className={`top-icon hide-phone ${tab2 === 'users' ? 'on' : ''}`} onClick={() => goTab('users')} aria-label="App admin: users and access" title="App admin"><Icon.settings /></button>}
            <button className="avatar" onClick={() => setMenu(true)} aria-label="Account and settings">{initials}</button>
          </div>
        </div>
      </header>
      {viewAs && (
        <div className="viewas-bar">Viewing as <b>{roleName(viewAs)}</b>{can({ role: viewAs }).hqView ? ' – the HQ view' : ''}. Changes still use your admin rights.
          <button className="btn small" onClick={() => { setViewAs(null); setTab('home'); }}>Exit</button></div>
      )}
      <nav className="nav" aria-label="Sections">
        {groups.map(([k, l, Ico, tabs]) => (
          <button key={k} className={cur?.[0] === k ? 'on' : ''} aria-current={cur?.[0] === k ? 'page' : undefined} onClick={() => goTab(lastTab[k] || tabs[0][0])}>
            <Ico />{l}{k === 'att' && alerts && !perm.hqView ? <span className="badge">{alerts}</span> : null}
          </button>
        ))}
      </nav>
      {cur && cur[3].length > 1 && (
        <div className="subnav" role="tablist" aria-label={cur[1]}>
          <div className="subnav-inner">
            {cur[3].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab2 === k} className={tab2 === k ? 'on' : ''} onClick={() => goTab(k)}>
                {l}{k === 'calls' && alerts ? <span className="badge">{alerts}</span> : null}
              </button>
            ))}
            
          </div>
        </div>
      )}
      <main>
        {error && <div className="banner err" style={{ marginBottom: 12 }}>{error} <button className="link small" onClick={() => setError('')}>Dismiss</button></div>}
        {loading ? <div className="center muted">Loading Gaius {D.center?.name || ''}…</div> : (
          <>
            {tab2 === 'home' && <Dashboard {...ctx} />}
            {tab2 === 'attendance' && <Attendance {...ctx} />}
            {tab2 === 'calls' && <FollowUp {...ctx} />}
            {tab2 === 'people' && <People {...ctx} />}
            {tab2 === 'departments' && <Departments {...ctx} />}
            {tab2 === 'users' && <><Users {...ctx} R={R} realProfile={realProfile} viewAs={viewAs} setViewAs={pickViewAs} />{perm.backup && <Backup {...ctx} R={R} realProfile={realProfile} />}</>}
            {tab2 === 'meeting' && <Meeting {...ctx} />}
            {tab2 === 'calendar' && <CalendarPage {...ctx} />}
            {tab2 === 'leadership' && <Leadership {...ctx} />}
            {tab2 === 'plans' && <PlansPage {...ctx} />}
            {tab2 === 'messages' && <Messages {...ctx} />}
            {tab2 === 'finance' && <Finance {...ctx} />}
            {tab2 === 'roadmap' && !D.r4 && <div className="banner err">Linking program topics to the roadmap needs the release 4 SQL to be run in Supabase once.</div>}
            {['messages', 'finance'].includes(tab2) && !D.r3 && <div className="banner err">This page needs the release 3 SQL to be run in Supabase once.</div>}
            {tab2 === 'roadmap' && <Roadmap {...ctx} />}
            {['plans', 'roadmap', 'calendar'].includes(tab2) && !D.r2 && <div className="banner err">Plans and the roadmap need the release 2 SQL to be run in Supabase once.</div>}
            {['meeting', 'calendar', 'leadership'].includes(tab2) && !D.p2 && <div className="banner err">This part needs the Phase 2 SQL (v3_schema.sql) to be run in Supabase once.</div>}
          </>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
      {exporting && <ExportSheet ctx={ctx} initial={exporting} onClose={() => setExporting(null)} />}
      {personId && personBy[personId] && <PersonSheet {...ctx} person={personBy[personId]} onClose={() => setPersonId(null)} />}
      {menu && (
        <Sheet title="Account" onClose={() => setMenu(false)}>
          <AccountPanel profile={realProfile} perm={perm} studio={studio} setMode={setMode} onExport={() => { setMenu(false); setExporting({}); }} go={(k) => { setMenu(false); goTab(k); }} />
        </Sheet>
      )}
    </div>
  );
}

/* the Gaius logo from the landing-page settings, or the simple mark */
export function Logo({ site, size = 36 }) {
  const [bad, setBad] = useState(false);
  if (!site?.logo || bad) return <Mark size={size} />;
  return <img className="logo-img" src={site.logo} alt="Gaius Ministry" width={size} height={size} onError={() => setBad(true)} />;
}

