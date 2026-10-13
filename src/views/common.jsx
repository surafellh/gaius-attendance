import { etLabel, fmtGreg, latestSunday } from '../lib/ethiopian';

export function WeekChips({ sundays, value, onChange, held, latestLabel }) {
  const today = latestSunday();
  const shown = sundays.filter((s) => s <= today || held?.has(s));
  return (
    <div className="weekpick">
      {latestLabel !== undefined && (
        <button className={!value ? 'chip on' : 'chip'} onClick={() => onChange(null)}>
          <span>Latest</span><small>{latestLabel || '—'}</small>
        </button>
      )}
      {shown.map((s) => (
        <button key={s} className={value === s ? 'chip on' : 'chip'} onClick={() => onChange(s)}>
          <span>{etLabel(s)}</span><small>{fmtGreg(s)}</small>
        </button>
      ))}
      {shown.length === 0 && <span className="muted">No Sundays yet in this semester.</span>}
    </div>
  );
}

export function Stat({ label, value, delta, tone }) {
  return (
    <div className={`stat ${tone || ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {delta !== undefined && delta !== null && (
        <div className={`delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
          {delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '– '}{Math.abs(Math.round(delta * 10) / 10)} vs last week
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
