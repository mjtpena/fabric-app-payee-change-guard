/**
 * Second key: the approver sees the change, the call-back evidence and every red flag explained, then approves
 * (with a written override when two or more flags are up) or rejects. Blocked for the requester, the verifier,
 * non-approvers, and inside the payment-run freeze, with the exact time the gate opens.
 */
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, KeyRound, ShieldAlert, Snowflake } from 'lucide-react';

import { checkText, formatDateTime, formatRelative, useAction } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Button, Callout, Dialog, EmptyState, ErrorPanel, Field, InlineError, LoadingBlock, TextArea } from '@x10/shared/ui';

import { Country, Eyebrow, Facts, FlagList, Masked, Money, StatusBadge } from '../components/bits';
import { GateDesk } from '../components/GateDesk';
import { useWorld } from '../components/useWorld';
import { countryName, rules } from '../config';
import { buildCanal, CHANNEL_LABEL, type Boat } from '../domain/canal';
import { needsOverride } from '../domain/flags';
import { checkApprove, checkApproveGate, checkReject, formatExact, type Actor } from '../domain/gates';
import { approveRequest, nameOf, rejectRequest, type World } from '../domain/requests';
import { limits, type Schema } from '../model';
import { CallLog } from './CallbackPage';

export function SecondKeyPage() {
  const { id } = useParams();
  const { state, world, actor, me } = useWorld();
  const data = useMemo(() => (world ? buildCanal(world, new Date()) : null), [world]);
  if (state.error && !world) return <ErrorPanel error={state.error} onRetry={() => void state.reload()} />;
  if (!data || !world) return <LoadingBlock rows={6} />;
  const waiting = data.boats.filter((b) => b.req.status === 'verified').sort((a, b) => b.flags.length - a.flags.length || b.ageHours - a.ageHours);
  const boat = id ? (data.boats.find((b) => b.id === id) ?? null) : (waiting.find((b) => checkApproveGate(b.req, actor, b.freeze!).ok) ?? waiting[0] ?? null);
  return (
    <GateDesk title="Second key" queueLabel="Waiting for approval" boats={waiting} base="/second-key" selectedId={id} activeId={boat?.id} me={me.sub} empty="No called-back change is waiting for approval.">
      {boat ? (
        <KeySheet key={boat.id} boat={boat} world={world} actor={actor} />
      ) : (
        <EmptyState icon={<KeyRound />} title="Nothing to approve">
          Changes arrive here once someone has confirmed them on the number on file.
        </EmptyState>
      )}
    </GateDesk>
  );
}

function KeySheet({ boat, world, actor }: { boat: Boat; world: World; actor: Actor }) {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const r = boat.req;
  const s = boat.supplier!;
  const freeze = boat.freeze ?? { frozen: false, until: null, run: null, next: null };
  const [override, setOverride] = useState('');
  const [touched, setTouched] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const overrideId = useId();
  const reasonId = useId();
  const needs = needsOverride(boat.flags);
  const gate = r.status === 'verified' ? checkApproveGate(r, actor, freeze) : null;
  const full = r.status === 'verified' ? checkApprove(r, actor, { freeze, flags: boat.flags, overrideReason: override }) : null;
  const canReject = checkReject(r, actor, 'x'.repeat(limits.rejectReason.min));
  const verifyingCall = world.callbacks.filter((c) => c.requestId === r.id).sort((a, b) => b.calledAt.localeCompare(a.calledAt));

  const approve = useAction(async () => {
    setTouched(true);
    if (!full?.ok) return;
    await approveRequest(store, me, r.id, override, new Date());
    navigate('/', { state: { focus: r.id } });
  });
  const reject = useAction(async () => {
    await rejectRequest(store, me, r.id, reason, new Date());
    navigate('/', { state: { focus: r.id } });
  });

  return (
    <article className="min-w-0" data-testid="key-sheet">
      <header className="mb-5">
        <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-muted">
          <span className="font-mono">{r.ref}</span>
          <StatusBadge status={r.status} />
          <span>
            Raised by {r.requestedBy === me.sub ? 'you' : boat.requester} · called back by {r.verifiedBy === me.sub ? 'you' : boat.verifier}
          </span>
        </div>
        <h2 className="m-0 text-2xl font-semibold">{s.name}</h2>
      </header>

      {/* the change itself */}
      <section className="mb-6 grid items-center gap-3 rounded-xl border border-line bg-surface p-5 sm:grid-cols-[1fr_auto_1fr]" aria-label="The change">
        <div>
          <div className="x-legend-label mb-1 text-muted">On file now</div>
          <Masked value={s.currentAccountMasked} className="text-xl!" />
          <div className="mt-1 text-ui text-muted">{countryName(s.currentBankCountry)}</div>
        </div>
        <ArrowRight className="hidden size-5 text-muted sm:block" aria-hidden="true" />
        <div>
          <div className="x-legend-label mb-1 text-muted">Change to</div>
          <Masked value={r.newAccountMasked} className="text-xl! font-semibold text-fg" />
          <div className="mt-1 text-ui text-muted">
            {countryName(r.newBankCountry)}
            {r.newBankCountry !== s.country && <span className="text-warn-text"> · supplier is in {countryName(s.country)}</span>}
          </div>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <Eyebrow className="mb-0">Red flags</Eyebrow>
            <span className={needs ? 'text-ui font-medium text-bad-text' : 'text-ui text-muted'} data-testid="flag-headline">
              {boat.flags.length === 0 ? 'None' : `${boat.flags.length} ${boat.flags.length === 1 ? 'flag' : 'flags'}${needs ? ': override needed' : ''}`}
            </span>
          </div>
          <FlagList flags={boat.flags} empty="No red flags on this change." />

          <section className="mt-6 border-t border-line pt-5" data-testid="decision-panel">
            <Eyebrow>Decision</Eyebrow>
            {freeze.frozen && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-[var(--pcg-ice-ink)]/30 bg-[var(--pcg-plaque)] px-4 py-3 text-[var(--pcg-plaque-ink)]" data-testid="freeze-banner">
                <Snowflake className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold" data-testid="key-blocked">Frozen until {formatExact(freeze.until!)}</div>
                  <div className="text-ui opacity-85">
                    {freeze.run?.label} is due. No approval or release in the {freeze.run?.freezeHours ?? rules.FREEZE_HOURS} hours before a payment run.
                  </div>
                </div>
              </div>
            )}
            {r.status !== 'verified' ? (
              <Callout tone="info" title="Not at this gate">
                <span data-testid="key-blocked">This change is {r.status}. Open its voyage log for the next step.</span>
              </Callout>
            ) : gate && !gate.ok && gate.code !== 'frozen' ? (
              <Callout tone="bad" icon={<ShieldAlert />} title="You cannot turn this key">
                <span data-testid="key-blocked">{gate.reason}</span>
              </Callout>
            ) : (
              <>
                {needs && (
                  <Field
                    label="Override reason"
                    htmlFor={overrideId}
                    required
                    error={touched && full && !full.ok && full.code === 'override' ? full.reason : null}
                    hint={`Why it is safe despite ${boat.flags.length} flags. At least ${rules.OVERRIDE_MIN_CHARS} characters; kept in the ledger.`}
                    counter={{ value: override.length, max: limits.overrideReason.max }}
                  >
                    <TextArea id={overrideId} rows={3} value={override} onChange={(e) => setOverride(e.target.value)} maxLength={limits.overrideReason.max} disabled={freeze.frozen} />
                  </Field>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" icon={<KeyRound />} onClick={() => void approve.run()} busy={approve.pending} disabled={!gate?.ok} data-testid="approve">
                    Approve
                  </Button>
                  {canReject.ok && (
                    <Button variant="secondary" className="text-bad-text" onClick={() => setRejecting(true)} data-testid="reject">
                      Reject
                    </Button>
                  )}
                </div>
                <InlineError error={approve.error} />
              </>
            )}
          </section>
        </div>

        <aside className="min-w-0">
          <Eyebrow>The request</Eyebrow>
          <Facts
            rows={[
              ['Raised', `${formatDateTime(r.requestedAt)} (${formatRelative(r.requestedAt)})`],
              ['By', nameOf(world, r.requestedBy)],
              ['Channel', CHANNEL_LABEL[r.channel]],
              ['Source', r.sourceRef],
              ['Reason given', r.reason],
              ['Supplier', <span key="s">{s.supplierNo} · <Country code={s.country} /> · <Money value={s.annualSpend} /> a year</span>],
            ]}
          />
          <Eyebrow className="mt-6">Call-back evidence</Eyebrow>
          {verifyingCall.length ? <CallLog calls={verifyingCall} world={world} /> : <p className="m-0 text-ui text-muted">No calls yet.</p>}
          <p className="mt-6 text-ui">
            <Link to={`/requests/${r.id}`} className="text-brand-text">
              Voyage log for {r.ref}
            </Link>
          </p>
        </aside>
      </div>

      <Dialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={`Reject ${r.ref}`}
        description="The boat goes to the dry dock; the supplier master is not touched."
        footer={
          <>
            <Button onClick={() => setRejecting(false)}>Keep it</Button>
            <Button variant="danger" busy={reject.pending} disabled={!!checkText(reason, { ...limits.rejectReason, label: 'Reason' })} onClick={() => void reject.run()} data-testid="confirm-reject">
              Reject
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor={reasonId} required counter={{ value: reason.length, max: limits.rejectReason.max }}>
          <TextArea id={reasonId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={limits.rejectReason.max} />
        </Field>
        <InlineError error={reject.error} />
      </Dialog>
    </article>
  );
}
