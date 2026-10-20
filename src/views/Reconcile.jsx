import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, monthOf, addMonths, monthLabel, monthRange, ET_MONTHS_AM, addDays, weekdayOf, WEEKDAYS } from '../lib/ethiopian';
import { deptColor, deptName, itemsBetween, itemWhen } from '../lib/plans';
import { Icon } from './common';

const DECISIONS = [['fits', 'Fits our plan', 'ok'], ['adjusted', 'We adjusted', 'lime'], ['clash', 'Clash – tell HQ', 'bad'], ['not_applicable', 'Not for our center', '']];

/* HQ ↔ center: put every HQ event and HQ teaching Sunday next to what the center planned for the same days */
export default function Reconcile({ D, today, perm, progBy, reload, setError, profile }) {
  const [month, setMonth] = useState(() => monthOf(today));
  const [from, to] = monthRange(month);
  const [sent, setSent] = useState(false);
  const cid = D.center?.id || 1;
  const recs = useMemo(() => new Map((D.reconcile || []).filter((r) => r.center_id === cid).map((r) => [`${r.kind}|${r.ref_id}`, r])), [D.reconcile, cid]);
  const ours = itemsBetween(D, addDays(from, -3), addDays(to, 3)).filter((i) => i.due_kind === 'day' && i.status !== 'cancelled');
  const ourEvents = D.events.filter((e) => e.center_id === cid);
  const span = (e) => [e.starts_on, e.ends_on && e.ends_on > e.starts_on ? e.ends_on : e.starts_on];
  const rows = useMemo(() => {
    const out = [];
    for (const e of D.events.filter((x) => x.center_id == null)) {
      const [a, b] = span(e);
      if (b < from || a > to) continue;
      const near = ours.filter((i) => i.due >= a && i.due <= b);
      const evs = ourEvents.filter((o) => { const [c, d] = span(o); return c <= b && a <= d; });
      const sundays = []; for (let d = a; d <= b; d = addDays(d, 1)) if (weekdayOf(d) === 0) sundays.push(d);
      out.push({ kind: 'event', id: e.id, date: a, title: e.title, sub: [e.kind, e.location, b !== a ? `until ${etLabel(b)}` : null].filter(Boolean).join(' · '), near, evs, sundays });
    }
    for (const t of D.plan.filter((x) => x.center_id == null && x.sunday >= from && x.sunday <= to)) {
      const prog = progBy[t.sunday];
      const near = ours.filter((i) => i.due === t.sunday);
      const own = D.plan.find((x) => x.center_id === cid && x.sunday === t.sunday);
      out.push({ kind: 'teaching', id: t.id, date: t.sunday, title: `HQ teaching: ${t.topic || '—'}`, sub: [t.series, t.teacher].filter(Boolean).join(' · '), near, evs: [], prog, own });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [D.events, D.plan, ours, ourEvents, from, to, progBy, cid]); // eslint-disable-line
  const auto = (r) => (r.near.length || r.evs.length ? 'clash' : 'fits');
  const decided = (r) => recs.get(`${r.kind}|${r.id}`)?.decision || null;
  const counts = { clash: rows.filter((r) => (decided(r) || auto(r)) === 'clash').length, open: rows.filter((r) => !decided(r)).length };

  async function decide(r, decision, note) {
    const { error } = await supabase.from('hq_reconcile').upsert({ center_id: cid, kind: r.kind, ref_id: r.id, decision, note: note ?? recs.get(`${r.kind}|${r.id}`)?.note ?? null, updated_at: new Date().toISOString() }, { onConflict: 'center_id,kind,ref_id' });
    if (error) return setError(`Not saved: ${error.message}`);
    reload();
  }
  async function sendToHq() {
    const lines = rows.filter((r) => (decided(r) || auto(r)) === 'clash').map((r) => `• ${etLabel(r.date, true)} – ${r.title}: ${[...r.near.map((i) => i.plan.title), ...r.evs.map((e) => e.title)].join(', ') || 'see note'}${recs.get(`${r.kind}|${r.id}`)?.note ? ` (${recs.get(`${r.kind}|${r.id}`).note})` : ''}`);
    const { error } = await supabase.from('messages').insert({ center_id: cid, from_hq: false, author_name: profile?.full_name, subject: `Plan clashes · ${monthLabel(month)}`,
      body: lines.length ? `These HQ items clash with our ${monthLabel(month)} plan:\n${lines.join('\n')}` : `Our ${monthLabel(month)} plan fits all HQ items.` });
    if (error) return setError(`Not sent: ${error.message}`);
    setSent(true); reload();
  }

  return (
    <>
      <div className="month-bar">
        <button className="arrow" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><Icon.left /></button>
        <div className="current">
          <span className="w-main">{monthLabel(month)} <span className="am muted" style={{ fontWeight: 600 }}>{ET_MONTHS_AM[month.month]}</span></span>
          <span className="w-sub">{rows.length} HQ items · {counts.clash} clash{counts.clash === 1 ? '' : 'es'} · {counts.open} not reviewed yet</span>
        </div>
        <button className="arrow" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><Icon.right /></button>
      </div>
      <section className="card">
        <div className="card-head">
          <div><div className="card-title">HQ plan vs our plan</div><div className="card-sub">Each HQ event and HQ teaching Sunday, with what our departments planned for the same days. Decide what to do, then send the clashes to HQ.</div></div>
          {sent && <span className="tag ok">Sent – see Messages</span>}
          {perm.mark && rows.length > 0 && <button className="btn lime small" onClick={sendToHq}><Icon.bell width="16" height="16" /> Send to HQ</button>}
        </div>
        {rows.length === 0 && <p className="muted small">No HQ events or HQ teaching plan for this month yet. HQ adds them (as “All centers”) under Events and the Teaching plan.</p>}
        <ul className="rec-list">
          {rows.map((r) => {
            const d = decided(r), a = auto(r), rec = recs.get(`${r.kind}|${r.id}`);
            return (
              <li key={`${r.kind}${r.id}`} className={`rec ${d || a}`}>
                <div className="rec-date"><small>{WEEKDAYS[weekdayOf(r.date)].slice(0, 3)}</small><b>{etLabel(r.date).split(' ')[1]}</b><small>{fmtGreg(r.date)}</small></div>
                <div className="rec-body">
                  <div className="rec-hq"><span className="tag lime">HQ</span> <b className="am">{r.title}</b>{r.sub && <span className="small muted"> · {r.sub}</span>}</div>
                  <div className="rec-ours">
                    {r.kind === 'teaching' && <span className="small">{r.prog?.kind ? <>Our Sunday: <b>{r.prog.kind}{r.prog.topic ? ` – ${r.prog.topic}` : ''}</b></> : <span className="muted">No program recorded yet for that Sunday.</span>}</span>}
                    {r.near.map((i) => <span key={i.id} className="cal-chip plan" style={{ '--dc': deptColor(D, i.plan.department_id) }}><span className="am">{deptName(D, i.plan.department_id)}: {i.plan.title} · {itemWhen(i)}</span></span>)}
                    {r.evs.map((e) => <span key={e.id} className="cal-chip event am">Our event: {e.title}</span>)}
                    {!r.near.length && !r.evs.length && r.kind === 'event' && <span className="small muted">Nothing of ours on these days.</span>}
                  </div>
                  <div className="rec-actions">
                    <select className="small-select" value={d || ''} disabled={!perm.mark} onChange={(e) => decide(r, e.target.value || null)}>
                      <option value="">{a === 'clash' ? 'Looks like a clash – decide' : 'Looks fine – confirm'}</option>
                      {DECISIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <input className="rec-note" defaultValue={rec?.note || ''} disabled={!perm.mark} placeholder="Note (what we changed, what HQ should know)" onBlur={(e) => e.target.value !== (rec?.note || '') && decide(r, d || a, e.target.value)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
