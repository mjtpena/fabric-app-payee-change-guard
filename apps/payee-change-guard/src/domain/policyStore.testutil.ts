/**
 * Test helper: wraps a DataStore so every write is checked against a mirror of the entities' row-level security,
 * as the deployed GraphQL API would check it for the signed-in `sub`. Proves the domain only makes writes the
 * database will accept (and that the database itself blocks the requester).
 */
import type { BaseRow, DataStore, Repo } from '@x10/shared/data';

import type { ChangeRequest, Schema } from '../model';
import { canCreateRequestRow, canUpdateRequestRow, REQUEST_CREATE_EXCLUDED, REQUEST_UPDATE_EXCLUDED } from './policies';

export class PolicyViolation extends Error {}

function present(obj: object, keys: readonly string[]): string[] {
  return keys.filter((k) => k in obj && (obj as Record<string, unknown>)[k] !== undefined);
}

export function policyStore(inner: DataStore<Schema>, sub: string): DataStore<Schema> {
  function repo<K extends keyof Schema & string>(name: K): Repo<Schema[K] & BaseRow> {
    const base = inner.repo(name) as unknown as Repo<BaseRow>;
    const wrapped: Repo<BaseRow> = { ...base };
    const deny = (what: string) => async () => {
      throw new PolicyViolation(`${name} has no ${what} permission`);
    };
    const ownerOnly = (col: string) => {
      wrapped.create = async (data) => {
        if ((data as Record<string, unknown>)[col] !== sub) throw new PolicyViolation(`${name} create: ${col} must be you`);
        return base.create(data);
      };
      wrapped.update = async (id, patch) => {
        const row = (await base.get(id)) as Record<string, unknown> | null;
        if (!row || row[col] !== sub) throw new PolicyViolation(`${name} update: ${col} must be you`);
        return base.update(id, patch);
      };
    };
    if (name === 'ChangeRequest') {
      wrapped.create = async (data) => {
        const row = data as unknown as ChangeRequest;
        if (!canCreateRequestRow(sub, row)) throw new PolicyViolation('ChangeRequest create: requestedBy must be you and status requested');
        const bad = present(data, REQUEST_CREATE_EXCLUDED);
        if (bad.length) throw new PolicyViolation(`ChangeRequest create sends excluded fields: ${bad.join(', ')}`);
        return base.create(data);
      };
      wrapped.update = async (id, patch) => {
        const row = (await base.get(id)) as unknown as ChangeRequest | null;
        if (!row || !canUpdateRequestRow(sub, row)) throw new PolicyViolation('ChangeRequest update: requester or closed row');
        const bad = present(patch, REQUEST_UPDATE_EXCLUDED);
        if (bad.length) throw new PolicyViolation(`ChangeRequest update sends excluded fields: ${bad.join(', ')}`);
        return base.update(id, patch);
      };
      wrapped.remove = deny('delete');
    }
    if (name === 'Callback') {
      wrapped.create = async (data) => {
        const d = data as Record<string, unknown>;
        if (d.calledBy !== sub || d.requesterSub === sub) throw new PolicyViolation('Callback create: calledBy must be you and you must not be the requester');
        return base.create(data);
      };
      wrapped.update = deny('update');
      wrapped.remove = deny('delete');
    }
    if (name === 'Supplier') {
      ownerOnly('custodianSub');
      wrapped.remove = deny('delete');
    }
    if (name === 'PaymentRun') {
      ownerOnly('createdBy');
      wrapped.remove = async (id) => {
        const row = (await base.get(id)) as Record<string, unknown> | null;
        if (!row || row.createdBy !== sub) throw new PolicyViolation('PaymentRun delete: createdBy must be you');
        return base.remove(id);
      };
    }
    if (name === 'StaffRole') {
      ownerOnly('grantedBy');
      wrapped.remove = async (id) => {
        const row = (await base.get(id)) as Record<string, unknown> | null;
        if (!row || row.grantedBy !== sub) throw new PolicyViolation('StaffRole delete: grantedBy must be you');
        return base.remove(id);
      };
    }
    return wrapped as unknown as Repo<Schema[K] & BaseRow>;
  }
  return { kind: inner.kind, repo: repo as DataStore<Schema>['repo'] };
}
