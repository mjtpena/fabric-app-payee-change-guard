import type { DataStore } from '@x10/shared/data';
import { DAY, HOUR } from '@x10/shared/lib';
import type { SeedContext } from '@x10/shared/runtime';

import { protectAccount } from './domain/account';
import { computeFlags, encodeFlags } from './domain/flags';
import type { Callback, ChangeRequest, PayGroup, PaymentRun, Schema, Supplier } from './model';

/**
 * Fictional, generic seed data. Dates are computed from ctx.now. Runs once (runSeed checks a marker row).
 *
 * 24 suppliers and 14 change requests in every state: one with four flags (email, urgency, new bank country, an
 * account already on file for another supplier), one rejected by a denied call-back, one frozen before tomorrow's
 * domestic payment run, one released last week. Domestic runs are on Tuesdays and Fridays (plus an off-cycle run
 * tomorrow when tomorrow is neither, so the freeze is always on show); the weekly international run is four days
 * out, so international approvals stay open in the demo. Account numbers are invented and only their masked form
 * and SHA-256 hash are stored.
 */

type SupplierSeed = {
  key: string;
  name: string;
  no: string;
  country: string;
  bank: string;
  group: PayGroup;
  spend: number | null;
  phone: string;
  /** Days since the phone on file was set. */
  phoneDays: number;
  account: string;
  blocked?: boolean;
};

const SUPPLIERS: SupplierSeed[] = [
  { key: 'northwind', name: 'Northwind Office Supplies', no: 'S-1001', country: 'GB', bank: 'GB', group: 'domestic', spend: 84_000, phone: '+44 20 7946 0101', phoneDays: 900, account: '20-71-44 61552018' },
  { key: 'hartley', name: 'Hartley Fixings Ltd', no: 'S-1002', country: 'GB', bank: 'GB', group: 'domestic', spend: 46_500, phone: '+44 113 496 0202', phoneDays: 1400, account: '40215583991706' },
  { key: 'bluefin', name: 'Bluefin Logistics BV', no: 'S-1003', country: 'NL', bank: 'NL', group: 'international', spend: 312_000, phone: '+31 20 555 0303', phoneDays: 700, account: 'NL20DEMO0417736512' },
  { key: 'kestrel', name: 'Kestrel Print & Packaging', no: 'S-1004', country: 'GB', bank: 'GB', group: 'domestic', spend: 128_000, phone: '+44 161 496 0404', phoneDays: 1100, account: '30-90-12 77410263' },
  { key: 'alder', name: 'Alder Facilities Services', no: 'S-1005', country: 'GB', bank: 'GB', group: 'domestic', spend: 205_000, phone: '+44 20 7946 0505', phoneDays: 640, account: '11-04-58 20963311' },
  { key: 'lindqvist', name: 'Lindqvist Industrial Parts GmbH', no: 'S-1006', country: 'DE', bank: 'NL', group: 'international', spend: 182_000, phone: '+49 30 5550 0606', phoneDays: 820, account: 'NL61DEMO0552190873' },
  { key: 'copperleaf', name: 'Copperleaf Catering', no: 'S-1007', country: 'GB', bank: 'GB', group: 'domestic', spend: 38_200, phone: '+44 113 496 0707', phoneDays: 12, account: '60-83-71 40027719' },
  { key: 'ravensworth', name: 'Ravensworth Timber', no: 'S-1008', country: 'GB', bank: 'GB', group: 'domestic', spend: 61_000, phone: '+44 161 496 0808', phoneDays: 1300, account: '09-01-28 88130452' },
  { key: 'saltmarsh', name: 'Saltmarsh Cleaning Co', no: 'S-1009', country: 'GB', bank: 'GB', group: 'domestic', spend: 22_800, phone: '+44 20 7946 0909', phoneDays: 500, account: '23-14-70 51288936' },
  { key: 'fenwick', name: 'Fenwick Electrical', no: 'S-1010', country: 'GB', bank: 'GB', group: 'domestic', spend: 97_400, phone: '+44 113 496 0110', phoneDays: 760, account: '40-47-84 63320197' },
  { key: 'harbourline', name: 'Harbourline Shipping', no: 'S-1011', country: 'GB', bank: 'GB', group: 'domestic', spend: 143_000, phone: '+44 161 496 0111', phoneDays: 980, account: '77-31-05 19470625' },
  { key: 'pinecrest', name: 'Pinecrest Laboratory Supplies', no: 'S-1012', country: 'GB', bank: 'GB', group: 'domestic', spend: 56_000, phone: '+44 20 7946 0112', phoneDays: 410, account: '16-52-21 70814466' },
  { key: 'tidewater', name: 'Tidewater Marine Services', no: 'S-1013', country: 'IE', bank: 'IE', group: 'international', spend: 74_000, phone: '+353 1 555 0113', phoneDays: 600, account: 'IE12DEMO93115204478812' },
  { key: 'corvid', name: 'Corvid Analytics BV', no: 'S-1014', country: 'NL', bank: 'NL', group: 'international', spend: 118_000, phone: '+31 10 555 0114', phoneDays: 380, account: 'NL44DEMO0730016294' },
  { key: 'granite', name: 'Granite Peak Software Inc', no: 'S-1015', country: 'US', bank: 'US', group: 'international', spend: 265_000, phone: '+1 555 0115', phoneDays: 1500, account: '026009593 4471108825' },
  { key: 'mossgrove', name: 'Mossgrove Garden Care', no: 'S-1016', country: 'GB', bank: 'GB', group: 'domestic', spend: 12_400, phone: '+44 113 496 0116', phoneDays: 300, account: '20-19-77 32008841' },
  { key: 'quarry', name: 'Quarry Lane Builders Merchants', no: 'S-1017', country: 'GB', bank: 'GB', group: 'domestic', spend: 231_000, phone: '+44 161 496 0117', phoneDays: 2000, account: '83-06-08 11904577' },
  { key: 'silverbirch', name: 'Silverbirch Recruitment', no: 'S-1018', country: 'GB', bank: 'GB', group: 'domestic', spend: 176_000, phone: '+44 20 7946 0118', phoneDays: 450, account: '30-65-41 92250618' },
  { key: 'larkspur', name: 'Larkspur Translation Services', no: 'S-1019', country: 'FR', bank: 'FR', group: 'international', spend: 18_900, phone: '+33 1 5550 0119', phoneDays: 700, account: 'FR76DEMO30004000031234567890' },
  { key: 'ironbridge', name: 'Ironbridge Steel Stockholders', no: 'S-1020', country: 'GB', bank: 'GB', group: 'domestic', spend: 289_000, phone: '+44 113 496 0120', phoneDays: 1800, account: '56-00-29 46113920' },
  { key: 'wren', name: 'Wren & Partners Legal', no: 'S-1021', country: 'GB', bank: 'GB', group: 'domestic', spend: 64_000, phone: '+44 20 7946 0121', phoneDays: 950, account: '18-00-02 27716643' },
  { key: 'eastgate', name: 'Eastgate Couriers', no: 'S-1022', country: 'GB', bank: 'GB', group: 'domestic', spend: 31_700, phone: '+44 161 496 0122', phoneDays: 260, account: '60-02-46 58831275' },
  { key: 'cobalt', name: 'Cobalt Data Centres', no: 'S-1023', country: 'IE', bank: 'IE', group: 'international', spend: 198_000, phone: '+353 1 555 0123', phoneDays: 520, account: 'IE64DEMO90014422370051' },
  { key: 'juniper', name: 'Juniper Travel Management', no: 'S-1024', country: 'ES', bank: 'ES', group: 'international', spend: 44_000, phone: '+34 91 555 0124', phoneDays: 670, account: 'ES91DEMO00490075432099', blocked: true },
];

/** Accounts the released requests replaced (the supplier now holds the SUPPLIERS account above). */
const OLD_ACCOUNTS: Record<string, string> = { northwind: '20-71-44 30018422', alder: '11-04-58 70219945', copperleaf: '60-83-71 22917730' };

export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const [alex, sam, priya, jordan] = ctx.people;
  const now = ctx.now.getTime();
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();

  // Keys: Alex (admin) grants the clerk and approver roles.
  const roles = store.repo('StaffRole');
  for (const [p, role] of [
    [sam, 'clerk'],
    [priya, 'clerk'],
    [jordan, 'approver'],
    [alex, 'approver'],
  ] as const) {
    await roles.create({ personSub: p.sub, personName: p.displayName, role, grantedBy: alex.sub, grantedAt: at(24 * 90) });
  }

  // Supplier master.
  const suppliers: Record<string, Supplier> = {};
  for (const s of SUPPLIERS) {
    const { masked, hash } = protectAccount(s.account);
    suppliers[s.key] = await store.repo('Supplier').create({
      name: s.name,
      supplierNo: s.no,
      phoneOnFile: s.phone,
      phoneOnFileSince: at(s.phoneDays * 24),
      country: s.country,
      currentAccountMasked: masked,
      currentAccountHash: hash,
      currentBankCountry: s.bank,
      annualSpend: s.spend,
      status: s.blocked ? 'blocked' : 'active',
      payGroup: s.group,
      custodianSub: alex.sub,
    });
  }

  // Payment runs: domestic Tuesdays and Fridays 10:00 UTC, an off-cycle run tomorrow when needed, and the weekly
  // international run at 14:00 UTC.
  const runs: Omit<PaymentRun, 'id'>[] = [];
  const day0 = Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate());
  const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let d = -14; d <= 28; d++) {
    const day = new Date(day0 + d * DAY);
    const wd = day.getUTCDay();
    if (wd === 2 || wd === 5) runs.push({ runDate: new Date(day0 + d * DAY + 10 * HOUR).toISOString(), freezeHours: 48, label: `Domestic run (${WEEKDAY[wd]})`, payGroup: 'domestic', createdBy: alex.sub });
  }
  const tomorrow = new Date(day0 + DAY);
  if (tomorrow.getUTCDay() !== 2 && tomorrow.getUTCDay() !== 5) {
    runs.push({ runDate: new Date(day0 + DAY + 10 * HOUR).toISOString(), freezeHours: 48, label: 'Off-cycle domestic run', payGroup: 'domestic', createdBy: alex.sub });
  }
  for (const w of [-10, -3, 4, 11, 18, 25]) {
    runs.push({ runDate: new Date(day0 + w * DAY + 14 * HOUR).toISOString(), freezeHours: 48, label: 'International run', payGroup: 'international', createdBy: alex.sub });
  }
  for (const r of runs.sort((a, b) => a.runDate.localeCompare(b.runDate))) await store.repo('PaymentRun').create(r);

  // Change requests, oldest first, with flags worked out against what existed at the time.
  const made: ChangeRequest[] = [];
  const callbacks: Omit<Callback, 'id'>[] = [];
  let n = 101;
  type Spec = {
    s: string;
    by: string;
    hoursAgo: number;
    channel: ChangeRequest['channel'];
    sourceRef: string;
    account: string;
    bank?: string;
    reason: string;
    urgent?: boolean;
    status: ChangeRequest['status'];
    verifiedBy?: string;
    verifiedHoursAgo?: number;
    approvedBy?: string;
    approvedHoursAgo?: number;
    overrideReason?: string;
    releasedHoursAgo?: number;
    closedBy?: string;
    closedHoursAgo?: number;
    rejectReason?: string;
    calls?: { by: string; hoursAgo: number; number?: string; contact: string; outcome: Callback['outcome']; note?: string }[];
  };
  const add = async (x: Spec) => {
    const supplier = suppliers[x.s];
    const seedSupplier = SUPPLIERS.find((s) => s.key === x.s)!;
    const { masked, hash } = protectAccount(x.account);
    const bank = x.bank ?? seedSupplier.bank;
    // For history the supplier still held its old account when the request was made.
    const asThen: Supplier = OLD_ACCOUNTS[x.s] && x.status === 'released' ? { ...supplier, currentAccountHash: protectAccount(OLD_ACCOUNTS[x.s]).hash } : supplier;
    const flags = computeFlags(
      { supplier: asThen, channel: x.channel, urgencyClaimed: !!x.urgent, newBankCountry: bank, newAccountHash: hash, requestedAt: at(x.hoursAgo) },
      { suppliers: Object.values(suppliers).map((s) => (s.id === asThen.id ? asThen : s)), requests: made },
    );
    const row = await store.repo('ChangeRequest').create({
      ref: `PCR-${String(n++).padStart(4, '0')}`,
      supplierId: supplier.id,
      requestedBy: x.by,
      requestedAt: at(x.hoursAgo),
      channel: x.channel,
      sourceRef: x.sourceRef,
      newAccountMasked: masked,
      newAccountHash: hash,
      newBankCountry: bank,
      reason: x.reason,
      urgencyClaimed: !!x.urgent,
      status: x.status,
      flags: encodeFlags(flags),
      verifiedBy: x.verifiedBy ?? null,
      verifiedAt: x.verifiedHoursAgo !== undefined ? at(x.verifiedHoursAgo) : null,
      approvedBy: x.approvedBy ?? null,
      approvedAt: x.approvedHoursAgo !== undefined ? at(x.approvedHoursAgo) : null,
      releasedAt: x.releasedHoursAgo !== undefined ? at(x.releasedHoursAgo) : null,
      rejectReason: x.rejectReason ?? null,
      overrideReason: x.overrideReason ?? null,
      closedBy: x.closedBy ?? null,
      closedAt: x.closedHoursAgo !== undefined ? at(x.closedHoursAgo) : null,
    });
    made.push(row);
    for (const c of x.calls ?? []) {
      const number = c.number ?? supplier.phoneOnFile;
      callbacks.push({
        requestId: row.id,
        requesterSub: x.by,
        calledBy: c.by,
        calledAt: at(c.hoursAgo),
        numberUsed: number,
        numberMatchesFile: number === supplier.phoneOnFile,
        contactName: c.contact,
        outcome: c.outcome,
        note: c.note ?? null,
      });
    }
    return row;
  };
  const specs: Spec[] = [];

  // Released (Alder), about three weeks ago.
  specs.push({
    s: 'alder', by: priya.sub, hoursAgo: 24 * 23, channel: 'portal', sourceRef: 'Supplier portal change form SP-22817', account: SUPPLIERS[4].account,
    reason: 'Supplier moved its operating account after a bank merger; new details entered on the portal.',
    status: 'released', verifiedBy: sam.sub, verifiedHoursAgo: 24 * 22.8, approvedBy: jordan.sub, approvedHoursAgo: 24 * 21.9, releasedHoursAgo: 24 * 20.5,
    calls: [{ by: sam.sub, hoursAgo: 24 * 22.8, contact: 'Dana Whitfield, finance manager', outcome: 'confirmed', note: 'Confirmed new sort code and last four digits.' }],
  });
  // Released last week (Northwind).
  specs.push({
    s: 'northwind', by: sam.sub, hoursAgo: 24 * 10, channel: 'letter', sourceRef: 'Letter on supplier letterhead, ref NW/AP/0412', account: SUPPLIERS[0].account,
    reason: 'New bank account after the supplier changed banks; letter signed by their finance director.',
    status: 'released', verifiedBy: priya.sub, verifiedHoursAgo: 24 * 9.7, approvedBy: jordan.sub, approvedHoursAgo: 24 * 8.9, releasedHoursAgo: 24 * 6.2,
    calls: [{ by: priya.sub, hoursAgo: 24 * 9.7, contact: 'Ruth Calloway, finance director', outcome: 'confirmed', note: 'Read back the last four digits; matched the letter.' }],
  });
  // Rejected: the call-back was denied (Ravensworth).
  specs.push({
    s: 'ravensworth', by: sam.sub, hoursAgo: 24 * 4.2, channel: 'email', sourceRef: 'Email from accounts@ravensworth-timber.co (look-alike domain)', account: 'LT12DEMO10000188234401', bank: 'LT',
    reason: 'Email says the old account is under audit and asks for all open invoices to go to the new account today.', urgent: true,
    status: 'rejected', closedBy: priya.sub, closedHoursAgo: 24 * 3.9, rejectReason: 'Call-back denied by Tom Ashdown on the number on file.',
    calls: [{ by: priya.sub, hoursAgo: 24 * 3.9, contact: 'Tom Ashdown', outcome: 'denied', note: 'Supplier has not changed banks and did not send the email. Reported to IT security.' }],
  });
  // Released 9 days ago (Copperleaf), phone on file had changed just before.
  specs.push({
    s: 'copperleaf', by: priya.sub, hoursAgo: 24 * 11, channel: 'phone', sourceRef: 'Phone call from owner, notes in AP diary', account: SUPPLIERS[6].account,
    reason: 'Owner switched the business to a new bank and asked for the details to be updated before month end.',
    status: 'released', verifiedBy: sam.sub, verifiedHoursAgo: 24 * 10.8, approvedBy: jordan.sub, approvedHoursAgo: 24 * 10.1, releasedHoursAgo: 24 * 9,
    calls: [{ by: sam.sub, hoursAgo: 24 * 10.8, contact: 'Mei Lin, owner', outcome: 'confirmed', note: 'Called the number on file; owner confirmed.' }],
  });
  // Cancelled (Fenwick): raised against the wrong supplier record.
  specs.push({
    s: 'fenwick', by: priya.sub, hoursAgo: 24 * 6, channel: 'portal', sourceRef: 'Supplier portal change form SP-23104', account: '40-47-84 99012733',
    reason: 'Portal change submitted for the electrical maintenance contract.',
    status: 'cancelled', closedBy: alex.sub, closedHoursAgo: 24 * 5.5, rejectReason: 'Raised against the wrong supplier record. The portal form was for a different Fenwick entity.',
  });
  // Rejected at the second key (Saltmarsh).
  specs.push({
    s: 'saltmarsh', by: sam.sub, hoursAgo: 24 * 3, channel: 'letter', sourceRef: 'Letter, unsigned, posted from a different town', account: '23-14-70 61002945',
    reason: 'Letter asks for payments to go to a new account from next month.',
    status: 'rejected', verifiedBy: priya.sub, verifiedHoursAgo: 24 * 2.8, closedBy: jordan.sub, closedHoursAgo: 24 * 2.1,
    rejectReason: 'Contact on the call could not read back the account; letter unsigned. Ask the supplier to use the portal.',
    calls: [{ by: priya.sub, hoursAgo: 24 * 2.8, contact: 'Front desk, Saltmarsh Cleaning', outcome: 'confirmed', note: 'Receptionist confirmed a letter was sent but could not give details.' }],
  });
  // Approved, waiting for release (Bluefin, international, high spend).
  specs.push({
    s: 'bluefin', by: priya.sub, hoursAgo: 52, channel: 'portal', sourceRef: 'Supplier portal change form SP-23377', account: 'NL20DEMO0821155740',
    reason: 'Supplier consolidated its euro accounts into one operating account.',
    status: 'approved', verifiedBy: sam.sub, verifiedHoursAgo: 47, approvedBy: jordan.sub, approvedHoursAgo: 22,
    calls: [{ by: sam.sub, hoursAgo: 47, contact: 'Joost Verhaegen, treasury', outcome: 'confirmed', note: 'Confirmed by treasury; last four digits match the portal form.' }],
  });
  // Four flags, called back on the number on file, waiting for the second key (Lindqvist, international).
  specs.push({
    s: 'lindqvist', by: sam.sub, hoursAgo: 30, channel: 'email', sourceRef: 'Email from Lindqvist accounts with PDF bank letter attached', account: '40215583991706', bank: 'DE',
    reason: 'Supplier says they are moving to a German bank and asks for this week’s payment to go to the new account, urgently.', urgent: true,
    status: 'verified', verifiedBy: priya.sub, verifiedHoursAgo: 20,
    calls: [
      { by: priya.sub, hoursAgo: 26, number: '+49 30 5550 9147', contact: 'K. Brandt (number from the email signature)', outcome: 'confirmed', note: 'Dialled the number in the email signature. Logged, but it is not the number on file.' },
      { by: priya.sub, hoursAgo: 20, contact: 'Accounts desk, Lindqvist', outcome: 'confirmed', note: 'Number on file. Desk said a bank move is planned but could not read back the account.' },
    ],
  });
  // Called back, frozen before tomorrow’s domestic run (Kestrel).
  specs.push({
    s: 'kestrel', by: sam.sub, hoursAgo: 28, channel: 'letter', sourceRef: 'Letter on letterhead, ref KPP/FIN/2211', account: '30-90-12 55120874',
    reason: 'Supplier moved to a new business account with the same bank.',
    status: 'verified', verifiedBy: priya.sub, verifiedHoursAgo: 6,
    calls: [{ by: priya.sub, hoursAgo: 6, contact: 'Gareth Pryce, finance', outcome: 'confirmed', note: 'Confirmed new account; matches the letter.' }],
  });
  // Called back, one flag, ready for approval (Corvid, international).
  specs.push({
    s: 'corvid', by: sam.sub, hoursAgo: 9, channel: 'email', sourceRef: 'Email from known contact, signed PDF attached', account: 'NL44DEMO0904417730',
    reason: 'New account for invoices after a change of legal entity bank mandate.',
    status: 'verified', verifiedBy: priya.sub, verifiedHoursAgo: 3,
    calls: [{ by: priya.sub, hoursAgo: 3, contact: 'Femke de Groot, controller', outcome: 'confirmed', note: 'Confirmed by the controller we know.' }],
  });
  // Waiting for a call-back for 31 hours (Harbourline).
  specs.push({
    s: 'harbourline', by: sam.sub, hoursAgo: 31, channel: 'letter', sourceRef: 'Letter on letterhead, ref HLS/0981', account: '77-31-05 40072218',
    reason: 'Supplier opened a new account for UK receipts.', status: 'requested',
  });
  // Waiting for a call-back after no answer (Tidewater, international).
  specs.push({
    s: 'tidewater', by: alex.sub, hoursAgo: 20, channel: 'phone', sourceRef: 'Inbound phone call, AP diary 14:20', account: 'IE12DEMO93118870015524',
    reason: 'Caller asked to update the account before the next international run.', urgent: true, status: 'requested',
    calls: [{ by: sam.sub, hoursAgo: 6, contact: 'No one', outcome: 'no_answer', note: 'Voicemail. Try again in the morning.' }],
  });
  // Recent change and recent phone change: two flags (Copperleaf again).
  specs.push({
    s: 'copperleaf', by: priya.sub, hoursAgo: 5, channel: 'portal', sourceRef: 'Supplier portal change form SP-23590', account: '60-83-71 88124509',
    reason: 'Second account change this month: supplier says the first new account was opened in error.', status: 'requested',
  });
  // Fresh request (Pinecrest).
  specs.push({
    s: 'pinecrest', by: sam.sub, hoursAgo: 3, channel: 'portal', sourceRef: 'Supplier portal change form SP-23611', account: '16-52-21 30448172',
    reason: 'Supplier moved invoicing to a new subsidiary account.', status: 'requested',
  });

  for (const x of specs.sort((a, b) => b.hoursAgo - a.hoursAgo)) await add(x);
  for (const c of callbacks.sort((a, b) => a.calledAt.localeCompare(b.calledAt))) await store.repo('Callback').create(c);
}
