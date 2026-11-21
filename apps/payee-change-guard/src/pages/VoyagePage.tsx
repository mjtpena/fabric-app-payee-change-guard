/**
 * Voyage log: one change request through its gates, with who did what and when, the call-backs, the flags, the
 * trail check, and the actions open to you now (call back, second key, release, cancel).
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Anchor, Check, Download, KeyRound, PhoneCall, Ship, Snowflake, Warehouse, X } from 'lucide-react';

import { checkText, downloadText, formatDateTime, useAction } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Badge, Button, Callout, cx, Dialog, EmptyState, ErrorPanel, Field, InlineError, LinkButton, LoadingBlock, PageHeader, TextArea } from '@x10/shared/ui';

import { BoatGlyph } from '../canal/Boat';
import { Country, Eyebrow, Facts, FlagList, Masked, StatusBadge } from '../components/bits';
import { useWorld } from '../components/useWorld';
import { countryName } from '../config';
import { buildCanal, CHANNEL_LABEL, hullColor, type Boat } from '../domain/canal';
import { checkCancel, checkRelease, formatExact, isOpen } from '../domain/gates';
import { ledgerCsv } from '../domain/ledger';
import { cancelRequest, nameOf, releaseRequest, type World } from '../domain/requests';
import { limits, type Schema } from '../model';
import { CallLog } from './CallbackPage';

export function VoyagePage() {
  const { id } = useParams();
  const { state, world, actor } = useWorld();
  const data = useMemo(() => (world ? buildCanal(world, new Date()) : null), [world]);
  if (state.error && !world) return <ErrorPanel error={state.error} onRetry={() => void state.reload()} />;
  if (!data || !world) return <LoadingBlock rows={8} />;
  // Older closed requests are not on the canal; build their boat from the world directly.
  const boat = data.boats.find((b) => b.id === id) ?? buildCanal({ ...world, requests: world.requests.filter((r) => r.id === id) }, new Date(world.requests.find((r) => r.id === id)?.requestedAt ?? Date.now())).boats[0];
  if (!boat) {
    return (
      <EmptyState icon={<Ship />} title="No such change request" action={<LinkButton to="/">Back to the canal</LinkButton>}>
        It may have been typed wrongly, or it belongs to another app.
      </EmptyState>
    );
  }
  return <Voyage boat={boat} world={world} actor={actor} reload={state.reload} />;
}

function Voyage({ boat, world, actor, reload }: { boat: Boat; world: World; actor: ReturnType<typeof useWorld>['actor']; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const r = boat.req;
  const s = boat.supplier;
  const freeze = boat.freeze ?? { frozen: false, until: null, run: null, next: null };
  const [releasing, setReleasing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const release = s ? checkRelease(r, actor, s, freeze) : null;
  const cancel = checkCancel(r, actor, 'x'.repeat(limits.rejectReason.min));
  const calls = world.callbacks.filter((c) => c.requestId === r.id).sort((a, b) => a.calledAt.localeCompare(b.calledAt));

  const doRelease = useAction(async () => {
    await releaseRequest(store, me, r.id, new Date());
    await reload();
    navigate('/', { state: { focus: r.id } });
  });
  const doCancel = useAction(async () => {
    await cancelRequest(store, me, r.id, reason, new Date());
    await reload();
    setCancelling(false);
  });

  const steps: Step[] = [
    {
      key: 'request',
      title: 'Request',
      state: 'done',
      who: `${nameOf(world, r.requestedBy)} · ${CHANNEL_LABEL[r.channel]}`,
      at: r.requestedAt,
      body: <span>{r.sourceRef}</span>,
    },
    {
      key: 'callback',
      title: 'Call-back',
      state: r.verifiedAt ? 'done' : r.status === 'requested' ? 'current' : r.status === 'rejected' && !r.verifiedAt ? 'stopped' : 'skipped',
      who: r.verifiedBy ? `${nameOf(world, r.verifiedBy)} on the number on file` : calls.length ? `${calls.length} ${calls.length === 1 ? 'call' : 'calls'}, none confirming on file` : 'Waiting for someone other than the requester',
      at: r.verifiedAt,
      body: calls.length ? <CallLog calls={[...calls].reverse()} world={world} /> : null,
    },
    {
      key: 'approval',
      title: 'Second approval',
      state: r.approvedAt ? 'done' : r.status === 'verified' ? (freeze.frozen ? 'frozen' : 'current') : r.status === 'rejected' && r.verifiedAt ? 'stopped' : 'skipped',
      who: r.approvedBy ? nameOf(world, r.approvedBy) : r.status === 'verified' ? (freeze.frozen ? `Frozen until ${formatExact(freeze.until!)}` : 'Waiting for an approver who is neither requester nor verifier') : '',
      at: r.approvedAt,
      body: r.overrideReason ? (
        <span>
          <span className="text-muted">Override: </span>
          {r.overrideReason}
        </span>
      ) : null,
    },
    {
      key: 'release',
      title: 'Released to the master',
      state: r.releasedAt ? 'done' : r.status === 'approved' ? (freeze.frozen ? 'frozen' : 'current') : 'skipped',
      who: r.releasedAt ? 'Supplier master updated' : r.status === 'approved' ? (freeze.frozen ? `Frozen until ${formatExact(freeze.until!)}` : 'Waiting for the supplier’s custodian') : '',
      at: r.releasedAt,
      body: null,
    },
  ];

  return (
    <div className="pb-8">
      <PageHeader
        eyebrow={
          <Link to="/" state={{ focus: r.id }} className="text-ui text-muted hover:text-fg">
            Canal
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <BoatGlyph hull={hullColor(boat, 'gate')} flags={boat.flags} frozen={freeze.frozen} leaking={boat.issues.length > 0} closed={r.status === 'rejected' ? 'rejected' : null} size={56} />
            <span>{s?.name ?? r.ref}</span>
          </span>
        }
        meta={
          <>
            <span className="font-mono text-xs">{r.ref}</span>
            <StatusBadge status={r.status} />
            {s && <span>{s.supplierNo}</span>}
          </>
        }
        actions={
          <>
            {r.status === 'requested' && (
              <LinkButton to={`/callback/${r.id}`} variant="primary" icon={<PhoneCall />}>
                Call back
              </LinkButton>
            )}
            {r.status === 'verified' && (
              <LinkButton to={`/second-key/${r.id}`} variant="primary" icon={<KeyRound />}>
                Second key
              </LinkButton>
            )}
            {r.status === 'approved' && (
              <Button variant="primary" icon={<Warehouse />} disabled={!release?.ok} onClick={() => setReleasing(true)} data-testid="release">
                Release
              </Button>
            )}
            {isOpen(r.status) && cancel.ok && (
              <Button variant="ghost" onClick={() => setCancelling(true)}>
                Cancel request
              </Button>
            )}
          </>
        }
      />

      {boat.issues.length > 0 && (
        <Callout tone="bad" title="The trail does not back this boat’s position" className="mb-6">
          <ul className="m-0 pl-4">
            {boat.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Callout>
      )}
      {r.status === 'approved' && release && !release.ok && (
        <p className={cx('m-0 mb-6 flex items-center gap-2 text-ui', release.code === 'frozen' ? 'text-[var(--pcg-ice-ink)]' : 'text-muted')} data-testid="release-blocked">
          {release.code === 'frozen' && <Snowflake className="size-4" aria-hidden="true" />}
          {release.reason}
        </p>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Voyage through the gates">
          <Eyebrow>Voyage</Eyebrow>
          <ol className="m-0 list-none p-0" data-testid="voyage">
            {steps.map((st, i) => (
              <VoyageStep key={st.key} step={st} last={i === steps.length - 1 && r.status !== 'rejected' && r.status !== 'cancelled'} />
            ))}
            {(r.status === 'rejected' || r.status === 'cancelled') && (
              <VoyageStep
                last
                step={{
                  key: 'closed',
                  title: r.status === 'rejected' ? 'Rejected: dry dock' : 'Cancelled: dry dock',
                  state: 'stopped',
                  who: r.closedBy ? nameOf(world, r.closedBy) : '',
                  at: r.closedAt,
                  body: r.rejectReason ? <span>{r.rejectReason}</span> : null,
                }}
              />
            )}
          </ol>
        </section>
        <aside className="min-w-0">
          <Eyebrow>The change</Eyebrow>
          <Facts
            rows={[
              ['New account', <span key="n" className="flex items-center gap-2"><Masked value={r.newAccountMasked} /> <Country code={r.newBankCountry} /></span>],
              ['On file now', s ? <span key="o" className="flex items-center gap-2"><Masked value={s.currentAccountMasked} /> <Country code={s.currentBankCountry} /></span> : '—'],
              ['Supplier based in', s ? countryName(s.country) : '—'],
              ['Reason given', r.reason],
              ['Urgency claimed', r.urgencyClaimed ? 'Yes' : 'No'],
            ]}
          />
          <Eyebrow className="mt-6">Red flags</Eyebrow>
          <FlagList flags={boat.flags} />
          <div className="mt-6 flex flex-wrap gap-2">
            {s && (
              <LinkButton to={`/ledger/${s.id}`} size="sm" icon={<Anchor />}>
                Supplier ledger
              </LinkButton>
            )}
            <Button size="sm" icon={<Download />} onClick={() => downloadText(`${r.ref}.csv`, ledgerCsv({ ...world, requests: world.requests.filter((x) => x.id === r.id) }))}>
              Export CSV
            </Button>
          </div>
        </aside>
      </div>

      <Dialog
        open={releasing}
        onClose={() => setReleasing(false)}
        title={`Release ${r.ref}`}
        description={s ? `Write ${r.newAccountMasked} (${countryName(r.newBankCountry)}) to ${s.name} in the supplier master.` : undefined}
        footer={
          <>
            <Button onClick={() => setReleasing(false)}>Not yet</Button>
            <Button variant="primary" busy={doRelease.pending} onClick={() => void doRelease.run()} data-testid="confirm-release">
              Release
            </Button>
          </>
        }
      >
        <p className="m-0 text-sm">Only the masked account, its fingerprint and the bank country change. Nothing else on the supplier is touched.</p>
        <p className="m-0 mt-2 text-ui text-muted">Then apply the same change in your payment system; this app records the control, it does not pay.</p>
        <InlineError error={doRelease.error} />
      </Dialog>
      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${r.ref}`}
        footer={
          <>
            <Button onClick={() => setCancelling(false)}>Keep it</Button>
            <Button variant="danger" busy={doCancel.pending} disabled={!!checkText(reason, { ...limits.rejectReason, label: 'Reason' })} onClick={() => void doCancel.run()}>
              Cancel request
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor={reasonId} required counter={{ value: reason.length, max: limits.rejectReason.max }}>
          <TextArea id={reasonId} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={limits.rejectReason.max} />
        </Field>
        <InlineError error={doCancel.error} />
      </Dialog>
    </div>
  );
}

interface Step {
  key: string;
  title: string;
  state: 'done' | 'current' | 'frozen' | 'stopped' | 'skipped';
  who: string;
  at: string | null;
  body: ReactNode;
}

function VoyageStep({ step, last }: { step: Step; last: boolean }) {
  const icon =
    step.state === 'done' ? <Check className="size-3.5" /> : step.state === 'stopped' ? <X className="size-3.5" /> : step.state === 'frozen' ? <Snowflake className="size-3.5" /> : null;
  const tone =
    step.state === 'done'
      ? 'bg-accent-9 text-accent-contrast'
      : step.state === 'current'
        ? 'border-2 border-accent-9 bg-surface'
        : step.state === 'frozen'
          ? 'bg-[var(--pcg-plaque)] text-[var(--pcg-ice-ink)] ring-1 ring-[var(--pcg-ice-ink)]'
          : step.state === 'stopped'
            ? 'bg-bad-solid text-bad-contrast'
            : 'border border-line-strong bg-surface';
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-4 pb-6" data-testid="voyage-step" data-state={step.state}>
      {!last && <span aria-hidden="true" className={cx('absolute left-[13px] top-7 bottom-0 w-0.5', step.state === 'done' ? 'bg-accent-9' : 'bg-line')} />}
      <span className={cx('relative z-[1] mt-0.5 grid size-7 place-items-center rounded-full', tone)} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className={cx('m-0 text-base font-semibold', step.state === 'skipped' && 'text-muted')}>{step.title}</h3>
          {step.at && <span className="font-mono text-xs text-muted">{formatDateTime(step.at)}</span>}
        </div>
        {step.who && <div className="mt-0.5 text-ui text-muted">{step.who}</div>}
        {step.state === 'current' && <Badge tone="brand" className="mt-1">Next gate</Badge>}
        {step.body && <div className="mt-2 text-sm">{step.body}</div>}
      </div>
    </li>
  );
}
