/**
 * Call-back: phone the supplier on the number already on file (never a number from the request) and record what
 * they said. Only a confirmed call on the number on file, by someone other than the requester, opens the gate.
 */
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Check, PhoneCall, PhoneOff, X } from 'lucide-react';

import { daysBetween, formatDate, formatDateTime, formatRelative, useAction } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import { Button, Callout, EmptyState, ErrorPanel, Field, InlineError, Input, LoadingBlock, SegmentedControl, TextArea, cx } from '@x10/shared/ui';

import { Country, Eyebrow, Facts, FlagList, Masked, StatusBadge } from '../components/bits';
import { GateDesk } from '../components/GateDesk';
import { useWorld } from '../components/useWorld';
import { countryName, rules } from '../config';
import { buildCanal, CHANNEL_LABEL, type Boat } from '../domain/canal';
import { callbackResult, checkCallback, type Actor } from '../domain/gates';
import { samePhone } from '../domain/phone';
import { nameOf, recordCallback, validateCallback, type CallbackInput, type World } from '../domain/requests';
import type { Outcome, Schema } from '../model';

const OUTCOME_LABEL: Record<Outcome, string> = { confirmed: 'Confirmed', denied: 'Denied', no_answer: 'No answer' };

export function CallbackPage() {
  const { id } = useParams();
  const { state, world, actor, me } = useWorld();
  const data = useMemo(() => (world ? buildCanal(world, new Date()) : null), [world]);
  if (state.error && !world) return <ErrorPanel error={state.error} onRetry={() => void state.reload()} />;
  if (!data || !world) return <LoadingBlock rows={6} />;
  const waiting = data.boats.filter((b) => b.req.status === 'requested').sort((a, b) => b.ageHours - a.ageHours);
  const boat = id ? (data.boats.find((b) => b.id === id) ?? null) : (waiting.find((b) => b.req.requestedBy !== me.sub) ?? waiting[0] ?? null);
  return (
    <GateDesk title="Call-back" queueLabel="At the call-back gate" boats={waiting} base="/callback" selectedId={id} activeId={boat?.id} me={me.sub} empty="Every request has been called back.">
      {boat ? (
        <CallSheet key={boat.id} boat={boat} world={world} actor={actor} reload={state.reload} />
      ) : (
        <EmptyState icon={<PhoneCall />} title="No call-backs waiting">
          New requests appear here as soon as the Lock keeper puts them in the water.
        </EmptyState>
      )}
    </GateDesk>
  );
}

function CallSheet({ boat, world, actor, reload }: { boat: Boat; world: World; actor: Actor; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const r = boat.req;
  const s = boat.supplier!;
  const [form, setForm] = useState<CallbackInput>({ numberUsed: '', contactName: '', outcome: 'confirmed', note: '' });
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<{ message: string; effect: string } | null>(null);
  const ids = { number: useId(), contact: useId(), note: useId() };
  const gate = checkCallback(r, actor);
  const errors = validateCallback(form);
  const matches = form.numberUsed.trim().length >= 5 ? samePhone(form.numberUsed, s.phoneOnFile) : null;
  const preview = callbackResult(form, s);
  const phoneDays = daysBetween(s.phoneOnFileSince, new Date());
  const calls = world.callbacks.filter((c) => c.requestId === r.id).sort((a, b) => b.calledAt.localeCompare(a.calledAt));

  const save = useAction(async () => {
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    const res = await recordCallback(store, me, r.id, form, new Date());
    await reload();
    setDone({ message: res.result.message, effect: res.result.effect });
  });

  return (
    <article className="min-w-0" data-testid="call-sheet">
      <header className="mb-5">
        <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui text-muted">
          <span className="font-mono">{r.ref}</span>
          <StatusBadge status={r.status} />
          <span>Raised by {r.requestedBy === me.sub ? 'you' : boat.requester} {formatRelative(r.requestedAt)}</span>
        </div>
        <h2 className="m-0 text-2xl font-semibold">{s.name}</h2>
      </header>

      <section className="mb-6 rounded-xl border border-line bg-surface p-5" aria-labelledby="pcg-onfile">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 id="pcg-onfile" className="x-legend-label m-0 mb-1.5 text-muted">
              Call this number: on file
            </h3>
            <a href={`tel:${s.phoneOnFile.replace(/\s/g, '')}`} className="block font-mono text-3xl font-semibold tracking-tight text-fg no-underline num" data-testid="number-on-file">
              {s.phoneOnFile}
            </a>
            <p className="m-0 mt-1.5 text-ui text-muted">
              On file since {formatDate(s.phoneOnFileSince)} · {s.supplierNo} · {countryName(s.country)}
            </p>
          </div>
          <PhoneCall className="size-8 text-accent-9" aria-hidden="true" />
        </div>
        {phoneDays < rules.PHONE_CHANGE_DAYS && (
          <p className="m-0 mt-3 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-ui text-warn-text">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            This number changed {phoneDays} {phoneDays === 1 ? 'day' : 'days'} ago. Check with the admin who changed it before you rely on it.
          </p>
        )}
        <p className="m-0 mt-3 border-t border-line pt-3 text-ui text-muted">Never use a number from the email, letter or form that asked for the change.</p>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {done ? (
            <Callout
              tone={done.effect === 'verify' ? 'ok' : done.effect === 'reject' ? 'bad' : 'warn'}
              title={done.effect === 'verify' ? 'The call-back gate opens' : done.effect === 'reject' ? 'Rejected: to the dry dock' : 'Logged; the gate stays shut'}
              action={
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => navigate('/', { state: { focus: r.id } })} data-testid="see-on-canal">
                    See it on the canal
                  </Button>
                  <Button size="sm" onClick={() => navigate('/callback')}>
                    Next call-back
                  </Button>
                </span>
              }
            >
              <span data-testid="call-result">{done.message}</span>
            </Callout>
          ) : !gate.ok ? (
            <Callout tone={gate.code === 'sod_requester' ? 'bad' : 'info'} title={gate.code === 'sod_requester' ? 'Not your call to make' : 'Nothing to call'}>
              <span data-testid="call-blocked">{gate.reason}</span>
            </Callout>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save.run();
              }}
              noValidate
              data-testid="call-form"
            >
              <Eyebrow>Record the call</Eyebrow>
              <Field
                label="Number you dialled"
                htmlFor={ids.number}
                required
                error={touched ? errors.numberUsed : undefined}
                hint={
                  matches === null ? (
                    'Type the number exactly as you dialled it.'
                  ) : matches ? (
                    <span className="inline-flex items-center gap-1 text-ok-text" data-testid="number-match">
                      <Check className="size-3.5" aria-hidden="true" /> Matches the number on file
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-bad-text" data-testid="number-mismatch">
                      <X className="size-3.5" aria-hidden="true" /> Not the number on file: this call cannot open the gate
                    </span>
                  )
                }
              >
                <Input id={ids.number} type="tel" value={form.numberUsed} onChange={(e) => setForm({ ...form, numberUsed: e.target.value })} className="font-mono" invalid={matches === false} autoComplete="off" />
              </Field>
              <Field label="Who you spoke to" htmlFor={ids.contact} required error={touched ? errors.contactName : undefined}>
                <Input id={ids.contact} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Name and role" />
              </Field>
              <div className="mb-4">
                <span className="mb-1.5 block text-ui font-medium text-fg">What they said</span>
                <SegmentedControl<Outcome>
                  label="Outcome"
                  value={form.outcome}
                  onChange={(v) => setForm({ ...form, outcome: v })}
                  options={[
                    { value: 'confirmed', label: 'Confirmed the change', icon: <Check /> },
                    { value: 'denied', label: 'Denied it', icon: <X /> },
                    { value: 'no_answer', label: 'No answer', icon: <PhoneOff /> },
                  ]}
                />
              </div>
              <Field label="Note" htmlFor={ids.note} error={touched ? errors.note : undefined} counter={{ value: form.note.length, max: 600 }}>
                <TextArea id={ids.note} rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What they read back, anything odd" />
              </Field>
              <p className={cx('m-0 mb-3 text-ui', preview.effect === 'verify' ? 'text-ok-text' : preview.effect === 'reject' ? 'text-bad-text' : 'text-muted')} data-testid="call-effect">
                {form.numberUsed.trim().length >= 5 ? preview.message : 'Only a confirmed call on the number on file opens the gate. A denial rejects the request.'}
              </p>
              <Button type="submit" variant={form.outcome === 'denied' ? 'danger' : 'primary'} busy={save.pending} className="w-full sm:w-auto">
                Record the call
              </Button>
              <InlineError error={save.error} />
            </form>
          )}
        </div>

        <aside className="min-w-0">
          <Eyebrow>What they asked for</Eyebrow>
          <Facts
            rows={[
              ['New account', <span key="a" className="flex items-center gap-2"><Masked value={r.newAccountMasked} /> <Country code={r.newBankCountry} /></span>],
              ['On file now', <span key="o" className="flex items-center gap-2"><Masked value={s.currentAccountMasked} /> <Country code={s.currentBankCountry} /></span>],
              ['Channel', CHANNEL_LABEL[r.channel]],
              ['Source', r.sourceRef],
              ['Reason given', r.reason],
            ]}
          />
          <Eyebrow className="mt-6">Red flags</Eyebrow>
          <FlagList flags={boat.flags} />
          {calls.length > 0 && (
            <>
              <Eyebrow className="mt-6">Earlier calls</Eyebrow>
              <CallLog calls={calls} world={world} />
            </>
          )}
        </aside>
      </div>
      <p className="mt-8 text-ui text-muted">
        <Link to={`/requests/${r.id}`} className="text-brand-text">
          Voyage log for {r.ref}
        </Link>
      </p>
    </article>
  );
}

export function CallLog({ calls, world }: { calls: World['callbacks']; world: World }) {
  return (
    <ul className="m-0 list-none divide-y divide-[var(--line)] p-0" data-testid="call-log">
      {calls.map((c) => (
        <li key={c.id} className="py-2.5 first:pt-0" data-testid="call-log-item">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">
              {OUTCOME_LABEL[c.outcome]}
              {!c.numberMatchesFile && <span className="ml-2 text-xs font-normal text-bad-text">not the number on file</span>}
            </span>
            <span className="font-mono text-xs text-muted">{formatDateTime(c.calledAt)}</span>
          </div>
          <div className="mt-0.5 text-ui text-muted">
            {nameOf(world, c.calledBy)} called <span className="font-mono">{c.numberUsed}</span>, spoke to {c.contactName}
          </div>
          {c.note && <div className="mt-0.5 text-ui text-fg">{c.note}</div>}
        </li>
      ))}
    </ul>
  );
}
