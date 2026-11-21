import { boolean, date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * One call-back attempt on a change request. Append-only.
 *
 * Security: everyone reads; create only stamped with your own sub (calledBy = caller) and never by the requester
 * (`requesterSub` is the request's requestedBy, denormalised so the policy can name it); no update, no delete.
 * Whether the number used is the one on file is re-checked by the domain against the supplier master.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.calledBy).and(claims.sub.neq(item.requesterSub)),
})
export class Callback {
  @uuid() id!: string;
  @uuid() requestId!: string;
  @text({ min: 1, max: 255 }) requesterSub!: string;
  @text({ min: 1, max: 255 }) calledBy!: string;
  @date() calledAt!: Date;
  @text({ min: 5, max: 40 }) numberUsed!: string;
  @boolean() numberMatchesFile!: boolean;
  @text({ min: 2, max: 120 }) contactName!: string;
  @set('confirmed', 'denied', 'no_answer') outcome!: 'confirmed' | 'denied' | 'no_answer';
  @text({ max: 600, optional: true }) note?: string;
}
