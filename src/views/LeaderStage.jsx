import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel } from '../lib/ethiopian';
import { ONE, stageOf, STAGE_LABEL, JOIN_WAYS } from '../lib/stats';

const MOVES = [
  ['candidate', 'Leadership candidate – stays a member', 'Member', 'candidate'],
  ['potential', 'Potential leader – joins the leadership team', 'Leader', 'potential'],
  ['leader', 'Leader', 'Leader', null],
  ['member', 'Member – not on the leadership path', 'Member', null],
];
export const currentMove = (p) => (stageOf(p) === 'candidate' ? 'candidate' : stageOf(p) === 'potential' ? 'potential' : p.category === 'Leader' ? 'leader' : p.category === 'Member' ? 'member' : '');

/* Change where someone is on the leadership path, keeping the history and weekly snapshots right. */
export default function LeaderStage({ p, idx, latest, reload, setError, onDone }) {
  const recent = useMemo(() => idx.held.slice(-8).reverse(), [idx.held]);
  const [move, setMove] = useState(currentMove(p));
  const [how, setHow] = useState(JOIN_WAYS[0]);
  const [from, setFrom] = useState(latest);
  const [busy, setBusy] = useState(false);
  const target = MOVES.find((m) => m[0] === move);
  const changesGroup = target && target[2] !== p.category;
  const joining = target && (move === 'potential' || move === 'leader') && p.category !== 'Leader';

  async function save() {
    if (!target) return;
    setBusy(true);
    try {
      const [, , cat, stage] = target;
      const note = joining ? how : move === 'potential' ? 'Potential leader' : null;
      const { error } = await supabase.from('people').update({ category: cat, leader_stage: stage, potential_leader: stage === 'potential' }).eq('id', p.id);
      if (error) throw error;
      if (changesGroup) {
        await supabase.from('attendance').update({ category: cat, active: true }).eq('person_id', p.id).gte('sunday', from);
        await supabase.from('category_history').update({ since: from, note }).eq('person_id', p.id).eq('category', cat).gte('since', from);
      }
      reload(); onDone?.();
    } catch (e) { setError(`Not saved: ${e.message}`); }
    setBusy(false);
  }

  return (
    <div className="form">
      <p className="small muted" style={{ margin: 0 }}>Now: <b>{ONE[p.category] || '—'}</b>{stageOf(p) ? ` · ${STAGE_LABEL[stageOf(p)]}` : ''}</p>
      <label>Move to
        <select value={move} onChange={(e) => setMove(e.target.value)}>
          {!currentMove(p) && <option value="">— keep as {ONE[p.category] || 'is'}</option>}
          {MOVES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {joining && <label>How they joined the leadership<select value={how} onChange={(e) => setHow(e.target.value)}>{JOIN_WAYS.map((w) => <option key={w}>{w}</option>)}</select></label>}
      {changesGroup && <label>Counts from Sunday<select value={from} onChange={(e) => setFrom(e.target.value)}>{recent.map((s) => <option key={s} value={s}>{etLabel(s, true)}</option>)}</select></label>}
      <p className="muted tiny" style={{ margin: 0 }}>Candidates stay members. Potential leaders have joined the leadership team and count as leaders. Earlier groups stay in the history.</p>
      <button type="button" className="btn lime" disabled={busy || !target || move === currentMove(p)} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
}
