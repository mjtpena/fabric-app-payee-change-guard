/**
 * A gate's desk: the queue of boats waiting at this gate on the left, the selected one on the right.
 * Phones show one or the other (the queue at /gate, the detail at /gate/:id with a back link).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Snowflake } from 'lucide-react';

import { cx, EmptyState, useIsDesktop } from '@x10/shared/ui';

import type { Boat } from '../domain/canal';
import { formatShort } from '../domain/gates';
import { FlagCount } from './bits';

export function GateDesk({
  title,
  queueLabel,
  boats,
  base,
  selectedId,
  activeId,
  me,
  empty,
  children,
}: {
  title: ReactNode;
  queueLabel: string;
  boats: Boat[];
  base: string;
  /** The id in the route (phones show the detail only when there is one). */
  selectedId: string | undefined;
  /** The boat shown on desktop when the route has no id. */
  activeId?: string;
  me: string;
  empty: ReactNode;
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  const queue = (
    <nav aria-label={queueLabel} className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="x-legend-label m-0 text-muted">{queueLabel}</h2>
        <span className="font-mono text-xs text-muted num">{boats.length}</span>
      </div>
      {boats.length === 0 ? (
        <EmptyState compact title="Nobody waiting">
          {empty}
        </EmptyState>
      ) : (
        <ul className="m-0 list-none divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-line bg-surface p-0" data-testid="gate-queue">
          {boats.map((b) => {
            const active = b.id === (selectedId ?? activeId);
            const hours = b.ageHours;
            return (
              <li key={b.id}>
                <Link
                  to={`${base}/${b.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cx('flex items-start gap-3 px-3.5 py-3 text-fg no-underline transition-colors hover:bg-surface-2', active && 'bg-[color-mix(in_oklab,var(--accent-9)_9%,transparent)]')}
                  data-testid="queue-item"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.supplier?.name ?? b.ref}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                      <span className="font-mono">{b.ref}</span>
                      <span>{b.req.requestedBy === me ? 'Raised by you' : `by ${b.requester}`}</span>
                      {b.freeze?.frozen && (
                        <span className="inline-flex items-center gap-1 text-[var(--pcg-ice-ink)]">
                          <Snowflake className="size-3" aria-hidden="true" /> until {formatShort(b.freeze.until!)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <FlagCount flags={b.flags} />
                    <span className={cx('font-mono text-xs num', b.callbackOverdue ? 'text-warn-text' : 'text-muted')}>{hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} d`}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );

  if (!desktop) {
    return (
      <div className="pb-6">
        {selectedId ? (
          <>
            <Link to={base} className="mb-3 inline-flex items-center gap-1 text-ui text-muted no-underline hover:text-fg">
              <ChevronLeft className="size-4" aria-hidden="true" /> {queueLabel}
            </Link>
            {children}
          </>
        ) : (
          <>
            <h1 className="m-0 mb-4 text-2xl font-semibold">{title}</h1>
            {queue}
          </>
        )}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div>
        <h1 className="m-0 mb-5 text-2xl font-semibold">{title}</h1>
        {queue}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
