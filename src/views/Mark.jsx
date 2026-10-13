import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, latestSunday } from '../lib/ethiopian';
import { CATEGORIES, SHORT, pct } from '../lib/stats';
import { WeekChips, Modal } from './common';

export default function Mark({ sundays, roster, people, att, saveMark, semester, reload, stats }) {
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

  const counts = useMemo(() => {
    const c = {};
    for (const k of CATEGORIES) {
      const list = roster.filter((p) => p.category === k);
      const pres = list.filter((p) => rec(p.id).status === 'Present').length;
      const marked = list.filter((p) => rec(p.id).status).length;
      c[k] = { total: list.length, pres, marked };
    }
    return c;
  }, [roster, att, day]); // eslint-disable-line

  const list = roster
    .filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : p.category === cat))
    .sort((a, b) => (a.sn ?? 9999) - (b.sn ?? 9999));

  const totalPresent = roster.filter((p) => rec(p.id).status === 'Present').length;
  const unmarked = list.filter((p) => !rec(p.id).status);

  async function markRestAbsent() {
    if (!unmarked.length) return;
    if (!window.confirm(`Mark ${unmarked.length} unmarked ${q ? 'people' : SHORT[cat]} as Absent for ${etLabel(day)}?`)) return;
    const rows = unmarked.map((p) => ({ person_id: p.id, sunday: day, status: 'Absent', updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('attendance').upsert(rows);
    if (error) return window.alert(error.message);
    reload();
  }

  return (
    <div className="page">
      <WeekChips sundays={sundays} value={day} onChange={(s) => s && setSunday(s)} held={stats.heldSet} />

      <div className="day-head">
        <div>
          <h2>{etLabel(day, true)}</h2>
          <div className="muted">{fmtGreg(day)} · {semester}</div>
        </div>
        <div className="big-count"><b>{totalPresent}</b><span>present</span></div>
      </div>

      <div className="cat-tabs">
        {CATEGORIES.map((k) => (
          <button key={k} className={!q && cat === k ? 'on' : ''} onClick={() => { setCat(k); setQ(''); }}>
            <span>{SHORT[k]}</span>
            <small>{counts[k].pres}/{counts[k].total}{counts[k].marked ? ` · ${pct(counts[k].pres / counts[k].marked)}` : ''}</small>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search anyone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setAdding(true)}>+ New comer</button>
      </div>

      <ul className="people-list">
        {list.map((p, i) => {
          const r = rec(p.id);
          const isOpen = open === p.id;
          return (
            <li key={p.id} className={`person ${r.status === 'Present' ? 'is-p' : r.status === 'Absent' ? 'is-a' : ''}`}>
              <div className="person-row">
                <button className="person-info" onClick={() => setOpen(isOpen ? null : p.id)}>
                  <span className="idx">{i + 1}</span>
                  <span className="pname">{p.name}</span>
                  <span className="pmeta">
                    {q && <em>{SHORT[p.category]}</em>}
                    {p.category === 'New Comer' && <em className={p.nc_active ? 'tag ok' : 'tag'}>{p.nc_active ? 'Active' : 'Inactive'}</em>}
                    {p.responsible && <em>· {p.responsible}</em>}
                    {r.called && <em className="tag call">Called</em>}
                    {r.reason && <em title={r.reason}>· “{r.reason}”</em>}
                  </span>
                </button>
                <div className="pa">
                  <button className={r.status === 'Present' ? 'p on' : 'p'}
                    onClick={() => saveMark(p.id, day, { status: r.status === 'Present' ? null : 'Present' })}>P</button>
                  <button className={r.status === 'Absent' ? 'a on' : 'a'}
                    onClick={() => saveMark(p.id, day, { status: r.status === 'Absent' ? null : 'Absent' })}>A</button>
                </div>
              </div>
              {isOpen && (
                <div className="person-extra">
                  <label className="check">
                    <input type="checkbox" checked={!!r.called} onChange={(e) => saveMark(p.id, day, { called: e.target.checked })} />
                    Called
                  </label>
                  <input className="reason" placeholder="Reason (optional)" defaultValue={r.reason || ''}
                    onBlur={(e) => e.target.value !== (r.reason || '') && saveMark(p.id, day, { reason: e.target.value || null })} />
                  {p.phone && p.phone.length > 5 && <a className="btn ghost small" href={`tel:${p.phone.replace(/\s/g, '')}`}>Call {p.phone}</a>}
                </div>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="muted empty">Nobody here.</li>}
      </ul>

      {unmarked.length > 0 && (
        <button className="btn ghost wide" onClick={markRestAbsent}>
          Mark the {unmarked.length} unmarked as Absent
        </button>
      )}

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
    <Modal title={`Register new comer · ${etLabel(day)}`} onClose={onClose}>
      <form onSubmit={save} className="form">
        <label>Name<input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Phone<input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label>Responsible person<input value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })} /></label>
        <p className="muted small">They'll be added as an active New Comer, joined {etLabel(day, true)}, and marked Present.</p>
        <button className="btn wide" disabled={busy}>{busy ? 'Saving…' : 'Register'}</button>
      </form>
    </Modal>
  );
}
