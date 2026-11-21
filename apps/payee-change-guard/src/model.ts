/**
 * App data types and runtime entity definitions. Keep these in step with rayfin/data/*.ts:
 * every field listed here must exist on the entity class with the matching decorator.
 * Dates are ISO strings in the app; optional fields are `| null`.
 */
import type { EntityDefs } from '@x10/shared/data';
import { AppMarkerDef, PersonDef, type AppMarker, type Person } from '@x10/shared/identity';

/** The same numbers as the decorators on the entities. */
export const limits = {
  supplierName: { min: 3, max: 150 },
  supplierNo: { min: 1, max: 20 },
  phone: { min: 5, max: 40 },
  country: { min: 2, max: 2 },
  masked: { min: 1, max: 34 },
  ref: { min: 1, max: 12 },
  sourceRef: { min: 3, max: 200 },
  reason: { min: 10, max: 600 },
  flags: { max: 300 },
  rejectReason: { min: 10, max: 600 },
  overrideReason: { min: 20, max: 600 },
  contactName: { min: 2, max: 120 },
  callNote: { max: 600 },
  runLabel: { min: 3, max: 60 },
  personName: { min: 1, max: 100 },
  /** A full account number or IBAN as typed (never stored): 6 to 34 letters and digits after removing spaces. */
  account: { min: 6, max: 34 },
} as const;

export const CHANNELS = ['email', 'letter', 'portal', 'phone', 'in_person'] as const;
export type Channel = (typeof CHANNELS)[number];

export const REQUEST_STATUSES = ['requested', 'verified', 'approved', 'rejected', 'released', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const OUTCOMES = ['confirmed', 'denied', 'no_answer'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const PAY_GROUPS = ['domestic', 'international'] as const;
export type PayGroup = (typeof PAY_GROUPS)[number];
export type RunScope = PayGroup | 'all';

export const STAFF_ROLES = ['clerk', 'approver'] as const;
export type StaffRoleName = (typeof STAFF_ROLES)[number];

export interface Supplier {
  id: string;
  name: string;
  supplierNo: string;
  phoneOnFile: string;
  phoneOnFileSince: string;
  country: string;
  currentAccountMasked: string;
  currentAccountHash: string;
  currentBankCountry: string;
  annualSpend: number | null;
  status: 'active' | 'blocked';
  payGroup: PayGroup;
  custodianSub: string;
}

export interface ChangeRequest {
  id: string;
  ref: string;
  supplierId: string;
  requestedBy: string;
  requestedAt: string;
  channel: Channel;
  sourceRef: string;
  newAccountMasked: string;
  newAccountHash: string;
  newBankCountry: string;
  reason: string;
  urgencyClaimed: boolean;
  status: RequestStatus;
  /** Comma list of flag codes raised when the request was made (see src/domain/flags.ts). */
  flags: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  rejectReason: string | null;
  overrideReason: string | null;
  /** Who rejected or cancelled it. */
  closedBy: string | null;
  closedAt: string | null;
}

export interface Callback {
  id: string;
  requestId: string;
  requesterSub: string;
  calledBy: string;
  calledAt: string;
  numberUsed: string;
  numberMatchesFile: boolean;
  contactName: string;
  outcome: Outcome;
  note: string | null;
}

export interface PaymentRun {
  id: string;
  runDate: string;
  freezeHours: number;
  label: string;
  payGroup: RunScope;
  createdBy: string;
}

export interface StaffRole {
  id: string;
  personSub: string;
  personName: string;
  role: StaffRoleName;
  grantedBy: string;
  grantedAt: string;
}

export type Schema = {
  Person: Person;
  AppMarker: AppMarker;
  Supplier: Supplier;
  ChangeRequest: ChangeRequest;
  Callback: Callback;
  PaymentRun: PaymentRun;
  StaffRole: StaffRole;
};

export const defs: EntityDefs<Schema> = {
  Person: PersonDef,
  AppMarker: AppMarkerDef,
  Supplier: {
    name: 'Supplier',
    fields: {
      id: 'uuid',
      name: 'text',
      supplierNo: 'text',
      phoneOnFile: 'text',
      phoneOnFileSince: 'date',
      country: 'text',
      currentAccountMasked: 'text',
      currentAccountHash: 'text',
      currentBankCountry: 'text',
      annualSpend: 'decimal',
      status: 'set',
      payGroup: 'set',
      custodianSub: 'text',
    },
  },
  ChangeRequest: {
    name: 'ChangeRequest',
    fields: {
      id: 'uuid',
      ref: 'text',
      supplierId: 'uuid',
      requestedBy: 'text',
      requestedAt: 'date',
      channel: 'set',
      sourceRef: 'text',
      newAccountMasked: 'text',
      newAccountHash: 'text',
      newBankCountry: 'text',
      reason: 'text',
      urgencyClaimed: 'bool',
      status: 'set',
      flags: 'text',
      verifiedBy: 'text',
      verifiedAt: 'date',
      approvedBy: 'text',
      approvedAt: 'date',
      releasedAt: 'date',
      rejectReason: 'text',
      overrideReason: 'text',
      closedBy: 'text',
      closedAt: 'date',
    },
  },
  Callback: {
    name: 'Callback',
    fields: {
      id: 'uuid',
      requestId: 'uuid',
      requesterSub: 'text',
      calledBy: 'text',
      calledAt: 'date',
      numberUsed: 'text',
      numberMatchesFile: 'bool',
      contactName: 'text',
      outcome: 'set',
      note: 'text',
    },
  },
  PaymentRun: {
    name: 'PaymentRun',
    fields: { id: 'uuid', runDate: 'date', freezeHours: 'int', label: 'text', payGroup: 'set', createdBy: 'text' },
  },
  StaffRole: {
    name: 'StaffRole',
    fields: { id: 'uuid', personSub: 'text', personName: 'text', role: 'set', grantedBy: 'text', grantedAt: 'date' },
  },
};
