import { useMemo, useState } from 'react';
import { semesterOf, semNo, semYear, addDays } from '../lib/ethiopian';
import { roleName } from '../lib/roles';
import { undo, redo, useUndo } from '../lib/undo';
import { Icon, Sheet } from '../views/common';
import Dashboard from '../views/Dashboard';
import PersonSheet from '../views/Person';
import Messages from '../views/Messages';
import AccountPanel from '../views/Account';
import Users from '../views/Users';
import Backup from '../views/Backup';
import HqOverview from './HqOverview';
import HqAttendance from './HqAttendance';
import HqPeople from './HqPeople';
import HqPlans from './HqPlans';
import HqFinance from './HqFinance';
import { allCenters, agenda, colorOf } from './hqData';

const NAV = [['overview', 'Overview', Icon.home], ['attendance', 'Attendance', Icon.check], ['people', 'People', Icon.people], ['plans', 'Plans', Icon.cal], ['finance', 'Finance', Icon.card], ['messages', 'Messages', Icon.mail]];

/* The HQ side: its own app. Every center at once – no switching – plus HQ's own plans and activities.
   Founder, Director, HQ Follow-up and HQ staff always land here; the admin can switch between the two sides. */
export default function HqApp({ R, today, profile, realProfile, perm, reload, setError, error, loading, Logo, onCenterSide, viewAs, setViewAs, studio, setMode }) {
  const [tab, setTab] = useState('overview');
  const [centerOpen, setCenterOpen] = useState(null);
  const [person, setPerson] = useState(null);          // { cid, id }
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [week, setWeek] = useState(null);
  const [period, setPeriod] = useState(() => ({ kind: 'sem', no: semNo(semesterOf(today)), year: semYear(semesterOf(today)) }));
  const U = useUndo();
  const C = useMemo(() => allCenters(R, today), [R, today]);
  const upcoming = useMemo(() => agenda(R, today, addDays(today, 30)), [R, today]);
  const hqPerm = { ...perm, hqView: true, switchCenter: true, studio: false };
  const flash = (t) => { setToast(t); setTimeout(() => setToast(''), 2200); };
  const doUndo = async (fn, w) => { try { const l = await fn(); if (l) flash(`${w}: ${l}`); } catch (e) { setError(`Couldn’t ${w.toLowerCase()}: ${e.message}`); } };
  const go = (k) => { setTab(k); setCenterOpen(null); window.scrollTo(0, 0); };
  const openCenter = (id) => { setCenterOpen(id); setWeek(null); window.scrollTo(0, 0); };
  const openPerson = (cid, id) => setPerson({ cid, id });
  const unreadOf = (cid) => (R.messages || []).filter((m) => !m.from_hq && (cid == null || m.center_id === cid) && !(R.reads || []).some((x) => x.message_id === m.id && x.user_id === realProfile.user_id)).length;
  const unread = unreadOf(null);
  const initials = (realProfile.full_name || realProfile.email || '?').trim()[0].toUpperCase();
  const px = person && C.find((x) => x.c.id === person.cid);
  const common = { R, C, today, perm: hqPerm, reload, setError, period, setPeriod, openCenter, openPerson, go };

  return (
    <div className="app hq">
      <header className="hq-top">
        <div className="hq-top-inner">
          <button className="hq-brand" onClick={() => go('overview')}>
            <Logo site={R.site} size={34} />
            <span><span className="hq-name">Gaius <b>HQ</b></span><span className="hq-sub">{profile.title && !viewAs ? profile.title : roleName(profile.role)} · all centers</span></span>
          </button>
          <nav className="hq-menu" aria-label="HQ sections">
            {NAV.map(([k, l, Ico]) => (
              <button key={k} className={tab === k && !centerOpen ? 'on' : ''} aria-current={tab === k && !centerOpen ? 'page' : undefined} onClick={() => go(k)}>
                <Ico />{l}{k === 'messages' && unread ? <span className="badge">{unread}</span> : null}
              </button>
            ))}
          </nav>
          <div className="hq-actions">
            {perm.hqEdit && (
              <span className="undo-group">
                <button className="top-icon" disabled={!U.canUndo || U.busy} onClick={() => doUndo(undo, 'Undone')} title={U.canUndo ? `Undo: ${U.undoLabel}` : 'Nothing to undo'} aria-label="Undo"><Icon.undo /></button>
                <button className="top-icon" disabled={!U.canRedo || U.busy} onClick={() => doUndo(redo, 'Redone')} title={U.canRedo ? `Redo: ${U.redoLabel}` : 'Nothing to redo'} aria-label="Redo"><Icon.redo /></button>
              </span>
            )}
            {onCenterSide && <button className="side-switch" onClick={onCenterSide} title="Switch to the center side (Gerji, Mekanisa… as the center sees it)"><Icon.layers /><span className="desk-only">Center side</span></button>}
            {realProfile.role === 'admin' && <button className={`top-icon hide-phone ${tab === 'users' ? 'on' : ''}`} onClick={() => go('users')} aria-label="App admin" title="App admin"><Icon.settings /></button>}
            <button className="avatar" onClick={() => setMenu(true)} aria-label="Account">{initials}</button>
          </div>
        </div>
      </header>
      {viewAs && <div className="viewas-bar">Viewing as <b>{roleName(viewAs)}</b>. Changes still use your admin rights. <button className="btn small" onClick={() => setViewAs(null)}>Exit</button></div>}
      <nav className="nav hq-nav" aria-label="HQ sections">
        {NAV.map(([k, l, Ico]) => (
          <button key={k} className={tab === k && !centerOpen ? 'on' : ''} onClick={() => go(k)}><Ico />{l}{k === 'messages' && unread ? <span className="badge">{unread}</span> : null}</button>
        ))}
      </nav>
      <main>
        {error && <div className="banner err" style={{ marginBottom: 12 }}>{error} <button className="link small" onClick={() => setError('')}>Dismiss</button></div>}
        {loading ? <div className="center muted">Loading every center…</div> : centerOpen ? (
          <CenterReport x={C.find((y) => y.c.id === centerOpen)} R={R} C={C} today={today} perm={hqPerm} week={week} setWeek={setWeek} openCenter={openCenter} openPerson={openPerson} back={() => setCenterOpen(null)} go={go} />
        ) : <>
          {tab === 'overview' && <HqOverview {...common} upcoming={upcoming} />}
          {tab === 'attendance' && <HqAttendance {...common} />}
          {tab === 'people' && <HqPeople {...common} />}
          {tab === 'plans' && <HqPlans {...common} perm={perm} />}
          {tab === 'finance' && <HqFinance {...common} />}
          {tab === 'messages' && <HqMessages R={R} C={C} profile={realProfile} perm={hqPerm} reload={reload} setError={setError} unreadOf={unreadOf} />}
          {tab === 'users' && realProfile.role === 'admin' && <>
            <Users D={C[0]?.D || { people: [] }} R={R} perm={perm} profile={profile} realProfile={realProfile} viewAs={viewAs} setViewAs={setViewAs} reload={reload} />
            <Backup D={C[0]?.D || {}} R={R} perm={perm} realProfile={realProfile} reload={reload} setError={setError} />
          </>}
        </>}
      </main>
      {toast && <div className="toast">{toast}</div>}
      {px && px.personBy[person.id] && (
        <PersonSheet {...px} today={today} perm={hqPerm} person={px.personBy[person.id]} saveMark={() => {}} reload={reload} setError={setError} onClose={() => setPerson(null)} />
      )}
      {menu && (
        <Sheet title="Account" onClose={() => setMenu(false)}>
          <AccountPanel profile={realProfile} perm={{ ...perm, canStudio: false }} studio={studio} setMode={setMode} hq go={(k) => { setMenu(false); go(k === 'users' ? 'users' : 'overview'); }} onExport={() => setMenu(false)} />
          {onCenterSide && <button className="btn ghost wide" style={{ marginTop: 10 }} onClick={() => { setMenu(false); onCenterSide(); }}><Icon.layers width="18" height="18" /> Switch to the center side</button>}
        </Sheet>
      )}
    </div>
  );
}

/* one center, opened from the HQ side: its dashboard through the HQ lens. Other centers are one tap away. */
function CenterReport({ x, R, C, today, perm, week, setWeek, openCenter, openPerson, back, go }) {
  if (!x) return null;
  const c = x.c;
  return (
    <div className="hq-center">
      <div className="hq-center-head">
        <button className="btn ghost small" onClick={back}><Icon.left width="16" height="16" /> All centers</button>
        <div className="chips hq-center-chips">
          {C.map((y) => <button key={y.c.id} className={`chipbtn ${y.c.id === c.id ? 'on' : ''}`} style={{ '--cc': colorOf(R, y.c.id) }} onClick={() => openCenter(y.c.id)}><i className="cdot" />{y.c.name}</button>)}
        </div>
      </div>
      <div className="hq-center-title">
        <h1 className="page-title">{c.name} <span className="am muted">{c.name_am}</span></h1>
        <p className="page-sub">{[c.address || c.meeting_place, c.sunday_time && `Sundays ${c.sunday_time}`, c.phone].filter(Boolean).join(' · ') || 'Center report'} · as HQ sees it</p>
      </div>
      <Dashboard {...x} week={week} setWeek={setWeek} today={today} perm={perm} openPerson={(id) => openPerson(c.id, id)} go={(k) => go(k === 'attendance' || k === 'calls' ? 'attendance' : k === 'calendar' || k === 'meeting' ? 'plans' : 'overview')} />
    </div>
  );
}

function HqMessages({ R, C, profile, perm, reload, setError, unreadOf }) {
  const [cid, setCid] = useState(() => (C.find((x) => unreadOf(x.c.id)) || C[0])?.c.id);
  const x = C.find((y) => y.c.id === cid) || C[0];
  if (!x) return null;
  return (
    <>
      <div className="chips hq-msg-chips" style={{ flexWrap: 'wrap' }}>
        {C.map((y) => { const n = unreadOf(y.c.id); return <button key={y.c.id} className={`chipbtn ${cid === y.c.id ? 'on' : ''}`} onClick={() => setCid(y.c.id)}>{y.c.name}{n ? <span className="badge inline">{n}</span> : null}</button>; })}
      </div>
      <Messages key={x.c.id} D={x.D} perm={perm} profile={profile} reload={reload} setError={setError} />
    </>
  );
}
