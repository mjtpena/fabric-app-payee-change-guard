/**
 * Lock keeper: raise a bank-detail change. The account number is masked as you type and only its masked form and a
 * SHA-256 fingerprint leave the browser. Red flags hoist on the preview boat as the details come in.
 */
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Fingerprint, ShieldCheck } from 'lucide-react';

import { formatDate, useAction } from '@x10/shared/lib';
import { Button, Callout, Checkbox, ErrorPanel, Field, InlineError, Input, PageHeader, Select, SegmentedControl, Skeleton, TextArea } from '@x10/shared/ui';

import { BoatShape } from '../canal/Boat';
import { Country, Eyebrow, Facts, FlagList, Masked, Money } from '../components/bits';
import { SupplierPicker } from '../components/SupplierPicker';
import { useWorld } from '../components/useWorld';
import { COUNTRIES, countryName, rules } from '../config';
import { hashAccount, maskAccount, validateAccount } from '../domain/account';
import { CHANNEL_LABEL, FLAG_GROUPS } from '../domain/canal';
import { needsOverride } from '../domain/flags';
import { isOpen } from '../domain/gates';
import { createRequest, nextRef, previewFlags, validateNewRequest, type NewRequestInput } from '../domain/requests';
import { CHANNELS, limits, type Channel } from '../model';

const EMPTY: NewRequestInput = { supplierId: '', account: '', newBankCountry: '', channel: 'email', sourceRef: '', reason: '', urgencyClaimed: false };

export function KeeperPage() {
  const { state, world, me, store } = useWorld(false);
  const navigate = useNavigate();
  const [form, setForm] = useState<NewRequestInput>(EMPTY);
  const [touched, setTouched] = useState(false);
  const ids = { supplier: useId(), account: useId(), country: useId(), source: useId(), reason: useId() };
  const set = <K extends keyof NewRequestInput>(k: K, v: NewRequestInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const supplier = world?.suppliers.find((s) => s.id === form.supplierId) ?? null;
  const accountOk = !validateAccount(form.account);
  const hash = useMemo(() => (accountOk ? hashAccount(form.account) : ''), [accountOk, form.account]);
  const now = useMemo(() => new Date(), []);
  const flags = useMemo(() => (world && supplier ? previewFlags(world, { ...form, accountHash: hash }, now) : []), [world, supplier, form, hash, now]);
  const errors = validateNewRequest(form);
  const open = world && supplier ? world.requests.find((r) => r.supplierId === supplier.id && isOpen(r.status)) : null;
  const sameAsFile = !!supplier && !!hash && hash === supplier.currentAccountHash;

  const save = useAction(async () => {
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    const created = await createRequest(store, me, form, new Date());
    // The typed number is dropped from memory with the form.
    setForm(EMPTY);
    navigate('/', { state: { focus: created.id } });
  });

  if (state.error && !world) return <ErrorPanel error={state.error} onRetry={() => void state.reload()} />;

  const err = (k: keyof NewRequestInput) => (touched ? errors[k] : undefined);
  const hullColor = flags.length >= 4 ? 'var(--bad-solid)' : flags.length >= 2 ? 'var(--warn-solid)' : flags.length === 1 ? 'var(--info-solid)' : 'var(--blue-9)';

  return (
    <div className="pb-24 md:pb-0">
      <PageHeader eyebrow={<Link to="/" className="text-ui text-muted hover:text-fg">Canal</Link>} title="Lock keeper" subtitle="Put a bank-detail change into the first lock." />
      <form
        className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
        noValidate
      >
        <div className="min-w-0">
          <section className="border-t border-line pt-5 pb-6">
            <Eyebrow>Supplier</Eyebrow>
            <Field label="Supplier" htmlFor={ids.supplier} error={err('supplierId')} required>
              {world ? (
                <SupplierPicker suppliers={world.suppliers} value={form.supplierId} onChange={(id) => set('supplierId', id)} invalid={!!err('supplierId')} inputId={ids.supplier} />
              ) : (
                <Skeleton height={32} />
              )}
            </Field>
            {supplier && (
              <div className="mt-3">
                <Facts
                  rows={[
                    ['Account on file', <span key="a" className="flex items-center gap-2"><Masked value={supplier.currentAccountMasked} /> <Country code={supplier.currentBankCountry} /></span>],
                    ['Based in', countryName(supplier.country)],
                    ['Phone on file', <span key="p" className="font-mono text-ui">{supplier.phoneOnFile} <span className="font-sans text-muted">since {formatDate(supplier.phoneOnFileSince)}</span></span>],
                    ['Annual spend', <Money key="s" value={supplier.annualSpend} />],
                    ['Pay group', supplier.payGroup === 'domestic' ? 'Domestic runs' : 'International runs'],
                  ]}
                />
                {open && (
                  <Callout tone="warn" className="mt-3" title={`${open.ref} is already in the locks`} action={<Link to={`/requests/${open.id}`} className="text-ui font-medium text-brand-text">Open its voyage log</Link>}>
                    Finish or cancel it before raising another change for {supplier.name}.
                  </Callout>
                )}
                {supplier.status === 'blocked' && (
                  <Callout tone="bad" className="mt-3" title="Blocked in the master">
                    An admin must unblock {supplier.name} before its bank details can change.
                  </Callout>
                )}
              </div>
            )}
          </section>

          <section className="border-t border-line pt-5 pb-6">
            <Eyebrow>New bank details</Eyebrow>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <Field
                label="New account number or IBAN"
                htmlFor={ids.account}
                error={err('account') ?? (sameAsFile ? 'That is the account already on file.' : undefined)}
                required
                hint={
                  accountOk ? (
                    <span className="inline-flex items-center gap-1.5" data-testid="mask-preview">
                      <Fingerprint className="size-3.5" aria-hidden="true" /> Saved only as <Masked value={maskAccount(form.account)} className="text-fg" /> and SHA-256{' '}
                      <span className="font-mono">{hash.slice(0, 8)}…</span>
                    </span>
                  ) : (
                    'Saved only masked, with a SHA-256 fingerprint. The full number is never stored.'
                  )
                }
              >
                <Input
                  id={ids.account}
                  value={form.account}
                  onChange={(e) => set('account', e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="text"
                  className="font-mono tracking-wide"
                  invalid={!!err('account') || sameAsFile}
                  placeholder="e.g. GB00 0000 0000 0000 0000 00"
                  maxLength={48}
                />
              </Field>
              <Field label="Bank country" htmlFor={ids.country} error={err('newBankCountry')} required>
                <Select id={ids.country} value={form.newBankCountry} onChange={(e) => set('newBankCountry', e.target.value)} invalid={!!err('newBankCountry')}>
                  <option value="">Choose…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section className="border-t border-line pt-5 pb-6">
            <Eyebrow>Where the request came from</Eyebrow>
            <div className="grid gap-4">
              <div>
                <span className="mb-1.5 block text-ui font-medium text-fg">Channel</span>
                <SegmentedControl<Channel>
                  label="Channel"
                  value={form.channel}
                  onChange={(v) => set('channel', v)}
                  options={CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] === 'Supplier portal' ? 'Portal' : CHANNEL_LABEL[c] }))}
                  className="flex-wrap"
                />
              </div>
              <Field label="Source document" htmlFor={ids.source} error={err('sourceRef')} required hint="The email, letter or form reference, so the approver can find it." counter={{ value: form.sourceRef.length, max: limits.sourceRef.max }}>
                <Input id={ids.source} value={form.sourceRef} onChange={(e) => set('sourceRef', e.target.value)} invalid={!!err('sourceRef')} maxLength={limits.sourceRef.max} />
              </Field>
              <Field label="Reason given" htmlFor={ids.reason} error={err('reason')} required counter={{ value: form.reason.length, max: limits.reason.max }}>
                <TextArea id={ids.reason} rows={3} value={form.reason} onChange={(e) => set('reason', e.target.value)} invalid={!!err('reason')} maxLength={limits.reason.max} />
              </Field>
              <Checkbox label="The request presses for urgency" description="“Pay the new account today”, “the old account is frozen”, threats of late fees." checked={form.urgencyClaimed} onChange={(v) => set('urgencyClaimed', v)} />
            </div>
          </section>

          <div className="fixed inset-x-0 bottom-[var(--x-bottom-inset,0px)] z-10 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" size="lg" busy={save.pending} disabled={!!open || supplier?.status === 'blocked' || sameAsFile} className="w-full md:w-auto">
                Put it in the water
              </Button>
              <span className="hidden text-ui text-muted md:inline">Someone else makes the call-back; a third person turns the second key.</span>
            </div>
            <InlineError error={save.error} />
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start" aria-label="Preview">
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <svg viewBox="-150 -104 300 150" className="block w-full" role="img" aria-label={`Preview: ${flags.length} red ${flags.length === 1 ? 'flag' : 'flags'}`} data-testid="preview-boat">
              <defs>
                <linearGradient id="pcg-prev-sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--world-sky)" />
                  <stop offset="1" stopColor="var(--world-sky-2)" />
                </linearGradient>
                <linearGradient id="pcg-prev-water" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--pcg-water-top)" />
                  <stop offset="1" stopColor="var(--pcg-water-deep)" />
                </linearGradient>
              </defs>
              <rect x={-150} y={-104} width={300} height={150} fill="url(#pcg-prev-sky)" />
              <rect x={-150} y={-30} width={300} height={22} fill="var(--pcg-grass)" />
              <rect x={-150} y={0} width={300} height={48} fill="url(#pcg-prev-water)" />
              <g transform="scale(1.6)">
                <BoatShape len={62} hull={hullColor} flags={flags} animate />
              </g>
              <rect x={-150} y={1} width={300} height={48} fill="var(--pcg-water-front)" />
              <text x={-138} y={-88} className="x-legend-label" style={{ fontSize: 9 }} fill="var(--world-ink-muted)">
                {world ? nextRef(world.requests) : 'PCR-····'} · REQUEST CHAMBER
              </text>
            </svg>
            <div className="border-t border-line p-4">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <span className="text-base font-semibold" data-testid="flag-count">
                  {flags.length === 0 ? 'No red flags yet' : `${flags.length} red ${flags.length === 1 ? 'flag' : 'flags'}`}
                </span>
                <span className="text-xs text-muted">{FLAG_GROUPS.find((g) => g.key === (flags.length === 0 ? '0' : flags.length === 1 ? '1' : flags.length < 4 ? '2' : '4'))?.label}</span>
              </div>
              <FlagList flags={flags} empty={supplier ? 'Flags appear here as the details come in.' : 'Choose a supplier to start.'} testId="keeper-flags" />
              {needsOverride(flags) && (
                <p className="m-0 mt-3 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-ui text-warn-text" data-testid="override-note">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {rules.OVERRIDE_FLAGS} or more flags: the approver must write an override reason to let this through.
                </p>
              )}
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}
