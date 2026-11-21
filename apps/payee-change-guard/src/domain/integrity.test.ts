import type { Callback, ChangeRequest, Supplier } from '../model';
import { trailIssues } from './integrity';

const base: ChangeRequest = {
  id: 'r',
  ref: 'PCR-0001',
  supplierId: 's',
  requestedBy: 'sam',
  requestedAt: '2026-11-18T09:00:00.000Z',
  channel: 'letter',
  sourceRef: 'Letter',
  newAccountMasked: '•••• 1234',
  newAccountHash: 'a'.repeat(64),
  newBankCountry: 'GB',
  reason: 'New account at the same bank',
  urgencyClaimed: false,
  status: 'approved',
  flags: '',
  verifiedBy: 'priya',
  verifiedAt: '2026-11-18T12:00:00.000Z',
  approvedBy: 'jordan',
  approvedAt: '2026-11-19T09:00:00.000Z',
  releasedAt: null,
  rejectReason: null,
  overrideReason: null,
  closedBy: null,
  closedAt: null,
};
const supplier = { id: 's', phoneOnFile: '+44 20 7946 0101', phoneOnFileSince: '2024-01-01T00:00:00.000Z' } as Supplier;
const call = (over: Partial<Callback> = {}): Callback => ({
  id: 'c',
  requestId: 'r',
  requesterSub: 'sam',
  calledBy: 'priya',
  calledAt: '2026-11-18T12:00:00.000Z',
  numberUsed: '+44 20 7946 0101',
  numberMatchesFile: true,
  contactName: 'Finance',
  outcome: 'confirmed',
  note: null,
  ...over,
});

describe('trail check', () => {
  it('a clean trail has no issues', () => {
    expect(trailIssues(base, [call()], supplier)).toEqual([]);
    expect(trailIssues({ ...base, status: 'requested', verifiedBy: null, approvedBy: null }, [], supplier)).toEqual([]);
  });

  it('flags a verification without a confirmed call on the number on file', () => {
    expect(trailIssues(base, [], supplier)).toContain('No confirmed call-back on the number on file backs the verification.');
    expect(trailIssues(base, [call({ numberMatchesFile: false })], supplier)).toHaveLength(1);
    expect(trailIssues(base, [call({ outcome: 'no_answer' })], supplier)).toHaveLength(1);
    expect(trailIssues(base, [call({ calledBy: 'someone-else' })], supplier)).toHaveLength(1);
  });

  it('catches a numberMatchesFile flag that lies about the number', () => {
    expect(trailIssues(base, [call({ numberUsed: '+44 20 0000 0000' })], supplier)).toEqual(['The call-back number is not the number on file.']);
  });

  it('flags self-verification and self-approval', () => {
    expect(trailIssues({ ...base, verifiedBy: 'sam' }, [call({ calledBy: 'sam' })], supplier)).toEqual(expect.arrayContaining(['The requester verified their own request.']));
    expect(trailIssues({ ...base, approvedBy: 'priya' }, [call()], supplier)).toEqual(['The verifier also approved.']);
    expect(trailIssues({ ...base, approvedBy: 'sam' }, [call()], supplier)).toEqual(['The requester approved their own request.']);
  });

  it('flags a multi-flag approval without an override reason', () => {
    expect(trailIssues({ ...base, flags: 'email,urgency' }, [call()], supplier)).toEqual(['Approved with two or more flags but no override reason.']);
    expect(trailIssues({ ...base, flags: 'email,urgency', overrideReason: 'Met the supplier in person.' }, [call()], supplier)).toEqual([]);
  });
});
