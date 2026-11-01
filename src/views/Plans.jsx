import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel, fmtGreg, semesterOf, semName, SEMESTERS, semesterStart, semesterEnd, toEthiopian, ET_MONTHS, ET_MONTHS_AM, monthRange, addDays, semNo, semYear, semKey, WEEKDAYS, weekdayOf } from '../lib/ethiopian';
import { parseAnyDate, parseMonths } from '../lib/teaching';
import { deptColor, deptName, STATUS, KIND_LABEL, birr, semesterItems, itemState, monthKeyOf, monthName, saveItem, nextWeek, nextMonth, itemWhen, effStatus, needsReason, isPostponed } from '../lib/plans';
import { toExcel, toPdf, tableText, readSheet, rowsUnder, col, downloadTemplate } from '../lib/exports';
import { Sheet, Icon } from './common';
import Grid from './Grid';
import { recordUpdate } from '../lib/undo';

export default function PlansPage(props) {
  const { D, today, perm } = props;
  const TABS = perm.hqView ? [['dates', 'Planned dates'], ['budget', 'Budget']]
    : [['plans', 'Plans'], ['budget', 'Budget'], ['request', 'Month-end request'], ...(perm.studio ? [['report', 'Done / not done']] : [])];
  const [tab0, setTab] = useState(TABS[0][0]);
  const tab = TABS.some(([k]) => k === tab0) ? tab0 : TABS[0][0];
  const [sem, setSem] = useState(semesterOf(today));
  const sems = SEMESTERS.filter((s) => semesterStart(s) <= addDays(today, 400)).reverse();
  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Plans &amp; budget</h1><p className="page-sub">{perm.hqView ? 'Each department’s planned activities, dates and budget.' : 'Each department’s 6-month action & budget plan. Mark items done or not done (with the reason) and move them when dates change.'}</p></div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <select className="small-select" value={sem} onChange={(e) => setSem(e.target.value)} aria-label="Semester">{sems.map((s) => <option key={s} value={s}>{semName(s)}</option>)}</select>
          <div className="seg">
            {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
          </div>
        </div>
      </div>
      {tab === 'plans' && <PlanList {...props} sem={sem} />}
      {tab === 'dates' && <PlannedDates {...props} sem={sem} />}
      {tab === 'budget' && <Budget {...props} sem={sem} />}
      {tab === 'request' && <MonthRequest {...props} sem={sem} />}
      {tab === 'report' && <DoneReport {...props} sem={sem} />}
      {!perm.mark && <p className="muted tiny">You can view plans; leaders can update them.</p>}
      {D.plans.length === 0 && D.r2 && <div className="card empty">No plans yet for this center.</div>}
    </div>
  );
}

/* ── Plans by department ─────────────────────────────────────────── */
function PlanList({ D, today, perm, reload, setError, sem }) {
  const [open, setOpen] = useState(null);
  const [item, setItem] = useState(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState(perm.mark ? 'table' : 'cards');
  const items = useMemo(() => semesterItems(D, sem), [D, sem]);
  const plans = D.plans.filter((p) => p.semester === sem);
  const byDept = D.departments.map((d) => ({ d, plans: plans.filter((p) => p.department_id === d.id) })).filter((x) => x.plans.length);
  const stat = (list) => {
    const due = list.filter((i) => i.due <= today || i.status !== 'planned');
    return { total: list.length, due: due.length, done: list.filter((i) => i.status === 'done').length, notDone: list.filter((i) => effStatus(i, today) === 'not_done').length };
  };
  return (
    <>
      <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <div className="seg" style={{ marginRight: 'auto' }}><button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button><button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>By department</button></div>
        <button className="btn ghost" onClick={() => toExcel(plansList(D, sem))}><Icon.download width="18" height="18" /> Download plans</button>
        {perm.mark && <button className="btn ghost" onClick={() => setImporting(true)}><Icon.grid width="18" height="18" /> Import from Excel</button>}
        {perm.mark && <button className="btn lime" onClick={() => setAdding(true)}><Icon.plus /> Add a plan</button>}
      </div>
      {plans.length === 0 && <div className="card empty">No plans for {semName(sem)} yet.{perm.mark ? ' Add them one by one, or fill the Excel template and import it.' : ''}</div>}
      {view === 'table' && (
        <section className="card flush">
          <Grid canEdit={perm.mark} rows={[...plans].sort((a, b) => D.departments.findIndex((d) => d.id === a.department_id) - D.departments.findIndex((d) => d.id === b.department_id))} empty="No plans this semester."
            onSave={async (p, patch) => { const before = Object.fromEntries(Object.keys(patch).map((k) => [k, p[k] ?? null])), t = p.title; const { error } = await supabase.from('plans').update(patch).eq('id', p.id); if (error) return setError(`Not saved: ${error.message}`); recordUpdate('plans', p.id, before, patch, `plan “${t}”`); reload(); }}
            columns={[
              { key: 'department_id', label: 'Department', type: 'select', required: true, options: D.departments.map((d) => [d.id, d.name]), width: 160 },
              { key: 'title', label: 'Activity', required: true, width: 260 },
              { key: 'timing_note', label: 'When (as planned)', width: 150 },
              { key: 'dates', label: 'Dates', ro: true, width: 210, render: (p) => <button className="link small" style={{ textAlign: 'left' }} onClick={() => setOpen(p)}>{items.filter((i) => i.plan_id === p.id).slice(0, 4).map((i) => itemWhen(i)).join(' · ') || 'Add dates'}{items.filter((i) => i.plan_id === p.id).length > 4 ? ' …' : ''}</button> },
              { key: 'budget', label: 'Budget (birr)', type: 'number', width: 110 },
              { key: 'budget_note', label: 'Budget detail', width: 180 },
              { key: 'details', label: 'Details', width: 200 },
            ]} />
          {perm.mark && <p className="tiny muted" style={{ margin: '0 14px 12px' }}>Add new plans with “Add a plan” or Import from Excel; tap the dates to mark them done or move them.</p>}
        </section>
      )}
      {view === 'cards' && <div className="dept-plans">
        {byDept.map(({ d, plans: ps }) => {
          const its = items.filter((i) => i.plan.department_id === d.id);
          const s = stat(its);
          const budget = ps.reduce((n, p) => n + Number(p.budget || 0), 0);
          return (
            <section key={d.id} className="card plan-dept" style={{ '--dc': deptColor(D, d.id) }}>
              <div className="plan-dept-head">
                <div><div className="card-title">{d.name}</div><div className="small muted am">{d.name_am}{ps[0]?.prepared_by ? ` · ${ps[0].prepared_by}` : ''}</div></div>
                <div className="plan-dept-nums"><b>{s.done}</b>/{s.due} done so far<small>{birr(budget)}</small></div>
              </div>
              <div className="progress"><span style={{ width: `${s.due ? (s.done / s.due) * 100 : 0}%` }} /><i style={{ width: `${s.due ? (s.notDone / s.due) * 100 : 0}%` }} /></div>
              <ul className="plan-list">
                {ps.map((p) => {
                  const pi = its.filter((i) => i.plan_id === p.id);
                  return (
                    <li key={p.id}>
                      <button className="plan-row" onClick={() => setOpen(p)}>
                        <span className="plan-title am">{p.title}{perm.mark && <span className="edit-hint" aria-hidden="true"> ✎</span>}</span>
                        <span className="plan-meta">{p.timing_note || KIND_LABEL[pi[0]?.due_kind]}{Number(p.budget) ? ` · ${birr(p.budget)}` : ''}{pi.some((i) => needsReason(i, today)) && <span className="tag bad" style={{ marginLeft: 6 }}>reason needed</span>}{pi.some(isPostponed) && <span className="tag sun" style={{ marginLeft: 6 }}>postponed</span>}</span>
                      </button>
                      <span className="item-dots">
                        {pi.slice(0, 30).map((i) => {
                          const st = itemState(i, today);
                          return <button key={i.id} className={`idot ${st}`} title={`${itemWhen(i)} – ${STATUS[i.status][0]}${i.reason ? ': ' + i.reason : ''}`} onClick={() => setItem(i)} aria-label={`${p.title}, ${itemWhen(i)}, ${STATUS[i.status][0]}`} />;
                        })}
                        {pi.length > 30 && <small className="muted">+{pi.length - 30}</small>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>}
      <div className="grid-legend">
        <span className="row"><i className="idot done" /> Done</span><span className="row"><i className="idot not_done" /> Not done</span>
        <span className="row"><i className="idot overdue" /> Date passed, not marked</span><span className="row"><i className="idot ahead" /> Coming up</span>
      </div>
      {open && <PlanSheet plan={open} D={D} today={today} perm={perm} onClose={() => setOpen(null)} onItem={(i) => setItem(i)} reload={reload} setError={setError} />}
      {item && <ItemSheet item={item} D={D} perm={perm} onClose={() => setItem(null)} reload={reload} setError={setError} />}
      {adding && <NewPlanSheet D={D} sem={sem} onClose={() => setAdding(false)} reload={reload} setError={setError} />}
      {importing && <ImportPlansSheet D={D} sem={sem} onClose={() => setImporting(false)} reload={reload} setError={setError} />}
    </>
  );
}

export function ItemSheet({ item, D, perm, onClose, reload, setError }) {
  const plan = item.plan || D.plans.find((p) => p.id === item.plan_id);
  const [status, setStatus] = useState(item.status);
  const [reason, setReason] = useState(item.reason || '');
  const [due, setDue] = useState(item.due);
  const [budget, setBudget] = useState(item.budget ?? 0);
  const [note, setNote] = useState(item.note || '');
  const [approvedBy, setApprovedBy] = useState(item.approved_by || '');
  const [busy, setBusy] = useState(false);
  const [fix, setFix] = useState(false); // a typing correction, not a postponement
  const moved = due !== item.due && !fix;
  const today = new Date().toISOString().slice(0, 10);
  const lapsed = item.status === 'planned' && effStatus(item, today) === 'not_done';
  async function save() {
    if ((status === 'not_done' || (lapsed && status === 'planned' && !moved)) && !reason.trim()) return setError('Please write why it was not done.');
    if (moved && (!reason.trim() || !approvedBy.trim())) return setError('Postponing needs a reason and who approved it.');
    setBusy(true);
    try {
      await saveItem(item.id, { status, reason: reason.trim() || null, due, budget: Number(budget) || 0, note: note.trim() || null,
        done_on: status === 'done' ? (item.done_on || new Date().toISOString().slice(0, 10)) : null,
        ...(lapsed && status === 'planned' && !moved ? { status: 'not_done' } : {}),
        ...(moved ? { moved_from: item.moved_from || item.due, approved: true, approved_by: approvedBy.trim() } : {}) });
      reload(); onClose();
    } catch (e) { setError(`Not saved: ${e.message}`); }
    setBusy(false);
  }
  return (
    <Sheet title={plan?.title || 'Plan item'} onClose={onClose}>
      <div className="form">
        <p className="small muted" style={{ margin: 0 }}><span className="dot" style={{ background: deptColor(D, plan?.department_id) }} /> {deptName(D, plan?.department_id)} · {itemWhen(item)}{item.label ? ` · ${item.label}` : ''}{item.moved_from ? ` · moved from ${etLabel(item.moved_from)}` : ''}</p>
        {plan?.details && <p className="small am" style={{ margin: 0 }}>{plan.details}</p>}
        {lapsed && <div className="banner warn">This month is over and it wasn’t marked, so it counts as <b>not done</b>. Mark it done, or write the reason.</div>}
        {item.moved_from && <p className="tiny muted" style={{ margin: 0 }}>Postponed from {etLabel(item.moved_from, true)}{item.approved_by ? ` · approved by ${item.approved_by}` : ''}{item.reason ? ` · ${item.reason}` : ''}</p>}
        <div className="status-pick">
          {Object.entries(STATUS).map(([k, [l, c]]) => <button key={k} type="button" disabled={!perm.mark} className={`${status === k ? 'on' : ''} ${c}`} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        {(status === 'not_done' || status === 'cancelled' || moved || lapsed) && <label>{moved ? 'Why is it postponed?' : status === 'not_done' || lapsed ? 'Why was it not done?' : 'Reason'}<textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. clashed with the HQ program" disabled={!perm.mark} /></label>}
        <label>Date {due && <span className="faint">{etLabel(due, true)} · {fmtGreg(due)}</span>}
          <span className="row" style={{ gap: 6 }}>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={!perm.mark} style={{ flex: 1 }} />
            <button type="button" className="btn ghost small" disabled={!perm.mark} onClick={() => setDue(nextWeek(due))}>+1 week</button>
            <button type="button" className="btn ghost small" disabled={!perm.mark} onClick={() => setDue(nextMonth(due))}>+1 month</button>
          </span>
        </label>
        {due !== item.due && <label className="check"><input type="checkbox" checked={fix} onChange={(e) => setFix(e.target.checked)} /> The date was entered wrong – this is a correction, not a postponement</label>}
        {moved && <label>Postponing approved by<input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="e.g. leaders’ meeting Tikimt 11, center leader" /></label>}
        <div className="row2">
          <label>Budget for this item (birr)<input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={!perm.mark} /></label>
          <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} disabled={!perm.mark} /></label>
        </div>
        {plan?.budget_note && <p className="tiny muted am" style={{ margin: 0 }}>Budget detail: {plan.budget_note}</p>}
        {perm.mark && <button className="btn lime wide" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
      </div>
    </Sheet>
  );
}

function PlanSheet({ plan, D, today, perm, onClose, onItem, reload, setError }) {
  const [f, setF] = useState({ title: plan.title, details: plan.details || '', budget: plan.budget || 0, budget_note: plan.budget_note || '', timing_note: plan.timing_note || '', department_id: plan.department_id });
  const items = D.items.filter((i) => i.plan_id === plan.id).sort((a, b) => a.due.localeCompare(b.due)).map((i) => ({ ...i, plan }));
  const [newDue, setNewDue] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function run(q) { const { error } = await q; if (error) setError(`Not saved: ${error.message}`); else reload(); }
  return (
    <Sheet title={perm.mark ? "Edit plan" : "Plan"} onClose={onClose} wide>
      <div className="form">
        <label>Plan<input value={f.title} onChange={set('title')} disabled={!perm.mark} /></label>
        <label>Details<textarea rows={2} value={f.details} onChange={set('details')} disabled={!perm.mark} /></label>
        <div className="row3">
          <label>Department<select value={f.department_id || ''} onChange={set('department_id')} disabled={!perm.mark}>{D.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>When (as planned)<input value={f.timing_note} onChange={set('timing_note')} disabled={!perm.mark} /></label>
          <label>Total budget (birr)<input inputMode="numeric" value={f.budget} onChange={set('budget')} disabled={!perm.mark} /></label>
        </div>
        <label>Budget detail<input value={f.budget_note} onChange={set('budget_note')} disabled={!perm.mark} /></label>
        {perm.mark && <button className="btn ghost" onClick={() => run(supabase.from('plans').update({ ...f, budget: Number(f.budget) || 0, department_id: Number(f.department_id) }).eq('id', plan.id))}>Save plan</button>}
        <div className="form-section">Dates ({items.length})</div>
        <ul className="hist">
          {items.map((i) => (
            <li key={i.id}>
              <button className="link" style={{ padding: 0, textAlign: 'left' }} onClick={() => onItem(i)}>{itemWhen(i)}{i.label ? ` · ${i.label}` : ''}</button>
              <span><span className={`tag ${STATUS[i.status][1]}`}>{STATUS[i.status][0]}</span>{Number(i.budget) ? <span className="muted"> · {birr(i.budget)}</span> : null}
                {perm.mark && <button className="link small" style={{ marginLeft: 8 }} aria-label={`Remove ${itemWhen(i)}`} onClick={() => window.confirm(`Remove ${itemWhen(i)} from this plan?`) && run(supabase.from('plan_items').delete().eq('id', i.id))}>Remove</button>}</span>
            </li>
          ))}
        </ul>
        {perm.mark && (
          <div className="row" style={{ gap: 8 }}>
            <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} style={{ flex: 1 }} />
            <button className="btn ghost small" disabled={!newDue} onClick={() => { run(supabase.from('plan_items').insert({ plan_id: plan.id, center_id: plan.center_id, due: newDue, due_kind: 'day', status: 'planned' })); setNewDue(''); }}>Add a date</button>
            <button className="btn danger small" onClick={() => window.confirm('Delete this plan and all its dates?') && run(supabase.from('plans').delete().eq('id', plan.id)).then(onClose)}>Delete plan</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* create a plan and its dates; f: {department_id, title, details, budget, budget_note, kind, dates[], months[], prepared_by} */
export async function createPlan(D, sem, f) {
  const y = toEthiopian(semesterStart(sem)).year;
  let due = [];
  if (f.kind === 'day') due = f.dates.filter(Boolean).map((d) => [d, 'day']);
  if (f.kind === 'month') due = f.months.map((m) => [monthRange({ year: y, month: Number(m) })[1], 'month']);
  if (f.kind === 'week') { for (let d = f.dates.find(Boolean) || semesterStart(sem); d <= semesterEnd(sem); d = addDays(d, 7)) due.push([d, 'week']); }
  if (f.kind === 'period') due = [[semesterEnd(sem), 'period']];
  if (!String(f.title || '').trim() || !due.length) throw new Error('Add a title and at least one date or month.');
  const budget = Number(f.budget) || 0;
  const { data, error } = await supabase.from('plans').insert({ center_id: D.center?.id || 1, department_id: Number(f.department_id), semester: sem, title: f.title.trim(), details: f.details || null, budget, budget_note: f.budget_note || null,
    prepared_by: f.prepared_by || null, timing_note: f.timing_note || null, timing: { day: 'date', week: 'weekly', month: 'monthly', period: 'within' }[f.kind], sort: 1000 }).select().single();
  if (error) throw error;
  const per = Math.round((budget / due.length) * 100) / 100;
  const { error: e2 } = await supabase.from('plan_items').insert(due.map(([d, k]) => ({ plan_id: data.id, center_id: data.center_id, due: d, due_kind: k, budget: per, status: 'planned' })));
  if (e2) throw e2;
  return data;
}

function SemesterPick({ no, year, setNo, setYear }) {
  return (
    <div className="row2">
      <label>Semester<select value={no} onChange={(e) => setNo(Number(e.target.value))}><option value={1}>Semester 1 (Meskerem – Yekatit)</option><option value={2}>Semester 2 (Megabit – Pagume)</option></select></label>
      <label>Ethiopian year<input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></label>
    </div>
  );
}

function NewPlanSheet({ D, sem: sem0, onClose, reload, setError }) {
  const [no, setNo] = useState(semNo(sem0));
  const [year, setYear] = useState(semYear(sem0));
  const sem = semKey(no, Number(year) || semYear(sem0));
  const [f, setF] = useState({ department_id: D.departments[0]?.id, title: '', details: '', budget: '', budget_note: '', kind: 'day', dates: [''], months: [] });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const semMonths = [0, 1, 2, 3, 4, 5].map((i) => toEthiopian(semesterStart(sem)).month + i).filter((m) => m <= 12);
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try { await createPlan(D, sem, f); reload(); onClose(); } catch (err) { setError(`Not saved: ${err.message}`); }
    setBusy(false);
  }
  const outside = f.dates.some((d) => d && (d < semesterStart(sem) || d > semesterEnd(sem)));
  return (
    <Sheet title={`New plan · ${semName(sem)}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <SemesterPick no={no} year={year} setNo={setNo} setYear={setYear} />
        <label>Department<select value={f.department_id} onChange={set('department_id')}>{D.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Plan<input value={f.title} onChange={set('title')} required /></label>
        <label>Details<textarea rows={2} value={f.details} onChange={set('details')} /></label>
        <div className="seg">{[['day', 'On dates'], ['week', 'Every week'], ['month', 'In months'], ['period', 'Any time']].map(([k, l]) => <button type="button" key={k} className={f.kind === k ? 'on' : ''} onClick={() => setF({ ...f, kind: k })}>{l}</button>)}</div>
        {(f.kind === 'day' || f.kind === 'week') && f.dates.map((d, i) => (
          <label key={i}>{f.kind === 'week' ? 'First week' : `Date ${i + 1}`} {d && <span className="faint">{WEEKDAYS[weekdayOf(d)]}, {etLabel(d, true)}</span>}<input type="date" value={d} onChange={(e) => { const n = [...f.dates]; n[i] = e.target.value; setF({ ...f, dates: n }); }} /></label>
        ))}
        {f.kind === 'day' && <button type="button" className="link small" onClick={() => setF({ ...f, dates: [...f.dates, ''] })}>+ another date</button>}
        {outside && <p className="banner warn" style={{ margin: 0 }}>A date is outside {semName(sem)}.</p>}
        {f.kind === 'month' && <div className="chips">{semMonths.map((m) => <label key={m} className="check"><input type="checkbox" checked={f.months.includes(m)} onChange={(e) => setF({ ...f, months: e.target.checked ? [...f.months, m] : f.months.filter((x) => x !== m) })} /> {ET_MONTHS[m]}</label>)}</div>}
        <div className="row2">
          <label>Budget (birr, total)<input inputMode="numeric" value={f.budget} onChange={set('budget')} placeholder="– if none" /></label>
          <label>Budget detail<input value={f.budget_note} onChange={set('budget_note')} /></label>
        </div>
        <button className="btn lime wide" disabled={busy}>{busy ? 'Saving…' : 'Add plan'}</button>
      </form>
    </Sheet>
  );
}

/* ── Excel: the semester's plans in the same layout as the import template ─── */
const PLAN_HEAD = ['Department', 'Activity', 'Details', 'When', 'Dates or months', 'Budget (birr)', 'Budget detail', 'Prepared by'];
const WHEN = [['day', 'On dates'], ['week', 'Every week'], ['month', 'In months'], ['period', 'Any time']];
const dateCell = (d) => { const e = toEthiopian(d); return `${ET_MONTHS_AM[e.month]} ${String(e.day).padStart(2, '0')}`; };
export function plansList(D, sem) {
  const plans = D.plans.filter((p) => p.semester === sem);
  const body = plans.map((p) => {
    const its = D.items.filter((i) => i.plan_id === p.id).sort((a, b) => a.due.localeCompare(b.due));
    const k = its[0]?.due_kind || 'day';
    const when = k === 'month' ? its.map((i) => ET_MONTHS[toEthiopian(i.due).month]).join(', ') : k === 'week' ? (its[0] ? dateCell(its[0].due) : '') : k === 'period' ? '' : its.map((i) => dateCell(i.due)).join(', ');
    return [deptName(D, p.department_id), p.title, p.details || '', WHEN.find((w) => w[0] === k)[1], when, Number(p.budget) || '', p.budget_note || '', p.prepared_by || ''];
  });
  return { title: `Gaius ${D.center?.name || ''} – plans, ${semName(sem)}`, file: `Gaius_${D.center?.name || ''}_plans_${sem.replace(' ', '_')}`, sub: `${plans.length} plans`, sheets: [{ name: 'Plans', head: PLAN_HEAD, body }] };
}

function ImportPlansSheet({ D, sem: sem0, onClose, reload, setError }) {
  const [no, setNo] = useState(semNo(sem0));
  const [year, setYear] = useState(semYear(sem0));
  const sem = semKey(no, Number(year) || semYear(sem0));
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const findDept = (v) => {
    const t = String(v || '').trim().toLowerCase();
    if (!t) return null;
    return D.departments.find((d) => [d.name, d.name_am].some((n) => n && n.toLowerCase() === t))
      || D.departments.find((d) => [d.name, d.name_am].some((n) => n && (n.toLowerCase().includes(t) || t.includes(n.toLowerCase()))));
  };
  async function template() {
    await downloadTemplate(`Plan_template_${semName(sem).replace(/\W+/g, '_')}`, 'Plans',
      `Plans · ${semName(sem)} · one activity per row. When: On dates / Every week / In months / Any time. Dates like ጥቅምት 15, ኅዳር 20 (or 2026-10-25); months like Tikimt, Hidar. Departments: ${D.departments.map((d) => d.name).join(', ')}`,
      PLAN_HEAD, [[D.departments[0]?.name || 'Follow-up', 'Example – delete this row', 'What and why', 'On dates', 'ጥቅምት 15, ኅዳር 20', 1500, 'Transport and snacks', '']], [18, 34, 30, 12, 26, 12, 24, 16]);
  }
  async function readFile(file) {
    try {
      const { head, rows: list } = rowsUnder(await readSheet(file), ['department', 'ክፍል']);
      const c = { d: col(head, 'department', 'ክፍል'), a: col(head, 'activity', 'plan', 'ተግባር'), de: col(head, 'detail'), w: col(head, 'when'), x: col(head, 'dates', 'date', 'month'), b: col(head, 'budget (', 'budget'), bd: col(head, 'budget detail'), p: col(head, 'prepared') };
      if (c.d < 0 || c.a < 0) return setError('The sheet needs “Department” and “Activity” columns – use the template.');
      const y = Number(year);
      setRows(list.map(({ line, cells }) => {
        const get = (i) => (i >= 0 ? cells[i] : '');
        const title = String(get(c.a) || '').trim();
        const dept = findDept(get(c.d));
        const w = String(get(c.w) || '').toLowerCase();
        const kind = /week|ሳምንት/.test(w) ? 'week' : /month|ወር/.test(w) ? 'month' : /any|period|ጊዜ/.test(w) ? 'period' : 'day';
        const raw = get(c.x);
        const parts = raw instanceof Date || typeof raw === 'number' ? [raw] : String(raw || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
        const dates = kind === 'day' || kind === 'week' ? parts.map((x) => parseAnyDate(x, y)) : [];
        const months = kind === 'month' ? parseMonths(raw) : [];
        const problems = [];
        if (/example/i.test(title)) problems.push('example row');
        if (!title) problems.push('no activity');
        if (!dept) problems.push(`department “${get(c.d)}” not found`);
        if (kind === 'day' && (!dates.length || dates.some((d) => !d))) problems.push('a date was not understood');
        if (kind === 'month' && !months.length) problems.push('no months');
        if (dates.some((d) => d && (d < semesterStart(sem) || d > semesterEnd(sem)))) problems.push('date outside the semester');
        return { line, title, dept, kind, dates: dates.filter(Boolean), months, details: String(get(c.de) || ''), budget: Number(String(get(c.b) || '').replace(/[^\d.]/g, '')) || 0, budget_note: String(get(c.bd) || ''), prepared_by: String(get(c.p) || ''), problems, use: !problems.length };
      }));
    } catch (e) { setError(`Couldn’t read the file: ${e.message}`); }
  }
  async function save() {
    setBusy(true);
    let n = 0;
    for (const r of rows.filter((x) => x.use)) {
      try { await createPlan(D, sem, { department_id: r.dept.id, title: r.title, details: r.details, budget: r.budget, budget_note: r.budget_note, prepared_by: r.prepared_by, kind: r.kind, dates: r.dates, months: r.months }); n++; setDone(n); }
      catch (e) { setError(`Row ${r.line} not saved: ${e.message}`); break; }
    }
    setBusy(false); reload(); if (n) onClose();
  }
  const usable = (rows || []).filter((r) => r.use).length;
  return (
    <Sheet title="Import plans from Excel" onClose={onClose} wide>
      <div className="form">
        <SemesterPick no={no} year={year} setNo={setNo} setYear={setYear} />
        <p className="small muted" style={{ margin: 0 }}>{semName(sem)}: {etLabel(semesterStart(sem), true)} – {etLabel(semesterEnd(sem), true)}. Imported plans are added to the ones already there.</p>
        <div className="import-box">
          <button type="button" className="btn ghost" onClick={template}><Icon.download width="18" height="18" /> Download template</button>
          <label className="btn lime file-btn"><Icon.grid width="18" height="18" /> Choose the filled Excel file<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} /></label>
        </div>
        {rows && (
          <div style={{ overflowX: 'auto' }}>
            <table className="gtable left"><thead><tr><th /><th>Department</th><th>Activity</th><th>When</th><th>Budget</th></tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className={r.use ? '' : 'skipped'}>
                  <td><input type="checkbox" checked={r.use} disabled={!r.dept || !r.title} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, use: e.target.checked } : x)))} aria-label={`Import row ${r.line}`} /></td>
                  <td>{r.dept?.name || <span className="tag bad">?</span>}</td>
                  <td className="am">{r.title}{r.problems.length > 0 && <div className="tiny" style={{ color: 'var(--absent)' }}>Row {r.line}: {r.problems.join(', ')}</div>}</td>
                  <td className="small">{r.kind === 'month' ? r.months.map((m) => ET_MONTHS[m]).join(', ') : r.kind === 'period' ? 'Any time' : r.kind === 'week' ? `Weekly from ${r.dates[0] ? etLabel(r.dates[0]) : 'the start'}` : r.dates.map((d) => etLabel(d)).join(', ')}</td>
                  <td>{r.budget ? birr(r.budget) : '–'}</td>
                </tr>
              ))}</tbody></table>
          </div>
        )}
        <button className="btn lime" disabled={!usable || busy} onClick={save}>{busy ? `Saving ${done}/${usable}…` : `Import ${usable || ''} plan${usable === 1 ? '' : 's'}`}</button>
      </div>
    </Sheet>
  );
}

/* ── Budget ──────────────────────────────────────────────────────── */
function Budget({ D, sem }) {
  const items = useMemo(() => semesterItems(D, sem), [D, sem]);
  const months = [...new Set(items.map((i) => monthKeyOf(i.due)))].sort();
  const depts = D.departments.filter((d) => items.some((i) => i.plan.department_id === d.id));
  const sum = (list) => list.reduce((n, i) => n + Number(i.budget || 0), 0);
  const total = sum(items);
  const doneSpent = sum(items.filter((i) => i.status === 'done'));
  const max = Math.max(1, ...depts.map((d) => sum(items.filter((i) => i.plan.department_id === d.id))));
  return (
    <div className="dash-grid">
      <section className="card">
        <div className="card-head"><div><div className="card-title">{semName(sem)} budget</div><div className="card-sub">Requested in the department plans.</div></div></div>
        <div className="budget-total"><b>{birr(total)}</b><span>{birr(doneSpent)} for items already done</span></div>
        {depts.map((d) => {
          const v = sum(items.filter((i) => i.plan.department_id === d.id));
          return (
            <div key={d.id} className="funnel-row">
              <span><span className="dot" style={{ background: deptColor(D, d.id) }} /> {d.name}</span>
              <span className="funnel-track"><span style={{ width: `${(v / max) * 100}%`, background: deptColor(D, d.id) }} /></span>
              <b className="num">{v ? v.toLocaleString() : '–'}</b>
            </div>
          );
        })}
      </section>
      <section className="card">
        <div className="card-head"><div><div className="card-title">By month</div><div className="card-sub">“Any time” items are counted in the last month.</div></div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable">
            <thead><tr><th>Department</th>{months.map((m) => <th key={m}>{ET_MONTHS[Number(m.slice(5))].slice(0, 3)}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {depts.map((d) => (
                <tr key={d.id}><td><span className="dot" style={{ background: deptColor(D, d.id) }} /> {d.name}</td>
                  {months.map((m) => { const v = sum(items.filter((i) => i.plan.department_id === d.id && monthKeyOf(i.due) === m)); return <td key={m} className="num">{v ? v.toLocaleString() : ''}</td>; })}
                  <td className="num"><b>{sum(items.filter((i) => i.plan.department_id === d.id)).toLocaleString()}</b></td></tr>
              ))}
              <tr className="total"><td>Total</td>{months.map((m) => <td key={m} className="num">{sum(items.filter((i) => monthKeyOf(i.due) === m)).toLocaleString()}</td>)}<td className="num">{total.toLocaleString()}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ── Month-end budget request for Admin & Finance ───────────────── */
export function requestFor(D, monthKey, withSkipped = false) {
  const y = Number(monthKey.slice(0, 4)), m = Number(monthKey.slice(5));
  const [from, to] = monthRange({ year: y, month: m });
  const plans = new Map(D.plans.map((p) => [p.id, p]));
  const list = D.items.filter((i) => i.due >= from && i.due <= to && i.status !== 'cancelled' && plans.has(i.plan_id)).map((i) => ({ ...i, plan: plans.get(i.plan_id) }));
  const needs = list.filter((i) => Number(i.budget) > 0 && i.status !== 'done' && i.status !== 'not_done');
  return { from, to, needs: withSkipped ? needs : needs.filter((i) => !i.request_skip), free: list.filter((i) => !Number(i.budget)) };
}
function MonthRequest({ D, today, sem, perm, reload, setError }) {
  const months = [...new Set(semesterItems(D, sem).map((i) => monthKeyOf(i.due)))].sort();
  const nextKey = monthKeyOf(addDays(today, 15));
  const [key, setKey] = useState(months.includes(nextKey) ? nextKey : months[0]);
  const [copied, setCopied] = useState('');
  if (!key) return <div className="card empty">No plans in this semester.</div>;
  const { needs, free } = requestFor(D, key, true);
  const asked = needs.filter((i) => !i.request_skip);
  const total = asked.reduce((n, i) => n + Number(i.budget), 0);
  const rep = {
    title: `Gaius ${D.center?.name || ''} – budget request, ${monthName(key)}`, file: `Gaius_${D.center?.name || ''}_budget_${monthName(key).replace(' ', '_')}`,
    sub: `${asked.length} plans · total ${birr(total)}`,
    sheets: [{ name: 'Budget request', head: ['Date', 'Department', 'Plan', 'Budget (birr)', 'Detail'], body: [...asked.map((i) => [itemWhen(i), deptName(D, i.plan.department_id), i.plan.title + (i.moved_from ? ` (postponed from ${etLabel(i.moved_from)})` : ''), Number(i.budget), i.plan.budget_note || '']), ['', '', 'Total', total, '']] }],
  };
  async function toggle(i) {
    try { await saveItem(i.id, { request_skip: !i.request_skip }); reload(); } catch (e) { setError(`Not saved: ${e.message}`); }
  }
  return (
    <section className="card">
      <div className="card-head">
        <div><div className="card-title">Budget request · {monthName(key)}</div><div className="card-sub">For the last leaders’ meeting of the month. Untick plans you won’t ask budget for; postponed plans move here automatically. Then give the list to Admin &amp; Finance.</div></div>
        <select className="small-select" value={key} onChange={(e) => setKey(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
      </div>
      <table className="gtable left">
        <thead><tr><th>Ask</th><th>Date</th><th>Department</th><th>Plan</th><th style={{ textAlign: 'right' }}>Birr</th></tr></thead>
        <tbody>
          {needs.map((i) => (
            <tr key={i.id} className={i.request_skip ? 'skipped' : ''}>
              <td><input type="checkbox" checked={!i.request_skip} disabled={!perm.mark} onChange={() => toggle(i)} aria-label={`Ask budget for ${i.plan.title}`} /></td>
              <td>{itemWhen(i)}</td><td><span className="dot" style={{ background: deptColor(D, i.plan.department_id) }} /> {deptName(D, i.plan.department_id)}</td>
              <td className="am">{i.plan.title}{i.moved_from && <span className="tag sun" style={{ marginLeft: 6 }}>postponed from {etLabel(i.moved_from)}</span>}{i.plan.budget_note && <div className="tiny muted">{i.plan.budget_note}</div>}</td>
              <td className="num" style={{ textAlign: 'right' }}>{Number(i.budget).toLocaleString()}</td>
            </tr>
          ))}
          {needs.length === 0 && <tr><td colSpan={5} className="muted">Nothing needs budget this month.</td></tr>}
          <tr className="total"><td colSpan={4}>Total to ask{needs.length !== asked.length ? ` (${needs.length - asked.length} left out)` : ''}</td><td className="num" style={{ textAlign: 'right' }}>{total.toLocaleString()}</td></tr>
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn lime" onClick={() => toExcel(rep)}><Icon.grid width="18" height="18" /> Excel</button>
        <button className="btn ghost" onClick={() => toPdf(rep)}><Icon.book width="18" height="18" /> PDF</button>
        <button className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(tableText(rep.sheets[0])); setCopied('Copied.'); } catch { setCopied('Copy was blocked – use the PDF page.'); } }}><Icon.copy width="18" height="18" /> Copy</button>
        {copied && <span className="small muted">{copied}</span>}
      </div>
      {free.length > 0 && <p className="small muted" style={{ marginTop: 12 }}>Also planned this month without budget ({free.length}): {[...new Set(free.map((i) => i.plan.title))].slice(0, 8).join(' · ')}</p>}
    </section>
  );
}

/* ── Done / not done (monthly or semester) ───────────────────────── */
export const STATUS_TEXT = (i, today) => {
  const st = effStatus(i, today);
  if (st === 'planned' && i.moved_from) return 'Postponed';
  if (st === 'not_done' && i.status === 'planned') return 'Not done (month over, not marked)';
  return STATUS[st][0];
};
export function planReport(D, from, to, label) {
  const today = new Date().toISOString().slice(0, 10);
  const plans = new Map(D.plans.map((p) => [p.id, p]));
  const list = D.items.filter((i) => i.due >= from && i.due <= to && plans.has(i.plan_id)).map((i) => ({ ...i, plan: plans.get(i.plan_id) }))
    .sort((a, b) => a.due.localeCompare(b.due));
  const depts = D.departments.filter((d) => list.some((i) => i.plan.department_id === d.id));
  const st = (i) => effStatus(i, today);
  const perf = depts.map((d) => {
    const x = list.filter((i) => i.plan.department_id === d.id);
    const due = x.filter((i) => st(i) !== 'planned' || i.due <= today);
    const done = x.filter((i) => st(i) === 'done').length;
    return [d.name, x.length, done, x.filter((i) => st(i) === 'not_done').length, x.filter((i) => i.moved_from && st(i) === 'planned').length,
      x.filter((i) => st(i) === 'cancelled').length, x.filter((i) => st(i) === 'planned').length, due.length ? `${Math.round((done / due.length) * 100)}%` : '–',
      x.reduce((n, i) => n + Number(i.budget || 0), 0), x.filter((i) => st(i) === 'done').reduce((n, i) => n + Number(i.budget || 0), 0)];
  });
  const tot = perf.reduce((t, r) => t.map((v, k) => (k === 0 ? 'All departments' : k === 7 ? '' : v + r[k])), ['', 0, 0, 0, 0, 0, 0, '', 0, 0]);
  const dueAll = list.filter((i) => st(i) !== 'planned' || i.due <= today).length;
  tot[7] = dueAll ? `${Math.round((tot[2] / dueAll) * 100)}%` : '–';
  return {
    title: `Gaius ${D.center?.name || ''} – plan report, ${label}`, file: `Gaius_${D.center?.name || ''}_plan_report_${label.replace(/\W+/g, '_')}`,
    sub: `${tot[2]} done · ${tot[3]} not done · ${tot[4]} postponed · ${tot[6]} still to come`,
    sheets: [
      { name: 'Department performance', head: ['Department', 'Planned', 'Done', 'Not done', 'Postponed', 'Cancelled', 'Still to come', 'Done so far', 'Budget planned', 'Budget used (done)'], body: [...perf, tot] },
      { name: 'All activities', head: ['When', 'Department', 'Activity', 'Status', 'Budget', 'Reason / note'],
        body: list.map((i) => [itemWhen(i), deptName(D, i.plan.department_id), i.plan.title + (i.label ? ` – ${i.label}` : ''), STATUS_TEXT(i, today), Number(i.budget) || '',
          [i.reason, i.moved_from ? `postponed from ${etLabel(i.moved_from)}${i.approved_by ? `, approved by ${i.approved_by}` : ''}` : '', i.note].filter(Boolean).join(' · ') || (needsReason(i, today) ? 'reason needed' : '')]) },
    ],
  };
}
function DoneReport({ D, today, sem, perm, reload, setError }) {
  const months = [...new Set(semesterItems(D, sem).map((i) => monthKeyOf(i.due)))].sort();
  const [key, setKey] = useState('sem');
  const [item, setItem] = useState(null);
  const [only, setOnly] = useState('all');
  const [from, to, label] = key === 'sem' ? [semesterStart(sem), semesterEnd(sem), semName(sem)] : [...monthRange({ year: Number(key.slice(0, 4)), month: Number(key.slice(5)) }), monthName(key)];
  const rep = planReport(D, from, to, label);
  const plans = new Map(D.plans.map((p) => [p.id, p]));
  const list = D.items.filter((i) => i.due >= from && i.due <= to && plans.has(i.plan_id)).map((i) => ({ ...i, plan: plans.get(i.plan_id) })).sort((a, b) => a.due.localeCompare(b.due));
  const shown = list.filter((i) => only === 'all' || (only === 'reason' ? needsReason(i, today) : STATUS_TEXT(i, today).startsWith({ done: 'Done', not: 'Not done', post: 'Postponed', plan: 'Planned' }[only])));
  const [perf] = rep.sheets;
  return (
    <>
      <section className="card">
        <div className="card-head">
          <div><div className="card-title">Department performance · {label}</div><div className="card-sub">{rep.sub}. Items whose month is over and weren’t marked count as not done.</div></div>
          <div className="row">
            <select className="small-select" value={key} onChange={(e) => setKey(e.target.value)}><option value="sem">Whole {semName(sem)}</option>{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
            <button className="btn ghost small" onClick={() => toPdf(rep)}>PDF</button><button className="btn ghost small" onClick={() => toExcel(rep)}>Excel</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable">
            <thead><tr>{perf.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{perf.body.map((r, k) => <tr key={r[0]} className={k === perf.body.length - 1 ? 'total' : ''}>{r.map((v, i) => <td key={i} className={i ? 'num' : ''}>{i >= 8 ? (v ? v.toLocaleString() : '–') : v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <div><div className="card-title">All activities ({shown.length})</div><div className="card-sub">Tap one to mark it, give the reason, or postpone it (needs a reason and who approved it).</div></div>
          <div className="seg">{[['all', 'All'], ['done', 'Done'], ['not', 'Not done'], ['reason', 'Reason needed'], ['post', 'Postponed'], ['plan', 'To come']].map(([k, l]) => <button key={k} className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{l}</button>)}</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="gtable left act-table">
            <thead><tr><th>When</th><th>Department</th><th>Activity</th><th>Status</th><th>Reason / note</th></tr></thead>
            <tbody>
              {shown.map((i) => {
                const t = STATUS_TEXT(i, today);
                return (
                  <tr key={i.id} onClick={() => setItem(i)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{itemWhen(i)}</td>
                    <td><span className="dot" style={{ background: deptColor(D, i.plan.department_id) }} /> {deptName(D, i.plan.department_id)}</td>
                    <td className="am">{i.plan.title}{i.label ? ` – ${i.label}` : ''}</td>
                    <td><span className={`tag ${t.startsWith('Done') ? 'ok' : t.startsWith('Not') ? 'bad' : t === 'Postponed' ? 'sun' : ''}`}>{t}</span></td>
                    <td className="small">{i.reason || i.note || (needsReason(i, today) ? <span className="tag bad">reason needed</span> : '')}{i.moved_from ? <div className="tiny muted">from {etLabel(i.moved_from)}{i.approved_by ? `, approved by ${i.approved_by}` : ''}</div> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {item && <ItemSheet item={item} D={D} perm={perm} onClose={() => setItem(null)} reload={reload} setError={setError} />}
    </>
  );
}

/* HQ: what each department planned and when, with the budget – no done / not done */
function PlannedDates({ D, sem }) {
  const items = useMemo(() => semesterItems(D, sem).filter((i) => i.status !== 'cancelled').sort((a, b) => a.due.localeCompare(b.due)), [D, sem]);
  const total = items.reduce((n, i) => n + Number(i.budget || 0), 0);
  const rep = { title: `Gaius ${D.center?.name || ''} – planned activities, ${semName(sem)}`, file: `Gaius_${D.center?.name || ''}_planned_${sem.replace(' ', '_')}`, sub: `${items.length} dates · ${birr(total)}`,
    sheets: [{ name: 'Planned dates', head: ['When', 'Department', 'Activity', 'Budget'], body: items.map((i) => [itemWhen(i), deptName(D, i.plan.department_id), i.plan.title + (i.label ? ` – ${i.label}` : ''), Number(i.budget) || '']) }] };
  return (
    <section className="card flush">
      <div className="card-head" style={{ padding: '14px 16px 0' }}>
        <div><div className="card-title">Planned activities · {semName(sem)}</div><div className="card-sub">{items.length} dates · {birr(total)} planned</div></div>
        <div className="row"><button className="btn ghost small" onClick={() => toExcel(rep)}>Excel</button><button className="btn ghost small" onClick={() => toPdf(rep)}>PDF</button></div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="gtable left act-table">
          <thead><tr><th>When</th><th>Department</th><th>Activity</th><th>Budget</th></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id}><td style={{ whiteSpace: 'nowrap' }}>{itemWhen(i)}</td><td><span className="dot" style={{ background: deptColor(D, i.plan.department_id) }} /> {deptName(D, i.plan.department_id)}</td><td className="am">{i.plan.title}{i.label ? ` – ${i.label}` : ''}</td><td className="num">{Number(i.budget) ? birr(i.budget) : '–'}</td></tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="muted">No plans this semester.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}
