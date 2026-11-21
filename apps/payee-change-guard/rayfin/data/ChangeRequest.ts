import { boolean, date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A request to change a supplier's bank details: the boat that rises through the three lock gates.
 *
 * Security (README "Security model"; keep in step with src/domain/policies.ts):
 * - read: every signed-in user.
 * - create: only as yourself (requestedBy = caller), only in status "requested"; gate fields cannot be set.
 * - update: anyone EXCEPT the requester (so the requester can never verify, approve or release their own change),
 *   and only while the request is still open (requested, verified or approved). Everything the requester wrote is
 *   frozen. Verifier ≠ approver, the call-back rule, the freeze and the approver role are checked in the domain.
 * - delete: nobody (cancel instead; the ledger must stay complete).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.requestedBy).and(item.status.eq('requested')),
  exclude: ['verifiedBy', 'verifiedAt', 'approvedBy', 'approvedAt', 'releasedAt', 'rejectReason', 'overrideReason', 'closedBy', 'closedAt'],
})
@role('authenticated', 'update', {
  policy: (claims, item) =>
    claims.sub
      .neq(item.requestedBy)
      .and(item.status.neq('released'))
      .and(item.status.neq('rejected'))
      .and(item.status.neq('cancelled')),
  exclude: [
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
  ],
})
export class ChangeRequest {
  @uuid() id!: string;
  @text({ min: 1, max: 12 }) ref!: string;
  @uuid() supplierId!: string;
  @text({ min: 1, max: 255 }) requestedBy!: string;
  @date() requestedAt!: Date;
  @set('email', 'letter', 'portal', 'phone', 'in_person') channel!: 'email' | 'letter' | 'portal' | 'phone' | 'in_person';
  @text({ min: 3, max: 200 }) sourceRef!: string;
  @text({ min: 1, max: 34 }) newAccountMasked!: string;
  @text({ min: 64, max: 64 }) newAccountHash!: string;
  @text({ min: 2, max: 2 }) newBankCountry!: string;
  @text({ min: 10, max: 600 }) reason!: string;
  @boolean() urgencyClaimed!: boolean;
  @set('requested', 'verified', 'approved', 'rejected', 'released', 'cancelled')
  status!: 'requested' | 'verified' | 'approved' | 'rejected' | 'released' | 'cancelled';
  @text({ max: 300 }) flags!: string;
  @text({ max: 255, optional: true }) verifiedBy?: string;
  @date({ optional: true }) verifiedAt?: Date;
  @text({ max: 255, optional: true }) approvedBy?: string;
  @date({ optional: true }) approvedAt?: Date;
  @date({ optional: true }) releasedAt?: Date;
  @text({ max: 600, optional: true }) rejectReason?: string;
  @text({ max: 600, optional: true }) overrideReason?: string;
  @text({ max: 255, optional: true }) closedBy?: string;
  @date({ optional: true }) closedAt?: Date;
}
