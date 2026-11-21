/**
 * Home: the canal locks. Lenses re-paint the boats (keys 1-5), view as clerk or approver dims what is not yours to
 * act on (V), Today flies to what needs attention, L switches to the list of the same requests.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Anchor, ArrowRight, Clock, Keyboard, Mail, PhoneCall, RotateCcw, Search, Ship, Snowflake, Wallet } from 'lucide-react';

import { formatDate, formatRelative, useNow } from '@x10/shared/lib';
import {
  Badge,
  Button,
  Dialog,
  IconButton,
  Input,
  Kbd,
  Legend,
  LensBar,
  LinkButton,
  Spinner,
  StageMessage,
  StagePage,
  Table,
  TableWrap,
  Td,
  Th,
  TodayPanel,
  Tr,
  ViewAsSwitch,
  ViewToggle,
  useHotkeys,
  useIsDesktop,
  type LegendItem,
  type LensOption,
  type StageView,
  type TodayItem,
} from '@x10/shared/ui';

import { BoatGlyph } from '../canal/Boat';
import { CanalScene } from '../canal/CanalScene';
import { FlagCount, Pennant, StatusBadge } from '../components/bits';
import { useWorld } from '../components/useWorld';
import {
  buildCanal,
  CHANNEL_LABEL,
  defaultViewAs,
  groupKey,
  groupLabel,
  hullColor,
  isActionable,
  lensGroups,
  todayFor,
  type Boat,
  type CanalData,
  type CanalLens,
  type ViewAs,
} from '../domain/canal';
import { CHAMBERS, formatExact, nextStep } from '../domain/gates';

const LENSES: LensOption<CanalLens>[] = [
  { value: 'gate', label: 'Gate', swatch: 'conic-gradient(var(--blue-9) 0 25%, var(--accent-9) 0 50%, var(--teal-9) 0 75%, var(--ok-solid) 0)', description: 'Which gate each change has reached' },
  { value: 'flags', label: 'Flags', swatch: 'conic-gradient(var(--ok-solid) 0 25%, var(--info-solid) 0 50%, var(--warn-solid) 0 75%, var(--bad-solid) 0)', description: 'How many red flags each change flies' },
  { value: 'age', label: 'Age', swatch: 'linear-gradient(90deg, var(--accent-9), var(--amber-9), var(--bad-solid))', icon: undefined, description: 'How long since the request was raised' },
  { value: 'spend', label: 'Spend', swatch: 'linear-gradient(90deg, var(--gray-7), var(--accent-9), var(--accent-11))', description: 'The supplier’s annual spend' },
  { value: 'channel', label: 'Channel', swatch: 'conic-gradient(var(--coral-9) 0 20%, var(--gold-9) 0 40%, var(--indigo-9) 0 60%, var(--violet-9) 0 80%, var(--cyan-9) 0)', description: 'How the request arrived' },
];
const LENS_LABEL: Record<CanalLens, string> = { gate: 'Gate', flags: 'Flags', age: 'Age', spend: 'Spend', channel: 'Channel' };

const PREF_KEY = 'x10:payee-change-guard:canal';
function readPrefs(): { lens?: CanalLens; view?: StageView } {
  try {
    return JSON.parse(sessionStorage.getItem(PREF_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function legendFor(data: CanalData, lens: CanalLens): LegendItem[] {
  const items: LegendItem[] = lensGroups(lens)
    .map((g) => ({ label: g.label, color: g.color, shape: 'square' as const, value: data.boats.filter((b) => groupKey(b, lens) === g.key).length }))
    .filter((g) => g.value > 0 || lens === 'flags');
  items.push({ label: 'Pennant: a red flag', icon: <Pennant code="urgency" size={11} /> });
  if (data.boats.some((b) => b.freeze?.frozen)) items.push({ label: 'Ice: frozen by a payment run', icon: <Snowflake className="size-3 text-[var(--pcg-ice-ink)]" /> });
  if (data.boats.some((b) => b.issues.length)) items.push({ label: 'Leaking: trail mismatch', color: 'var(--bad-solid)', shape: 'dash' });
  if (lens === 'spend') items.push({ label: 'Longer boat: more spend', color: 'var(--gray-8)', shape: 'line' });
  return items;
}

export function CanalPage() {
  const { state, world, actor, me } = useWorld();
  const location = useLocation();
  const navigate = useNavigate();
  const nav = (location.state as { focus?: string } | null) ?? null;
  const now = useNow(30_000);
  const desktop = useIsDesktop();
  const prefs = useMemo(readPrefs, []);
  const [lens, setLens] = useState<CanalLens>(prefs.lens ?? 'gate');
  const [view, setView] = useState<StageView>(prefs.view ?? 'stage');
  const [viewAs, setViewAs] = useState<ViewAs | null>(null);
  const [focus, setFocus] = useState<string | null>(nav?.focus ?? null);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState('');
  const findRef = useRef<HTMLInputElement>(null);
  const role: ViewAs = viewAs ?? defaultViewAs(actor);

  useEffect(() => {
    try {
      sessionStorage.setItem(PREF_KEY, JSON.stringify({ lens, view }));
    } catch {
      /* preferences are a convenience */
    }
  }, [lens, view]);

  const data = useMemo(() => (world ? buildCanal(world, now) : null), [world, now]);
  const order = useMemo(() => {
    if (!data) return [] as string[];
    return [...data.boats].sort((a, b) => CHAMBERS.indexOf(a.chamber) - CHAMBERS.indexOf(b.chamber)).map((b) => b.id);
  }, [data]);
  const entries = useMemo(() => (data ? todayFor(data, role) : []), [data, role]);
  const today: TodayItem[] = entries.map((e) => ({ id: e.id, title: e.title, severity: e.severity, value: e.value, unit: e.unit, lens: LENS_LABEL[e.lens], meta: e.meta }));
  const focused = data?.boats.find((b) => b.id === focus) ?? null;

  const pick = (id: string) => setFocus((f) => (f === id ? null : id));
  const step = (dir: 1 | -1) => {
    if (!order.length) return;
    const i = focus ? order.indexOf(focus) : -1;
    setFocus(order[(i + dir + order.length) % order.length]);
  };
  const open = () => focused && navigate(`/requests/${focused.id}`);
  const fly = () => {
    const words = q.trim().toLowerCase();
    if (!words || !data) return;
    const hit = data.boats.find((b) => b.ref.toLowerCase().includes(words) || (b.supplier?.name ?? '').toLowerCase().includes(words));
    if (hit) {
      setFocus(hit.id);
      setView('stage');
    }
  };

  useHotkeys({
    'shift+?': () => setHelp(true),
    escape: () => setFocus(null),
    arrowright: () => step(1),
    arrowleft: () => step(-1),
    o: open,
    enter: open,
    n: () => navigate('/keeper'),
    '/': () => findRef.current?.focus(),
  });

  const viewAsSwitch = (
    <ViewAsSwitch<ViewAs>
      value={role}
      onChange={setViewAs}
      glass={!desktop}
      className={desktop ? 'bg-gray-3' : undefined}
      options={[
        { value: 'all', label: 'All' },
        { value: 'clerk', label: 'Clerk', icon: <PhoneCall /> },
        { value: 'approver', label: 'Approver', icon: <Wallet /> },
      ]}
    />
  );

  const inLocks = data ? data.boats.filter((b) => b.chamber === 'request' || b.chamber === 'callback' || b.chamber === 'approval').length : 0;
  const frozenGroup = data ? (data.freeze.domestic.frozen ? 'domestic' : data.freeze.international.frozen ? 'international' : null) : null;
  const meta = focused ? (
    <FocusMeta boat={focused} />
  ) : data ? (
    <span className="num">
      {inLocks} in the locks · {data.boats.filter((b) => b.chamber === 'basin').length} released · {data.boats.filter((b) => b.chamber === 'drydock').length} in dry dock
      {frozenGroup ? ` · ${frozenGroup} frozen` : ''}
    </span>
  ) : (
    <span>Filling the locks…</span>
  );

  const stage =
    state.error && !data ? (
      <StageMessage icon={<RotateCcw />} title="The canal did not load" action={<Button onClick={() => void state.reload()}>Retry</Button>}>
        {state.error.message}
      </StageMessage>
    ) : !data ? (
      <StageMessage icon={<Spinner small />} title="Filling the locks">
        Reading change requests, call-backs and the payment-run calendar.
      </StageMessage>
    ) : data.boats.length === 0 ? (
      <>
        <CanalScene data={data} lens={lens} focusId={null} onPick={pick} isDim={() => false} onKeeper={() => navigate('/keeper')} pan={!desktop} />
        <StageMessage icon={<Ship />} title="No boats in the locks" action={<LinkButton to="/keeper" variant="primary">Raise a change request</LinkButton>}>
          Every change to a supplier’s bank details enters here and rises through three gates.
        </StageMessage>
      </>
    ) : (
      <CanalScene data={data} lens={lens} focusId={focus} onPick={pick} isDim={(b) => !isActionable(b, role, actor)} onKeeper={() => navigate('/keeper')} pan={!desktop} />
    );

  return (
    <>
      <StagePage
        label="Canal locks"
        view={view}
        breadcrumb={focused ? [{ label: 'Canal', onClick: () => setFocus(null) }, { label: nextStep(focused.req.status) }] : undefined}
        title={focused ? (focused.supplier?.name ?? focused.ref) : 'The canal locks'}
        meta={meta}
        topRight={
          <>
            <form
              className="relative"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                fly();
              }}
            >
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-faint" />
              <label htmlFor="pcg-find" className="sr-only">
                Find a boat
              </label>
              <Input
                ref={findRef}
                id="pcg-find"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a boat…"
                list="pcg-find-list"
                className={view === 'stage' ? 'x-glass w-44 rounded-full! pl-8' : 'w-44 pl-8'}
              />
              <datalist id="pcg-find-list">
                {data?.boats.map((b) => <option key={b.id} value={b.supplier?.name ?? b.ref} />)}
              </datalist>
            </form>
            {desktop && <IconButton label="Keyboard shortcuts" icon={<Keyboard />} onClick={() => setHelp(true)} variant="ghost" className={view === 'stage' ? 'x-glass rounded-full!' : undefined} />}
            <ViewToggle value={view} onChange={setView} glass={view === 'stage'} stageLabel="Canal" listLabel="List" stageIcon={<Anchor />} />
          </>
        }
        lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} showLabel={false} />}
        legend={data && <Legend title={LENS_LABEL[lens]} items={legendFor(data, lens)} collapsible defaultOpen={desktop} />}
        bottomRight={desktop ? undefined : viewAsSwitch}
        side={
          <div>
            {desktop && <div className="mb-3 px-1">{viewAsSwitch}</div>}
            <TodayPanel
              bare
              items={today}
              date={formatDate(now.toISOString())}
              activeId={entries.find((e) => e.boatId === focus)?.id ?? null}
              empty={role === 'clerk' ? 'No call-backs waiting on you.' : role === 'approver' ? 'Nothing waits for the second key.' : 'Nothing in the locks needs attention.'}
              onSelect={(it) => {
                const e = entries.find((x) => x.id === it.id);
                if (!e) return;
                if (e.boatId) setFocus(e.boatId);
                setLens(e.lens);
                setView('stage');
              }}
            />
          </div>
        }
        sideCount={today.length}
        stage={stage}
        list={data ? <CanalList data={data} lens={lens} focus={focus} me={me.sub} /> : null}
      />
      <ShortcutSheet open={help} onClose={() => setHelp(false)} />
    </>
  );
}

function FocusMeta({ boat }: { boat: Boat }) {
  const r = boat.req;
  const action =
    r.status === 'requested'
      ? { to: `/callback/${r.id}`, label: 'Call back', icon: <PhoneCall /> }
      : r.status === 'verified'
        ? { to: `/second-key/${r.id}`, label: 'Second key', icon: <Wallet /> }
        : r.status === 'approved'
          ? { to: `/requests/${r.id}`, label: 'Release', icon: <ArrowRight /> }
          : null;
  return (
    <>
      <StatusBadge status={r.status} />
      <span className="font-mono text-xs">{r.ref}</span>
      <FlagCount flags={boat.flags} />
      {boat.freeze?.frozen && (
        <span className="inline-flex items-center gap-1 text-ui font-medium text-[var(--pcg-ice-ink)]" data-testid="focus-frozen">
          <Snowflake className="size-3.5" aria-hidden="true" /> until {formatExact(boat.freeze.until!)}
        </span>
      )}
      {boat.issues.length > 0 && <Badge tone="bad">Trail mismatch</Badge>}
      <span className="flex w-full flex-wrap gap-2 pt-1.5">
        {action && (
          <LinkButton to={action.to} size="sm" variant="primary" icon={action.icon} data-testid="focus-action">
            {action.label}
          </LinkButton>
        )}
        <LinkButton to={`/requests/${r.id}`} size="sm" data-testid="focus-open">
          Voyage log
        </LinkButton>
      </span>
    </>
  );
}

/* ------------------------------------------------------------------ list (same data) */

function CanalList({ data, lens, focus, me }: { data: CanalData; lens: CanalLens; focus: string | null; me: string }) {
  const rows = [...data.boats].sort(
    (a, b) => CHAMBERS.indexOf(a.chamber) - CHAMBERS.indexOf(b.chamber) || b.flags.length - a.flags.length || a.req.requestedAt.localeCompare(b.req.requestedAt),
  );
  return (
    <>
      <TableWrap label="Change requests">
        <Table data-testid="canal-list">
          <thead>
            <tr>
              <Th>Change</Th>
              {lens !== 'gate' && <Th>{LENS_LABEL[lens]}</Th>}
              <Th>Gate</Th>
              <Th>Flags</Th>
              <Th>Channel</Th>
              <Th>Raised by</Th>
              <Th numeric>In locks</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <Tr key={b.id} selected={b.id === focus} data-testid="canal-row" data-ref={b.ref}>
                <Td>
                  <span className="flex min-w-[240px] items-center gap-3">
                    <BoatGlyph hull={hullColor(b, lens)} flags={b.flags} frozen={!!b.freeze?.frozen} leaking={b.issues.length > 0} closed={b.req.status === 'rejected' ? 'rejected' : null} />
                    <span className="min-w-0">
                      <Link to={`/requests/${b.id}`} className="block font-medium text-fg">
                        {b.supplier?.name ?? 'Unknown supplier'}
                      </Link>
                      <span className="block font-mono text-xs text-muted">
                        {b.ref} · {b.req.newAccountMasked}
                      </span>
                    </span>
                  </span>
                </Td>
                {lens !== 'gate' && (
                  <Td>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ui font-medium">
                      <span aria-hidden="true" className="inline-block size-2 rounded-[3px]" style={{ background: hullColor(b, lens) }} />
                      {groupLabel(b, lens)}
                    </span>
                  </Td>
                )}
                <Td>
                  <span className="flex flex-col gap-0.5">
                    <StatusBadge status={b.req.status} />
                    {b.freeze?.frozen && <span className="text-xs text-[var(--pcg-ice-ink)]">Frozen until {formatExact(b.freeze.until!)}</span>}
                  </span>
                </Td>
                <Td>
                  <FlagCount flags={b.flags} />
                </Td>
                <Td muted>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    {b.req.channel === 'email' && <Mail className="size-3.5" aria-hidden="true" />}
                    {CHANNEL_LABEL[b.req.channel]}
                  </span>
                </Td>
                <Td muted>{b.req.requestedBy === me ? 'You' : b.requester}</Td>
                <Td numeric title={formatRelative(b.req.requestedAt)}>
                  {b.ageHours < 48 ? `${Math.round(b.ageHours)} h` : `${Math.round(b.ageHours / 24)} d`}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <p className="mt-3 flex items-center gap-1.5 text-ui text-muted">
        <Clock className="size-3.5" aria-hidden="true" />
        {data.archived > 0 ? `${data.archived} older ${data.archived === 1 ? 'change is' : 'changes are'} in the Ledger only. ` : ''}
        Released and closed changes leave the canal after 30 days.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ keyboard */

const KEYS: [string[], string][] = [
  [['1', '–', '5'], 'Switch lens: gate, flags, age, spend, channel'],
  [['V'], 'View as all, clerk or approver'],
  [['L'], 'Canal or list'],
  [['←', '→'], 'Step from boat to boat'],
  [['O'], 'Open the focused boat’s voyage log'],
  [['N'], 'New change request (Lock keeper)'],
  [['/'], 'Find a boat'],
  [['Esc'], 'Back to the whole canal'],
  [['?'], 'This list'],
];

function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2.5 text-sm">
        {KEYS.map(([keys, what]) => (
          <div key={what} className="contents">
            <dt className="flex items-center gap-1">{keys.map((k) => (k === '–' ? <span key={k} className="text-faint">–</span> : <Kbd key={k}>{k}</Kbd>))}</dt>
            <dd className="m-0 text-muted">{what}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
