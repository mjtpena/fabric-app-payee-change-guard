/** Supplier search: a combobox over the master (name or supplier number), keyboard and touch friendly. */
import { useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import { cx, IconButton, Input } from '@x10/shared/ui';

import type { Supplier } from '../model';

export function SupplierPicker({
  suppliers,
  value,
  onChange,
  invalid,
  inputId,
}: {
  suppliers: Supplier[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  inputId: string;
}) {
  const selected = suppliers.find((s) => s.id === value) ?? null;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? suppliers.filter((s) => s.name.toLowerCase().includes(t) || s.supplierNo.toLowerCase().includes(t)) : suppliers;
    return list.slice(0, 8);
  }, [q, suppliers]);

  const choose = (s: Supplier) => {
    onChange(s.id);
    setQ('');
    setOpen(false);
  };

  if (selected) {
    return (
      <div className={cx('x-control flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 sm:h-8')} data-testid="supplier-chosen">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{selected.name}</span>
        <span className="font-mono text-xs text-muted">{selected.supplierNo}</span>
        <IconButton
          size="sm"
          label="Change supplier"
          icon={<X />}
          onClick={() => {
            onChange('');
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-faint" />
      <Input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
        autoComplete="off"
        placeholder="Name or supplier number"
        className="pl-8"
        invalid={invalid}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(matches.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && open && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="Suppliers" className="absolute inset-x-0 top-full z-20 m-0 mt-1 max-h-72 list-none overflow-y-auto rounded-xl border border-line bg-surface-raised p-1 shadow-1">
          {matches.length === 0 && <li className="px-3 py-2 text-ui text-muted">No supplier matches “{q}”.</li>}
          {matches.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${s.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(s)}
              onMouseEnter={() => setActive(i)}
              className={cx('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', i === active && 'bg-surface-2')}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
              {s.status === 'blocked' && <span className="text-xs text-bad-text">Blocked</span>}
              <span className="font-mono text-xs text-muted">{s.supplierNo}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
