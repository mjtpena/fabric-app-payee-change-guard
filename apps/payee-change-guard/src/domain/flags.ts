/**
 * Red flags on a bank-detail change, each with a plain reason. Two or more flags mean the approver must write an
 * override reason. Flags are worked out when the request is made (and stored as codes), and again live, so a shared
 * account that appears later is still caught at the second key.
 */
import { DAY, formatDate, toMs } from '@x10/shared/lib';

import { countryName, rules } from '../config';
import type { ChangeRequest, Channel, Supplier } from '../model';

export const FLAG_CODES = [
  'shared_account',
  'urgency',
  'email',
  'new_country',
  'country_mismatch',
  'phone_changed',
  'recent_change',
  'high_spend',
] as const;
export type FlagCode = (typeof FLAG_CODES)[number];

export const FLAG_LABEL: Record<FlagCode, string> = {
  shared_account: 'Account on another supplier',
  urgency: 'Urgency claimed',
  email: 'Requested by email',
  new_country: 'New bank country',
  country_mismatch: 'Bank abroad',
  phone_changed: 'Phone changed recently',
  recent_change: 'Changed recently',
  high_spend: 'High spend',
};

/** Short pennant text (the canal writes these on the flags). */
export const FLAG_SHORT: Record<FlagCode, string> = {
  shared_account: 'SHARED',
  urgency: 'URGENT',
  email: 'EMAIL',
  new_country: 'NEW CTRY',
  country_mismatch: 'ABROAD',
  phone_changed: 'PHONE',
  recent_change: 'RECENT',
  high_spend: 'SPEND',
};

export interface Flag {
  code: FlagCode;
  label: string;
  reason: string;
}

export interface FlagInput {
  supplier: Supplier;
  channel: Channel;
  urgencyClaimed: boolean;
  newBankCountry: string;
  /** Empty while the account field is empty. */
  newAccountHash: string;
  requestedAt: string | Date;
  /** The request itself, so it does not count as its own history. */
  requestId?: string | null;
}

export interface FlagContext {
  suppliers: Supplier[];
  requests: ChangeRequest[];
}

const OPEN: ChangeRequest['status'][] = ['requested', 'verified', 'approved'];
const money = (n: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(n);

/** Bank countries this supplier has been paid in: the current one and every released change. */
export function seenCountries(supplier: Supplier, requests: ChangeRequest[], excludeId?: string | null): Set<string> {
  const seen = new Set([supplier.currentBankCountry]);
  for (const r of requests) if (r.supplierId === supplier.id && r.status === 'released' && r.id !== excludeId) seen.add(r.newBankCountry);
  return seen;
}

/** Another supplier holding (or about to hold) the same account. */
export function sharedAccountWith(hash: string, supplierId: string, ctx: FlagContext): Supplier | null {
  if (!hash) return null;
  const onFile = ctx.suppliers.find((s) => s.id !== supplierId && s.currentAccountHash === hash);
  if (onFile) return onFile;
  const pending = ctx.requests.find((r) => r.supplierId !== supplierId && OPEN.includes(r.status) && r.newAccountHash === hash);
  return pending ? (ctx.suppliers.find((s) => s.id === pending.supplierId) ?? null) : null;
}

export function computeFlags(input: FlagInput, ctx: FlagContext): Flag[] {
  const { supplier } = input;
  const t = toMs(input.requestedAt);
  const out: Flag[] = [];
  const add = (code: FlagCode, reason: string) => out.push({ code, label: FLAG_LABEL[code], reason });

  const other = sharedAccountWith(input.newAccountHash, supplier.id, ctx);
  if (other) add('shared_account', `This account is already on file for ${other.name} (${other.supplierNo}).`);

  if (input.urgencyClaimed) add('urgency', 'The request presses for speed. Pressure to skip checks is the classic sign of impersonation.');

  if (input.channel === 'email') add('email', 'Email is the channel fraudsters use most: a look-alike address or a hijacked mailbox.');

  if (input.newBankCountry && !seenCountries(supplier, ctx.requests, input.requestId).has(input.newBankCountry)) {
    add('new_country', `Never paid into ${countryName(input.newBankCountry)} before for this supplier.`);
  }

  if (input.newBankCountry && input.newBankCountry !== supplier.country) {
    add('country_mismatch', `Bank in ${countryName(input.newBankCountry)}; the supplier is based in ${countryName(supplier.country)}.`);
  }

  const phoneAge = (t - toMs(supplier.phoneOnFileSince)) / DAY;
  if (phoneAge >= 0 && phoneAge < rules.PHONE_CHANGE_DAYS) {
    add('phone_changed', `The phone on file changed on ${formatDate(supplier.phoneOnFileSince)}. A fraudster may have changed it first.`);
  }

  const previous = ctx.requests
    .filter((r) => r.supplierId === supplier.id && r.id !== input.requestId && r.status !== 'cancelled')
    .map((r) => ({ r, at: Math.max(toMs(r.requestedAt), r.releasedAt ? toMs(r.releasedAt) : 0) }))
    .filter(({ at }) => at <= t && t - at < rules.RECENT_CHANGE_DAYS * DAY)
    .sort((a, b) => b.at - a.at)[0];
  if (previous) {
    const days = Math.max(0, Math.floor((t - previous.at) / DAY));
    add('recent_change', `${previous.r.ref} touched these bank details ${days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'} earlier`}.`);
  }

  if (supplier.annualSpend !== null && supplier.annualSpend > rules.HIGH_SPEND) {
    add('high_spend', `Annual spend ${money(supplier.annualSpend)} is above ${money(rules.HIGH_SPEND)}.`);
  }
  return out;
}

export function encodeFlags(flags: Flag[]): string {
  return flags.map((f) => f.code).join(',');
}

export function decodeFlags(s: string | null | undefined): FlagCode[] {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x): x is FlagCode => (FLAG_CODES as readonly string[]).includes(x));
}

/** Flags for a stored request: the stored codes plus anything that is true now, with today's reasons. */
export function flagsForRequest(req: ChangeRequest, ctx: FlagContext): Flag[] {
  const supplier = ctx.suppliers.find((s) => s.id === req.supplierId);
  if (!supplier) return decodeFlags(req.flags).map((code) => ({ code, label: FLAG_LABEL[code], reason: FLAG_LABEL[code] }));
  const live = computeFlags(
    {
      supplier,
      channel: req.channel,
      urgencyClaimed: req.urgencyClaimed,
      newBankCountry: req.newBankCountry,
      newAccountHash: req.newAccountHash,
      requestedAt: req.requestedAt,
      requestId: req.id,
    },
    // History as it was when the request was made: the release of this very request is not "history".
    { suppliers: ctx.suppliers, requests: ctx.requests.filter((r) => r.id !== req.id) },
  );
  // Once released, the supplier's current account IS this account, and its own country is "seen": keep the
  // stored record for those instead of the live view.
  const stored = decodeFlags(req.flags);
  const byCode = new Map(live.map((f) => [f.code, f]));
  const merged: Flag[] = [];
  for (const code of FLAG_CODES) {
    const l = byCode.get(code);
    if (l && (req.status !== 'released' || stored.includes(code))) merged.push(l);
    else if (stored.includes(code)) merged.push({ code, label: FLAG_LABEL[code], reason: storedReason(code) });
  }
  return merged;
}

function storedReason(code: FlagCode): string {
  return `${FLAG_LABEL[code]} was raised when the request was made.`;
}

export function needsOverride(flags: Flag[] | FlagCode[]): boolean {
  return flags.length >= rules.OVERRIDE_FLAGS;
}
