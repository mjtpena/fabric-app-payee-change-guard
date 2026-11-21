import { date, decimal, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A supplier in the master, with the bank account currently on file (masked + SHA-256 hash only: the app never
 * stores a full account number).
 *
 * Security (README "Security model"):
 * - read: every signed-in user (clerks need the master to raise and check requests).
 * - create/update: only the supplier's custodian (`custodianSub`, the admin who maintains this part of the master).
 *   That the custodian is an admin is checked in src/domain/admin.ts (there is no admin claim). Release writes the
 *   approved account here, so only the custodian can release.
 * - delete: nobody (block a supplier instead; the ledger must stay complete).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', ['create', 'update'], {
  policy: (claims, item) => claims.sub.eq(item.custodianSub),
})
export class Supplier {
  @uuid() id!: string;
  @text({ min: 3, max: 150 }) name!: string;
  @text({ min: 1, max: 20 }) supplierNo!: string;
  @text({ min: 5, max: 40 }) phoneOnFile!: string;
  @date() phoneOnFileSince!: Date;
  @text({ min: 2, max: 2 }) country!: string;
  @text({ min: 1, max: 34 }) currentAccountMasked!: string;
  @text({ min: 64, max: 64 }) currentAccountHash!: string;
  @text({ min: 2, max: 2 }) currentBankCountry!: string;
  @decimal({ optional: true }) annualSpend?: number;
  @set('active', 'blocked') status!: 'active' | 'blocked';
  @set('domestic', 'international') payGroup!: 'domestic' | 'international';
  @text({ min: 1, max: 255 }) custodianSub!: string;
}
