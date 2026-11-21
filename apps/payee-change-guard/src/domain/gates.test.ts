import type { ChangeRequest, Supplier } from '../model';
import type { Flag } from './flags';
import type { FreezeState } from './freeze';
import {
  callbackResult,
  chamberOf,
  checkApprove,
  checkCallback,
  checkCancel,
  checkReject,
  checkRelease,
  formatExact,
  isApprover,
  nextStep,
  type Actor,
} from './gates';
import { normalisePhone, samePhone } from './phone';

const clerk = (sub: string): Actor => ({ sub, isAdmin: false, roles: ['clerk'] });
const approver = (sub: string): Actor => ({ sub, isAdmin: false, roles: ['approver'] });
const admin = (sub: string): Actor => ({ sub, isAdmin: true, roles: [] });

const open: FreezeState = { frozen: false, until: null, run: null, next: null };
const frozen: FreezeState = {
  frozen: true,
  until: '2026-11-21T10:00:00.000Z',
  run: { id: 'r', runDate: '2026-11-21T10:00:00.000Z', freezeHours: 48, label: 'Off-cycle domestic run', payGroup: 'domestic', createdBy: 'a' },
  next: null,
};
const flag = (code: Flag['code']): Flag => ({ code, label: code, reason: code });

const req = (over: Partial<Pick<ChangeRequest, 'status' | 'requestedBy' | 'verifiedBy'>> = {}) => ({
  status: 'verified' as ChangeRequest['status'],
  requestedBy: 'sam',
  verifiedBy: 'priya' as string | null,
  ...over,
});
const supplier: Pick<Supplier, 'phoneOnFile' | 'custodianSub' | 'status'> = { phoneOnFile: '+44 20 7946 0101', custodianSub: 'alex', status: 'active' };

describe('chambers', () => {
  it('maps each status to its chamber', () => {
    expect(chamberOf('requested')).toBe('request');
    expect(chamberOf('verified')).toBe('callback');
    expect(chamberOf('approved')).toBe('approval');
    expect(chamberOf('released')).toBe('basin');
    expect(chamberOf('rejected')).toBe('drydock');
    expect(chamberOf('cancelled')).toBe('drydock');
    expect(nextStep('verified')).toMatch(/second key/);
  });
});

describe('phone numbers', () => {
  it('compares by digits', () => {
    expect(normalisePhone('+44 (20) 7946-0101')).toBe('+442079460101');
    expect(samePhone('+44 20 7946 0101', '+44 (20) 79460101')).toBe(true);
    expect(samePhone('+44 20 7946 0101', '+44 20 7946 0102')).toBe(false);
    expect(samePhone('020 7946 0101', '+44 20 7946 0101')).toBe(false);
    expect(samePhone('', '')).toBe(false);
  });
});

describe('gate 1: call-back', () => {
  it('the requester cannot call back their own request', () => {
    const c = checkCallback(req({ status: 'requested' }), clerk('sam'));
    expect(c).toMatchObject({ ok: false, code: 'sod_requester' });
    expect(checkCallback(req({ status: 'requested' }), clerk('priya')).ok).toBe(true);
    expect(checkCallback(req({ status: 'verified' }), clerk('priya'))).toMatchObject({ ok: false, code: 'status' });
  });

  it('only a confirmed call on the number on file verifies', () => {
    expect(callbackResult({ outcome: 'confirmed', numberUsed: '+44 20 7946 0101' }, supplier)).toMatchObject({ effect: 'verify', numberMatchesFile: true });
    const wrong = callbackResult({ outcome: 'confirmed', numberUsed: '+44 20 7946 9999' }, supplier);
    expect(wrong).toMatchObject({ effect: 'none', numberMatchesFile: false });
    expect(wrong.message).toMatch(/cannot verify/);
  });

  it('a denied call-back rejects, whatever number; no answer changes nothing', () => {
    expect(callbackResult({ outcome: 'denied', numberUsed: '+44 20 7946 0101' }, supplier).effect).toBe('reject');
    expect(callbackResult({ outcome: 'denied', numberUsed: '+44 20 0000 0000' }, supplier).effect).toBe('reject');
    expect(callbackResult({ outcome: 'no_answer', numberUsed: '+44 20 7946 0101' }, supplier).effect).toBe('none');
  });
});

describe('gate 2: second approval', () => {
  it('needs the call-back gate first', () => {
    expect(checkApprove(req({ status: 'requested', verifiedBy: null }), approver('jordan'), { freeze: open, flags: [] })).toMatchObject({ code: 'status' });
  });

  it('approver ≠ requester and ≠ verifier', () => {
    expect(checkApprove(req(), approver('sam'), { freeze: open, flags: [] })).toMatchObject({ ok: false, code: 'sod_requester' });
    expect(checkApprove(req(), approver('priya'), { freeze: open, flags: [] })).toMatchObject({ ok: false, code: 'sod_verifier' });
    expect(checkApprove(req(), approver('jordan'), { freeze: open, flags: [] }).ok).toBe(true);
  });

  it('needs the approver role (or admin)', () => {
    expect(checkApprove(req(), clerk('ken'), { freeze: open, flags: [] })).toMatchObject({ code: 'role' });
    expect(checkApprove(req(), admin('alex'), { freeze: open, flags: [] }).ok).toBe(true);
    expect(isApprover(admin('alex'))).toBe(true);
  });

  it('is blocked inside the freeze, with the exact end time', () => {
    const c = checkApprove(req(), approver('jordan'), { freeze: frozen, flags: [] });
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.code).toBe('frozen');
      expect(c.reason).toContain(`Frozen until ${formatExact('2026-11-21T10:00:00.000Z')}`);
      expect(c.reason).toContain('Off-cycle domestic run');
      expect(c.reason).toContain('48 hours');
    }
  });

  it('two or more flags need an override reason of at least 20 characters', () => {
    const flags = [flag('email'), flag('urgency')];
    expect(checkApprove(req(), approver('jordan'), { freeze: open, flags })).toMatchObject({ code: 'override' });
    expect(checkApprove(req(), approver('jordan'), { freeze: open, flags, overrideReason: 'ok fine' })).toMatchObject({ code: 'override' });
    expect(checkApprove(req(), approver('jordan'), { freeze: open, flags, overrideReason: 'Supplier visited in person with ID.' }).ok).toBe(true);
    expect(checkApprove(req(), approver('jordan'), { freeze: open, flags: [flag('email')] }).ok).toBe(true);
  });

  it('separation of duties is checked before the freeze (the requester always sees the SoD reason)', () => {
    expect(checkApprove(req(), approver('sam'), { freeze: frozen, flags: [] })).toMatchObject({ code: 'sod_requester' });
  });
});

describe('reject, cancel, release', () => {
  it('reject needs an approver who is not the requester, and a reason', () => {
    expect(checkReject(req(), approver('sam'), 'Not our supplier at all')).toMatchObject({ code: 'sod_requester' });
    expect(checkReject(req(), clerk('priya'), 'Not our supplier at all')).toMatchObject({ code: 'role' });
    expect(checkReject(req(), approver('jordan'), 'no')).toMatchObject({ code: 'reason' });
    expect(checkReject(req(), approver('jordan'), 'Unsigned letter, cannot verify.').ok).toBe(true);
    expect(checkReject(req({ status: 'approved' }), approver('jordan'), 'Unsigned letter, cannot verify.')).toMatchObject({ code: 'status' });
  });

  it('the requester cannot cancel their own request (the database would refuse the update)', () => {
    expect(checkCancel(req({ status: 'requested' }), admin('sam'), 'Raised in error, wrong record')).toMatchObject({ code: 'sod_requester' });
    expect(checkCancel(req({ status: 'requested' }), admin('alex'), 'Raised in error, wrong record').ok).toBe(true);
    expect(checkCancel(req({ status: 'released' }), admin('alex'), 'Raised in error, wrong record')).toMatchObject({ code: 'status' });
  });

  it('release: approved, by the custodian admin, not the requester, outside the freeze', () => {
    const approved = req({ status: 'approved' });
    expect(checkRelease(approved, admin('alex'), supplier, open).ok).toBe(true);
    expect(checkRelease(approved, admin('alex'), supplier, frozen)).toMatchObject({ code: 'frozen' });
    expect(checkRelease(approved, approver('jordan'), supplier, open)).toMatchObject({ code: 'role' });
    expect(checkRelease(approved, admin('other'), supplier, open)).toMatchObject({ code: 'custodian' });
    expect(checkRelease({ ...approved, requestedBy: 'alex' }, admin('alex'), supplier, open)).toMatchObject({ code: 'sod_requester' });
    expect(checkRelease(req(), admin('alex'), supplier, open)).toMatchObject({ code: 'status' });
  });
});
