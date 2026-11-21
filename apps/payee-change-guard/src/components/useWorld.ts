import { useMemo } from 'react';

import { useAsync, usePolling } from '@x10/shared/lib';
import { useApp } from '@x10/shared/runtime';

import { actorFor, loadWorld } from '../domain/requests';
import type { Schema } from '../model';

/** The whole world (small: suppliers, requests, call-backs, runs, roles, people), polled every 5 s. */
export function useWorld(poll = true) {
  const { store, me } = useApp<Schema>();
  const state = useAsync(() => loadWorld(store), [store]);
  usePolling(state.reload, 5000, poll);
  const actor = useMemo(() => (state.data ? actorFor(me, state.data) : { sub: me.sub, isAdmin: !!me.isAdmin, roles: [] }), [state.data, me]);
  return { state, world: state.data, actor, me, store };
}
