import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * App roles: AP clerks and approvers (finance controllers). Admins come from Person.isAdmin.
 * Security: everyone reads; writes only by the row's grantor (grantedBy = caller). The domain trusts a role row only
 * when its grantor is an admin, so granting yourself "approver" through the API has no effect in the app.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', ['create', 'update', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.grantedBy),
})
export class StaffRole {
  @uuid() id!: string;
  @text({ min: 1, max: 255 }) personSub!: string;
  @text({ min: 1, max: 100 }) personName!: string;
  @set('clerk', 'approver') role!: 'clerk' | 'approver';
  @text({ min: 1, max: 255 }) grantedBy!: string;
  @date() grantedAt!: Date;
}
