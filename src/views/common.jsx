import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { etLabel, fmtGreg, latestSunday, groupByMonth, toEthiopian, ET_MONTHS_AM } from '../lib/ethiopian';
import { SHORT, pct } from '../lib/stats';

export const CAT_COLOR = {
  'Leader': 'var(--c-leader)', 'Senior Leader': 'var(--c-senior)', 'Member': 'var(--c-member)',
  'Active Informal Member': 'var(--c-active)', 'Inactive Informal Member': 'var(--c-inactive)',
  'New Comer': 'var(--c-newcomer)', 'Active New Comer': 'var(--c-newcomer)',
};

/* ───── icons (inline, stroke-based) ───── */
const I = (d, extra) => (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true" {...p}>
    {d}{extra}
  </svg>
);
export const Icon = {
  check: I(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  x: I(<path d="M6 6l12 12M18 6L6 18" />),
  left: I(<path d="M15 5l-7 7 7 7" />),
  right: I(<path d="M9 5l7 7-7 7" />),
  down: I(<path d="M6 9l6 6 6-6" />),
  search: I(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>),
  phone: I(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />),
  plus: I(<path d="M12 5v14M5 12h14" />),
  roll: I(<><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" /></>),
  bell: I(<><path d="M6 16V11a6 6 0 1112 0v5l2 2H4z" /><path d="M10 21h4" /></>),
  chart: I(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  people: I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5a5 5 0 016 5" /></>),
  shield: I(<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />),
  cal: I(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  edit: I(<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />),
};

/* Adey Abeba (Meskel daisy) mark */
export function Mark() {
  const petals = Array.from({ length: 8 }, (_, i) => (
    <ellipse key={i} cx="17" cy="8.5" rx="3.3" ry="6.2" fill="#f4b23e" transform={`rotate(${i * 45} 17 17)`} />
  ));
  return (
    <svg className="brand-mark" viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="10" fill="#2b3166" />
      {petals}
      <circle cx="17" cy="17" r="4.2" fill="#1c2145" />
    </svg>
  );
}

export function Initials({ name, category }) {
  const parts = (name || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/);
  const t = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  return <span className="initials" style={{ background: CAT_COLOR[category] || 'var(--ink-3)' }}>{t.toUpperCase()}</span>;
}

export function Sheet({ title, onClose, children, head }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="sheet-head">
          {head || <h3>{title}</h3>}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ───── Week picker: one compact control + a calendar sheet ───── */
export function WeekPicker({ sundays, value, onChange, held, counts = {}, allowLatest, latest }) {
  const [open, setOpen] = useState(false);
  const today = latestSunday();
  const shown = value || latest;
  const selectable = sundays.filter((s) => s <= today || held?.has(s));
  const idx = selectable.indexOf(shown);
  const go = (d) => {
    const n = selectable[idx + d];
    if (n) onChange(allowLatest && n === latest ? null : n);
  };
  const e = shown ? toEthiopian(shown) : null;
  const max = Math.max(1, ...Object.values(counts));
  const weekNo = shown ? sundays.indexOf(shown) + 1 : 0;

  return (
    <>
      <div className="weekbar">
        <button className="arrow" onClick={() => go(-1)} disabled={idx <= 0} aria-label="Previous Sunday"><Icon.left /></button>
        <button className="current" onClick={() => setOpen(true)} aria-label="Choose a Sunday">
          {e ? (
            <>
              <span className="cal"><small>{etLabel(shown).split(' ')[0].slice(0, 3)}</small><b>{e.day}</b></span>
              <span>
                <span className="w-main">{etLabel(shown, true)}</span>
                <span className="w-sub" style={{ display: 'block' }}>
                  {fmtGreg(shown)} · week {weekNo} of {sundays.length}{allowLatest && !value ? ' · latest' : ''}
                </span>
              </span>
            </>
          ) : <span className="w-main">No Sundays yet</span>}
          <span className="chev"><Icon.cal /></span>
        </button>
        <button className="arrow" onClick={() => go(1)} disabled={idx < 0 || idx >= selectable.length - 1} aria-label="Next Sunday"><Icon.right /></button>
      </div>
      {open && (
        <Sheet title="Choose a Sunday" onClose={() => setOpen(false)}>
          {allowLatest && (
            <button className="btn ghost wide" style={{ marginBottom: 14 }} onClick={() => { onChange(null); setOpen(false); }}>
              Always show the latest Sunday
            </button>
          )}
          <div className="months">
            {groupByMonth(sundays).map((m) => (
              <div className="month-row" key={m.month}>
                <div className="month-name"><b>{m.name}</b><span className="am">{m.am}</span></div>
                <div className="days">
                  {m.days.map(({ sunday, day }) => {
                    const c = counts[sunday];
                    const ok = selectable.includes(sunday);
                    const t = c ? c / max : 0;
                    const bg = c ? `color-mix(in oklab, #2a78d6 ${Math.round(18 + t * 70)}%, #ffffff)` : undefined;
                    return (
                      <button key={sunday} disabled={!ok}
                        className={`day ${sunday === shown ? 'on' : ''} ${sunday === today ? 'today' : ''}`}
                        style={{ background: bg, color: t > 0.55 ? '#fff' : undefined }}
                        onClick={() => { onChange(allowLatest && sunday === latest ? null : sunday); setOpen(false); }}
                        aria-label={`${etLabel(sunday, true)}${c ? `, ${c} present` : ''}`}>
                        <b>{day}</b>
                        <small>{c ? `${c} came` : sunday === today ? 'today' : fmtGreg(sunday).replace(' ', '\u00a0')}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="legend-scale"><span>Fewer</span><i /><span>More present</span></div>
        </Sheet>
      )}
    </>
  );
}

export function Meter({ v, color = 'var(--present)' }) {
  return (
    <span className="meter">
      <span className="track"><span style={{ width: `${(v || 0) * 100}%`, background: color }} /></span>
      <b>{pct(v)}</b>
    </span>
  );
}

export function Ring({ value, total, label }) {
  const r = 36, c = 2 * Math.PI * r, f = total ? value / total : 0;
  return (
    <div className="ring">
      <svg viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--line-2)" strokeWidth="9" />
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--present)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`} style={{ transition: 'stroke-dasharray .3s' }} />
      </svg>
      <div className="ring-num"><div><b>{value}</b><small>{label}</small></div></div>
    </div>
  );
}

export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ───── Person sheet: attendance strip + quick facts ───── */
export function PersonSheet({ person, sundays, mark, att, onClose, onEdit }) {
  const today = latestSunday();
  const months = groupByMonth(sundays);
  const reasons = sundays.map((s) => att[`${person.id}|${s}`]).filter((r) => r?.reason);
  return (
    <Sheet onClose={onClose} head={
      <div className="p-head">
        <Initials name={person.name} category={person.category} />
        <div>
          <h3>{person.name}</h3>
          <div className="pmeta">
            <span className="dot" style={{ background: CAT_COLOR[person.category] }} />{SHORT[person.category] || person.category}
            {person.category === 'New Comer' && <span className={`tag ${person.nc_active ? 'ok' : ''}`}>{person.nc_active ? 'Active' : 'Inactive'}</span>}
            {person.responsible && <span>· with {person.responsible}</span>}
          </div>
        </div>
      </div>
    }>
      <div className="p-stats">
        <div className="p-stat"><b>{pct(person.pct)}</b><span>This semester</span></div>
        <div className="p-stat"><b>{person.streak ? `${person.streak}` : '0'}</b><span>Weeks absent in a row</span></div>
        <div className="p-stat"><b>{person.sixPct == null ? '–' : pct(person.sixPct)}</b><span>6-month score</span></div>
      </div>
      <div className="strip" aria-label="Attendance by Sunday">
        {months.map((m) => [
          <div key={m.month} className="strip-month">{m.name} <span className="am">{ET_MONTHS_AM[m.month]}</span></div>,
          ...m.days.map(({ sunday, day }) => {
            const st = mark(person.id, sunday);
            const cls = st === 'Present' ? 'P' : st === 'Absent' ? 'A' : sunday > today ? 'F' : 'N';
            return (
              <div key={sunday} className="strip-cell" title={`${etLabel(sunday)}: ${st || 'not marked'}`}>
                <i className={cls}>{cls === 'P' ? '✓' : cls === 'A' ? '✕' : ''}</i>
                <small>{day}</small>
              </div>
            );
          }),
        ])}
      </div>
      {reasons.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="card-sub" style={{ marginBottom: 6 }}>Notes</div>
          {reasons.map((r) => <div key={r.sunday} className="small"><b>{etLabel(r.sunday)}:</b> {r.reason}</div>)}
        </div>
      )}
      <div className="row-actions" style={{ marginTop: 18 }}>
        {person.phone && person.phone.replace(/\D/g, '').length > 6
          ? <a className="btn gold" href={`tel:${person.phone.replace(/\s/g, '')}`}><Icon.phone /> Call {person.phone}</a>
          : <span className="muted small">No phone number saved</span>}
        {onEdit && <button className="btn ghost" onClick={onEdit}><Icon.edit /> Edit</button>}
      </div>
    </Sheet>
  );
}
