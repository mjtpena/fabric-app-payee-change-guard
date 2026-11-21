/**
 * The canal locks: a side-on cutaway of a lock flight rising left to right through the Request, Call-back and
 * Second-approval chambers to the Released basin, with a dry dock cut into the bank for rejected and cancelled
 * boats. Every open change request is a boat in the chamber of its current gate. When a gate opens (a call-back
 * confirmed, an approval, a release) the boat glides to the gate, rises with the water and sails into the next
 * chamber; a rejected boat is lifted out and set down in the dry dock. Positions persist per tab, so a change made
 * on another screen (or by someone else, via polling) plays as movement when you come back.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useReducedMotion } from '@x10/shared/ui';

import { boatScale, hullColor, type Boat, type CanalData, type CanalLens } from '../domain/canal';
import { CHAMBER_LABEL, formatExact, type Chamber } from '../domain/gates';
import { STATUS_LABEL } from '../domain/ledger';
import { BoatShape, Snowflake } from './Boat';
import { CHAMBER_BOXES, DRY_DOCK, GATES, SHAPE_LEN, VIEW, gatesCrossed, layoutBoats, voyage, type Slot } from './geometry';

const POS_KEY = 'x10:payee-change-guard:canal-positions';

type Stored = Record<string, { c: Chamber; x: number; y: number }>;

function readStored(): Stored {
  try {
    return JSON.parse(sessionStorage.getItem(POS_KEY) ?? '{}') as Stored;
  } catch {
    return {};
  }
}
function writeStored(s: Stored) {
  try {
    sessionStorage.setItem(POS_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: movement replays are a nicety */
  }
}

/** Short name for the boat's label: the first word, or two when the first is short. */
export function shortName(name: string | undefined): string {
  if (!name) return '—';
  const words = name.replace(/&/g, '').split(/\s+/).filter(Boolean);
  const first = words[0] ?? name;
  return first.length <= 4 && words[1] ? `${first} ${words[1]}` : first;
}

export interface CanalSceneProps {
  data: CanalData;
  lens: CanalLens;
  focusId: string | null;
  onPick: (id: string) => void;
  isDim: (b: Boat) => boolean;
  onKeeper?: () => void;
  /** Phones: draw at the stage height and let the canal scroll sideways. */
  pan?: boolean;
}

export function CanalScene({ data, lens, focusId, onPick, isDim, onKeeper, pan }: CanalSceneProps) {
  const reduced = useReducedMotion();
  const boats = data.boats;
  const slots = useMemo(() => layoutBoats(boats, (id) => boatScale(boats.find((b) => b.id === id)?.supplier?.annualSpend)), [boats]);
  const refs = useRef(new Map<string, SVGGElement>());
  const labelRefs = useRef(new Map<string, SVGGElement>());
  const [openGates, setOpenGates] = useState<Set<number>>(new Set());
  const [surge, setSurge] = useState<Set<Chamber>>(new Set());
  const scroller = useRef<HTMLDivElement>(null);

  const layoutKey = boats.map((b) => `${b.id}:${b.chamber}`).join('|');

  // Replay movement since the last time this tab drew the canal.
  useLayoutEffect(() => {
    const prev = readStored();
    const hadPrev = Object.keys(prev).length > 0;
    const next: Stored = {};
    const opens = new Set<number>();
    const surges = new Set<Chamber>();
    let longest = 0;
    for (const b of boats) {
      const slot = slots.get(b.id);
      if (!slot) continue;
      next[b.id] = { c: b.chamber, x: slot.x, y: slot.y };
      if (reduced) continue;
      const p = prev[b.id];
      const el = refs.current.get(b.id);
      if (!el || (p && p.c === b.chamber)) continue;
      if (!p && !(hadPrev && b.chamber === 'request')) continue;
      const crossed = gatesCrossed(p?.c ?? null, b.chamber);
      const frames = voyage(p ? { x: p.x, y: p.y } : null, slot, p?.c ?? null, b.chamber);
      const duration = !p ? 2600 : b.chamber === 'drydock' ? 2400 : 1200 + 1700 * Math.max(1, crossed.length);
      longest = Math.max(longest, duration);
      const keyframes = frames.map((f) => ({ transform: `translate(${f.x}px, ${f.y}px)`, offset: f.at }));
      const timing = { duration, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' };
      el.animate(keyframes, timing);
      labelRefs.current.get(b.id)?.animate(keyframes, timing);
      crossed.forEach((g) => opens.add(g));
      if (crossed.length) surges.add(b.chamber);
    }
    writeStored(next);
    if (!opens.size && !surges.size) return;
    setOpenGates(opens);
    setSurge(surges);
    const t = window.setTimeout(() => {
      setOpenGates(new Set());
      setSurge(new Set());
    }, longest);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, reduced]);

  // Phones: keep the focused boat in view, and start on the lower chambers.
  useEffect(() => {
    const el = scroller.current;
    if (!pan || !el) return;
    const svg = el.firstElementChild as SVGSVGElement | null;
    if (!svg) return;
    const scale = svg.getBoundingClientRect().width / VIEW.w;
    const target = focusId ? slots.get(focusId)?.x : 330;
    if (target === undefined) return;
    el.scrollTo({ left: Math.max(0, target * scale - el.clientWidth / 2), behavior: reduced ? 'auto' : 'smooth' });
  }, [focusId, pan, slots, reduced]);

  const domFrozen = data.freeze.domestic.frozen;
  const intFrozen = data.freeze.international.frozen;
  const anyFrozen = domFrozen || intFrozen;
  const count = (c: Chamber) => boats.filter((b) => b.chamber === c).length;

  const svg = (
    <svg
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={pan ? 'block h-full w-auto max-w-none' : 'absolute inset-y-0 left-0 h-full w-[calc(100%-var(--side-w,0px))]'}
      style={pan ? { aspectRatio: `${VIEW.w} / ${VIEW.h}` } : undefined}
      role="group"
      aria-label={`Lock flight: ${count('request')} at the call-back gate, ${count('callback')} called back, ${count('approval')} approved, ${count('basin')} released, ${count('drydock')} in the dry dock`}
      data-testid="canal"
    >
      <defs>
        <linearGradient id="pcg-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--pcg-water-top)" />
          <stop offset="1" stopColor="var(--pcg-water-deep)" />
        </linearGradient>
        <linearGradient id="pcg-earth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--pcg-stone)" />
          <stop offset="0.35" stopColor="var(--pcg-earth)" />
          <stop offset="1" stopColor="var(--pcg-earth-2)" />
        </linearGradient>
        <linearGradient id="pcg-dock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--pcg-dock-2)" />
          <stop offset="1" stopColor="var(--pcg-dock)" />
        </linearGradient>
        <pattern id="pcg-blocks" width="44" height="22" patternUnits="userSpaceOnUse">
          <path d="M0 0.5H44M0 11.5H44M22 0V11M0 11V22M44 11V22" stroke="var(--pcg-stone-line)" strokeWidth="1" fill="none" />
        </pattern>
        <pattern id="pcg-planks" width="12" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 0.5H12" stroke="rgb(0 0 0 / .18)" strokeWidth="1" />
        </pattern>
        <filter id="pcg-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        {CHAMBER_BOXES.map((c) => (
          <clipPath key={c.key} id={`pcg-clip-${c.key}`}>
            <rect x={c.x0} y={c.water - 8} width={c.x1 - c.x0} height={c.floor - c.water + 8} />
          </clipPath>
        ))}
      </defs>

      {/* hills and the far bank */}
      <path d="M0 186 C 150 128, 280 146, 400 160 S 660 96, 820 104 S 1070 48, 1200 60 V 460 H 0 Z" fill="var(--pcg-hill)" />
      <path d="M0 258 C 190 212, 340 238, 480 228 S 770 172, 930 166 S 1110 126, 1200 116 V 460 H 0 Z" fill="var(--pcg-hill-2)" />
      {CHAMBER_BOXES.map((c, i) => (
        <rect key={`bank-${c.key}`} x={c.x0} y={c.coping - 14} width={(i === CHAMBER_BOXES.length - 1 ? VIEW.w : CHAMBER_BOXES[i + 1].x0) - c.x0} height={14 + (c.floor - c.coping)} fill="var(--pcg-grass)" />
      ))}

      {/* far walls and water (behind the boats) */}
      {CHAMBER_BOXES.map((c) => (
        <g key={`water-${c.key}`}>
          <rect x={c.x0} y={c.coping} width={c.x1 - c.x0} height={c.floor - c.coping} fill="var(--pcg-stone-2)" />
          <rect x={c.x0} y={c.coping} width={c.x1 - c.x0} height={c.floor - c.coping} fill="url(#pcg-blocks)" />
          <rect x={c.x0} y={c.coping} width={c.x1 - c.x0} height={3} fill="var(--pcg-stone)" />
          <g className={surge.has(c.key) ? 'pcg-surge' : undefined}>
            <rect x={c.x0} y={c.water} width={c.x1 - c.x0} height={c.floor - c.water} fill="url(#pcg-water)" />
          </g>
        </g>
      ))}

      {/* the lock keeper's hut on the river bank: raise a new request */}
      <g
        role="link"
        tabIndex={onKeeper ? 0 : -1}
        aria-label="Lock keeper: raise a change request"
        onClick={onKeeper}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onKeeper?.()}
        className={onKeeper ? 'pcg-boat' : undefined}
        data-testid="keeper-hut"
      >
        <rect x={18} y={CHAMBER_BOXES[0].coping - 52} width={58} height={38} fill="var(--world-structure)" stroke="var(--world-grid)" />
        <path d={`M12 ${CHAMBER_BOXES[0].coping - 50} L47 ${CHAMBER_BOXES[0].coping - 74} L82 ${CHAMBER_BOXES[0].coping - 50} Z`} fill="var(--pcg-timber)" />
        <rect x={28} y={CHAMBER_BOXES[0].coping - 42} width={12} height={10} rx={1} fill="var(--world-glow)" />
        <rect x={52} y={CHAMBER_BOXES[0].coping - 40} width={14} height={26} rx={1} fill="var(--pcg-timber-2)" />
        <text x={47} y={CHAMBER_BOXES[0].coping - 82} textAnchor="middle" className="x-legend-label" style={{ fontSize: 10 }} fill="var(--world-ink-muted)">
          Lock keeper
        </text>
      </g>

      {/* boats in the water */}
      {boats
        .filter((b) => b.chamber !== 'drydock')
        .sort((a, b) => (slots.get(b.id)?.depth ?? 0) - (slots.get(a.id)?.depth ?? 0))
        .map((b, i) => (
          <BoatOnCanal
            key={b.id}
            b={b}
            i={i}
            slot={slots.get(b.id)!}
            lens={lens}
            focused={focusId === b.id}
            dim={isDim(b)}
            animate={!reduced}
            onPick={onPick}
            setRef={(el) => (el ? refs.current.set(b.id, el) : refs.current.delete(b.id))}
          />
        ))}

      {/* front water: hulls sit in it */}
      {CHAMBER_BOXES.map((c) => (
        <g key={`front-${c.key}`} pointerEvents="none">
          <rect x={c.x0} y={c.water + 1} width={c.x1 - c.x0} height={c.floor - c.water - 1} fill="var(--pcg-water-front)" />
          <g clipPath={`url(#pcg-clip-${c.key})`}>
            <path className={reduced ? undefined : 'pcg-wave'} d={wave(c.x0 - 40, c.x1 + 80, c.water, 2.4, 40)} fill="none" stroke="var(--pcg-wave)" strokeWidth={1.6} />
            <path
              className={reduced ? undefined : 'pcg-wave-slow'}
              d={wave(c.x0 - 80, c.x1 + 40, c.water + 16, 1.4, 40)}
              fill="none"
              stroke="var(--pcg-wave)"
              strokeWidth={1}
              opacity={0.45}
            />
            <path className={reduced ? undefined : 'pcg-shimmer'} d={wave(c.x0 - 40, c.x1 + 40, c.water + 36, 1, 60)} fill="none" stroke="var(--pcg-wave)" strokeWidth={0.8} opacity={0.3} />
          </g>
        </g>
      ))}

      {/* masonry below the chambers, the step risers and the dry dock cut into the bank */}
      <path d={landPath()} fill="url(#pcg-earth)" />
      <path d={landPath()} fill="url(#pcg-blocks)" />
      {CHAMBER_BOXES.map((c) => (
        <g key={`cap-${c.key}`}>
          <rect x={c.x0} y={c.floor} width={c.x1 - c.x0} height={5} fill="var(--pcg-stone-2)" />
          <text
            x={(c.key === 'request' ? 96 + c.x1 : c.x0 + c.x1) / 2}
            y={c.floor + 30}
            textAnchor="middle"
            className="x-legend-label"
            style={{ fontSize: 12, letterSpacing: '0.12em' }}
            fill="var(--world-ink-muted)"
            data-testid={`chamber-${c.key}`}
          >
            {CHAMBER_LABEL[c.key].toUpperCase()} · {count(c.key)}
          </text>
        </g>
      ))}

      <g data-testid="dry-dock">
        <rect x={DRY_DOCK.x0} y={DRY_DOCK.top} width={DRY_DOCK.x1 - DRY_DOCK.x0} height={DRY_DOCK.floor - DRY_DOCK.top} rx={6} fill="url(#pcg-dock)" />
        <rect x={DRY_DOCK.x0} y={DRY_DOCK.top} width={DRY_DOCK.x1 - DRY_DOCK.x0} height={DRY_DOCK.floor - DRY_DOCK.top} rx={6} fill="url(#pcg-planks)" opacity={0.6} />
        <rect x={DRY_DOCK.x0} y={DRY_DOCK.top} width={DRY_DOCK.x1 - DRY_DOCK.x0} height={10} rx={4} fill="rgb(0 0 0 / .12)" />
        <rect x={DRY_DOCK.x0} y={DRY_DOCK.floor - 6} width={DRY_DOCK.x1 - DRY_DOCK.x0} height={6} fill="var(--pcg-stone-2)" />
        <text x={DRY_DOCK.x0 + 16} y={DRY_DOCK.floor + 26} className="x-legend-label" style={{ fontSize: 12, letterSpacing: '0.12em' }} fill="var(--world-ink-muted)">
          DRY DOCK · {count('drydock')}
        </text>
        <text x={DRY_DOCK.x1 - 16} y={DRY_DOCK.floor + 26} textAnchor="end" className="x-legend-label" style={{ fontSize: 10, letterSpacing: '0.1em' }} fill="var(--world-ink-muted)">
          REJECTED AND CANCELLED, 30 DAYS
        </text>
        {boats
          .filter((b) => b.chamber === 'drydock')
          .map((b, i) => {
            const s = slots.get(b.id)!;
            return (
              <g key={`blocks-${b.id}`} aria-hidden="true">
                <rect x={s.x - s.len * 0.3 - 6} y={s.y + 12} width={12} height={DRY_DOCK.floor - 6 - s.y - 12} fill="var(--pcg-timber-2)" />
                <rect x={s.x + s.len * 0.22 - 6} y={s.y + 12} width={12} height={DRY_DOCK.floor - 6 - s.y - 12} fill="var(--pcg-timber-2)" />
                <BoatOnCanal
                  b={b}
                  i={i}
                  slot={s}
                  lens={lens}
                  focused={focusId === b.id}
                  dim={isDim(b)}
                  animate={false}
                  onPick={onPick}
                  setRef={(el) => (el ? refs.current.set(b.id, el) : refs.current.delete(b.id))}
                />
              </g>
            );
          })}
      </g>

      {/* gates */}
      {GATES.map((g) => (
        <Gate key={g.index} index={g.index} x={g.x} top={g.coping - 8} sill={g.upperFloor} open={openGates.has(g.index)} frozen={g.index >= 2 && anyFrozen} name={g.name} />
      ))}
      <FreezePlaque data={data} />
      {[...boats].sort((a, b) => Number(a.id === focusId) - Number(b.id === focusId)).map((b) => {
        const slot = slots.get(b.id);
        if (!slot) return null;
        return (
          <BoatLabel
            key={`label-${b.id}`}
            b={b}
            slot={slot}
            focused={focusId === b.id}
            dim={isDim(b)}
            setRef={(el) => (el ? labelRefs.current.set(b.id, el) : labelRefs.current.delete(b.id))}
          />
        );
      })}
      <text x={VIEW.w - 14} y={CHAMBER_BOXES[3].floor + 52} textAnchor="end" className="x-legend-label" style={{ fontSize: 10, letterSpacing: '0.1em' }} fill="var(--world-ink-muted)">
        RELEASED TO THE SUPPLIER MASTER, 30 DAYS
      </text>
    </svg>
  );

  if (!pan) return svg;
  return (
    <div ref={scroller} className="no-scrollbar absolute inset-0 overflow-x-auto overflow-y-hidden" data-testid="canal-pan">
      {svg}
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function wave(x0: number, x1: number, y: number, amp: number, period: number): string {
  let d = `M ${x0} ${y}`;
  for (let x = x0; x < x1; x += period) d += ` q ${period / 4} ${-amp} ${period / 2} 0 t ${period / 2} 0`;
  return d;
}

function landPath(): string {
  const [r, c, a, b] = CHAMBER_BOXES;
  return [
    `M 0 ${VIEW.h}`,
    `L 0 ${r.floor}`,
    `L ${c.x0} ${r.floor}`,
    `L ${c.x0} ${c.floor}`,
    `L ${a.x0} ${c.floor}`,
    `L ${a.x0} ${a.floor}`,
    `L ${b.x0} ${a.floor}`,
    `L ${b.x0} ${b.floor}`,
    `L ${b.x1} ${b.floor}`,
    `L ${b.x1} ${b.coping - 14}`,
    `L ${VIEW.w} ${b.coping - 14}`,
    `L ${VIEW.w} ${VIEW.h}`,
    'Z',
  ].join(' ');
}

function BoatOnCanal({
  b,
  i,
  slot,
  lens,
  focused,
  dim,
  animate,
  onPick,
  setRef,
}: {
  b: Boat;
  i: number;
  slot: Slot;
  lens: CanalLens;
  focused: boolean;
  dim: boolean;
  animate: boolean;
  onPick: (id: string) => void;
  setRef: (el: SVGGElement | null) => void;
}) {
  const frozen = !!b.freeze?.frozen;
  const k = slot.len / SHAPE_LEN;
  const labelY = labelOffset(slot);
  const status = STATUS_LABEL[b.req.status];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPick(b.id);
    }
  };
  const label = `${b.ref}, ${b.supplier?.name ?? 'unknown supplier'}: ${status}, ${b.flags.length} ${b.flags.length === 1 ? 'flag' : 'flags'}${frozen ? ', frozen' : ''}${b.issues.length ? ', trail mismatch' : ''}`;
  return (
    <g ref={setRef} transform={`translate(${slot.x} ${slot.y})`}>
      <g
        className="pcg-boat"
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={focused}
        onClick={() => onPick(b.id)}
        onKeyDown={onKey}
        style={{ opacity: dim ? 0.28 : 1 }}
        data-testid="boat"
        data-ref={b.ref}
        data-supplier={b.supplier?.name}
        data-chamber={b.chamber}
        data-frozen={frozen || undefined}
        data-flags={b.flags.length}
      >
        <rect x={-slot.len / 2 - 6} y={labelY - 14} width={slot.len + 16} height={-labelY + 14 + 12 * k} fill="transparent" />
        {focused && <ellipse className={animate ? 'pcg-halo' : undefined} cx={0} cy={5 * k} rx={slot.len * 0.66} ry={8 * k} fill="none" stroke="var(--accent-9)" strokeWidth={2.4} />}
        <ellipse className="pcg-focus-ring" cx={0} cy={5 * k} rx={slot.len * 0.66} ry={8 * k} fill="none" stroke="var(--focus, var(--accent-9))" strokeWidth={2} strokeDasharray="4 3" />
        <g className="pcg-lift">
          <g transform={`${slot.tilt ? `rotate(${slot.tilt}) ` : ''}scale(${k})`} className="pcg-hull">
            <BoatShape
              len={SHAPE_LEN}
              hull={hullColor(b, lens)}
              flags={b.flags}
              frozen={frozen}
              leaking={b.issues.length > 0}
              closed={b.req.status === 'rejected' ? 'rejected' : b.req.status === 'cancelled' ? 'cancelled' : null}
              animate={animate}
              phase={i}
            />
          </g>
        </g>
      </g>
    </g>
  );
}

/** Inner boats label just above the mast; outer (breasted-up) boats one lane higher, with a leader line. */
function labelOffset(slot: Slot): number {
  const k = slot.len / SHAPE_LEN;
  return -(k * 50 + 10) - slot.row * 16 - slot.depth * 24;
}

/** Labels are drawn above the gates and beams so they never hide behind the masonry. */
function BoatLabel({ b, slot, focused, dim, setRef }: { b: Boat; slot: Slot; focused: boolean; dim: boolean; setRef: (el: SVGGElement | null) => void }) {
  const name = shortName(b.supplier?.name);
  const k = slot.len / SHAPE_LEN;
  const labelY = labelOffset(slot);
  const pillW = Math.max(name.length * 7.4, b.ref.length * 6.2) + 24;
  return (
    <g ref={setRef} transform={`translate(${slot.x} ${slot.y})`} pointerEvents="none" style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 240ms' }} aria-hidden="true">
      {!focused && (slot.row === 1 || slot.depth === 1) && <line x1={0} y1={labelY + 4} x2={0} y2={-k * 44} stroke="var(--world-ink-muted)" strokeWidth={0.7} opacity={0.55} />}
      {focused ? (
        <g>
          <rect x={-pillW / 2} y={labelY - 28} width={pillW} height={36} rx={9} fill="var(--accent-9)" />
          <text x={0} y={labelY - 12} textAnchor="middle" style={{ fontSize: 13, fontWeight: 600 }} fill="var(--accent-contrast)">
            {name}
          </text>
          <text x={0} y={labelY + 2} textAnchor="middle" className="font-mono" style={{ fontSize: 10 }} fill="var(--accent-contrast)" opacity={0.85}>
            {b.ref}
          </text>
        </g>
      ) : (
        <text
          x={0}
          y={labelY}
          textAnchor="middle"
          style={{ fontSize: 13, fontWeight: 600, paintOrder: 'stroke' }}
          stroke="var(--world-sky-2)"
          strokeWidth={4}
          strokeLinejoin="round"
          fill="var(--world-ink)"
        >
          {name}
        </text>
      )}
    </g>
  );
}

function Gate({ index, x, top, sill, open, frozen, name }: { index: number; x: number; top: number; sill: number; open: boolean; frozen: boolean; name: string }) {
  const w = 16;
  return (
    <g data-testid={`gate-${index}`} data-frozen={frozen || undefined} data-open={open || undefined} aria-label={`${name}${frozen ? ', frozen' : ''}`} role="img">
      {/* balance beam over the lower side */}
      <path d={`M ${x + 4} ${top + 5} L ${x - 96} ${top - 3}`} stroke="var(--pcg-timber-2)" strokeWidth={9} strokeLinecap="round" />
      <path d={`M ${x + 4} ${top + 3} L ${x - 96} ${top - 5}`} stroke="var(--pcg-timber)" strokeWidth={4} strokeLinecap="round" />
      <circle cx={x - 88} cy={top - 4} r={2.4} fill="var(--world-structure)" />
      {/* the leaf */}
      <g className="pcg-leaf" data-open={open} style={{ transformOrigin: `${x + w / 2}px ${(top + sill) / 2}px` }}>
        <rect x={x - w / 2} y={top} width={w} height={sill - top} fill="var(--pcg-timber)" stroke="var(--pcg-timber-2)" strokeWidth={1.2} />
        <rect x={x - w / 2} y={top} width={w} height={sill - top} fill="url(#pcg-planks)" />
        <rect x={x - w / 2 - 2} y={top} width={w + 4} height={5} rx={1} fill="var(--pcg-timber-2)" />
        {frozen && (
          <g aria-hidden="true">
            <rect x={x - w / 2 - 1} y={top} width={w + 2} height={sill - top} fill="var(--pcg-frost)" />
            {Array.from({ length: 4 }, (_, k) => (
              <polygon key={k} points={`${x - w / 2 - 1 + k * 3.6},${top + 5} ${x - w / 2 + 2 + k * 3.6},${top + 5} ${x - w / 2 + 0.5 + k * 3.6},${top + 13 + (k % 2) * 5}`} fill="var(--pcg-ice)" />
            ))}
            <Snowflake x={x} y={(top + sill) / 2} r={5} />
          </g>
        )}
      </g>
    </g>
  );
}

/** The sign on the second key: frozen until the run has gone, or when the next freeze starts. */
function FreezePlaque({ data }: { data: CanalData }) {
  const g = GATES[1];
  const dom = data.freeze.domestic;
  const int = data.freeze.international;
  const frozen = dom.frozen || int.frozen;
  const group = dom.frozen && int.frozen ? 'All suppliers' : dom.frozen ? 'Domestic' : int.frozen ? 'International' : null;
  const s = dom.frozen ? dom : int.frozen ? int : null;
  const nextStart = [dom.next, int.next].filter(Boolean).sort((a, b) => a!.startsAt.localeCompare(b!.startsAt))[0];
  const line1 = frozen ? `FROZEN · ${group!.toUpperCase()}` : 'GATES OPEN';
  const line2 = frozen ? `until ${formatExact(s!.until!)}` : nextStart ? `next freeze ${formatExact(nextStart.startsAt)}` : 'no payment run scheduled';
  const line3 = frozen ? (s!.run?.label ?? '') : '';
  const w = 196;
  const cx = g.x;
  const y = g.coping - 150;
  return (
    <g data-testid="freeze-plaque" data-frozen={frozen || undefined}>
      <line x1={cx} y1={y + 62} x2={cx} y2={g.coping - 8} stroke="var(--world-ink-muted)" strokeWidth={1} opacity={0.6} strokeDasharray="2 3" />
      <rect x={cx - w / 2} y={y} width={w} height={62} rx={8} fill={frozen ? 'var(--pcg-plaque)' : 'var(--pcg-sign)'} stroke={frozen ? 'var(--pcg-ice-ink)' : 'var(--world-grid)'} strokeWidth={1.2} />
      {frozen && <Snowflake x={cx - w / 2 + 16} y={y + 18} r={6} />}
      <text x={frozen ? cx - w / 2 + 30 : cx - w / 2 + 12} y={y + 22} className="x-legend-label" style={{ fontSize: 11, letterSpacing: '0.1em', fontWeight: 600 }} fill={frozen ? 'var(--pcg-ice-ink)' : 'var(--pcg-sign-ink)'}>
        {line1}
      </text>
      <text x={cx - w / 2 + 12} y={y + 40} style={{ fontSize: 11.5, fontWeight: 600 }} fill={frozen ? 'var(--pcg-plaque-ink)' : 'var(--pcg-sign-ink)'} className="num" data-testid="freeze-until">
        {line2}
      </text>
      {line3 && (
        <text x={cx - w / 2 + 12} y={y + 54} style={{ fontSize: 10 }} fill={frozen ? 'var(--pcg-plaque-ink)' : 'var(--pcg-sign-ink)'} opacity={0.8}>
          {line3}
        </text>
      )}
    </g>
  );
}
