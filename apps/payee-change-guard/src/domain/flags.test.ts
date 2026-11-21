import { rules } from '../config';
import type { ChangeRequest, Supplier } from '../model';
import { hashAccount } from './account';
import { computeFlags, decodeFlags, encodeFlags, flagsForRequest, needsOverride, seenCountries, type FlagInput } from './flags';

const NOW = '2026-11-20T09:00:00.000Z';
const daysAgo = (d: number) => new Date(Date.parse(NOW) - d * 86_400_000).toISOString();

const supplier = (over: Partial<Supplier> = {}): Supplier => ({
  id: 's1',
  name: 'Lindqvist Industrial Parts GmbH',
  supplierNo: 'S-1006',
  phoneOnFile: '+49 30 5550 0606',
  phoneOnFileSince: daysAgo(800),
  country: 'NL',
  currentAccountMasked: '•••• 0873',
  currentAccountHash: hashAccount('NL61DEMO0552190873'),
  currentBankCountry: 'NL',
  annualSpend: 182_000,
  status: 'active',
  payGroup: 'international',
  custodianSub: 'admin',
  ...over,
});

const other = supplier({ id: 's2', name: 'Hartley Fixings Ltd', supplierNo: 'S-1002', country: 'GB', currentBankCountry: 'GB', currentAccountHash: hashAccount('40215583991706') });

const input = (over: Partial<FlagInput> = {}): FlagInput => ({
  supplier: supplier(),
  channel: 'portal',
  urgencyClaimed: false,
  newBankCountry: 'NL',
  newAccountHash: hashAccount('NL99DEMO0000000001'),
  requestedAt: NOW,
  ...over,
});

const req = (over: Partial<ChangeRequest> = {}): ChangeRequest => ({
  id: 'r0',
  ref: 'PCR-0001',
  supplierId: 's1',
  requestedBy: 'clerk',
  requestedAt: daysAgo(20),
  channel: 'portal',
  sourceRef: 'Portal form',
  newAccountMasked: '•••• 0873',
  newAccountHash: hashAccount('NL61DEMO0552190873'),
  newBankCountry: 'NL',
  reason: 'Earlier change',
  urgencyClaimed: false,
  status: 'released',
  flags: '',
  verifiedBy: 'b',
  verifiedAt: daysAgo(19),
  approvedBy: 'c',
  approvedAt: daysAgo(19),
  releasedAt: daysAgo(18),
  rejectReason: null,
  overrideReason: null,
  closedBy: null,
  closedAt: null,
  ...over,
});

const codes = (i: FlagInput, requests: ChangeRequest[] = [], suppliers: Supplier[] = [i.supplier, other]) =>
  computeFlags(i, { suppliers, requests }).map((f) => f.code);

describe('red flags', () => {
  it('a clean portal change to a known bank country raises nothing', () => {
    expect(codes(input())).toEqual([]);
  });

  it('urgency claimed', () => {
    expect(codes(input({ urgencyClaimed: true }))).toEqual(['urgency']);
  });

  it('email channel', () => {
    expect(codes(input({ channel: 'email' }))).toEqual(['email']);
    expect(codes(input({ channel: 'letter' }))).toEqual([]);
  });

  it('bank country differs from the supplier country, and a never-seen country, are separate flags', () => {
    // A German supplier that banks in NL: moving to DE is new for this supplier but not abroad.
    const german = supplier({ country: 'DE' });
    expect(codes(input({ supplier: german, newBankCountry: 'DE' }))).toEqual(['new_country']);
    // Moving to LT is both.
    expect(codes(input({ supplier: german, newBankCountry: 'LT' }))).toEqual(['new_country', 'country_mismatch']);
    // NL is already seen (current bank), but still abroad for a German supplier.
    expect(codes(input({ supplier: german, newBankCountry: 'NL' }))).toEqual(['country_mismatch']);
  });

  it('countries of earlier released changes count as seen', () => {
    const s = supplier({ currentBankCountry: 'DE' });
    const history = [req({ newBankCountry: 'NL', status: 'released' })];
    expect([...seenCountries(s, history)].sort()).toEqual(['DE', 'NL']);
    expect(codes(input({ supplier: s, newBankCountry: 'NL' }), history)).toEqual([]);
    // A rejected change does not make a country "seen".
    expect(codes(input({ supplier: s, newBankCountry: 'NL' }), [req({ status: 'rejected', releasedAt: null, requestedAt: daysAgo(40) })])).toEqual(['new_country']);
  });

  it(`phone on file changed in the last ${rules.PHONE_CHANGE_DAYS} days`, () => {
    expect(codes(input({ supplier: supplier({ phoneOnFileSince: daysAgo(12) }) }))).toEqual(['phone_changed']);
    expect(codes(input({ supplier: supplier({ phoneOnFileSince: daysAgo(29.9) }) }))).toEqual(['phone_changed']);
    expect(codes(input({ supplier: supplier({ phoneOnFileSince: daysAgo(30) }) }))).toEqual([]);
  });

  it('the new account is already on file for a different supplier (or pending for one)', () => {
    const shared = hashAccount('40215583991706');
    const f = computeFlags(input({ newAccountHash: shared }), { suppliers: [supplier(), other], requests: [] });
    expect(f.map((x) => x.code)).toEqual(['shared_account']);
    expect(f[0].reason).toContain('Hartley Fixings Ltd (S-1002)');
    const pendingHash = hashAccount('99887766554433');
    const pending = req({ id: 'p', supplierId: 's2', newAccountHash: pendingHash, status: 'verified', requestedAt: daysAgo(1), releasedAt: null });
    expect(codes(input({ newAccountHash: pendingHash }), [pending])).toEqual(['shared_account']);
    // Its own current account is not "another supplier".
    expect(codes(input({ newAccountHash: supplier().currentAccountHash }))).toEqual([]);
  });

  it(`annual spend above ${rules.HIGH_SPEND}`, () => {
    expect(codes(input({ supplier: supplier({ annualSpend: 250_001 }) }))).toEqual(['high_spend']);
    expect(codes(input({ supplier: supplier({ annualSpend: 250_000 }) }))).toEqual([]);
    expect(codes(input({ supplier: supplier({ annualSpend: null }) }))).toEqual([]);
  });

  it(`a change within ${rules.RECENT_CHANGE_DAYS} days of a previous change`, () => {
    const recent = req({ requestedAt: daysAgo(16), releasedAt: daysAgo(9) });
    const f = computeFlags(input(), { suppliers: [supplier(), other], requests: [recent] });
    expect(f.map((x) => x.code)).toEqual(['recent_change']);
    expect(f[0].reason).toContain('9 days earlier');
    expect(codes(input(), [req({ requestedAt: daysAgo(30), releasedAt: daysAgo(15) })])).toEqual([]);
    // A cancelled request is not a change.
    expect(codes(input(), [req({ status: 'cancelled', requestedAt: daysAgo(2), releasedAt: null })])).toEqual([]);
    // A rejected attempt days ago still counts: a second attempt is suspicious.
    expect(codes(input(), [req({ status: 'rejected', requestedAt: daysAgo(3), releasedAt: null })])).toEqual(['recent_change']);
  });

  it('the seeded four-flag case: email, urgency, new country, shared account', () => {
    const f = computeFlags(input({ supplier: supplier({ country: 'DE' }), channel: 'email', urgencyClaimed: true, newBankCountry: 'DE', newAccountHash: hashAccount('40215583991706') }), {
      suppliers: [supplier({ country: 'DE' }), other],
      requests: [],
    });
    expect(f.map((x) => x.code).sort()).toEqual(['email', 'new_country', 'shared_account', 'urgency']);
    expect(f.every((x) => x.reason.length > 10)).toBe(true);
    expect(needsOverride(f)).toBe(true);
  });

  it(`${rules.OVERRIDE_FLAGS} or more flags need an override`, () => {
    expect(needsOverride([])).toBe(false);
    expect(needsOverride(['email'])).toBe(false);
    expect(needsOverride(['email', 'urgency'])).toBe(true);
  });

  it('encodes and decodes flag codes, ignoring unknown ones', () => {
    const f = computeFlags(input({ channel: 'email', urgencyClaimed: true }), { suppliers: [supplier()], requests: [] });
    expect(encodeFlags(f)).toBe('urgency,email');
    expect(decodeFlags('urgency, email,bogus,')).toEqual(['urgency', 'email']);
    expect(decodeFlags(null)).toEqual([]);
  });

  it('flagsForRequest keeps stored flags and adds live ones (a shared account that appeared later)', () => {
    const later = hashAccount('11112222333344');
    const r = req({ id: 'open', status: 'verified', requestedAt: daysAgo(1), releasedAt: null, newAccountHash: later, flags: 'email' , channel: 'email' });
    const hartleyNow = { ...other, currentAccountHash: later };
    const f = flagsForRequest(r, { suppliers: [supplier(), hartleyNow], requests: [r] });
    expect(f.map((x) => x.code)).toEqual(['shared_account', 'email']);
  });

  it('flagsForRequest on a released request keeps what was raised, not what release changed', () => {
    const r = req({ id: 'rel', newBankCountry: 'NL', flags: 'new_country' });
    const s = supplier({ currentBankCountry: 'NL', currentAccountHash: r.newAccountHash });
    expect(flagsForRequest(r, { suppliers: [s, other], requests: [r] }).map((x) => x.code)).toEqual(['new_country']);
  });
});
