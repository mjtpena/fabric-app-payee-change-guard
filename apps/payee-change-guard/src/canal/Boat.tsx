/**
 * One narrowboat, drawn side-on around its waterline at (0, 0). Hull colour is the lens; flags fly as pennants on
 * a line from the mast to the stern; a frozen boat wears ice; a boat whose trail does not match its status leaks.
 * Used on the canal, in the Lock keeper preview and as a small glyph in lists.
 */
import type { FlagCode } from '../domain/flags';

export const SEVERE_FLAGS: FlagCode[] = ['shared_account', 'urgency', 'phone_changed'];

export function pennantColor(code: FlagCode): string {
  return SEVERE_FLAGS.includes(code) ? 'var(--bad-solid)' : 'var(--warn-solid)';
}

export interface BoatProps {
  len: number;
  hull: string;
  flags: { code: FlagCode; label: string }[];
  frozen?: boolean;
  leaking?: boolean;
  closed?: 'rejected' | 'cancelled' | null;
  /** Draw the bobbing and fluttering loops. */
  animate?: boolean;
  /** Seed for animation phase. */
  phase?: number;
}

export function BoatShape({ len, hull, flags, frozen, leaking, closed, animate = true, phase = 0 }: BoatProps) {
  const h = len / 2;
  const deck = -9;
  const hullPath = `M ${-h} ${deck} L ${h - 7} ${deck} Q ${h + 1} ${deck - 1} ${h + 6} ${deck - 7} L ${h + 1} 6 Q ${h - 6} 12 ${h - 16} 12 L ${-h + 9} 12 Q ${-h + 1} 11 ${-h - 1} 3 Z`;
  const cabinX = -h + 9;
  const cabinW = len * 0.56;
  const mastX = h * 0.5;
  const mastTop = -44;
  const lineEnd = { x: cabinX + 2, y: -23 };
  const n = flags.length;
  const delay = `${-(phase % 7) * 0.37}s`;
  return (
    <g className={animate ? 'pcg-bob' : undefined} style={{ animationDelay: delay }}>
      {/* hull */}
      <path d={hullPath} fill={hull} stroke="color-mix(in oklab, var(--world-ink) 55%, transparent)" strokeWidth={1} />
      <path d={`M ${-h + 2} ${deck + 4} L ${h - 2} ${deck + 4}`} stroke="rgb(255 255 255 / .38)" strokeWidth={1.4} />
      {/* cabin */}
      <rect x={cabinX} y={-24} width={cabinW} height={15} rx={2.5} fill="var(--world-structure)" stroke="var(--world-grid)" strokeWidth={0.8} />
      <rect x={cabinX - 1} y={-26} width={cabinW + 2} height={3.2} rx={1.5} fill="var(--world-structure-2)" />
      {windows(cabinW).map((wx, i, arr) => (
        <rect
          key={i}
          x={cabinX + 5 + wx}
          y={-20}
          width={Math.min(7, (cabinW - 10) / arr.length - 3)}
          height={5}
          rx={1}
          fill={closed ? 'color-mix(in oklab, var(--world-structure-2) 70%, var(--world-ink-muted))' : 'var(--world-glow)'}
        />
      ))}
      {/* mast and pennant line */}
      <line x1={mastX} y1={deck} x2={mastX} y2={mastTop} stroke="var(--world-ink-muted)" strokeWidth={1.6} strokeLinecap="round" />
      {n > 0 && <line x1={mastX} y1={mastTop + 1} x2={lineEnd.x} y2={lineEnd.y} stroke="var(--world-ink-muted)" strokeWidth={0.8} />}
      {flags.map((f, i) => {
        const t0 = (i + 0.18) / (n + 0.2);
        const t1 = (i + 0.82) / (n + 0.2);
        const p = (t: number) => ({ x: mastX + (lineEnd.x - mastX) * t, y: mastTop + 1 + (lineEnd.y - mastTop - 1) * t });
        const a = p(t0);
        const b = p(t1);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 11 };
        return (
          <g key={f.code} className={animate ? 'pcg-flutter' : undefined} style={{ transformOrigin: `${(a.x + b.x) / 2}px ${(a.y + b.y) / 2}px`, animationDelay: `${-(i * 0.31 + phase * 0.13)}s` }}>
            <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${mid.x},${mid.y}`} fill={pennantColor(f.code)} stroke="rgb(0 0 0 / .18)" strokeWidth={0.5}>
              <title>{f.label}</title>
            </polygon>
          </g>
        );
      })}
      {/* ice */}
      {frozen && (
        <g aria-hidden="true">
          <path d={`M ${-h} ${deck} L ${h - 7} ${deck} Q ${h + 1} ${deck - 1} ${h + 6} ${deck - 7} L ${h + 4} ${deck + 2} L ${-h} ${deck + 3} Z`} fill="var(--pcg-ice)" opacity={0.95} />
          <rect x={cabinX - 1} y={-27} width={cabinW + 2} height={4.5} rx={2} fill="var(--pcg-ice)" />
          {Array.from({ length: Math.floor(len / 9) }, (_, i) => {
            const x = -h + 5 + i * 9;
            const l = 3 + ((i * 7) % 4);
            return <polygon key={i} points={`${x - 1.6},${deck + 2} ${x + 1.6},${deck + 2} ${x},${deck + 2 + l}`} fill="var(--pcg-ice)" opacity={0.9} />;
          })}
          <Snowflake x={cabinX + cabinW / 2} y={-35} r={6} />
        </g>
      )}
      {/* leaking: the trail does not back this boat's position */}
      {leaking && (
        <g aria-hidden="true">
          <path d={hullPath} fill="none" stroke="var(--bad-solid)" strokeWidth={2} strokeDasharray="4 3" />
          <circle cx={-h / 3} cy={16} r={2.2} fill="var(--bad-solid)">
            {animate && <animate attributeName="cy" values="12;26" dur="1.6s" repeatCount="indefinite" />}
          </circle>
        </g>
      )}
      {closed === 'rejected' && (
        <g stroke="var(--bad-solid)" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
          <line x1={cabinX + cabinW / 2 - 6} y1={-22} x2={cabinX + cabinW / 2 + 6} y2={-11} />
          <line x1={cabinX + cabinW / 2 + 6} y1={-22} x2={cabinX + cabinW / 2 - 6} y2={-11} />
        </g>
      )}
    </g>
  );
}

function windows(cabinW: number): number[] {
  const n = Math.max(2, Math.round(cabinW / 14));
  return Array.from({ length: n }, (_, i) => i * ((cabinW - 10) / n));
}

export function Snowflake({ x, y, r, color = 'var(--pcg-ice-ink)' }: { x: number; y: number; r: number; color?: string }) {
  return (
    <g stroke={color} strokeWidth={1.3} strokeLinecap="round" aria-hidden="true">
      {[0, 60, 120].map((a) => {
        const rad = (a * Math.PI) / 180;
        const dx = Math.cos(rad) * r;
        const dy = Math.sin(rad) * r;
        return <line key={a} x1={x - dx} y1={y - dy} x2={x + dx} y2={y + dy} />;
      })}
    </g>
  );
}

/** A small boat for tables and cards. */
export function BoatGlyph({
  hull,
  flags,
  frozen,
  leaking,
  closed,
  size = 44,
}: {
  hull: string;
  flags: { code: FlagCode; label: string }[];
  frozen?: boolean;
  leaking?: boolean;
  closed?: 'rejected' | 'cancelled' | null;
  size?: number;
}) {
  return (
    <svg width={size} height={size * 0.62} viewBox="-42 -50 84 66" aria-hidden="true" className="shrink-0 overflow-visible">
      <rect x={-42} y={0} width={84} height={16} rx={3} fill="var(--world-water)" opacity={0.75} />
      <BoatShape len={58} hull={hull} flags={flags} frozen={frozen} leaking={leaking} closed={closed} animate={false} />
    </svg>
  );
}
