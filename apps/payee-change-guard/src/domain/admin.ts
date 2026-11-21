/**
 * Harbour office: the supplier master, the payment-run calendar and who holds which key. Admin only (checked here;
 * the database adds custodian / creator / grantor policies on top).
 */
import { PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText, toMs } from '@x10/shared/lib';

import { rules } from '../config';
import { limits, type PayGroup, type PaymentRun, type RunScope, type Schema, type StaffRole, type StaffRoleName, type Supplier } from '../model';
import { protectAccount, validateAccount } from './account';
import { normalisePhone, samePhone } from './phone';

function admin(me: Person) {
  if (!me.isAdmin) throw new PermissionError('Only admins keep the supplier master, the payment-run calendar and the keys.');
}

/* ------------------------------------------------------------------ suppliers */

export interface SupplierInput {
  name: string;
  supplierNo: string;
  phoneOnFile: string;
  country: string;
  annualSpend: number | null;
  payGroup: PayGroup;
}

export function validateSupplier(input: SupplierInput): string | null {
  return (
    checkText(input.name, { ...limits.supplierName, label: 'Name' }) ??
    checkText(input.supplierNo, { ...limits.supplierNo, label: 'Supplier number' }) ??
    checkText(input.phoneOnFile, { ...limits.phone, label: 'Phone on file' }) ??
    (normalisePhone(input.phoneOnFile).replace('+', '').length < 5 ? 'The phone on file needs at least 5 digits.' : null) ??
    (/^[A-Z]{2}$/.test(input.country) ? null : 'Country is a two-letter code such as GB.') ??
    (input.annualSpend !== null && (!Number.isFinite(input.annualSpend) || input.annualSpend < 0) ? 'Annual spend must be zero or more.' : null)
  );
}

export async function createSupplier(
  store: DataStore<Schema>,
  me: Person,
  input: SupplierInput & { account: string; bankCountry: string },
  now = new Date(),
): Promise<Supplier> {
  admin(me);
  const msg = validateSupplier(input) ?? validateAccount(input.account) ?? (/^[A-Z]{2}$/.test(input.bankCountry) ? null : 'Choose the bank country.');
  if (msg) throw new RuleError(msg);
  const existing = await store.repo('Supplier').list({ where: { supplierNo: input.supplierNo.trim() } });
  if (existing.length) throw new RuleError(`Supplier number ${input.supplierNo.trim()} is already in the master.`);
  const { masked, hash } = protectAccount(input.account);
  return store.repo('Supplier').create({
    name: input.name.trim(),
    supplierNo: input.supplierNo.trim(),
    phoneOnFile: input.phoneOnFile.trim(),
    phoneOnFileSince: now.toISOString(),
    country: input.country,
    currentAccountMasked: masked,
    currentAccountHash: hash,
    currentBankCountry: input.bankCountry,
    annualSpend: input.annualSpend,
    status: 'active',
    payGroup: input.payGroup,
    custodianSub: me.sub,
  });
}

/** Edit the master. Changing the phone on file restarts its clock (and raises the "phone changed" flag). */
export async function updateSupplier(
  store: DataStore<Schema>,
  me: Person,
  id: string,
  patch: Partial<SupplierInput> & { status?: Supplier['status'] },
  now = new Date(),
): Promise<Supplier> {
  admin(me);
  const s = await store.repo('Supplier').get(id);
  if (!s) throw new RuleError('That supplier is no longer in the master.');
  if (s.custodianSub !== me.sub) throw new PermissionError('Only this supplier’s custodian can edit it.');
  const next = { name: s.name, supplierNo: s.supplierNo, phoneOnFile: s.phoneOnFile, country: s.country, annualSpend: s.annualSpend, payGroup: s.payGroup, ...patch };
  const msg = validateSupplier(next);
  if (msg) throw new RuleError(msg);
  const phoneChanged = patch.phoneOnFile !== undefined && !samePhone(patch.phoneOnFile, s.phoneOnFile);
  return store.repo('Supplier').update(id, {
    ...patch,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.phoneOnFile !== undefined ? { phoneOnFile: patch.phoneOnFile.trim() } : {}),
    ...(phoneChanged ? { phoneOnFileSince: now.toISOString() } : {}),
  });
}

/* ------------------------------------------------------------------ payment runs */

export interface RunInput {
  runDate: string;
  label: string;
  payGroup: RunScope;
  freezeHours?: number;
}

export async function addRun(store: DataStore<Schema>, me: Person, input: RunInput, now = new Date()): Promise<PaymentRun> {
  admin(me);
  const msg = checkText(input.label, { ...limits.runLabel, label: 'Label' });
  if (msg) throw new RuleError(msg);
  if (!input.runDate || Number.isNaN(toMs(input.runDate))) throw new RuleError('Choose the run date and time.');
  if (toMs(input.runDate) <= now.getTime()) throw new RuleError('A new payment run must be in the future.');
  const freezeHours = input.freezeHours ?? rules.FREEZE_HOURS;
  if (!Number.isInteger(freezeHours) || freezeHours < 0 || freezeHours > 168) throw new RuleError('Freeze hours must be a whole number from 0 to 168.');
  return store.repo('PaymentRun').create({ runDate: new Date(input.runDate).toISOString(), label: input.label.trim(), payGroup: input.payGroup, freezeHours, createdBy: me.sub });
}

export async function removeRun(store: DataStore<Schema>, me: Person, id: string): Promise<void> {
  admin(me);
  const run = await store.repo('PaymentRun').get(id);
  if (!run) return;
  if (run.createdBy !== me.sub) throw new PermissionError('Only the admin who scheduled this run can remove it.');
  await store.repo('PaymentRun').remove(id);
}

/* ------------------------------------------------------------------ keys (roles) */

export async function grantRole(store: DataStore<Schema>, me: Person, person: Pick<Person, 'sub' | 'displayName'>, role: StaffRoleName, now = new Date()): Promise<StaffRole> {
  admin(me);
  const existing = await store.repo('StaffRole').list({ where: { personSub: person.sub } });
  const same = existing.find((r) => r.role === role);
  if (same) return same;
  return store.repo('StaffRole').create({ personSub: person.sub, personName: person.displayName.slice(0, limits.personName.max), role, grantedBy: me.sub, grantedAt: now.toISOString() });
}

export async function revokeRole(store: DataStore<Schema>, me: Person, id: string): Promise<void> {
  admin(me);
  const row = await store.repo('StaffRole').get(id);
  if (!row) return;
  if (row.grantedBy !== me.sub) throw new PermissionError('Only the admin who granted this key can take it back.');
  await store.repo('StaffRole').remove(id);
}
