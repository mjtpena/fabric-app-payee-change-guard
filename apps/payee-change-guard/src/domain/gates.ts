/**
 * The three gates, as pure rules. A change rises requested → verified → approved → released:
 * - Call-back gate: a call-back with outcome "confirmed" on the number already on file, by someone other than the
 *   requester. A denied call-back rejects the request.
 * - Second-approval gate: an approver who is neither the requester nor the verifier, outside the payment-run freeze,
 *   with a written override reason when two or more flags are up.
 * - Release: the supplier's custodian (an admin, not the requester) writes the new account to the master, outside
 *   the freeze.
 * Every check returns a reason the UI shows as-is, so the same words appear in the app, the tests and the README.
 */
import { checkText } from '@x10/shared/lib';

import { rules } from '../config';
import { limits, type ChangeRequest, type Outcome, type RequestStatus, type StaffRoleName, type Supplier } from '../model';
import type { Flag } from './flags';
import { needsOverride } from './flags';
import type { FreezeState } from './freeze';
import { samePhone } from './phone';

export type Chamber = 'request' | 'callback' | 'approval' | 'basin' | 'drydock';

export const CHAMBERS: Chamber[] = ['request', 'callback', 'approval', 'basin', 'drydock'];

export const CHAMBER_LABEL: Record<Chamber, string> = {
  request: 'Request',
  callback: 'Call-back',
  approval: 'Second approval',
  basin: 'Released',
  drydock: 'Dry dock',
};

export function chamberOf(status: RequestStatus): Chamber {
  switch (status) {
    case 'requested':
      return 'request';
    case 'verified':
      return 'callback';
    case 'approved':
      return 'approval';
    case 'released':
      return 'basin';
    default:
      return 'drydock';
  }
}

export const isOpen = (s: RequestStatus) => s === 'requested' || s === 'verified' || s === 'approved';

/** What the request waits for next, in plain words. */
export function nextStep(status: RequestStatus): string {
  switch (status) {
    case 'requested':
      return 'Waiting for a call-back';
    case 'verified':
      return 'Waiting for the second key';
    case 'approved':
      return 'Waiting for release';
    case 'released':
      return 'Released to the supplier master';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Cancelled';
  }
}

export interface Actor {
  sub: string;
  isAdmin: boolean;
  roles: StaffRoleName[];
}

export type Check = { ok: true } | { ok: false; code: CheckCode; reason: string };
export type CheckCode = 'status' | 'sod_requester' | 'sod_verifier' | 'role' | 'frozen' | 'override' | 'custodian' | 'reason';

const no = (code: CheckCode, reason: string): Check => ({ ok: false, code, reason });
const OK: Check = { ok: true };

export const isApprover = (a: Actor) => a.isAdmin || a.roles.includes('approver');

const exactFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "Sat 21 Nov 2026, 10:00" in the viewer's time zone: the exact moment a frozen gate opens. */
export function formatExact(iso: string): string {
  return exactFmt.format(new Date(iso));
}

const shortFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** "Sat 21:00": for Today and badges where the week is obvious. */
export function formatShort(iso: string): string {
  return shortFmt.format(new Date(iso)).replace(',', '');
}

export function frozenMessage(freeze: FreezeState): string {
  return `Frozen until ${formatExact(freeze.until!)}: ${freeze.run?.label ?? 'a payment run'} is due. No approval or release in the ${freeze.run?.freezeHours ?? rules.FREEZE_HOURS} hours before a payment run.`;
}

/* ------------------------------------------------------------------ gate 1: call-back */

export function checkCallback(req: Pick<ChangeRequest, 'status' | 'requestedBy'>, actor: Actor): Check {
  if (req.status !== 'requested') return no('status', 'Only a request waiting at the call-back gate can be called back.');
  if (req.requestedBy === actor.sub) return no('sod_requester', 'You raised this request, so someone else must make the call-back.');
  return OK;
}

export interface CallbackResult {
  numberMatchesFile: boolean;
  /** What the call does to the request. */
  effect: 'verify' | 'reject' | 'none';
  message: string;
}

/** The effect of a recorded call. Only a confirmed call on the number already on file opens the gate. */
export function callbackResult(input: { outcome: Outcome; numberUsed: string }, supplier: Pick<Supplier, 'phoneOnFile'>): CallbackResult {
  const numberMatchesFile = samePhone(input.numberUsed, supplier.phoneOnFile);
  if (input.outcome === 'denied') {
    return { numberMatchesFile, effect: 'reject', message: 'The supplier denied asking for this change. The request is rejected and goes to the dry dock.' };
  }
  if (input.outcome === 'no_answer') {
    return { numberMatchesFile, effect: 'none', message: 'No answer. The call is logged; the request waits for another call-back.' };
  }
  if (!numberMatchesFile) {
    return {
      numberMatchesFile,
      effect: 'none',
      message: 'This number is not the one on file. A call to any other number cannot verify the request; the call is logged.',
    };
  }
  return { numberMatchesFile, effect: 'verify', message: 'Confirmed on the number on file. The call-back gate opens.' };
}

/* ------------------------------------------------------------------ gate 2: second approval */

export interface ApproveContext {
  freeze: FreezeState;
  flags: Flag[];
  overrideReason?: string | null;
}

/** Everything that must hold before the second key turns, except the override text (see checkApprove). */
export function checkApproveGate(req: Pick<ChangeRequest, 'status' | 'requestedBy' | 'verifiedBy'>, actor: Actor, freeze: FreezeState): Check {
  if (req.status !== 'verified') {
    return no('status', req.status === 'requested' ? 'The call-back gate has not opened yet: no confirmed call-back on the number on file.' : 'This request is not waiting for approval.');
  }
  if (req.requestedBy === actor.sub) return no('sod_requester', 'You raised this request. A different person must approve it.');
  if (req.verifiedBy === actor.sub) return no('sod_verifier', 'You made the call-back. The approver must be a third person.');
  if (!isApprover(actor)) return no('role', 'Only approvers (finance controllers) and admins hold the second key.');
  if (freeze.frozen) return no('frozen', frozenMessage(freeze));
  return OK;
}

export function checkApprove(req: Pick<ChangeRequest, 'status' | 'requestedBy' | 'verifiedBy'>, actor: Actor, ctx: ApproveContext): Check {
  const gate = checkApproveGate(req, actor, ctx.freeze);
  if (!gate.ok) return gate;
  if (needsOverride(ctx.flags)) {
    const msg = checkText(ctx.overrideReason ?? '', { ...limits.overrideReason, label: 'Override reason' });
    if (msg) {
      return no('override', `${ctx.flags.length} flags are up, so approving needs a written override reason (at least ${rules.OVERRIDE_MIN_CHARS} characters).`);
    }
  }
  return OK;
}

/* ------------------------------------------------------------------ reject, cancel, release */

export function checkReject(req: Pick<ChangeRequest, 'status' | 'requestedBy'>, actor: Actor, reason: string): Check {
  if (req.status !== 'requested' && req.status !== 'verified') return no('status', 'Only a request at the call-back or second-approval gate can be rejected.');
  if (req.requestedBy === actor.sub) return no('sod_requester', 'You raised this request, so someone else must decide on it.');
  if (!isApprover(actor)) return no('role', 'Only approvers and admins reject requests; a denied call-back rejects automatically.');
  const msg = checkText(reason, { ...limits.rejectReason, label: 'Reason' });
  if (msg) return no('reason', msg);
  return OK;
}

export function checkCancel(req: Pick<ChangeRequest, 'status' | 'requestedBy'>, actor: Actor, reason: string): Check {
  if (!isOpen(req.status as RequestStatus)) return no('status', 'Only an open request can be cancelled.');
  if (req.requestedBy === actor.sub) return no('sod_requester', 'A request cannot be changed by the person who raised it, even to cancel. Ask an approver or admin.');
  if (!isApprover(actor)) return no('role', 'Only approvers and admins cancel requests.');
  const msg = checkText(reason, { ...limits.rejectReason, label: 'Reason' });
  if (msg) return no('reason', msg);
  return OK;
}

export function checkRelease(
  req: Pick<ChangeRequest, 'status' | 'requestedBy'>,
  actor: Actor,
  supplier: Pick<Supplier, 'custodianSub' | 'status'>,
  freeze: FreezeState,
): Check {
  if (req.status !== 'approved') return no('status', 'Only an approved change can be released.');
  if (req.requestedBy === actor.sub) return no('sod_requester', 'You raised this request, so someone else must release it.');
  if (!actor.isAdmin) return no('role', 'Only an admin who keeps the supplier master releases changes.');
  if (supplier.custodianSub !== actor.sub) return no('custodian', 'Only this supplier’s custodian in the master can release the change.');
  if (freeze.frozen) return no('frozen', frozenMessage(freeze));
  return OK;
}
