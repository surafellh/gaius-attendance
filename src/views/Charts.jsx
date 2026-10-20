import { useState } from 'react';
import { etLabel, shortEt } from '../lib/ethiopian';
import { CAT_COLOR, useWidth } from './common';

const niceMax = (v) => {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].find((m) => m * p >= v) * p;
};
function Tip({ x, y, w, children }) {
  const left = Math.min(Math.max(x, 95), w - 95);
  return <div className="tip" style={{ left, top: Math.max(y, 70) }}>{children}</div>;
}
const labelEvery = (n, iw) => Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 48))));

/* Stacked bars – people present per Sunday by group. weeks: [{sunday, values:{key:n}, note}] */
export function StackedBars({ weeks, keys, labels, hidden, selected, onSelect, height = 240, colors = CAT_COLOR }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const vis = keys.filter((k) => !hidden.has(k));
  const totals = weeks.map((wk) => vis.reduce((n, k) => n + (wk.values[k] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const padL = 30, padB = 24, padT = 18;
  const iw = w - padL, ih = height - padB - padT;
  const step = iw / Math.max(weeks.length, 1);
  const bw = Math.max(4, Math.min(30, step * 0.64));
  const y = (v) => padT + ih - (v / max) * ih;
  const every = labelEvery(weeks.length, iw);
  return (
    <div className="chart-wrap" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={height} role="img" aria-label="People present each Sunday, by group">
        <g className="grid">{[0, max / 2, max].map((t) => <line key={t} x1={padL} x2={w} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">{[0, max / 2, max].map((t) => <text key={t} x={padL - 8} y={y(t) + 4} textAnchor="end">{Math.round(t)}</text>)}</g>
        {weeks.map((wk, i) => {
          const cx = padL + step * i + step / 2;
          let acc = 0;
          const isSel = wk.sunday === selected;
          return (
            <g key={wk.sunday} opacity={hover != null && hover !== i ? 0.45 : 1}>
              {vis.map((k) => {
                const v = wk.values[k] || 0;
                if (!v) return null;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return <rect key={k} x={cx - bw / 2} y={y1 + 1} width={bw} height={Math.max(y0 - y1 - 2, 1)} rx="3" fill={colors[k]} />;
              })}
              {weeks.length <= 26 && <text x={cx} y={y(acc) - 6} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="var(--text)">{acc || ''}</text>}
              {isSel && <rect x={cx - bw / 2 - 4} y={padT - 8} width={bw + 8} height={ih + 12} rx="7" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 3" />}
              {(i % every === 0 || isSel) && <text x={cx} y={height - 6} textAnchor="middle" fontSize="10.5" fontWeight={isSel ? 800 : 500} fill={isSel ? 'var(--ink)' : 'var(--muted)'}>{shortEt(wk.sunday)}</text>}
              <rect x={padL + step * i} y={0} width={step} height={height} fill="transparent" style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onClick={() => onSelect?.(wk.sunday)} />
            </g>
          );
        })}
      </svg>
      {hover != null && weeks[hover] && (
        <Tip x={padL + step * hover + step / 2} y={y(totals[hover])} w={w}>
          <div className="tip-head">{etLabel(weeks[hover].sunday, true)}</div>
          {weeks[hover].note && <div className="tip-sub">{weeks[hover].note}</div>}
          {[...vis].reverse().map((k) => (
            <div className="tip-row" key={k}><span><i className="dot" style={{ background: colors[k] }} />{labels[k]}</span><b>{weeks[hover].values[k] || 0}</b></div>
          ))}
          <div className="tip-row tip-total"><span>Total present</span><b>{totals[hover]}</b></div>
        </Tip>
      )}
    </div>
  );
}

/* Lines on a 0–100% scale with a crosshair tooltip. series: [{key,label,color,dash}] ; weeks: [{sunday, values:{key:0..1}, note}] */
export function RateLines({ weeks, series, selected, onSelect, height = 240 }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const padL = 38, padB = 24, padT = 14, padR = 12;
  const iw = w - padL - padR, ih = height - padB - padT;
  const x = (i) => padL + (weeks.length < 2 ? iw / 2 : (iw * i) / (weeks.length - 1));
  const y = (v) => padT + ih - v * ih;
  const every = labelEvery(weeks.length, iw);
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = weeks.length < 2 ? 0 : Math.round(((e.clientX - r.left - padL) / iw) * (weeks.length - 1));
    setHover(Math.min(Math.max(i, 0), weeks.length - 1));
  };
  const selIdx = weeks.findIndex((wk) => wk.sunday === selected);
  return (
    <div className="chart-wrap" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={height} role="img" aria-label="Attendance rate each Sunday"
        onPointerMove={move} onPointerDown={move} onClick={() => hover != null && onSelect?.(weeks[hover].sunday)} style={{ cursor: 'pointer' }}>
        <g className="grid">{[0, .25, .5, .75, 1].map((t) => <line key={t} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">{[0, .5, 1].map((t) => <text key={t} x={padL - 8} y={y(t) + 4} textAnchor="end">{t * 100}%</text>)}</g>
        {weeks.map((wk, i) => (i % every === 0 || i === selIdx) && (
          <text key={wk.sunday} x={x(i)} y={height - 6} textAnchor="middle" fontSize="10.5" fontWeight={i === selIdx ? 800 : 500} fill={i === selIdx ? 'var(--ink)' : 'var(--muted)'}>{shortEt(wk.sunday)}</text>
        ))}
        {selIdx >= 0 && <line x1={x(selIdx)} x2={x(selIdx)} y1={padT} y2={padT + ih} stroke="var(--ink)" strokeDasharray="3 3" />}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="var(--faint)" />}
        {series.map((s) => {
          const pts = weeks.map((wk, i) => (wk.values[s.key] == null ? null : [x(i), y(wk.values[s.key])])).filter(Boolean);
          return (
            <g key={s.key}>
              <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={s.width || 2.5} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
              {weeks.length <= 30 && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill={s.color} stroke="#fff" strokeWidth="1.5" />)}
            </g>
          );
        })}
        {hover != null && series.map((s) => weeks[hover].values[s.key] != null && (
          <circle key={s.key} cx={x(hover)} cy={y(weeks[hover].values[s.key])} r="5.5" fill={s.color} stroke="#fff" strokeWidth="2" />
        ))}
      </svg>
      {hover != null && weeks[hover] && (
        <Tip x={x(hover)} y={padT + 40} w={w}>
          <div className="tip-head">{etLabel(weeks[hover].sunday, true)}</div>
          {weeks[hover].note && <div className="tip-sub">{weeks[hover].note}</div>}
          {series.map((s) => (
            <div className="tip-row" key={s.key}><span><i className="dot" style={{ background: s.color }} />{s.label}</span>
              <b>{weeks[hover].values[s.key] == null ? '–' : `${Math.round(weeks[hover].values[s.key] * 100)}%`}</b></div>
          ))}
        </Tip>
      )}
    </div>
  );
}
