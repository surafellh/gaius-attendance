import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, sundaysOf, SEMESTERS } from '../lib/ethiopian';
import { CATEGORIES, SHORT, pct } from '../lib/stats';
import { Sheet, Icon, Initials, CAT_COLOR } from './common';

export default function People({ roster, people, semester, stats, isAdmin, openPerson, setEditing }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const byId = Object.fromEntries(stats.rows.map((r) => [r.id, r]));
  const catOf = Object.fromEntries(roster.map((r) => [r.id, r.category]));

  const count = (c) => (c === 'All' ? people.length : c === 'Not listed' ? people.filter((p) => !catOf[p.id]).length : roster.filter((r) => r.category === c).length);
  const list = people
    .map((p) => ({ ...p, category: catOf[p.id] || null }))
    .filter((p) => (cat === 'All' ? true : cat === 'Not listed' ? !p.category : p.category === cat))
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">People</h1>
          <p className="muted small">{people.length} on the list, statuses for {semester}</p>
        </div>
        {isAdmin && <button className="btn gold" onClick={() => setEditing({ new: true })}><Icon.plus /> Add person</button>}
      </div>
      <label className="search">
        <Icon.search />
        <span className="sr-only">Search</span>
        <input placeholder="Search by name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="scroll-x">
        <div className="seg">
          {['All', ...CATEGORIES, 'Not listed'].map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{SHORT[c] || c} <span className="faint">{count(c)}</span></button>
          ))}
        </div>
      </div>
      <div className="people-grid">
        {list.map((p) => {
          const s = byId[p.id];
          return (
            <button key={p.id} className="prow" style={{ border: 0, textAlign: 'left', padding: 0 }}
              onClick={() => (s ? openPerson(p.id) : isAdmin ? setEditing(p) : null)}>
              <div className="prow-main" style={{ padding: 12 }}>
                <Initials name={p.name} category={p.category} />
                <span className="pinfo">
                  <span className="pname">{p.name}</span>
                  <span className="pmeta">
                    {p.category
                      ? <><span className="dot" style={{ background: CAT_COLOR[p.category] }} />{SHORT[p.category]}</>
                      : <span>No status for {semester}</span>}
                    {p.category === 'New Comer' && <span className={`tag ${p.nc_active ? 'ok' : ''}`}>{p.nc_active ? 'Active' : 'Inactive'}</span>}
                    {p.week_joined && <span>joined {etLabel(p.week_joined)}</span>}
                  </span>
                </span>
                {s && <span className="num" style={{ fontWeight: 800, color: s.pct >= .6 ? 'var(--present)' : s.pct < .3 ? 'var(--absent)' : 'var(--muted)' }}>{pct(s.pct)}</span>}
              </div>
            </button>
          );
        })}
      </div>
      {list.length === 0 && <div className="card empty">Nobody matches “{q}”.</div>}
    </div>
  );
}

export function Editor({ person, statuses, people, semester, isAdmin, onClose, saved }) {
  const isNew = !!person.new;
  const own = isNew ? [] : statuses.filter((s) => s.person_id === person.id);
  const [f, setF] = useState({
    name: person.name || '', phone: person.phone || '+251', responsible: person.responsible || '',
    week_joined: person.week_joined || '', nc_active: person.nc_active ?? true,
  });
  const [cats, setCats] = useState(() => Object.fromEntries(SEMESTERS.map((s) => [s, own.find((o) => o.semester === s)?.category || ''])));
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const joinOptions = SEMESTERS.slice(0, 6).flatMap(sundaysOf).filter((s) => s <= today).reverse();

  async function save(e) {
    e.preventDefault();
    if (!isAdmin) return onClose();
    setBusy(true);
    const payload = {
      name: f.name.trim(), phone: f.phone.trim() || null, responsible: f.responsible.trim() || null,
      week_joined: f.week_joined || null, nc_active: f.nc_active,
    };
    let id = person.id;
    if (isNew) {
      const sn = Math.max(0, ...people.map((p) => p.sn || 0)) + 1;
      const { data, error } = await supabase.from('people').insert({ ...payload, sn }).select().single();
      if (error) { setBusy(false); return window.alert(error.message); }
      id = data.id;
    } else {
      const { error } = await supabase.from('people').update(payload).eq('id', id);
      if (error) { setBusy(false); return window.alert(error.message); }
    }
    const upserts = Object.entries(cats).filter(([, c]) => c).map(([s, c]) => ({ person_id: id, semester: s, category: c }));
    const removes = Object.entries(cats).filter(([s, c]) => !c && own.some((o) => o.semester === s)).map(([s]) => s);
    if (upserts.length) {
      const { error } = await supabase.from('person_status').upsert(upserts);
      if (error) { setBusy(false); return window.alert(error.message); }
    }
    if (removes.length) await supabase.from('person_status').delete().eq('person_id', id).in('semester', removes);
    saved();
  }

  async function remove() {
    if (!window.confirm(`Delete ${person.name} and all their attendance? This can't be undone.`)) return;
    const { error } = await supabase.from('people').delete().eq('id', person.id);
    if (error) return window.alert(error.message);
    saved();
  }

  const ro = !isAdmin;
  return (
    <Sheet title={isNew ? 'Add a person' : `Edit ${person.name}`} onClose={onClose}>
      <form onSubmit={save} className="form">
        <label>Name<input disabled={ro} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <div className="row2">
          <label>Phone<input disabled={ro} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label>Responsible person<input disabled={ro} value={f.responsible} onChange={(e) => setF({ ...f, responsible: e.target.value })} /></label>
        </div>
        <div className="row2">
          <label>First Sunday
            <select disabled={ro} value={f.week_joined} onChange={(e) => setF({ ...f, week_joined: e.target.value })}>
              <option value="">Existing member (not recorded)</option>
              {f.week_joined && !joinOptions.includes(f.week_joined) && <option value={f.week_joined}>{etLabel(f.week_joined, true)}</option>}
              {joinOptions.map((s) => <option key={s} value={s}>{etLabel(s, true)} ({fmtGreg(s)})</option>)}
            </select>
          </label>
          <label>As a new comer
            <select disabled={ro} value={f.nc_active ? 'yes' : 'no'} onChange={(e) => setF({ ...f, nc_active: e.target.value === 'yes' })}>
              <option value="yes">Active</option><option value="no">Inactive</option>
            </select>
          </label>
        </div>
        <fieldset>
          <legend>Status each semester</legend>
          <div className="sem-grid">
            {SEMESTERS.slice(0, 6).map((s) => (
              <label key={s} className={s === semester ? 'cur' : ''}>{s}{s === semester ? ' (shown)' : ''}
                <select disabled={ro} value={cats[s]} onChange={(e) => setCats({ ...cats, [s]: e.target.value })}>
                  <option value="">Same as before</option>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
        {isAdmin ? (
          <div className="row-actions">
            {!isNew && <button type="button" className="btn danger" onClick={remove}>Delete</button>}
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        ) : <p className="muted small">Only an admin can edit people.</p>}
      </form>
    </Sheet>
  );
}
