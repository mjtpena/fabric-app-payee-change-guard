/**
 * Ledger: every change per supplier, and the CSV export. Masked accounts only; hashes and full numbers never leave.
 */
import { toCsv } from '@x10/shared/lib';

import type { ChangeRequest, Supplier } from '../model';
import { CHANNEL_LABEL } from './canal';
import { decodeFlags, FLAG_LABEL } from './flags';
import { nameOf, type World } from './requests';

export const STATUS_LABEL: Record<ChangeRequest['status'], string> = {
  requested: 'At call-back gate',
  verified: 'Called back',
  approved: 'Approved',
  released: 'Released',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export interface SupplierLedger {
  supplier: Supplier;
  requests: ChangeRequest[];
  open: ChangeRequest | null;
  lastReleased: ChangeRequest | null;
}

export function supplierLedgers(world: World): SupplierLedger[] {
  return world.suppliers.map((supplier) => {
    const requests = world.requests.filter((r) => r.supplierId === supplier.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return {
      supplier,
      requests,
      open: requests.find((r) => r.status === 'requested' || r.status === 'verified' || r.status === 'approved') ?? null,
      lastReleased: requests.find((r) => r.status === 'released') ?? null,
    };
  });
}

export const LEDGER_HEADERS = [
  'ref',
  'supplier',
  'supplierNo',
  'requestedAt',
  'requestedBy',
  'channel',
  'sourceRef',
  'newAccountMasked',
  'newBankCountry',
  'urgencyClaimed',
  'flags',
  'status',
  'callbacks',
  'verifiedBy',
  'verifiedAt',
  'approvedBy',
  'approvedAt',
  'overrideReason',
  'releasedAt',
  'closedBy',
  'closedAt',
  'rejectOrCancelReason',
];

export function ledgerRows(world: World, supplierId?: string): unknown[][] {
  return world.requests
    .filter((r) => !supplierId || r.supplierId === supplierId)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
    .map((r) => {
      const s = world.suppliers.find((x) => x.id === r.supplierId);
      const calls = world.callbacks.filter((c) => c.requestId === r.id);
      return [
        r.ref,
        s?.name ?? '',
        s?.supplierNo ?? '',
        r.requestedAt,
        nameOf(world, r.requestedBy),
        CHANNEL_LABEL[r.channel],
        r.sourceRef,
        r.newAccountMasked,
        r.newBankCountry,
        r.urgencyClaimed ? 'yes' : 'no',
        decodeFlags(r.flags)
          .map((f) => FLAG_LABEL[f])
          .join('; '),
        STATUS_LABEL[r.status],
        calls.map((c) => `${c.calledAt} ${c.outcome}${c.numberMatchesFile ? '' : ' (not the number on file)'} by ${nameOf(world, c.calledBy)}`).join(' | '),
        r.verifiedBy ? nameOf(world, r.verifiedBy) : '',
        r.verifiedAt ?? '',
        r.approvedBy ? nameOf(world, r.approvedBy) : '',
        r.approvedAt ?? '',
        r.overrideReason ?? '',
        r.releasedAt ?? '',
        r.closedBy ? nameOf(world, r.closedBy) : '',
        r.closedAt ?? '',
        r.rejectReason ?? '',
      ];
    });
}

export function ledgerCsv(world: World, supplierId?: string): string {
  return toCsv(LEDGER_HEADERS, ledgerRows(world, supplierId));
}
