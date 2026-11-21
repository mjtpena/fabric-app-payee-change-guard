/**
 * Data access for change requests. Components call these; nothing else touches the store. Every write is checked
 * by the pure gate rules first, so separation of duties holds in demo mode and in Fabric alike.
 */
import { PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText, type Errors } from '@x10/shared/lib';

import { limits, type Callback, type ChangeRequest, type Channel, type Outcome, type PaymentRun, type Schema, type StaffRole, type Supplier } from '../model';
import { protectAccount, validateAccount } from './account';
import { computeFlags, encodeFlags, flagsForRequest, type Flag } from './flags';
import { freezeFor, type FreezeState } from './freeze';
import {
  callbackResult,
  checkApprove,
  checkCallback,
  checkCancel,
  checkReject,
  checkRelease,
  isOpen,
  type Actor,
  type CallbackResult,
  type Check,
} from './gates';

export interface World {
  suppliers: Supplier[];
  requests: ChangeRequest[];
  callbacks: Callback[];
  runs: PaymentRun[];
  roles: StaffRole[];
  people: Person[];
}

export async function loadWorld(store: DataStore<Schema>): Promise<World> {
  const [suppliers, requests, callbacks, runs, roles, people] = await Promise.all([
    store.repo('Supplier').list({ orderBy: { field: 'name' } }),
    store.repo('ChangeRequest').list({ orderBy: { field: 'requestedAt', dir: 'desc' } }),
    store.repo('Callback').list({ orderBy: { field: 'calledAt' } }),
    store.repo('PaymentRun').list({ orderBy: { field: 'runDate' } }),
    store.repo('StaffRole').list(),
    store.repo('Person').list(),
  ]);
  return { suppliers, requests, callbacks, runs, roles, people };
}

/** Roles count only when an admin granted them (a self-granted row written through the API is ignored). */
export function trustedRoles(roles: StaffRole[], people: Person[]): StaffRole[] {
  const admins = new Set(people.filter((p) => p.isAdmin).map((p) => p.sub));
  return roles.filter((r) => admins.has(r.grantedBy));
}

export function actorFor(me: Pick<Person, 'sub' | 'isAdmin'>, world: Pick<World, 'roles' | 'people'>): Actor {
  const roles = trustedRoles(world.roles, world.people)
    .filter((r) => r.personSub === me.sub)
    .map((r) => r.role);
  return { sub: me.sub, isAdmin: !!me.isAdmin, roles: [...new Set(roles)] };
}

export function nameOf(world: Pick<World, 'people' | 'roles'>, sub: string | null | undefined): string {
  if (!sub) return '—';
  return world.people.find((p) => p.sub === sub)?.displayName ?? world.roles.find((r) => r.personSub === sub)?.personName ?? 'Unknown person';
}

export function freezeForRequest(world: Pick<World, 'runs' | 'suppliers'>, req: Pick<ChangeRequest, 'supplierId'>, now: Date): FreezeState {
  const supplier = world.suppliers.find((s) => s.id === req.supplierId);
  return freezeFor(world.runs, supplier?.payGroup ?? 'domestic', now);
}

function must(check: Check) {
  if (check.ok) return;
  if (check.code === 'sod_requester' || check.code === 'sod_verifier' || check.code === 'role' || check.code === 'custodian') {
    throw new PermissionError(check.reason);
  }
  throw new RuleError(check.reason);
}

async function getRequest(store: DataStore<Schema>, id: string): Promise<ChangeRequest> {
  const req = await store.repo('ChangeRequest').get(id);
  if (!req) throw new RuleError('That change request no longer exists.');
  return req;
}

/* ------------------------------------------------------------------ Lock keeper: raise a request */

export interface NewRequestInput {
  supplierId: string;
  /** The full account number as typed. Never stored. */
  account: string;
  newBankCountry: string;
  channel: Channel;
  sourceRef: string;
  reason: string;
  urgencyClaimed: boolean;
}

export function validateNewRequest(input: NewRequestInput): Errors<NewRequestInput> {
  return {
    supplierId: input.supplierId ? undefined : 'Choose the supplier.',
    account: validateAccount(input.account) ?? undefined,
    newBankCountry: /^[A-Z]{2}$/.test(input.newBankCountry) ? undefined : 'Choose the bank country.',
    sourceRef: checkText(input.sourceRef, { ...limits.sourceRef, label: 'Source document' }) ?? undefined,
    reason: checkText(input.reason, { ...limits.reason, label: 'Reason given' }) ?? undefined,
  };
}

/** Next reference, PCR-0001 upwards. */
export function nextRef(requests: Pick<ChangeRequest, 'ref'>[]): string {
  const max = requests.reduce((m, r) => Math.max(m, Number(/(\d+)$/.exec(r.ref)?.[1] ?? 0)), 0);
  return `PCR-${String(max + 1).padStart(4, '0')}`;
}

/** Live flags for the form, before anything is saved. */
export function previewFlags(world: World, input: NewRequestInput & { accountHash: string }, now: Date): Flag[] {
  const supplier = world.suppliers.find((s) => s.id === input.supplierId);
  if (!supplier) return [];
  return computeFlags(
    {
      supplier,
      channel: input.channel,
      urgencyClaimed: input.urgencyClaimed,
      newBankCountry: input.newBankCountry,
      newAccountHash: input.accountHash,
      requestedAt: now,
    },
    { suppliers: world.suppliers, requests: world.requests },
  );
}

export async function createRequest(store: DataStore<Schema>, me: Person, input: NewRequestInput, now = new Date()): Promise<ChangeRequest> {
  const errors = validateNewRequest(input);
  const first = Object.values(errors).find(Boolean);
  if (first) throw new RuleError(first);
  const world = await loadWorld(store);
  const supplier = world.suppliers.find((s) => s.id === input.supplierId);
  if (!supplier) throw new RuleError('That supplier is not in the master.');
  if (supplier.status === 'blocked') throw new RuleError(`${supplier.name} is blocked in the master. Unblock it before changing its bank details.`);
  const { masked, hash } = protectAccount(input.account);
  if (hash === supplier.currentAccountHash) throw new RuleError('That is the account already on file for this supplier. Nothing to change.');
  const open = world.requests.find((r) => r.supplierId === supplier.id && isOpen(r.status));
  if (open) throw new RuleError(`${open.ref} is already in the locks for ${supplier.name}. Finish or cancel it first.`);
  const flags = computeFlags(
    { supplier, channel: input.channel, urgencyClaimed: input.urgencyClaimed, newBankCountry: input.newBankCountry, newAccountHash: hash, requestedAt: now },
    { suppliers: world.suppliers, requests: world.requests },
  );
  // Only the masked form and the hash leave this function; `input.account` is dropped here.
  return store.repo('ChangeRequest').create({
    ref: nextRef(world.requests),
    supplierId: supplier.id,
    requestedBy: me.sub,
    requestedAt: now.toISOString(),
    channel: input.channel,
    sourceRef: input.sourceRef.trim(),
    newAccountMasked: masked,
    newAccountHash: hash,
    newBankCountry: input.newBankCountry,
    reason: input.reason.trim(),
    urgencyClaimed: input.urgencyClaimed,
    status: 'requested',
    flags: encodeFlags(flags),
  } as Omit<ChangeRequest, 'id'>);
}

/* ------------------------------------------------------------------ Call-back */

export interface CallbackInput {
  numberUsed: string;
  contactName: string;
  outcome: Outcome;
  note: string;
}

export function validateCallback(input: CallbackInput): Errors<CallbackInput> {
  return {
    numberUsed: checkText(input.numberUsed, { ...limits.phone, label: 'Number dialled' }) ?? undefined,
    contactName: checkText(input.contactName, { ...limits.contactName, label: 'Who you spoke to' }) ?? undefined,
    note: input.note && input.note.length > limits.callNote.max ? `Note must be at most ${limits.callNote.max} characters.` : undefined,
  };
}

export async function recordCallback(
  store: DataStore<Schema>,
  me: Person,
  requestId: string,
  input: CallbackInput,
  now = new Date(),
): Promise<{ callback: Callback; result: CallbackResult; request: ChangeRequest }> {
  const first = Object.values(validateCallback(input)).find(Boolean);
  if (first) throw new RuleError(first);
  const world = await loadWorld(store);
  const req = await getRequest(store, requestId);
  must(checkCallback(req, actorFor(me, world)));
  const supplier = world.suppliers.find((s) => s.id === req.supplierId);
  if (!supplier) throw new RuleError('The supplier is missing from the master.');
  const result = callbackResult(input, supplier);
  const callback = await store.repo('Callback').create({
    requestId: req.id,
    requesterSub: req.requestedBy,
    calledBy: me.sub,
    calledAt: now.toISOString(),
    numberUsed: input.numberUsed.trim(),
    numberMatchesFile: result.numberMatchesFile,
    contactName: input.contactName.trim(),
    outcome: input.outcome,
    note: input.note.trim() || null,
  });
  let request = req;
  if (result.effect === 'verify') {
    request = await store.repo('ChangeRequest').update(req.id, { status: 'verified', verifiedBy: me.sub, verifiedAt: now.toISOString() });
  } else if (result.effect === 'reject') {
    request = await store.repo('ChangeRequest').update(req.id, {
      status: 'rejected',
      rejectReason: `Call-back denied by ${input.contactName.trim()} on the number on file.`.slice(0, limits.rejectReason.max),
      closedBy: me.sub,
      closedAt: now.toISOString(),
    });
  }
  return { callback, result, request };
}

/* ------------------------------------------------------------------ Second key */

export async function approveRequest(store: DataStore<Schema>, me: Person, id: string, overrideReason: string, now = new Date()): Promise<ChangeRequest> {
  const world = await loadWorld(store);
  const req = await getRequest(store, id);
  const flags = flagsForRequest(req, world);
  must(checkApprove(req, actorFor(me, world), { freeze: freezeForRequest(world, req, now), flags, overrideReason }));
  return store.repo('ChangeRequest').update(req.id, {
    status: 'approved',
    approvedBy: me.sub,
    approvedAt: now.toISOString(),
    ...(overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}),
  });
}

export async function rejectRequest(store: DataStore<Schema>, me: Person, id: string, reason: string, now = new Date()): Promise<ChangeRequest> {
  const world = await loadWorld(store);
  const req = await getRequest(store, id);
  must(checkReject(req, actorFor(me, world), reason));
  return store.repo('ChangeRequest').update(req.id, { status: 'rejected', rejectReason: reason.trim(), closedBy: me.sub, closedAt: now.toISOString() });
}

export async function cancelRequest(store: DataStore<Schema>, me: Person, id: string, reason: string, now = new Date()): Promise<ChangeRequest> {
  const world = await loadWorld(store);
  const req = await getRequest(store, id);
  must(checkCancel(req, actorFor(me, world), reason));
  return store.repo('ChangeRequest').update(req.id, { status: 'cancelled', rejectReason: reason.trim(), closedBy: me.sub, closedAt: now.toISOString() });
}

/** Release writes the approved account to the supplier master (masked, hash, bank country) and nothing else. */
export async function releaseRequest(store: DataStore<Schema>, me: Person, id: string, now = new Date()): Promise<ChangeRequest> {
  const world = await loadWorld(store);
  const req = await getRequest(store, id);
  const supplier = world.suppliers.find((s) => s.id === req.supplierId);
  if (!supplier) throw new RuleError('The supplier is missing from the master.');
  must(checkRelease(req, actorFor(me, world), supplier, freezeForRequest(world, req, now)));
  await store.repo('Supplier').update(supplier.id, {
    currentAccountMasked: req.newAccountMasked,
    currentAccountHash: req.newAccountHash,
    currentBankCountry: req.newBankCountry,
  });
  return store.repo('ChangeRequest').update(req.id, { status: 'released', releasedAt: now.toISOString() });
}
