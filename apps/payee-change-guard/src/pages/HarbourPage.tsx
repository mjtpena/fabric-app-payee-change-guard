/**
 * Harbour office (admins): the payment-run calendar that freezes the gates, the supplier master, and who holds
 * which key.
 */
import { useId, useMemo, useState } from 'react';
import { CalendarClock, Landmark, Pencil, Plus, Snowflake, Trash2 } from 'lucide-react';

import { formatDate, toLocalInput, fromLocalInput, useAction } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorPanel,
  Field,
  IconButton,
  InlineError,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  Table,
  TableWrap,
  Tabs,
  Td,
  Th,
  Tr,
} from '@x10/shared/ui';

import { Country, Masked, Money } from '../components/bits';
import { useWorld } from '../components/useWorld';
import { COUNTRIES, rules } from '../config';
import { addRun, createSupplier, grantRole, removeRun, revokeRole, updateSupplier, type SupplierInput } from '../domain/admin';
import { freezeWindow } from '../domain/freeze';
import { formatExact } from '../domain/gates';
import { trustedRoles, type World } from '../domain/requests';
import type { PayGroup, RunScope, Schema, StaffRoleName, Supplier } from '../model';

type Tab = 'runs' | 'suppliers' | 'keys';

export function HarbourPage() {
  const { state, world, me } = useWorld();
  const [tab, setTab] = useState<Tab>('runs');
  if (!me.isAdmin) {
    return (
      <EmptyState icon={<Landmark />} title="The harbour office is for admins">
        Admins keep the supplier master, the payment-run calendar and the keys.
      </EmptyState>
    );
  }
  if (state.error && !world) return <ErrorPanel error={state.error} onRetry={() => void state.reload()} />;
  if (!world) return <LoadingBlock rows={8} />;
  return (
    <>
      <PageHeader title="Harbour office" />
      <Tabs<Tab>
        label="Harbour office"
        value={tab}
        onChange={setTab}
        className="mb-6"
        tabs={[
          { value: 'runs', label: 'Payment runs', count: world.runs.filter((r) => Date.parse(r.runDate) > Date.now()).length },
          { value: 'suppliers', label: 'Supplier master', count: world.suppliers.length },
          { value: 'keys', label: 'Keys', count: trustedRoles(world.roles, world.people).length },
        ]}
      />
      {tab === 'runs' && <Runs world={world} reload={state.reload} />}
      {tab === 'suppliers' && <Suppliers world={world} reload={state.reload} />}
      {tab === 'keys' && <Keys world={world} reload={state.reload} />}
    </>
  );
}

/* ------------------------------------------------------------------ payment runs */

const SCOPE_LABEL: Record<RunScope, string> = { all: 'All suppliers', domestic: 'Domestic', international: 'International' };

function Runs({ world, reload }: { world: World; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const now = Date.now();
  const [past, setPast] = useState(false);
  const [adding, setAdding] = useState(false);
  const runs = world.runs
    .filter((r) => (past ? Date.parse(r.runDate) <= now : Date.parse(r.runDate) > now))
    .sort((a, b) => (past ? b.runDate.localeCompare(a.runDate) : a.runDate.localeCompare(b.runDate)));
  const remove = useAction(async (id: string) => {
    await removeRun(store, me, id);
    await reload();
  });
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Checkbox label="Show past runs" checked={past} onChange={setPast} />
        <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
          Schedule a run
        </Button>
      </div>
      <TableWrap label="Payment runs">
        <Table data-testid="runs-table">
          <thead>
            <tr>
              <Th>Run</Th>
              <Th>Pays</Th>
              <Th>Freeze window</Th>
              <Th>State</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const w = freezeWindow(r);
              const frozen = w.start <= now && now < w.end;
              return (
                <Tr key={r.id}>
                  <Td>
                    <span className="block font-medium">{r.label}</span>
                    <span className="font-mono text-xs text-muted">{formatExact(r.runDate)}</span>
                  </Td>
                  <Td muted>{SCOPE_LABEL[r.payGroup]}</Td>
                  <Td muted className="text-xs">
                    {formatExact(new Date(w.start).toISOString())} → run · <span className="num">{r.freezeHours} h</span>
                  </Td>
                  <Td>
                    {Date.parse(r.runDate) <= now ? (
                      <Badge tone="neutral">Run</Badge>
                    ) : frozen ? (
                      <span className="inline-flex items-center gap-1.5 text-ui font-medium text-[var(--pcg-ice-ink)]">
                        <Snowflake className="size-3.5" aria-hidden="true" /> Freezing gates now
                      </span>
                    ) : (
                      <Badge tone="info">Scheduled</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    {Date.parse(r.runDate) > now && r.createdBy === me.sub && (
                      <IconButton size="sm" label={`Remove ${r.label}`} icon={<Trash2 />} onClick={() => void remove.run(r.id)} />
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
      <InlineError error={remove.error} />
      <AddRun open={adding} onClose={() => setAdding(false)} reload={reload} />
    </section>
  );
}

function AddRun({ open, onClose, reload }: { open: boolean; onClose: () => void; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const ids = { date: useId(), label: useId(), group: useId(), hours: useId() };
  const [date, setDate] = useState(() => toLocalInput(new Date(Date.now() + 5 * 86_400_000).toISOString()));
  const [label, setLabel] = useState('Off-cycle run');
  const [group, setGroup] = useState<RunScope>('all');
  const [hours, setHours] = useState(String(rules.FREEZE_HOURS));
  const save = useAction(async () => {
    await addRun(store, me, { runDate: fromLocalInput(date) ?? '', label, payGroup: group, freezeHours: Number(hours) });
    await reload();
    onClose();
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Schedule a payment run"
      description="Approvals and releases for its suppliers freeze before it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={save.pending} onClick={() => void save.run()}>
            Schedule
          </Button>
        </>
      }
    >
      <Field label="Run date and time" htmlFor={ids.date} required>
        <Input id={ids.date} type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Label" htmlFor={ids.label} required>
        <Input id={ids.label} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pays" htmlFor={ids.group}>
          <Select id={ids.group} value={group} onChange={(e) => setGroup(e.target.value as RunScope)}>
            {(['all', 'domestic', 'international'] as RunScope[]).map((g) => (
              <option key={g} value={g}>
                {SCOPE_LABEL[g]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Freeze hours" htmlFor={ids.hours}>
          <Input id={ids.hours} type="number" min={0} max={168} value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      </div>
      <InlineError error={save.error} />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ supplier master */

function Suppliers({ world, reload }: { world: World; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <section>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
          Add supplier
        </Button>
      </div>
      <TableWrap label="Supplier master">
        <Table density="compact">
          <thead>
            <tr>
              <Th>Supplier</Th>
              <Th>Account</Th>
              <Th>Phone on file</Th>
              <Th numeric>Annual spend</Th>
              <Th>Pays in</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {world.suppliers.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <span className="block font-medium">{s.name}</span>
                  <span className="font-mono text-xs text-muted">
                    {s.supplierNo} · {s.country}
                    {s.status === 'blocked' && <span className="ml-2 font-sans text-bad-text">Blocked</span>}
                  </span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <Masked value={s.currentAccountMasked} /> <Country code={s.currentBankCountry} />
                  </span>
                </Td>
                <Td>
                  <span className="block font-mono text-ui">{s.phoneOnFile}</span>
                  <span className="text-xs text-muted">since {formatDate(s.phoneOnFileSince)}</span>
                </Td>
                <Td numeric>
                  <Money value={s.annualSpend} />
                </Td>
                <Td muted>{s.payGroup === 'domestic' ? 'Domestic' : 'International'}</Td>
                <Td className="text-right">
                  <IconButton size="sm" label={`Edit ${s.name}`} icon={<Pencil />} onClick={() => setEditing(s)} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      {editing && <SupplierDialog supplier={editing} onClose={() => setEditing(null)} reload={reload} />}
      {adding && <SupplierDialog supplier={null} onClose={() => setAdding(false)} reload={reload} />}
    </section>
  );
}

function SupplierDialog({ supplier, onClose, reload }: { supplier: Supplier | null; onClose: () => void; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const ids = { name: useId(), no: useId(), phone: useId(), country: useId(), spend: useId(), group: useId(), status: useId(), account: useId(), bank: useId() };
  const [f, setF] = useState<SupplierInput & { status: Supplier['status']; account: string; bankCountry: string }>({
    name: supplier?.name ?? '',
    supplierNo: supplier?.supplierNo ?? '',
    phoneOnFile: supplier?.phoneOnFile ?? '',
    country: supplier?.country ?? 'GB',
    annualSpend: supplier?.annualSpend ?? null,
    payGroup: supplier?.payGroup ?? 'domestic',
    status: supplier?.status ?? 'active',
    account: '',
    bankCountry: 'GB',
  });
  const save = useAction(async () => {
    if (supplier) {
      await updateSupplier(store, me, supplier.id, {
        name: f.name,
        phoneOnFile: f.phoneOnFile,
        country: f.country,
        annualSpend: f.annualSpend,
        payGroup: f.payGroup,
        status: f.status,
      });
    } else {
      await createSupplier(store, me, f);
    }
    await reload();
    onClose();
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={supplier ? `Edit ${supplier.name}` : 'Add a supplier'}
      description={supplier ? 'Bank details change only through the locks.' : 'The account is stored masked with a SHA-256 fingerprint.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={save.pending} onClick={() => void save.run()}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Name" htmlFor={ids.name} required>
        <Input id={ids.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={150} />
      </Field>
      {!supplier && (
        <Field label="Supplier number" htmlFor={ids.no} required>
          <Input id={ids.no} value={f.supplierNo} onChange={(e) => setF({ ...f, supplierNo: e.target.value })} maxLength={20} />
        </Field>
      )}
      <Field label="Phone on file" htmlFor={ids.phone} required hint={supplier ? 'Changing it raises the “phone changed” flag for 30 days.' : undefined}>
        <Input id={ids.phone} type="tel" className="font-mono" value={f.phoneOnFile} onChange={(e) => setF({ ...f, phoneOnFile: e.target.value })} maxLength={40} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Country" htmlFor={ids.country}>
          <Select id={ids.country} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Annual spend" htmlFor={ids.spend}>
          <Input id={ids.spend} type="number" min={0} value={f.annualSpend ?? ''} onChange={(e) => setF({ ...f, annualSpend: e.target.value === '' ? null : Number(e.target.value) })} />
        </Field>
        <Field label="Pays in" htmlFor={ids.group}>
          <Select id={ids.group} value={f.payGroup} onChange={(e) => setF({ ...f, payGroup: e.target.value as PayGroup })}>
            <option value="domestic">Domestic runs</option>
            <option value="international">International runs</option>
          </Select>
        </Field>
        {supplier && (
          <Field label="Status" htmlFor={ids.status}>
            <Select id={ids.status} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Supplier['status'] })}>
              <option value="active">Active</option>
              <option value="blocked">Blocked</option>
            </Select>
          </Field>
        )}
      </div>
      {!supplier && (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <Field label="Account number or IBAN" htmlFor={ids.account} required>
            <Input id={ids.account} className="font-mono" autoComplete="off" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} />
          </Field>
          <Field label="Bank country" htmlFor={ids.bank}>
            <Select id={ids.bank} value={f.bankCountry} onChange={(e) => setF({ ...f, bankCountry: e.target.value })}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <InlineError error={save.error} />
    </Dialog>
  );
}

/* ------------------------------------------------------------------ keys */

function Keys({ world, reload }: { world: World; reload: () => Promise<void> }) {
  const { store, me } = useApp<Schema>();
  const trusted = useMemo(() => trustedRoles(world.roles, world.people), [world]);
  const toggle = useAction(async (sub: string, displayName: string, role: StaffRoleName, on: boolean) => {
    if (on) await grantRole(store, me, { sub, displayName }, role);
    else {
      const row = trusted.find((r) => r.personSub === sub && r.role === role);
      if (row) await revokeRole(store, me, row.id);
    }
    await reload();
  });
  return (
    <section>
      <TableWrap label="Keys">
        <Table>
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>AP clerk</Th>
              <Th>Approver (second key)</Th>
              <Th>Admin</Th>
            </tr>
          </thead>
          <tbody>
            {world.people.map((p) => {
              const has = (role: StaffRoleName) => trusted.some((r) => r.personSub === p.sub && r.role === role);
              return (
                <Tr key={p.id}>
                  <Td className="font-medium">{p.displayName}</Td>
                  {(['clerk', 'approver'] as StaffRoleName[]).map((role) => (
                    <Td key={role}>
                      <Checkbox label={<span className="sr-only">{`${role === 'clerk' ? 'AP clerk' : 'Approver'}: ${p.displayName}`}</span>} checked={has(role)} onChange={(v) => void toggle.run(p.sub, p.displayName, role, v)} />
                    </Td>
                  ))}
                  <Td>{p.isAdmin ? <Badge tone="brand">Admin</Badge> : <span className="text-muted">—</span>}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
      <p className="mt-3 flex items-center gap-1.5 text-ui text-muted">
        <CalendarClock className="size-3.5" aria-hidden="true" /> Admins also hold the second key. Admin rights are set in the database by the deployer.
      </p>
      <InlineError error={toggle.error} />
    </section>
  );
}
