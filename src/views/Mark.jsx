import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, latestSunday } from '../lib/ethiopian';
import { CATEGORIES, SHORT, pct } from '../lib/stats';
import { WeekPicker, Sheet, Icon, Initials, Ring, CAT_COLOR } from './common';

export default function MarkView({ sundays, roster, people, att, saveMark, semester, reload, stats, counts, openPerson }) {
  const defaultSunday = useMemo(() => {
    const t = latestSunday();
    const past = sundays.filter((s) => s <= t);
    return past.length ? past[past.length - 1] : sundays[0];
  }, [sundays]);
  const [sunday, setSunday] = useState(defaultSunday);
  const [cat, setCat] = useState('Leader');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);

  const day = sundays.includes(sunday) ? sunday : defaultSunday;
  const rec = (id) => att[`${id}|${day}`] || {};

  const counts6 = useMemo(() => Object.fromEntries(CATEGORIES.map((k) => {
    const list = roster.filter((p) => p.category === k);
    return [k, {
      total: list.length,
      pres: list.filter((p) => rec(p.id).status === 'Present').length,
      marked: list.filter((p) => rec(p.id).status).length,
    }];
  })), [roster, att, day]); // eslint-disable-line

  const list = roster
    .filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : p.category === cat))
    .sort((a, b) => (a.sn ?? 9999) - (b.sn ?? 9999));

  const totalPresent = roster.filter((p) => rec(p.id).status === 'Present').length;
  const totalMarked = roster.filter((p) => rec(p.id).status).length;
  const unmarked = list.filter((p) => !rec(p.id).status);

  async function markRestAbsent() {
    if (!unmarked.length) return;
    if (!window.confirm(`Mark ${unmarked.length} unmarked ${q ? 'people' : SHORT[cat].toLowerCase()} as absent for ${etLabel(day)}?`)) return;
    const rows = unmarked.map((p) => ({ person_id: p.id, sunday: day, status: 'Absent', updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('attendance').upsert(rows);
    if (error) return window.alert(error.message);
    reload();
  }

  const toggle = (p, s) => saveMark(p.id, day, { status: rec(p.id).status === s ? null : s });

  return (
    <div className="page">
      <WeekPicker sundays={sundays} value={day} onChange={(s) => s && setSunday(s)} held={stats.heldSet} counts={counts} />

      <section className="card mark-summary">
        <Ring value={totalPresent} total={roster.length} label="present" />
        <div className="mark-stats">
          <div className="line"><b>Marked so far</b><span className="muted">{totalMarked} of {roster.length}</span></div>
          <div className="progress" aria-hidden="true">
            {CATEGORIES.map((k) => counts6[k].pres ? <span key={k} style={{ flex: counts6[k].pres, background: CAT_COLOR[k] }} /> : null)}
            <span style={{ flex: Math.max(roster.length - totalPresent, 0), background: 'transparent' }} />
          </div>
          <div className="line small muted">
            <span>{totalPresent} present, {totalMarked - totalPresent} absent</span>
            <span>{roster.length - totalMarked} to go</span>
          </div>
        </div>
      </section>

      <div className="scroll-x">
        <div className="cat-pills" role="tablist" aria-label="Category">
          {CATEGORIES.map((k) => {
            const c = counts6[k];
            return (
              <button key={k} role="tab" aria-selected={!q && cat === k} className={`cat-pill ${!q && cat === k ? 'on' : ''}`}
                onClick={() => { setCat(k); setQ(''); }}>
                <span className="cp-top"><span className="dot" style={{ background: CAT_COLOR[k] }} />{SHORT[k]}</span>
                <span className="cp-n">{c.pres} of {c.total}{c.marked ? `, ${pct(c.pres / c.marked)}` : ''}</span>
                <span className="bar"><span style={{ width: `${c.total ? (c.marked / c.total) * 100 : 0}%`, background: c.marked === c.total && c.total ? 'var(--present)' : 'var(--marigold)' }} /></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="toolbar">
        <label className="search">
          <Icon.search />
          <span className="sr-only">Search</span>
          <input placeholder="Find anyone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <ul className="plist">
        {list.map((p) => {
          const r = rec(p.id);
          const isOpen = open === p.id;
          return (
            <li key={p.id} className="prow">
              <div className="prow-main">
                <Initials name={p.name} category={p.category} />
                <button className="pinfo" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                  <span className="pname">{p.name}</span>
                  <span className="pmeta">
                    {q && <span>{SHORT[p.category]}</span>}
                    {p.category === 'New Comer' && <span className={`tag ${p.nc_active ? 'ok' : ''}`}>{p.nc_active ? 'Active' : 'Inactive'}</span>}
                    {p.responsible && <span>with {p.responsible}</span>}
                    {r.called && <span className="tag gold"><Icon.phone width="11" height="11" /> Called</span>}
                    {r.reason && <span className="tag">“{r.reason}”</span>}
                  </span>
                </button>
                <div className="pa">
                  <button className={`p ${r.status === 'Present' ? 'on' : ''}`} onClick={() => toggle(p, 'Present')}
                    aria-pressed={r.status === 'Present'} aria-label={`${p.name} present`}><Icon.check /></button>
                  <button className={`a ${r.status === 'Absent' ? 'on' : ''}`} onClick={() => toggle(p, 'Absent')}
                    aria-pressed={r.status === 'Absent'} aria-label={`${p.name} absent`}><Icon.x /></button>
                </div>
              </div>
              {isOpen && (
                <div className="prow-extra">
                  <label className="check">
                    <input type="checkbox" checked={!!r.called} onChange={(e) => saveMark(p.id, day, { called: e.target.checked })} />
                    Called
                  </label>
                  <input placeholder="Reason, e.g. travelling" defaultValue={r.reason || ''} aria-label="Reason"
                    onBlur={(e) => e.target.value !== (r.reason || '') && saveMark(p.id, day, { reason: e.target.value || null })} />
                  <button className="btn ghost small" onClick={() => openPerson(p.id)}>History</button>
                  {p.phone && p.phone.replace(/\D/g, '').length > 6 && (
                    <a className="icon-btn call" href={`tel:${p.phone.replace(/\s/g, '')}`} aria-label={`Call ${p.name}`}><Icon.phone /></a>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="empty">{q ? `Nobody called “${q}” this semester.` : 'Nobody in this group this semester.'}</li>}
      </ul>

      {unmarked.length > 0 && (
        <button className="btn ghost wide" onClick={markRestAbsent}>
          Mark the {unmarked.length} unmarked {q ? '' : SHORT[cat].toLowerCase()} as absent
        </button>
      )}

      <button className="btn gold fab" onClick={() => setAdding(true)}><Icon.plus /> New comer</button>

      {adding && (
        <NewComer onClose={() => setAdding(false)} day={day} semester={semester} people={people}
          saved={() => { setAdding(false); reload(); }} />
      )}
    </div>
  );
}

function NewComer({ onClose, day, semester, people, saved }) {
  const [f, setF] = useState({ name: '', phone: '+251', responsible: '' });
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    const sn = Math.max(0, ...people.map((p) => p.sn || 0)) + 1;
    const { data, error } = await supabase.from('people').insert({
      sn, name: f.name.trim(), phone: f.phone.trim(), responsible: f.responsible.trim() || null,
      week_joined: day, nc_active: true,
    }).select().single();
    if (error) { setBusy(false); return window.alert(error.message); }
    await supabase.from('person_status').insert({ person_id: data.id, semester, category: 'New Comer' });
    await supabase.from('attendance').upsert({ person_id: data.id, sunday: day, status: 'Present' });
    saved();
  }
  return (
    <Sheet title="Register a new comer" onClose={onClose}>
      <form onSubmit={save} className="form">
        <label>Name<input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <label>Phone<input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label>Who brought them / follows up<input value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })} /></label>
        <p className="muted small">They join as an active new comer on {etLabel(day, true)} and are marked present.</p>
        <button className="btn gold wide" disabled={busy}>{busy ? 'Registering…' : 'Register'}</button>
      </form>
    </Sheet>
  );
}
