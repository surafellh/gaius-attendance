import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { etLabel, fmtGreg, groupByMonth, toEthiopian, sundaysOf, semesterOf, SEMESTERS, todayIso } from '../lib/ethiopian';
import { pct } from '../lib/stats';

export const CAT_COLOR = {
  'Leader': 'var(--c-leader)', 'Senior Leader': 'var(--c-senior)', 'Member': 'var(--c-member)',
  'Active Informal Member': 'var(--c-active)', 'Inactive Informal Member': 'var(--c-inactive)',
  'New Comer': 'var(--c-newcomer)', 'Active New Comer': 'var(--c-newcomer)', 'Inactive New Comer': '#b8b0ea',
};

const I = (d) => (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20" aria-hidden="true" {...p}>{d}</svg>
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
  home: I(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>),
  grid: I(<><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 10h18M9 4v16M15 4v16" /></>),
  bell: I(<><path d="M6 16V11a6 6 0 1112 0v5l2 2H4z" /><path d="M10 21h4" /></>),
  people: I(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5a5 5 0 016 5" /></>),
  card: I(<><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16a3.4 3.4 0 016.4 0M14 10h4M14 13h3" /></>),
  layers: I(<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>),
  shield: I(<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />),
  more: I(<><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>),
  cal: I(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  edit: I(<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />),
  book: I(<><path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z" /><path d="M4 19V5" /></>),
  star: I(<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />),
  eye: I(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  trash: I(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />),
  user: I(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>),
  list: I(<><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></>),
  pin: I(<><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  clock: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
};

/* brand mark – a simple lime daisy (Adey Abeba) */
export function Mark({ size = 36 }) {
  const petals = Array.from({ length: 8 }, (_, i) => (
    <ellipse key={i} cx="18" cy="9" rx="3.4" ry="6.4" fill="#8dc63f" transform={`rotate(${i * 45} 18 18)`} />
  ));
  return (
    <svg className="brand-mark" style={{ width: size, height: size }} viewBox="0 0 36 36" aria-hidden="true">
      <rect width="36" height="36" rx="11" fill="#1a2e14" />
      {petals}
      <circle cx="18" cy="18" r="4.4" fill="#f6c343" />
    </svg>
  );
}

export function Initials({ name, category, size }) {
  const parts = (name || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/);
  const t = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  return <span className="initials" style={{ background: CAT_COLOR[category] || 'var(--ink-3)', ...(size ? { width: size, height: size } : {}) }}>{t.toUpperCase()}</span>;
}

export function Sheet({ title, onClose, children, head, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" style={wide ? { maxWidth: 900 } : undefined} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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

/* Right-hand panel, full window height (bottom sheet look on phones is not used: it slides in from the right everywhere) */
export function Drawer({ title, sub, onClose, children, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>{typeof title === 'string' ? <h3>{title}</h3> : title}{sub && <div className="small muted">{sub}</div>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.x /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>
  );
}

/* Calendar sheet: one semester at a time, each Sunday shaded by attendance rate.
   info(sunday) -> { rate, present, program } */
export function CalendarSheet({ value, onPick, onClose, info, title = 'Choose a Sunday', allowFuture, extra }) {
  const [sem, setSem] = useState(semesterOf(value || todayIso()));
  const today = todayIso();
  const i = SEMESTERS.indexOf(sem);
  const sundays = sundaysOf(sem);
  return (
    <Sheet title={title} onClose={onClose}>
      {extra}
      <div className="cal-nav">
        <button className="icon-btn" disabled={i <= 0} onClick={() => setSem(SEMESTERS[i - 1])} aria-label="Previous semester"><Icon.left /></button>
        <b>{sem} semester</b>
        <button className="icon-btn" disabled={i >= SEMESTERS.length - 1} onClick={() => setSem(SEMESTERS[i + 1])} aria-label="Next semester"><Icon.right /></button>
      </div>
      <div className="months">
        {groupByMonth(sundays).map((m) => (
          <div className="month-row" key={m.month}>
            <div className="month-name"><b>{m.name}</b><span className="am">{m.am}</span></div>
            <div className="days">
              {m.days.map(({ sunday, day }) => {
                const inf = info?.(sunday) || {};
                const ok = allowFuture || sunday <= today || inf.present;
                const t = inf.rate ?? null;
                const bg = t != null && inf.present ? `color-mix(in oklab, #4f8a12 ${Math.round(15 + t * 75)}%, #ffffff)` : undefined;
                return (
                  <button key={sunday} disabled={!ok}
                    className={`day ${sunday === value ? 'on' : ''} ${sunday === today ? 'today' : ''}`}
                    style={{ background: bg, color: t != null && t > 0.5 && inf.present ? '#fff' : undefined }}
                    onClick={() => { onPick(sunday); onClose(); }}
                    aria-label={`${etLabel(sunday, true)}${inf.present ? `, ${inf.present} present, ${pct(t)}` : ''}${inf.program ? `, ${inf.program}` : ''}`}>
                    {inf.program && <i title={inf.program} />}
                    <b>{day}</b>
                    <small>{inf.present ? pct(t) : sunday === today ? 'today' : fmtGreg(sunday).replace(' ', ' ')}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="legend-scale"><span>Lower</span><i className="scale" /><span>Higher attendance %</span><span className="row" style={{ gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--c-newcomer)', display: 'inline-block' }} /> program recorded</span></div>
    </Sheet>
  );
}

/* Compact Sunday selector with ‹ › and a calendar */
export function WeekPicker({ value, onChange, held, info, latest, allowLatest }) {
  const [open, setOpen] = useState(false);
  const shown = value || latest;
  const list = held;
  const idx = list.indexOf(shown);
  const go = (d) => { const n = list[idx + d]; if (n) onChange(allowLatest && n === latest ? null : n); };
  const e = shown ? toEthiopian(shown) : null;
  return (
    <>
      <div className="weekbar">
        <button className="arrow" onClick={() => go(-1)} disabled={idx <= 0} aria-label="Previous Sunday"><Icon.left /></button>
        <button className="current" onClick={() => setOpen(true)} aria-label="Choose a Sunday">
          {e ? (
            <>
              <span className="cal-chip"><small>{etLabel(shown).slice(0, 3)}</small><b>{e.day}</b></span>
              <span style={{ minWidth: 0 }}>
                <span className="w-main">{etLabel(shown, true)}</span>
                <span className="w-sub">{fmtGreg(shown)}{allowLatest && !value ? ' · latest Sunday' : ''}{info?.(shown)?.program ? ` · ${info(shown).program}` : ''}</span>
              </span>
            </>
          ) : <span className="w-main">No Sundays yet</span>}
          <span className="chev"><Icon.cal /></span>
        </button>
        <button className="arrow" onClick={() => go(1)} disabled={idx < 0 || idx >= list.length - 1} aria-label="Next Sunday"><Icon.right /></button>
      </div>
      {open && (
        <CalendarSheet value={shown} info={info} onClose={() => setOpen(false)}
          onPick={(s) => onChange(allowLatest && s === latest ? null : s)}
          extra={allowLatest && <button className="btn ghost wide" style={{ marginBottom: 14 }} onClick={() => { onChange(null); setOpen(false); }}>Always show the latest Sunday</button>} />
      )}
    </>
  );
}

export function Meter({ v, color = 'var(--present)' }) {
  return (
    <span className="meter">
      <span className="track"><span style={{ width: `${Math.min(1, v || 0) * 100}%`, background: color }} /></span>
      <b>{pct(v)}</b>
    </span>
  );
}

export function Delta({ d, suffix = '', invert }) {
  if (d == null || Number.isNaN(d)) return null;
  const r = Math.round(d * 10) / 10;
  const good = invert ? r < 0 : r > 0;
  return <span className={`delta ${r === 0 ? 'flat' : good ? 'up' : 'down'}`}>{r > 0 ? '▲' : r < 0 ? '▼' : '='} {Math.abs(r)}{suffix}</span>;
}

export function MiniDots({ statuses }) {
  return <span className="mini-dots" aria-label="Last Sundays">{statuses.map((s, i) => <i key={i} className={s === 'Present' ? 'P' : s === 'Absent' ? 'A' : ''} />)}</span>;
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

export const telLink = (phone) => {
  const d = (phone || '').replace(/[^\d+]/g, '');
  return d.replace(/\D/g, '').length > 8 ? `tel:${d}` : null;
};
