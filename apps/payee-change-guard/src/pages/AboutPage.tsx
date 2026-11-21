import type { ReactNode } from 'react';

import { AppLogo } from '@x10/shared/runtime';
import { Table, TableWrap, Td, Th } from '@x10/shared/ui';

import { BoatShape, Snowflake } from '../canal/Boat';
import { Pennant } from '../components/bits';
import { rules } from '../config';
import { FLAG_CODES, FLAG_LABEL, type FlagCode } from '../domain/flags';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2 border-t border-line py-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
      <h2 className="x-legend-label m-0 pt-1 text-muted">{title}</h2>
      <div className="min-w-0 text-sm leading-6 text-fg">{children}</div>
    </section>
  );
}

const money = (n: number) => new Intl.NumberFormat('en-GB').format(n);

const FLAG_RULE: Record<FlagCode, string> = {
  shared_account: 'The new account’s SHA-256 fingerprint is already on file (or pending) for a different supplier.',
  urgency: 'The request presses for speed.',
  email: 'The request arrived by email.',
  new_country: 'The new bank country has never been used for this supplier.',
  country_mismatch: 'The bank country differs from the supplier’s own country.',
  phone_changed: `The phone on file changed in the last ${rules.PHONE_CHANGE_DAYS} days.`,
  recent_change: `Another change to this supplier’s bank details within ${rules.RECENT_CHANGE_DAYS} days.`,
  high_spend: `Annual spend above ${money(rules.HIGH_SPEND)}.`,
};

/** About: what the app is for, how it works, the rules and thresholds from config.ts, and who can see what. */
export function AboutPage() {
  return (
    <div className="mx-auto max-w-[880px]">
      <header className="mb-8 flex flex-wrap items-center gap-6">
        <svg viewBox="-60 -70 120 96" width={132} height={106} aria-hidden="true" className="shrink-0">
          <rect x={-60} y={0} width={120} height={26} rx={4} fill="var(--pcg-water-top)" />
          <g transform="scale(1.4)">
            <BoatShape
              len={62}
              hull="var(--accent-9)"
              flags={[
                { code: 'email', label: 'Requested by email' },
                { code: 'urgency', label: 'Urgency claimed' },
              ]}
              animate={false}
            />
          </g>
          <rect x={-60} y={1} width={120} height={26} rx={4} fill="var(--pcg-water-front)" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <AppLogo size={20} />
            <span className="x-legend-label text-muted">Payee Change Guard</span>
          </div>
          <h1 className="x-serif m-0 text-4xl leading-tight text-fg">Every bank-detail change called back on a known number and approved by a second person.</h1>
        </div>
      </header>

      <Block title="Why">
        <p className="m-0">
          Business email compromise and vendor impersonation start with one message: a “supplier” asks for its bank details to be updated. A clerk changes them,
          and the next payment run pays the fraudster. The control that stops it is simple and routinely skipped: call the supplier back on the number already
          on file, and have a second person approve.
        </p>
      </Block>

      <Block title="How to use it">
        <ol className="m-0 space-y-1.5 pl-4">
          <li>
            <strong className="font-medium">Lock keeper:</strong> a clerk raises the change with its source document. Red flags appear as the details come in.
          </li>
          <li>
            <strong className="font-medium">Call-back:</strong> someone other than the requester phones the supplier on the number on file and records what
            they said. A confirmed call on that number opens the gate; a denial rejects the change.
          </li>
          <li>
            <strong className="font-medium">Second key:</strong> an approver who is neither the requester nor the caller approves, with an override reason
            when {rules.OVERRIDE_FLAGS} or more flags are up.
          </li>
          <li>
            <strong className="font-medium">Release:</strong> the supplier’s custodian writes the new masked account to the master.
          </li>
        </ol>
      </Block>

      <Block title="The canal">
        <ul className="m-0 space-y-1.5 pl-4">
          <li>Each open change is a boat in the chamber of the gate it has reached. When a gate opens, the boat rises with the water into the next chamber.</li>
          <li>
            Flags fly as pennants <Pennant code="urgency" /> (red for the most serious, amber for the rest). Boat length is the supplier’s annual spend.
          </li>
          <li>
            A payment run freezes the second key and the release gate: frozen boats and gates wear ice <span className="inline-block align-middle"><svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><Snowflake x={0} y={0} r={5} /></svg></span> and the
            sign shows exactly when the gate opens again.
          </li>
          <li>Rejected and cancelled boats wait in the dry dock for {rules.DRY_DOCK_DAYS} days; released boats moor in the basin for {rules.BASIN_DAYS} days. The Ledger keeps everything.</li>
          <li>A leaking boat is one whose position does not match its trail (for example “verified” with no confirmed call-back on the number on file).</li>
        </ul>
      </Block>

      <Block title="Rules">
        <ul className="m-0 space-y-1.5 pl-4">
          <li>Gate order: requested → verified → approved → released. Nothing skips a gate.</li>
          <li>Separation of duties: the verifier is not the requester; the approver is neither the requester nor the verifier.</li>
          <li>
            Freeze: no approval or release within <span className="num">{rules.FREEZE_HOURS}</span> hours before a payment run that pays the supplier’s pay group
            (each run can set its own freeze hours).
          </li>
          <li>
            {rules.OVERRIDE_FLAGS} or more red flags: approving needs a written override reason of at least <span className="num">{rules.OVERRIDE_MIN_CHARS}</span>{' '}
            characters, kept in the ledger.
          </li>
          <li>A request without a confirmed call-back after {rules.CALLBACK_DUE_HOURS} hours shows in Today.</li>
          <li>Release updates the supplier’s masked account, fingerprint and bank country, and nothing else.</li>
        </ul>
        <div className="mt-4">
          <TableWrap label="Red flags">
            <Table density="compact">
              <thead>
                <tr>
                  <Th>Flag</Th>
                  <Th>Raised when</Th>
                </tr>
              </thead>
              <tbody>
                {FLAG_CODES.map((c) => (
                  <tr key={c}>
                    <Td className="whitespace-nowrap font-medium">
                      <span className="inline-flex items-center gap-2">
                        <Pennant code={c} /> {FLAG_LABEL[c]}
                      </span>
                    </Td>
                    <Td muted>{FLAG_RULE[c]}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </div>
      </Block>

      <Block title="Account numbers">
        <p className="m-0">
          The app never stores a full account number. The form takes it, shows it masked (•••• and the last four characters), computes a SHA-256 fingerprint in
          your browser, and saves only the masked form and the fingerprint. The fingerprint lets the app spot a change to the same account and an account
          already used by another supplier. It is a matching aid, not encryption: account numbers are short, so treat the fingerprint as sensitive.
        </p>
      </Block>

      <Block title="Who sees what">
        <p className="m-0">
          Everyone who can open the app can read the supplier master, the requests and the call-backs. The database lets you raise requests and record
          call-backs only as yourself, never lets the requester update their own request or call it back, and lets only a supplier’s custodian change it.
          The approver role, verifier ≠ approver, the call-back number check and the freeze are enforced by the app, and the trail check flags any request
          whose status does not match its evidence.
        </p>
      </Block>

      <Block title="Scope">
        <p className="m-0 rounded-lg bg-surface-sunken px-3.5 py-3 text-ui" role="note">
          This app supports your payment controls process. It does not move money, change your ERP, or replace your finance, audit or legal judgement. Thresholds
          are starting points; set them to your own policy.
        </p>
        <p className="mt-6 text-ui text-faint">Built by Datachain Consulting for AI @Work. Runs on Microsoft Fabric Apps.</p>
      </Block>
    </div>
  );
}
