import { date, entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A scheduled payment run. Approvals and releases for suppliers in the run's pay group freeze `freezeHours` before
 * `runDate`. Security: everyone reads; writes only by the row's creator (createdBy = caller). That only admins
 * maintain the calendar is checked in the domain.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', ['create', 'update', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.createdBy),
})
export class PaymentRun {
  @uuid() id!: string;
  @date() runDate!: Date;
  @int() freezeHours!: number;
  @text({ min: 3, max: 60 }) label!: string;
  @set('all', 'domestic', 'international') payGroup!: 'all' | 'domestic' | 'international';
  @text({ min: 1, max: 255 }) createdBy!: string;
}
