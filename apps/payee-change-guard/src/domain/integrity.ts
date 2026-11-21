/**
 * Trail check. The database lets anyone but the requester update a request, so a determined user could set
 * "verified" or "approved" through the API without the gate's evidence. This check compares every request's status
 * with its call-back trail and named people; a mismatch shows as a leaking boat and in Today.
 */
import { toMs } from '@x10/shared/lib';

import type { Callback, ChangeRequest, Supplier } from '../model';
import { decodeFlags, needsOverride } from './flags';
import { samePhone } from './phone';

const PASSED_CALLBACK: ChangeRequest['status'][] = ['verified', 'approved', 'released'];
const PASSED_APPROVAL: ChangeRequest['status'][] = ['approved', 'released'];

export function trailIssues(req: ChangeRequest, callbacks: Callback[], supplier: Supplier | null): string[] {
  const out: string[] = [];
  const mine = callbacks.filter((c) => c.requestId === req.id);
  if (PASSED_CALLBACK.includes(req.status)) {
    if (!req.verifiedBy) out.push('No verifier is recorded.');
    else if (req.verifiedBy === req.requestedBy) out.push('The requester verified their own request.');
    const proof = mine.find(
      (c) =>
        c.outcome === 'confirmed' &&
        c.numberMatchesFile &&
        c.calledBy === req.verifiedBy &&
        c.calledBy !== req.requestedBy &&
        (!req.verifiedAt || toMs(c.calledAt) <= toMs(req.verifiedAt) + 60_000),
    );
    if (!proof) out.push('No confirmed call-back on the number on file backs the verification.');
    else if (supplier && toMs(supplier.phoneOnFileSince) <= toMs(proof.calledAt) && !samePhone(proof.numberUsed, supplier.phoneOnFile)) {
      out.push('The call-back number is not the number on file.');
    }
  }
  if (PASSED_APPROVAL.includes(req.status)) {
    if (!req.approvedBy) out.push('No approver is recorded.');
    else {
      if (req.approvedBy === req.requestedBy) out.push('The requester approved their own request.');
      if (req.approvedBy === req.verifiedBy) out.push('The verifier also approved.');
    }
    if (needsOverride(decodeFlags(req.flags)) && !req.overrideReason?.trim()) out.push('Approved with two or more flags but no override reason.');
  }
  if (req.status === 'released' && !req.releasedAt) out.push('Released without a release time.');
  return out;
}
