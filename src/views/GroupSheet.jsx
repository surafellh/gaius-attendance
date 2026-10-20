import { useMemo, useState } from 'react';
import { etLabel } from '../lib/ethiopian';
import { CATEGORIES, ONE, JOIN_WAYS } from '../lib/stats';
import { changeGroup } from '../lib/changes';
import { Sheet, CAT_COLOR } from './common';

/* Change someone's group; the old group stays in their history. */
export default function GroupSheet({ p, to: initial, idx, latest, history = [], onClose, onDone, setError }) {
  const recent = useMemo(() => idx.held.slice(-10).reverse(), [idx.held]);
  const [to, setTo] = useState(initial || p.category || 'Member');
  const [from, setFrom] = useState(latest);
  const [how, setHow] = useState(JOIN_WAYS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = history.filter((h) => h.person_id === p.id).sort((a, b) => (a.since < b.since ? 1 : -1));
  async function save() {
    setBusy(true);
    try { await changeGroup(p, to, from, [to === 'Leader' ? how : null, note].filter(Boolean).join(' · ')); onDone(); }
    catch (e) { setError(`Not saved: ${e.message}`); }
    setBusy(false);
  }
  return (
    <Sheet title={`Change group · ${p.name}`} onClose={onClose}>
      <div className="form">
        <div className="group-pick">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={to === c ? 'on' : ''} style={{ '--c': CAT_COLOR[c] }} onClick={() => setTo(c)}>
              <span className="dot" style={{ background: CAT_COLOR[c] }} />{ONE[c]}{c === p.category && <small>now</small>}
            </button>
          ))}
        </div>
        <label>Counts from Sunday<select value={from} onChange={(e) => setFrom(e.target.value)}>{recent.map((s) => <option key={s} value={s}>{etLabel(s, true)}</option>)}</select></label>
        {to === 'Leader' && p.category !== 'Leader' && <label>How they joined the leadership<select value={how} onChange={(e) => setHow(e.target.value)}>{JOIN_WAYS.map((w) => <option key={w}>{w}</option>)}</select></label>}
        <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. membership review, Semester 1 2019" /></label>
        <button type="button" className="btn lime wide" disabled={busy || to === p.category} onClick={save}>{busy ? 'Saving…' : `Move to ${ONE[to]}`}</button>
        {mine.length > 0 && (
          <>
            <div className="form-section">History</div>
            <ul className="hist">{mine.map((h) => <li key={h.id}><span><b>{ONE[h.category] || h.category}</b>{h.note ? <span className="muted"> · {h.note}</span> : null}</span><span className="muted">from {etLabel(h.since, true)}</span></li>)}</ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
