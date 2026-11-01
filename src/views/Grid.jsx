import { useRef, useState } from 'react';
import { etLabel } from '../lib/ethiopian';
import { Icon } from './common';

/* A spreadsheet-style table: type straight into the cells, a change saves when you leave the cell,
   Enter moves down, the last row adds a new line.
   columns: [{ key, label, type: 'text' | 'number' | 'date' | 'select' | 'check', options: [[value, label]], width, ro, required, show(row) }] */
export default function Grid({ columns, rows, onSave, onAdd, onDelete, canEdit, empty = 'Nothing yet.', addLabel = 'Add a row', rowKey = (r) => r.id, foot }) {
  const ref = useRef(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const move = (e) => { // Enter → same column, next row
    if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    const td = e.target.closest('td'); const tr = td?.parentElement; const i = [...tr.children].indexOf(td);
    const next = tr.nextElementSibling?.children[i]?.querySelector('input,select');
    e.target.blur(); next?.focus();
  };
  const value = (c, r) => (r[c.key] ?? '');
  const out = (c, v) => (c.type === 'number' ? (v === '' ? null : Number(v)) : c.type === 'check' ? !!v : v === '' ? null : v);
  const cell = (c, r, isNew) => {
    const ro = !canEdit || c.ro || (!isNew && c.show && !c.show(r));
    if (c.render && (ro || c.ro)) return c.render(r);
    if (ro) return <span className="cell-ro">{c.type === 'date' && r[c.key] ? etLabel(r[c.key], true) : c.type === 'select' ? (c.options.find((o) => String(o[0]) === String(r[c.key]))?.[1] ?? '') : c.type === 'check' ? (r[c.key] ? '✓' : '') : String(value(c, r))}</span>;
    const common = {
      'aria-label': c.label, onKeyDown: move,
      ...(isNew ? { value: draft[c.key] ?? '', onChange: (e) => setDraft({ ...draft, [c.key]: c.type === 'check' ? e.target.checked : e.target.value }) }
        : { defaultValue: value(c, r), key: `${rowKey(r)}-${c.key}-${String(r[c.key])}`, onBlur: (e) => { const v = c.type === 'check' ? e.target.checked : e.target.value; if (String(v) !== String(value(c, r))) onSave(r, { [c.key]: out(c, v) }); } }),
    };
    const { key: ck, ...rest } = common;
    if (c.type === 'select') return <select key={ck} {...rest}>{!c.required && <option value="">–</option>}{c.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
    if (c.type === 'check') return isNew ? <input type="checkbox" checked={!!draft[c.key]} aria-label={c.label} onChange={common.onChange} />
      : <input type="checkbox" defaultChecked={!!r[c.key]} aria-label={c.label} key={ck} onChange={(e) => onSave(r, { [c.key]: e.target.checked })} />;
    return (
      <span className={c.type === 'date' ? 'date-cell' : ''}>
        <input key={ck} type={c.type === 'date' ? 'date' : 'text'} inputMode={c.type === 'number' ? 'decimal' : undefined} {...rest} />
        {c.type === 'date' && (isNew ? draft[c.key] : r[c.key]) && <small>{etLabel(isNew ? draft[c.key] : r[c.key], true)}</small>}
      </span>
    );
  };
  async function add() {
    if (columns.some((c) => c.required && !String(draft[c.key] ?? '').trim())) return;
    setBusy(true);
    const row = Object.fromEntries(columns.filter((c) => !c.ro).map((c) => [c.key, out(c, draft[c.key] ?? (c.type === 'check' ? false : ''))]));
    const ok = await onAdd(row);
    setBusy(false);
    if (ok !== false) setDraft({});
  }
  const ready = columns.every((c) => !c.required || String(draft[c.key] ?? '').trim());
  return (
    <div className="grid-edit" ref={ref}>
      <table className="xl ge">
        <thead><tr>{columns.map((c) => <th key={c.key} style={{ minWidth: c.width || 120 }}>{c.label}{c.required && canEdit ? ' *' : ''}</th>)}{canEdit && onDelete && <th style={{ width: 40 }} />}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => <td key={c.key} className={c.type === 'number' ? 'num' : ''}>{cell(c, r)}</td>)}
              {canEdit && onDelete && <td><button className="icon-btn ge-del" title="Remove this row" aria-label="Remove this row" onClick={() => window.confirm('Remove this row? (You can undo it.)') && onDelete(r)}><Icon.trash width="16" height="16" /></button></td>}
            </tr>
          ))}
          {rows.length === 0 && !canEdit && <tr><td colSpan={columns.length} className="muted small" style={{ padding: 14 }}>{empty}</td></tr>}
          {canEdit && onAdd && (
            <tr className="ge-new">
              {columns.map((c) => <td key={c.key}>{c.ro ? null : cell(c, {}, true)}</td>)}
              <td><button className="btn lime small" disabled={!ready || busy} onClick={add} title={addLabel} aria-label={addLabel}><Icon.plus width="16" height="16" /></button></td>
            </tr>
          )}
          {foot}
        </tbody>
      </table>
      {canEdit && onAdd && <p className="tiny muted" style={{ margin: '6px 2px 0' }}>Type in a cell – it saves when you leave it. Enter moves down. Fill the last row and press + to add.</p>}
    </div>
  );
}
