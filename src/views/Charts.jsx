import { useState } from 'react';
import { etLabel, shortEt } from '../lib/ethiopian';
import { SHORT } from '../lib/stats';
import { CAT_COLOR, useWidth } from './common';

const niceMax = (v) => {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = [1, 2, 2.5, 5, 10].find((m) => m * p >= v);
  return n * p;
};

function Tip({ x, y, w, children }) {
  const left = Math.min(Math.max(x, 90), w - 90);
  return <div className="tip" style={{ left, top: y }}>{children}</div>;
}

/* Stacked bars: people present per Sunday, by category. Hover/tap shows breakdown; click selects the week. */
export function StackedBars({ weeks, cats, hidden, selected, onSelect, height = 230 }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const vis = cats.filter((c) => !hidden.has(c));
  const totals = weeks.map((wk) => vis.reduce((n, c) => n + wk[c], 0));
  const max = niceMax(Math.max(1, ...totals));
  const padL = 30, padB = 24, padT = 18;
  const iw = w - padL, ih = height - padB - padT;
  const step = iw / Math.max(weeks.length, 1);
  const bw = Math.min(34, step * 0.62);
  const y = (v) => padT + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(weeks.length / Math.max(1, Math.floor(iw / 52)));

  return (
    <div className="chart-wrap" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={height} role="img" aria-label="People present each Sunday, by category">
        <g className="grid">{ticks.map((t) => <line key={t} x1={padL} x2={w} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">{ticks.map((t) => <text key={t} x={padL - 8} y={y(t) + 4} textAnchor="end">{Math.round(t)}</text>)}</g>
        {weeks.map((wk, i) => {
          const cx = padL + step * i + step / 2;
          let acc = 0;
          const isSel = wk.sunday === selected;
          const dim = hover != null && hover !== i;
          return (
            <g key={wk.sunday} opacity={dim ? 0.45 : 1}>
              {vis.map((c) => {
                const v = wk[c];
                if (!v) return null;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return <rect key={c} x={cx - bw / 2} y={y1 + 1} width={bw} height={Math.max(y0 - y1 - 2, 1)} rx="3" fill={CAT_COLOR[c]} />;
              })}
              <text x={cx} y={y(acc) - 6} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--text)">{acc || ''}</text>
              {isSel && <rect x={cx - bw / 2 - 4} y={padT - 6} width={bw + 8} height={ih + 10} rx="8" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 3" />}
              {(i % labelEvery === 0 || isSel) && (
                <text x={cx} y={height - 6} textAnchor="middle" fontSize="11" fontWeight={isSel ? 800 : 500} fill={isSel ? 'var(--ink)' : 'var(--muted)'}>{shortEt(wk.sunday)}</text>
              )}
              <rect x={padL + step * i} y={0} width={step} height={height} fill="transparent"
                onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}
                onClick={() => onSelect?.(wk.sunday)} style={{ cursor: 'pointer' }} />
            </g>
          );
        })}
      </svg>
      {hover != null && weeks[hover] && (
        <Tip x={padL + step * hover + step / 2} y={y(totals[hover])} w={w}>
          <div className="tip-head">{etLabel(weeks[hover].sunday, true)}</div>
          {[...vis].reverse().map((c) => (
            <div className="tip-row" key={c}><span><i className="dot" style={{ background: CAT_COLOR[c] }} />{SHORT[c]}</span><b>{weeks[hover][c]}</b></div>
          ))}
          <div className="tip-row tip-total"><span>Total</span><b>{totals[hover]}</b></div>
        </Tip>
      )}
    </div>
  );
}

/* Attendance rate lines (0–100%) per group with a crosshair tooltip */
export function RateLines({ weeks, series, hidden, selected, onSelect, height = 230 }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const vis = series.filter((s) => !hidden.has(s.key));
  const padL = 36, padB = 24, padT = 14, padR = 10;
  const iw = w - padL - padR, ih = height - padB - padT;
  const x = (i) => padL + (weeks.length < 2 ? iw / 2 : (iw * i) / (weeks.length - 1));
  const y = (v) => padT + ih - v * ih;
  const labelEvery = Math.ceil(weeks.length / Math.max(1, Math.floor(iw / 52)));
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = weeks.length < 2 ? 0 : Math.round(((px - padL) / iw) * (weeks.length - 1));
    setHover(Math.min(Math.max(i, 0), weeks.length - 1));
  };
  return (
    <div className="chart-wrap" ref={ref} onPointerLeave={() => setHover(null)}>
      <svg width={w} height={height} role="img" aria-label="Attendance rate per group each Sunday"
        onPointerMove={onMove} onPointerDown={onMove} onClick={() => hover != null && onSelect?.(weeks[hover].sunday)}>
        <g className="grid">{[0, .5, 1].map((t) => <line key={t} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">{[0, .5, 1].map((t) => <text key={t} x={padL - 8} y={y(t) + 4} textAnchor="end">{t * 100}%</text>)}</g>
        {weeks.map((wk, i) => (i % labelEvery === 0 || wk.sunday === selected) && (
          <text key={wk.sunday} x={x(i)} y={height - 6} textAnchor="middle" fontSize="11"
            fontWeight={wk.sunday === selected ? 800 : 500} fill={wk.sunday === selected ? 'var(--ink)' : 'var(--muted)'}>{shortEt(wk.sunday)}</text>
        ))}
        {selected && weeks.findIndex((wk) => wk.sunday === selected) >= 0 && (
          <line x1={x(weeks.findIndex((wk) => wk.sunday === selected))} x2={x(weeks.findIndex((wk) => wk.sunday === selected))} y1={padT} y2={padT + ih} stroke="var(--ink)" strokeDasharray="3 3" />
        )}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="var(--faint)" />}
        {vis.map((s) => {
          const pts = weeks.map((wk, i) => (wk.rates[s.key] == null ? null : [x(i), y(wk.rates[s.key])])).filter(Boolean);
          return (
            <g key={s.key}>
              <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={CAT_COLOR[s.key]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill={CAT_COLOR[s.key]} stroke="var(--surface)" strokeWidth="2" />)}
            </g>
          );
        })}
      </svg>
      {hover != null && weeks[hover] && (
        <Tip x={x(hover)} y={padT + 10} w={w}>
          <div className="tip-head">{etLabel(weeks[hover].sunday, true)}</div>
          {vis.map((s) => (
            <div className="tip-row" key={s.key}><span><i className="dot" style={{ background: CAT_COLOR[s.key] }} />{s.label}</span>
              <b>{weeks[hover].rates[s.key] == null ? '–' : `${Math.round(weeks[hover].rates[s.key] * 100)}%`}</b></div>
          ))}
        </Tip>
      )}
    </div>
  );
}

/* Tiny sparkline for the hero card – white line on the indigo surface */
export function Spark({ values, selectedIdx, onPick, height = 54 }) {
  const [ref, w] = useWidth();
  if (values.length < 2) return <div ref={ref} />;
  const max = Math.max(...values), min = Math.min(...values);
  const x = (i) => 6 + ((w - 12) * i) / (values.length - 1);
  const y = (v) => 6 + (height - 12) * (1 - (v - min) / Math.max(max - min, 1));
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <div ref={ref} className="hero-spark">
      <svg width={w} height={height} role="img" aria-label="Total present each Sunday this semester">
        <polyline points={`${x(0)},${height} ${pts} ${x(values.length - 1)},${height}`} fill="rgba(244,178,62,.14)" stroke="none" />
        <polyline points={pts} fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        {values.map((v, i) => (
          <g key={i} onClick={() => onPick?.(i)} style={{ cursor: 'pointer' }}>
            <circle cx={x(i)} cy={y(v)} r="12" fill="transparent" />
            <circle cx={x(i)} cy={y(v)} r={i === selectedIdx ? 5.5 : 3} fill={i === selectedIdx ? '#f4b23e' : '#fff'} stroke="#1c2145" strokeWidth="2" />
          </g>
        ))}
      </svg>
    </div>
  );
}
