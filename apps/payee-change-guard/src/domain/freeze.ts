/**
 * The payment-run freeze: no approval or release in the `freezeHours` before a payment run that pays the supplier's
 * pay group. The freeze lifts when the run has gone. Back-to-back windows merge, so "frozen until" is the moment the
 * gate really opens again.
 */
import { HOUR, toMs } from '@x10/shared/lib';

import type { PayGroup, PaymentRun } from '../model';

export interface FreezeWindow {
  run: PaymentRun;
  start: number;
  end: number;
}

export interface FreezeState {
  frozen: boolean;
  /** ISO time the gate opens again (the last run of a merged chain). Null when not frozen. */
  until: string | null;
  /** The run whose freeze holds the gate now. */
  run: PaymentRun | null;
  /** The next freeze that has not started yet (for "freezes in 30 h"). */
  next: { startsAt: string; run: PaymentRun } | null;
}

export function appliesTo(run: Pick<PaymentRun, 'payGroup'>, group: PayGroup): boolean {
  return run.payGroup === 'all' || run.payGroup === group;
}

export function freezeWindow(run: PaymentRun): FreezeWindow {
  const end = toMs(run.runDate);
  return { run, start: end - Math.max(0, run.freezeHours) * HOUR, end };
}

export function freezeFor(runs: PaymentRun[], group: PayGroup, now: Date | string): FreezeState {
  const t = toMs(now);
  const windows = runs
    .filter((r) => appliesTo(r, group))
    .map(freezeWindow)
    .sort((a, b) => a.start - b.start);
  const holding = windows.filter((w) => w.start <= t && t < w.end).sort((a, b) => a.end - b.end);
  const upcoming = windows.find((w) => w.start > t);
  const next = upcoming ? { startsAt: new Date(upcoming.start).toISOString(), run: upcoming.run } : null;
  if (!holding.length) return { frozen: false, until: null, run: null, next };
  // Extend through overlapping or touching windows: the gate opens only when no freeze covers the moment.
  let until = Math.max(...holding.map((w) => w.end));
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of windows) {
      if (w.start <= until && w.end > until) {
        until = w.end;
        changed = true;
      }
    }
  }
  const nextAfter = windows.find((w) => w.start > until);
  return {
    frozen: true,
    until: new Date(until).toISOString(),
    run: holding[0].run,
    next: nextAfter ? { startsAt: new Date(nextAfter.start).toISOString(), run: nextAfter.run } : null,
  };
}

/** The next payment run for a pay group after `now` (for the canal's gate signs). */
export function nextRun(runs: PaymentRun[], group: PayGroup | 'any', now: Date | string): PaymentRun | null {
  const t = toMs(now);
  return (
    runs
      .filter((r) => (group === 'any' ? true : appliesTo(r, group)) && toMs(r.runDate) > t)
      .sort((a, b) => toMs(a.runDate) - toMs(b.runDate))[0] ?? null
  );
}
