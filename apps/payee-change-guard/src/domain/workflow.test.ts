import { PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { FIXED_NOW, testStore } from '@x10/shared/test';

import { PERSONA, personas } from '../app.config';
import { defs, type Schema } from '../model';
import { seed } from '../seed';
import { hashAccount } from './account';
import { addRun, createSupplier, grantRole, updateSupplier } from './admin';
import { formatExact } from './gates';
import { policyStore, PolicyViolation } from './policyStore.testutil';
import { approveRequest, cancelRequest, createRequest, loadWorld, recordCallback, rejectRequest, releaseRequest, type NewRequestInput } from './requests';

async function setup() {
  const raw = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  const people = await raw.repo('Person').list();
  const who = (sub: string) => people.find((p) => p.sub === sub)!;
  /** The store as the database sees this person: row policies enforced. */
  const as = (sub: string): [DataStore<Schema>, Person] => [policyStore(raw, sub), who(sub)];
  const byRef = async (ref: string) => (await raw.repo('ChangeRequest').list({ where: { ref } }))[0];
  const supplierNamed = async (name: string) => (await raw.repo('Supplier').list()).find((s) => s.name === name)!;
  return { raw, as, byRef, supplierNamed };
}

const later = (h: number) => new Date(FIXED_NOW.getTime() + h * 3_600_000);

describe('AC1: separation of duties', () => {
  it('the requester cannot verify their own request; a different persona can', async () => {
    const { as, byRef, supplierNamed } = await setup();
    const req = await byRef('PCR-0114'); // Pinecrest, raised by Sam
    expect(req.requestedBy).toBe(PERSONA.sam);
    const phone = (await supplierNamed('Pinecrest Laboratory Supplies')).phoneOnFile;
    const call = { numberUsed: phone, contactName: 'Finance desk', outcome: 'confirmed' as const, note: '' };
    await expect(recordCallback(...as(PERSONA.sam), req.id, call, later(1))).rejects.toBeInstanceOf(PermissionError);
    const { request, result } = await recordCallback(...as(PERSONA.priya), req.id, call, later(1));
    expect(result.effect).toBe('verify');
    expect(request.status).toBe('verified');
    expect(request.verifiedBy).toBe(PERSONA.priya);
  });

  it('the requester and the verifier cannot approve; a third person with the second key can', async () => {
    const { as, byRef } = await setup();
    const req = await byRef('PCR-0112'); // Corvid: Sam requested, Priya verified, one flag, international (not frozen)
    await expect(approveRequest(...as(PERSONA.sam), req.id, '', FIXED_NOW)).rejects.toThrow(/You raised this request/);
    await expect(approveRequest(...as(PERSONA.priya), req.id, '', FIXED_NOW)).rejects.toThrow(/You made the call-back/);
    const approved = await approveRequest(...as(PERSONA.jordan), req.id, '', FIXED_NOW);
    expect(approved.status).toBe('approved');
    expect(approved.approvedBy).toBe(PERSONA.jordan);
  });

  it('the database itself refuses any update by the requester, even if the domain were bypassed', async () => {
    const { as, byRef } = await setup();
    const req = await byRef('PCR-0112');
    const [store] = as(PERSONA.sam);
    await expect(store.repo('ChangeRequest').update(req.id, { status: 'approved', approvedBy: PERSONA.sam })).rejects.toBeInstanceOf(PolicyViolation);
    // ...and a call-back stamped by the requester.
    await expect(
      store.repo('Callback').create({
        requestId: req.id,
        requesterSub: req.requestedBy,
        calledBy: PERSONA.sam,
        calledAt: FIXED_NOW.toISOString(),
        numberUsed: '+44 20 7946 0000',
        numberMatchesFile: true,
        contactName: 'Me',
        outcome: 'confirmed',
        note: null,
      }),
    ).rejects.toBeInstanceOf(PolicyViolation);
  });

  it('a clerk without the second key cannot approve, even with a self-granted role row', async () => {
    const { as, byRef, supplierNamed } = await setup();
    const req = await byRef('PCR-0111'); // Tidewater, raised by Alex
    const phone = (await supplierNamed('Tidewater Marine Services')).phoneOnFile;
    await recordCallback(...as(PERSONA.priya), req.id, { numberUsed: phone, contactName: 'Accounts', outcome: 'confirmed', note: '' }, later(1));
    const [samStore] = as(PERSONA.sam);
    await samStore.repo('StaffRole').create({ personSub: PERSONA.sam, personName: 'Sam Taylor', role: 'approver', grantedBy: PERSONA.sam, grantedAt: FIXED_NOW.toISOString() });
    await expect(approveRequest(...as(PERSONA.sam), req.id, '', later(2))).rejects.toThrow(/Only approvers/);
    const ok = await approveRequest(...as(PERSONA.jordan), req.id, '', later(2));
    expect(ok.status).toBe('approved');
  });
});

describe('AC2: a call-back on a number other than the one on file cannot verify', () => {
  it('logs the call with numberMatchesFile false and leaves the request at the gate', async () => {
    const { raw, as, byRef } = await setup();
    const req = await byRef('PCR-0108'); // Harbourline, raised by Sam
    const { result, request, callback } = await recordCallback(
      ...as(PERSONA.priya),
      req.id,
      { numberUsed: '+44 7700 900123', contactName: 'Number in the letter', outcome: 'confirmed', note: 'Called the number printed on the letter.' },
      later(1),
    );
    expect(result.effect).toBe('none');
    expect(callback.numberMatchesFile).toBe(false);
    expect(request.status).toBe('requested');
    expect((await raw.repo('ChangeRequest').get(req.id))!.status).toBe('requested');
  });

  it('a denied call-back rejects the request automatically', async () => {
    const { as, byRef, supplierNamed } = await setup();
    const req = await byRef('PCR-0108');
    const phone = (await supplierNamed('Harbourline Shipping')).phoneOnFile;
    const { request } = await recordCallback(...as(PERSONA.priya), req.id, { numberUsed: phone, contactName: 'Accounts', outcome: 'denied', note: '' }, later(1));
    expect(request.status).toBe('rejected');
    expect(request.closedBy).toBe(PERSONA.priya);
    expect(request.rejectReason).toMatch(/denied/);
  });
});

describe('AC3: the payment-run freeze', () => {
  it('blocks approving the seeded Kestrel change before tomorrow’s domestic run, with the exact end time', async () => {
    const { raw, as, byRef } = await setup();
    const req = await byRef('PCR-0110'); // Kestrel: domestic, verified
    const world = await loadWorld(raw);
    const tomorrowRun = world.runs.find((r) => r.payGroup === 'domestic' && r.runDate === new Date(Date.UTC(2026, 10, 21, 10)).toISOString());
    expect(tomorrowRun).toBeDefined();
    const err = await approveRequest(...as(PERSONA.jordan), req.id, '', FIXED_NOW).catch((e: Error) => e);
    expect(err).toBeInstanceOf(RuleError);
    expect((err as Error).message).toContain(`Frozen until ${formatExact('2026-11-21T10:00:00.000Z')}`);
    // After the run has gone, the same approval goes through.
    const ok = await approveRequest(...as(PERSONA.jordan), req.id, '', new Date('2026-11-21T10:00:00.000Z'));
    expect(ok.status).toBe('approved');
  });

  it('a new run added by an admin freezes approvals for its pay group', async () => {
    const { as, byRef } = await setup();
    const req = await byRef('PCR-0112'); // Corvid, international
    await addRun(...as(PERSONA.alex), { runDate: later(5).toISOString(), label: 'Urgent international run', payGroup: 'international' }, FIXED_NOW);
    await expect(approveRequest(...as(PERSONA.jordan), req.id, '', FIXED_NOW)).rejects.toThrow(/Frozen until/);
  });
});

describe('AC4: the four-flag request needs an override reason', () => {
  it('lists four flags and approves only with an override reason', async () => {
    const { raw, as, byRef } = await setup();
    const req = await byRef('PCR-0109'); // Lindqvist
    expect(req.flags.split(',').sort()).toEqual(['email', 'new_country', 'shared_account', 'urgency']);
    await expect(approveRequest(...as(PERSONA.jordan), req.id, '', FIXED_NOW)).rejects.toThrow(/4 flags are up/);
    await expect(approveRequest(...as(PERSONA.jordan), req.id, 'too short', FIXED_NOW)).rejects.toThrow(/override reason/);
    const ok = await approveRequest(...as(PERSONA.jordan), req.id, 'Supplier visited in person with photo ID and a bank letter.', FIXED_NOW);
    expect(ok.status).toBe('approved');
    expect((await raw.repo('ChangeRequest').get(req.id))!.overrideReason).toMatch(/visited in person/);
  });

  it('can be rejected instead, with a reason', async () => {
    const { as, byRef } = await setup();
    const req = await byRef('PCR-0109');
    const r = await rejectRequest(...as(PERSONA.jordan), req.id, 'Account belongs to another supplier. Likely impersonation.', FIXED_NOW);
    expect(r.status).toBe('rejected');
    expect(r.closedBy).toBe(PERSONA.jordan);
  });
});

describe('AC5: no full account number is ever stored', () => {
  const ACCOUNT = 'GB82 WEST 1234 5698 7654 32';
  const input = (supplierId: string): NewRequestInput => ({
    supplierId,
    account: ACCOUNT,
    newBankCountry: 'GB',
    channel: 'letter',
    sourceRef: 'Letter on letterhead, ref TEST-1',
    reason: 'Supplier moved banks after a merger.',
    urgencyClaimed: false,
  });

  it('the stored request holds only the masked form and the SHA-256 hash', async () => {
    const { raw, as, supplierNamed } = await setup();
    const s = await supplierNamed('Mossgrove Garden Care');
    const created = await createRequest(...as(PERSONA.sam), input(s.id), FIXED_NOW);
    const stored = (await raw.repo('ChangeRequest').get(created.id))!;
    expect(stored.newAccountMasked).toBe('•••• 5432');
    expect(stored.newAccountHash).toBe(hashAccount(ACCOUNT));
    // Nowhere in the whole store: not the number as typed, not normalised, not its first eight digits.
    const dump = JSON.stringify(raw.dump());
    expect(dump).not.toContain('GB82WEST12345698765432');
    expect(dump).not.toContain('GB82 WEST 1234 5698 7654 32');
    expect(dump).not.toContain('123456987654');
    for (const v of Object.values(stored)) expect(String(v)).not.toContain('WEST1234');
  });

  it('release copies masked + hash to the supplier, still without the number', async () => {
    const { raw, as, byRef, supplierNamed } = await setup();
    const req = await byRef('PCR-0107'); // Bluefin, approved, international
    const before = await supplierNamed('Bluefin Logistics BV');
    await releaseRequest(...as(PERSONA.alex), req.id, FIXED_NOW);
    const after = (await raw.repo('Supplier').get(before.id))!;
    expect(after.currentAccountMasked).toBe(req.newAccountMasked);
    expect(after.currentAccountHash).toBe(req.newAccountHash);
    expect(after.currentBankCountry).toBe(req.newBankCountry);
    // Release writes nothing else on the supplier.
    expect({ ...after, currentAccountMasked: '', currentAccountHash: '', currentBankCountry: '' }).toEqual({
      ...before,
      currentAccountMasked: '',
      currentAccountHash: '',
      currentBankCountry: '',
    });
    expect((await raw.repo('ChangeRequest').get(req.id))!.status).toBe('released');
  });

  it('an admin adding a supplier stores masked + hash only', async () => {
    const { raw, as } = await setup();
    await createSupplier(...as(PERSONA.alex), {
      name: 'Test Supplier Ltd',
      supplierNo: 'S-9999',
      phoneOnFile: '+44 20 7946 0999',
      country: 'GB',
      annualSpend: 1000,
      payGroup: 'domestic',
      account: '99-88-77 12345678',
      bankCountry: 'GB',
    });
    expect(JSON.stringify(raw.dump())).not.toContain('12345678');
  });
});

describe('Lock keeper rules', () => {
  it('blocks a second open request for the same supplier, the same account, and blocked suppliers', async () => {
    const { as, supplierNamed } = await setup();
    const base = { account: '11-22-33 44556677', newBankCountry: 'GB', channel: 'letter' as const, sourceRef: 'Letter ref 1', reason: 'Bank changed after merger.', urgencyClaimed: false };
    const harbour = await supplierNamed('Harbourline Shipping');
    await expect(createRequest(...as(PERSONA.priya), { ...base, supplierId: harbour.id }, FIXED_NOW)).rejects.toThrow(/PCR-0108 is already in the locks/);
    const moss = await supplierNamed('Mossgrove Garden Care');
    await expect(createRequest(...as(PERSONA.priya), { ...base, supplierId: moss.id, account: '20-19-77 32008841' }, FIXED_NOW)).rejects.toThrow(/already on file/);
    const juniper = await supplierNamed('Juniper Travel Management');
    await expect(createRequest(...as(PERSONA.priya), { ...base, supplierId: juniper.id }, FIXED_NOW)).rejects.toThrow(/blocked/);
  });

  it('stores the flags raised at the time and numbers refs in order', async () => {
    const { as, supplierNamed } = await setup();
    const moss = await supplierNamed('Mossgrove Garden Care');
    const r = await createRequest(
      ...as(PERSONA.priya),
      { supplierId: moss.id, account: 'LT12DEMO10000188234401', newBankCountry: 'LT', channel: 'email', sourceRef: 'Email', reason: 'Urgent: pay the new account today.', urgencyClaimed: true },
      FIXED_NOW,
    );
    expect(r.ref).toBe('PCR-0115');
    expect(r.flags.split(',')).toEqual(['urgency', 'email', 'new_country', 'country_mismatch']);
  });
});

describe('cancel, release and admin', () => {
  it('only a non-requester approver or admin cancels', async () => {
    const { as, byRef } = await setup();
    const req = await byRef('PCR-0111'); // Tidewater, raised by Alex
    await expect(cancelRequest(...as(PERSONA.alex), req.id, 'Raised against the wrong record', FIXED_NOW)).rejects.toThrow(/person who raised it/);
    await expect(cancelRequest(...as(PERSONA.priya), req.id, 'Raised against the wrong record', FIXED_NOW)).rejects.toBeInstanceOf(PermissionError);
    const c = await cancelRequest(...as(PERSONA.jordan), req.id, 'Raised against the wrong record', FIXED_NOW);
    expect(c.status).toBe('cancelled');
  });

  it('release is frozen for domestic suppliers before the run and needs the custodian', async () => {
    const { as, byRef } = await setup();
    const req = await byRef('PCR-0107');
    await expect(releaseRequest(...as(PERSONA.jordan), req.id, FIXED_NOW)).rejects.toThrow(/Only an admin/);
  });

  it('changing the phone on file restarts its clock', async () => {
    const { raw, as, supplierNamed } = await setup();
    const s = await supplierNamed('Eastgate Couriers');
    await updateSupplier(...as(PERSONA.alex), s.id, { phoneOnFile: '+44 161 496 0999' }, FIXED_NOW);
    expect((await raw.repo('Supplier').get(s.id))!.phoneOnFileSince).toBe(FIXED_NOW.toISOString());
    await updateSupplier(...as(PERSONA.alex), s.id, { annualSpend: 40_000 }, later(1));
    expect((await raw.repo('Supplier').get(s.id))!.phoneOnFileSince).toBe(FIXED_NOW.toISOString());
  });

  it('admin-only actions refuse non-admins; self-granted roles are ignored', async () => {
    const { raw, as, byRef } = await setup();
    await expect(addRun(...as(PERSONA.sam), { runDate: later(5).toISOString(), label: 'Rogue run', payGroup: 'all' }, FIXED_NOW)).rejects.toBeInstanceOf(PermissionError);
    const [samStore, sam] = as(PERSONA.sam);
    await expect(grantRole(samStore, sam, sam, 'approver')).rejects.toBeInstanceOf(PermissionError);
    // Sam writes an approver row for himself straight through the API (the policy allows grantedBy = self)...
    await samStore.repo('StaffRole').create({ personSub: PERSONA.sam, personName: 'Sam Taylor', role: 'approver', grantedBy: PERSONA.sam, grantedAt: FIXED_NOW.toISOString() });
    // ...but the domain only trusts roles granted by an admin, so he still cannot approve someone else's change.
    const req = await byRef('PCR-0109');
    expect(req.requestedBy).toBe(PERSONA.sam);
    const tide = await byRef('PCR-0111');
    expect(tide.requestedBy).toBe(PERSONA.alex);
    expect((await raw.repo('StaffRole').list({ where: { personSub: PERSONA.sam } })).length).toBe(2);
  });
});
