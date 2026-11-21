/**
 * Ledger: every supplier's bank-detail history, and the CSV export (masked accounts only).
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookText, Download } from 'lucide-react';

import { downloadText, formatDate, formatRelative } from '@x10/shared/lib';
import {
  Button,
  EmptyState,
  ErrorPanel,
  LinkButton,
  LoadingBlock,
  PageHeader,
  SearchInput,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@x10/shared/ui';

import { Country, Eyebrow, Facts, FlagCount, Masked, Money, StatusBadge } from '../components/bits';
import { useWorld } from '../components/useWorld';
import { countryName } from '../config';
import { CHANNEL_LABEL } from '../domain/canal';
import { flagsForRequest } from '../domain/flags';
import { ledgerCsv, supplierLedgers } from '../domain/ledger';
import { nameOf } from '../domain/requests';

export function LedgerPage() {
  const { state, world } = useWorld();
  const [q, setQ] = useState('');
  const ledgers = useMemo(() => (world ? supplierLedgers(world) : []), [world]);
  if (state.error && !world) return <ErrorPanel error={state.error} onRetry={() => void state.reload()} />;
  if (!world) return <LoadingBlock rows={10} />;
  const t = q.trim().toLowerCase();
  const rows = ledgers.filter((l) => !t || l.supplier.name.toLowerCase().includes(t) || l.supplier.supplierNo.toLowerCase().includes(t));
  const released = world.requests.filter((r) => r.status === 'released').length;
  const rejected = world.requests.filter((r) => r.status === 'rejected').length;
  return (
    <>
      <PageHeader
        title="Ledger"
        subtitle="Masked accounts only: full numbers are never stored."
        actions={
          <Button icon={<Download />} onClick={() => downloadText('payee-change-ledger.csv', ledgerCsv(world))} data-testid="export-all">
            Export CSV
          </Button>
        }
      />
      <StatStrip className="mb-6" columns={4}>
        <Stat label="Suppliers" value={world.suppliers.length} />
        <Stat label="Change requests" value={world.requests.length} />
        <Stat label="Released" value={released} />
        <Stat label="Rejected" value={rejected} tone={rejected ? 'bad' : undefined} hint="denied call-backs and second-key rejections" />
      </StatStrip>
      <div className="mb-3 max-w-sm">
        <SearchInput value={q} onChange={setQ} label="Find a supplier" placeholder="Name or supplier number" />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<BookText />} title="No supplier matches">
          Try part of the name or the supplier number.
        </EmptyState>
      ) : (
        <TableWrap label="Suppliers">
          <Table data-testid="ledger-table">
            <thead>
              <tr>
                <Th>Supplier</Th>
                <Th>Account on file</Th>
                <Th>Phone on file since</Th>
                <Th numeric>Changes</Th>
                <Th>Last change</Th>
                <Th>Open</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <Tr key={l.supplier.id} data-testid="ledger-row">
                  <Td>
                    <Link to={`/ledger/${l.supplier.id}`} className="block font-medium text-fg">
                      {l.supplier.name}
                    </Link>
                    <span className="font-mono text-xs text-muted">
                      {l.supplier.supplierNo}
                      {l.supplier.status === 'blocked' && <span className="ml-2 font-sans text-bad-text">Blocked</span>}
                    </span>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap">
                      <Masked value={l.supplier.currentAccountMasked} /> <Country code={l.supplier.currentBankCountry} />
                    </span>
                  </Td>
                  <Td muted className="whitespace-nowrap">
                    {formatDate(l.supplier.phoneOnFileSince)}
                  </Td>
                  <Td numeric>{l.requests.length}</Td>
                  <Td>
                    {l.requests[0] ? (
                      <span className="flex flex-col gap-0.5">
                        <StatusBadge status={l.requests[0].status} />
                        <span className="text-xs text-muted">{formatRelative(l.requests[0].requestedAt)}</span>
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    {l.open ? (
                      <Link to={`/requests/${l.open.id}`} className="font-mono text-xs text-brand-text">
                        {l.open.ref}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}

export function SupplierLedgerPage() {
  const { id } = useParams();
  const { state, world } = useWorld();
  if (state.error && !world) return <ErrorPanel error={state.error} onRetry={() => void state.reload()} />;
  if (!world) return <LoadingBlock rows={8} />;
  const ledger = supplierLedgers(world).find((l) => l.supplier.id === id);
  if (!ledger) {
    return (
      <EmptyState icon={<BookText />} title="No such supplier" action={<LinkButton to="/ledger">Back to the ledger</LinkButton>}>
        It may have been removed from the master.
      </EmptyState>
    );
  }
  const s = ledger.supplier;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/ledger" className="text-ui text-muted hover:text-fg">
            Ledger
          </Link>
        }
        title={s.name}
        meta={
          <>
            <span className="font-mono text-xs">{s.supplierNo}</span>
            <span>{countryName(s.country)}</span>
            <span>{s.payGroup === 'domestic' ? 'Domestic runs' : 'International runs'}</span>
            {s.status === 'blocked' && <span className="text-bad-text">Blocked</span>}
          </>
        }
        actions={
          <Button icon={<Download />} onClick={() => downloadText(`${s.supplierNo}-ledger.csv`, ledgerCsv(world, s.id))}>
            Export CSV
          </Button>
        }
      />
      <div className="grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section>
          <Eyebrow>On file</Eyebrow>
          <Facts
            rows={[
              ['Account', <span key="a" className="flex items-center gap-2"><Masked value={s.currentAccountMasked} /> <Country code={s.currentBankCountry} /></span>],
              ['Phone', <span key="p" className="font-mono text-ui">{s.phoneOnFile}</span>],
              ['Phone since', formatDate(s.phoneOnFileSince)],
              ['Annual spend', <Money key="m" value={s.annualSpend} />],
              ['Custodian', nameOf(world, s.custodianSub)],
            ]}
          />
        </section>
        <section className="min-w-0">
          <Eyebrow>Changes</Eyebrow>
          {ledger.requests.length === 0 ? (
            <EmptyState compact title="No changes yet">
              The bank details on file have not changed in this app.
            </EmptyState>
          ) : (
            <TableWrap label={`Changes for ${s.name}`}>
              <Table>
                <thead>
                  <tr>
                    <Th>Change</Th>
                    <Th>New account</Th>
                    <Th>Gate</Th>
                    <Th>Flags</Th>
                    <Th>People</Th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.requests.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <Link to={`/requests/${r.id}`} className="block font-mono text-ui font-medium text-brand-text">
                          {r.ref}
                        </Link>
                        <span className="text-xs text-muted">
                          {formatDate(r.requestedAt)} · {CHANNEL_LABEL[r.channel]}
                        </span>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <Masked value={r.newAccountMasked} /> <Country code={r.newBankCountry} />
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={r.status} />
                      </Td>
                      <Td>
                        <FlagCount flags={flagsForRequest(r, world)} />
                      </Td>
                      <Td muted className="text-xs">
                        {nameOf(world, r.requestedBy)}
                        {r.verifiedBy && ` → ${nameOf(world, r.verifiedBy)}`}
                        {r.approvedBy && ` → ${nameOf(world, r.approvedBy)}`}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </section>
      </div>
    </>
  );
}
