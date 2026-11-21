/**
 * A mirror of the row-level security on the entities (rayfin/data/*.ts), so domain code and tests can check that
 * every write the app makes is one the deployed API will accept. Keep in step with the decorators.
 *
 * What the database enforces (Fabric mode):
 * - ChangeRequest create: requestedBy = caller, status 'requested'; gate fields cannot be set.
 * - ChangeRequest update: caller ≠ requestedBy, row still open; what the requester wrote is frozen.
 * - Callback create: calledBy = caller and caller ≠ requesterSub. No update or delete.
 * - Supplier create/update: caller = custodianSub. No delete.
 * - PaymentRun, StaffRole writes: caller = createdBy / grantedBy.
 * What it cannot express (no admin claim, no cross-row checks) is enforced in src/domain: verifier ≠ approver, the
 * call-back must be on the number on file, the freeze, the approver role, admin-only master and calendar edits.
 */
import type { ChangeRequest } from '../model';

export const REQUEST_CREATE_EXCLUDED = [
  'verifiedBy',
  'verifiedAt',
  'approvedBy',
  'approvedAt',
  'releasedAt',
  'rejectReason',
  'overrideReason',
  'closedBy',
  'closedAt',
] as const;

export const REQUEST_UPDATE_EXCLUDED = [
  'ref',
  'supplierId',
  'requestedBy',
  'requestedAt',
  'channel',
  'sourceRef',
  'newAccountMasked',
  'newAccountHash',
  'newBankCountry',
  'reason',
  'urgencyClaimed',
  'flags',
] as const;

export function canCreateRequestRow(sub: string, row: Pick<ChangeRequest, 'requestedBy' | 'status'>): boolean {
  return row.requestedBy === sub && row.status === 'requested';
}

/** The update policy is evaluated on the stored row. */
export function canUpdateRequestRow(sub: string, row: Pick<ChangeRequest, 'requestedBy' | 'status'>): boolean {
  return sub !== row.requestedBy && row.status !== 'released' && row.status !== 'rejected' && row.status !== 'cancelled';
}
