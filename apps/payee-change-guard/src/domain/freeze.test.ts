import type { PaymentRun } from '../model';
import { appliesTo, freezeFor, freezeWindow, nextRun } from './freeze';

const run = (id: string, runDate: string, payGroup: PaymentRun['payGroup'] = 'all', freezeHours = 48): PaymentRun => ({
  id,
  runDate,
  freezeHours,
  label: `Run ${id}`,
  payGroup,
  createdBy: 'admin',
});

describe('payment-run freeze', () => {
  const tue = run('tue', '2026-11-24T10:00:00.000Z');

  it('a window is the freezeHours before the run', () => {
    const w = freezeWindow(tue);
    expect(new Date(w.start).toISOString()).toBe('2026-11-22T10:00:00.000Z');
    expect(new Date(w.end).toISOString()).toBe('2026-11-24T10:00:00.000Z');
  });

  it('is open before the window, frozen from its first moment, and open again once the run has gone', () => {
    expect(freezeFor([tue], 'domestic', '2026-11-22T09:59:59.000Z').frozen).toBe(false);
    const at = freezeFor([tue], 'domestic', '2026-11-22T10:00:00.000Z');
    expect(at.frozen).toBe(true);
    expect(at.until).toBe('2026-11-24T10:00:00.000Z');
    expect(at.run?.id).toBe('tue');
    expect(freezeFor([tue], 'domestic', '2026-11-24T09:59:00.000Z').frozen).toBe(true);
    expect(freezeFor([tue], 'domestic', '2026-11-24T10:00:00.000Z').frozen).toBe(false);
  });

  it('merges overlapping windows so "frozen until" is when the gate really opens', () => {
    const wed = run('wed', '2026-11-25T10:00:00.000Z');
    const s = freezeFor([wed, tue], 'domestic', '2026-11-23T12:00:00.000Z');
    expect(s.until).toBe('2026-11-25T10:00:00.000Z');
    // A run 5 days later does not join the chain.
    const later = run('later', '2026-11-30T10:00:00.000Z');
    expect(freezeFor([tue, later], 'domestic', '2026-11-23T12:00:00.000Z').until).toBe('2026-11-24T10:00:00.000Z');
  });

  it('applies only to runs for the supplier’s pay group (or all suppliers)', () => {
    const intl = run('intl', '2026-11-24T14:00:00.000Z', 'international');
    expect(appliesTo(intl, 'domestic')).toBe(false);
    expect(appliesTo(run('a', tue.runDate, 'all'), 'international')).toBe(true);
    expect(freezeFor([intl], 'domestic', '2026-11-23T12:00:00.000Z').frozen).toBe(false);
    expect(freezeFor([intl], 'international', '2026-11-23T12:00:00.000Z').frozen).toBe(true);
  });

  it('reports the next freeze that has not started', () => {
    const s = freezeFor([tue], 'domestic', '2026-11-20T09:00:00.000Z');
    expect(s.frozen).toBe(false);
    expect(s.next?.startsAt).toBe('2026-11-22T10:00:00.000Z');
  });

  it('a zero-hour freeze never freezes', () => {
    expect(freezeFor([run('z', tue.runDate, 'all', 0)], 'domestic', '2026-11-24T09:59:00.000Z').frozen).toBe(false);
  });

  it('finds the next run for a group', () => {
    const intl = run('intl', '2026-11-23T14:00:00.000Z', 'international');
    expect(nextRun([tue, intl], 'domestic', '2026-11-20T09:00:00.000Z')?.id).toBe('tue');
    expect(nextRun([tue, intl], 'any', '2026-11-20T09:00:00.000Z')?.id).toBe('intl');
    expect(nextRun([tue], 'domestic', '2026-12-01T00:00:00.000Z')).toBeNull();
  });
});
