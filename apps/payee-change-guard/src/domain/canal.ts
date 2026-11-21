/**
 * The canal as data: every change request becomes a boat in the chamber of its current gate, with its flags as
 * pennants, the freeze that holds it, and the trail check. Pure: built from a loaded World and `now`.
 */
import { DAY, HOUR, toMs } from '@x10/shared/lib';

import { rules } from '../config';
import type { Callback, ChangeRequest, Channel, PayGroup, Supplier } from '../model';
import { flagsForRequest, sharedAccountWith, type Flag } from './flags';
import { freezeFor, nextRun, type FreezeState } from './freeze';
import { chamberOf, formatShort, isApprover, isOpen, type Actor, type Chamber } from './gates';
import { trailIssues } from './integrity';
import { nameOf, type World } from './requests';

export type CanalLens = 'gate' | 'flags' | 'age' | 'spend' | 'channel';
export type ViewAs = 'all' | 'clerk' | 'approver';

export interface Boat {
  id: string;
  ref: string;
  req: ChangeRequest;
  supplier: Supplier | null;
  chamber: Chamber;
  flags: Flag[];
  /** The freeze holding this boat at its next gate (only for boats at the approval or release gate). */
  freeze: FreezeState | null;
  /** Hours since requested (open) or from request to close (closed). */
  ageHours: number;
  callbacks: Callback[];
  callbackOverdue: boolean;
  issues: string[];
  sharedWith: Supplier | null;
  requester: string;
  verifier: string;
  approver: string;
}

export interface SharedAccount {
  hash: string;
  suppliers: Supplier[];
  /** The boat carrying the shared account, if any. */
  boatId: string | null;
}

export interface CanalData {
  now: string;
  boats: Boat[];
  freeze: Record<PayGroup, FreezeState>;
  nextRun: Record<PayGroup, { label: string; runDate: string } | null>;
  shared: SharedAccount[];
  /** Released or closed requests older than the basin / dry-dock window (in the Ledger only). */
  archived: number;
  world: World;
}

export function buildCanal(world: World, now: Date): CanalData {
  const t = now.getTime();
  const freeze: Record<PayGroup, FreezeState> = {
    domestic: freezeFor(world.runs, 'domestic', now),
    international: freezeFor(world.runs, 'international', now),
  };
  const boats: Boat[] = [];
  let archived = 0;
  for (const req of world.requests) {
    const chamber = chamberOf(req.status);
    if (chamber === 'basin' && req.releasedAt && t - toMs(req.releasedAt) > rules.BASIN_DAYS * DAY) {
      archived++;
      continue;
    }
    if (chamber === 'drydock' && t - toMs(req.closedAt ?? req.requestedAt) > rules.DRY_DOCK_DAYS * DAY) {
      archived++;
      continue;
    }
    const supplier = world.suppliers.find((s) => s.id === req.supplierId) ?? null;
    const callbacks = world.callbacks.filter((c) => c.requestId === req.id);
    const end = isOpen(req.status) ? t : toMs(req.releasedAt ?? req.closedAt ?? req.approvedAt ?? req.requestedAt);
    const ageHours = Math.max(0, (end - toMs(req.requestedAt)) / HOUR);
    const atFrozenGate = req.status === 'verified' || req.status === 'approved';
    boats.push({
      id: req.id,
      ref: req.ref,
      req,
      supplier,
      chamber,
      flags: flagsForRequest(req, world),
      freeze: atFrozenGate && supplier ? freeze[supplier.payGroup] : null,
      ageHours,
      callbacks,
      callbackOverdue: req.status === 'requested' && ageHours > rules.CALLBACK_DUE_HOURS,
      issues: trailIssues(req, world.callbacks, supplier),
      sharedWith: isOpen(req.status) ? sharedAccountWith(req.newAccountHash, req.supplierId, world) : null,
      requester: nameOf(world, req.requestedBy),
      verifier: nameOf(world, req.verifiedBy),
      approver: nameOf(world, req.approvedBy),
    });
  }
  const run = (g: PayGroup) => {
    const r = nextRun(world.runs, g, now);
    return r ? { label: r.label, runDate: r.runDate } : null;
  };
  return {
    now: now.toISOString(),
    boats,
    freeze,
    nextRun: { domestic: run('domestic'), international: run('international') },
    shared: sharedAccounts(world, boats),
    archived,
    world,
  };
}

/** Accounts held (or about to be held) by two or more suppliers. */
export function sharedAccounts(world: World, boats: Boat[]): SharedAccount[] {
  const holders = new Map<string, Set<string>>();
  const add = (hash: string, supplierId: string) => {
    if (!holders.has(hash)) holders.set(hash, new Set());
    holders.get(hash)!.add(supplierId);
  };
  for (const s of world.suppliers) add(s.currentAccountHash, s.id);
  for (const r of world.requests) if (isOpen(r.status)) add(r.newAccountHash, r.supplierId);
  const out: SharedAccount[] = [];
  for (const [hash, ids] of holders) {
    if (ids.size < 2) continue;
    const boat = boats.find((b) => isOpen(b.req.status) && b.req.newAccountHash === hash);
    out.push({ hash, suppliers: [...ids].map((id) => world.suppliers.find((s) => s.id === id)!).filter(Boolean), boatId: boat?.id ?? null });
  }
  return out;
}

/* ------------------------------------------------------------------ lenses */

export interface LensGroup {
  key: string;
  label: string;
  color: string;
}

export const GATE_GROUPS: LensGroup[] = [
  { key: 'requested', label: 'At the call-back gate', color: 'var(--blue-9)' },
  { key: 'verified', label: 'Called back', color: 'var(--accent-9)' },
  { key: 'approved', label: 'Approved', color: 'var(--teal-9)' },
  { key: 'released', label: 'Released', color: 'var(--ok-solid)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--bad-solid)' },
  { key: 'cancelled', label: 'Cancelled', color: 'var(--gray-8)' },
];

export const FLAG_GROUPS: LensGroup[] = [
  { key: '0', label: 'No flags', color: 'var(--ok-solid)' },
  { key: '1', label: '1 flag', color: 'var(--info-solid)' },
  { key: '2', label: '2–3 flags: override', color: 'var(--warn-solid)' },
  { key: '4', label: '4+ flags', color: 'var(--bad-solid)' },
];

export const AGE_GROUPS: LensGroup[] = [
  { key: 'a', label: 'Under 24 h', color: 'color-mix(in oklab, var(--accent-9) 70%, var(--gray-6))' },
  { key: 'b', label: '1–3 days', color: 'var(--amber-9)' },
  { key: 'c', label: '3–7 days', color: 'color-mix(in oklab, var(--bad-solid) 70%, var(--amber-9))' },
  { key: 'd', label: 'Over 7 days', color: 'var(--bad-solid)' },
];

export const SPEND_GROUPS: LensGroup[] = [
  { key: 'n', label: 'Spend not recorded', color: 'var(--gray-7)' },
  { key: 's', label: 'Under 50k', color: 'color-mix(in oklab, var(--accent-9) 45%, var(--gray-5))' },
  { key: 'm', label: '50k – 250k', color: 'var(--accent-9)' },
  { key: 'h', label: `Over 250k: high spend`, color: 'var(--accent-11)' },
];

export const CHANNEL_GROUPS: LensGroup[] = [
  { key: 'email', label: 'Email', color: 'var(--coral-9)' },
  { key: 'letter', label: 'Letter', color: 'var(--gold-9)' },
  { key: 'portal', label: 'Supplier portal', color: 'var(--indigo-9)' },
  { key: 'phone', label: 'Phone', color: 'var(--violet-9)' },
  { key: 'in_person', label: 'In person', color: 'var(--cyan-9)' },
];

export const CHANNEL_LABEL: Record<Channel, string> = { email: 'Email', letter: 'Letter', portal: 'Supplier portal', phone: 'Phone', in_person: 'In person' };

export function lensGroups(lens: CanalLens): LensGroup[] {
  return { gate: GATE_GROUPS, flags: FLAG_GROUPS, age: AGE_GROUPS, spend: SPEND_GROUPS, channel: CHANNEL_GROUPS }[lens];
}

export function groupKey(b: Boat, lens: CanalLens): string {
  switch (lens) {
    case 'gate':
      return b.req.status;
    case 'flags':
      return b.flags.length === 0 ? '0' : b.flags.length === 1 ? '1' : b.flags.length < 4 ? '2' : '4';
    case 'age':
      return b.ageHours < 24 ? 'a' : b.ageHours < 72 ? 'b' : b.ageHours < 168 ? 'c' : 'd';
    case 'spend': {
      const s = b.supplier?.annualSpend;
      return s === null || s === undefined ? 'n' : s < 50_000 ? 's' : s <= rules.HIGH_SPEND ? 'm' : 'h';
    }
    case 'channel':
      return b.req.channel;
  }
}

export function hullColor(b: Boat, lens: CanalLens): string {
  const key = groupKey(b, lens);
  return lensGroups(lens).find((g) => g.key === key)?.color ?? 'var(--gray-8)';
}

export function groupLabel(b: Boat, lens: CanalLens): string {
  const key = groupKey(b, lens);
  return lensGroups(lens).find((g) => g.key === key)?.label ?? '';
}

/** Boat length factor from annual spend: bigger barges carry more money (0.85 to 1.25). */
export function boatScale(spend: number | null | undefined): number {
  if (!spend || spend <= 0) return 0.85;
  const t = Math.min(1, Math.log10(Math.max(1, spend / 5_000)) / Math.log10(1_000_000 / 5_000));
  return 0.85 + t * 0.4;
}

/* ------------------------------------------------------------------ view as */

/** Boats this role can act on; the rest step back when viewing as that role. */
export function isActionable(b: Boat, viewAs: ViewAs, actor: Actor): boolean {
  if (viewAs === 'all') return true;
  if (viewAs === 'clerk') return (b.req.status === 'requested' && b.req.requestedBy !== actor.sub) || (isOpen(b.req.status) && b.req.requestedBy === actor.sub);
  return (b.req.status === 'verified' || b.req.status === 'approved') && b.req.requestedBy !== actor.sub;
}

/** The view-as default for a viewer: approvers see the second key, clerks the call-backs. */
export function defaultViewAs(actor: Actor): ViewAs {
  if (actor.isAdmin) return 'all';
  return isApprover(actor) ? 'approver' : 'clerk';
}

/* ------------------------------------------------------------------ today */

export interface TodayEntry {
  id: string;
  /** The boat to focus. */
  boatId: string | null;
  title: string;
  severity: 'bad' | 'warn' | 'info';
  value: string | number;
  unit: string;
  lens: CanalLens;
  meta: string;
  roles: ViewAs[];
}

const hoursText = (h: number) => (h < 48 ? `${Math.round(h)}` : `${Math.round(h / 24)}`);
const hoursUnit = (h: number, suffix: string) => (h < 48 ? `hours ${suffix}` : `days ${suffix}`);

export function todayFor(data: CanalData, viewAs: ViewAs): TodayEntry[] {
  const out: TodayEntry[] = [];
  const t = toMs(data.now);
  const open = data.boats.filter((b) => isOpen(b.req.status));

  for (const b of data.boats.filter((x) => x.issues.length && x.chamber !== 'drydock')) {
    out.push({
      id: `trail-${b.id}`,
      boatId: b.id,
      title: `${b.ref} passed a gate without its evidence`,
      severity: 'bad',
      value: b.issues.length,
      unit: b.issues.length === 1 ? 'trail issue' : 'trail issues',
      lens: 'gate',
      meta: b.supplier?.name ?? '',
      roles: ['all', 'approver'],
    });
  }

  const flagged = open.filter((b) => b.flags.length >= rules.OVERRIDE_FLAGS).sort((a, b) => b.flags.length - a.flags.length);
  for (const b of flagged.slice(0, 2)) {
    out.push({
      id: `flags-${b.id}`,
      boatId: b.id,
      title: `${b.supplier?.name ?? b.ref} change flies ${b.flags.length} red flags`,
      severity: b.flags.length >= 4 ? 'bad' : 'warn',
      value: b.flags.length,
      unit: 'flags',
      lens: 'flags',
      meta: b.ref,
      roles: b.req.status === 'requested' ? ['all', 'clerk', 'approver'] : ['all', 'approver'],
    });
  }

  const overdue = open.filter((b) => b.callbackOverdue).sort((a, b) => b.ageHours - a.ageHours);
  if (overdue.length) {
    const b = overdue[0];
    out.push({
      id: `callback-${b.id}`,
      boatId: b.id,
      title: `${b.supplier?.name ?? b.ref} still needs a call-back`,
      severity: 'warn',
      value: hoursText(b.ageHours),
      unit: hoursUnit(b.ageHours, 'waiting'),
      lens: 'age',
      meta: overdue.length > 1 ? `${b.ref} · +${overdue.length - 1} more over ${rules.CALLBACK_DUE_HOURS} h` : b.ref,
      roles: ['all', 'clerk'],
    });
  }

  const frozen = open.filter((b) => b.freeze?.frozen).sort((a, b) => toMs(a.freeze!.until!) - toMs(b.freeze!.until!));
  if (frozen.length) {
    const b = frozen[0];
    const left = (toMs(b.freeze!.until!) - t) / HOUR;
    out.push({
      id: `frozen-${b.id}`,
      boatId: b.id,
      title: `${b.supplier?.name ?? b.ref} is frozen until ${formatShort(b.freeze!.until!)}`,
      severity: 'info',
      value: hoursText(left),
      unit: hoursUnit(left, 'to thaw'),
      lens: 'gate',
      meta: frozen.length > 1 ? `${b.ref} · +${frozen.length - 1} more` : `${b.ref} · ${b.freeze!.run?.label ?? 'payment run'}`,
      roles: ['all', 'approver'],
    });
  }

  for (const s of data.shared.slice(0, 1)) {
    out.push({
      id: `shared-${s.hash.slice(0, 12)}`,
      boatId: s.boatId,
      title: `One account, ${s.suppliers.length} suppliers: ${s.suppliers.map((x) => x.name).join(' and ')}`,
      severity: 'bad',
      value: s.suppliers.length,
      unit: 'suppliers',
      lens: 'flags',
      meta: 'Same SHA-256',
      roles: ['all', 'clerk', 'approver'],
    });
  }

  const ready = open.filter((b) => b.req.status === 'verified' && !b.freeze?.frozen && b.flags.length < rules.OVERRIDE_FLAGS);
  if (ready.length) {
    const b = ready[0];
    out.push({
      id: `ready-${b.id}`,
      boatId: b.id,
      title: `${b.supplier?.name ?? b.ref} is ready for the second key`,
      severity: 'info',
      value: ready.length,
      unit: ready.length === 1 ? 'waiting' : 'waiting',
      lens: 'gate',
      meta: b.ref,
      roles: ['approver'],
    });
  }

  const rank: Record<TodayEntry['severity'], number> = { bad: 0, warn: 1, info: 2 };
  return out
    .filter((e) => e.roles.includes(viewAs))
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank[a.e.severity] - rank[b.e.severity] || a.i - b.i)
    .map(({ e }) => e)
    .slice(0, 5);
}
