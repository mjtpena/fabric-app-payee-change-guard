import type { ReactNode } from 'react';

import { Badge, cx, type Tone } from '@x10/shared/ui';

import { pennantColor } from '../canal/Boat';
import { countryName } from '../config';
import type { Flag } from '../domain/flags';
import { STATUS_LABEL } from '../domain/ledger';
import type { RequestStatus } from '../model';

export const STATUS_TONE: Record<RequestStatus, Tone> = {
  requested: 'info',
  verified: 'brand',
  approved: 'ok',
  released: 'ok',
  rejected: 'bad',
  cancelled: 'neutral',
};

export function StatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <span className={cx('inline-flex', className)} data-testid="status-badge">
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
    </span>
  );
}

/** A small pennant (the canal's flag) next to a flag's label. */
export function Pennant({ code, size = 10 }: { code: Flag['code']; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" className="inline-block shrink-0 align-[-1px]">
      <polygon points="0,1 10,1 4,10" fill={pennantColor(code)} />
    </svg>
  );
}

export function FlagCount({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <span className="text-ui text-muted">None</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ui font-medium" title={flags.map((f) => f.label).join(', ')}>
      <span className="inline-flex -space-x-0.5">
        {flags.slice(0, 5).map((f) => (
          <Pennant key={f.code} code={f.code} />
        ))}
      </span>
      <span className="num">{flags.length}</span>
    </span>
  );
}

/** Each flag with its reason, as a hairline-divided list. */
export function FlagList({ flags, empty, testId = 'flag-list' }: { flags: Flag[]; empty?: ReactNode; testId?: string }) {
  if (!flags.length) return <p className="m-0 text-ui text-muted">{empty ?? 'No red flags.'}</p>;
  return (
    <ul className="m-0 list-none divide-y divide-[var(--line)] p-0" data-testid={testId}>
      {flags.map((f) => (
        <li key={f.code} className="flex gap-3 py-2.5 first:pt-0 last:pb-0" data-testid="flag" data-code={f.code}>
          <span className="pt-1">
            <Pennant code={f.code} size={12} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">{f.label}</span>
            <span className="block text-ui text-muted">{f.reason}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Money({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  return <span className="num">{new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value)}</span>;
}

export function Masked({ value, className }: { value: string; className?: string }) {
  return <span className={cx('font-mono text-ui tracking-wide num', className)}>{value}</span>;
}

export function Country({ code }: { code: string }) {
  return (
    <span title={countryName(code)} className="font-mono text-ui">
      {code}
    </span>
  );
}

/** Label/value rows with hairlines, for summaries. */
export function Facts({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx('m-0 grid grid-cols-[minmax(110px,auto)_minmax(0,1fr)] gap-x-5 text-sm', className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="border-b border-line py-2 text-ui text-muted">{k}</dt>
          <dd className="m-0 min-w-0 border-b border-line py-2 text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Mono small-caps section label used across pages. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('x-legend-label m-0 mb-3 text-muted', className)}>{children}</h2>;
}
