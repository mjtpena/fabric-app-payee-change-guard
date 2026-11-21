import { FIXED_NOW, testStore } from '@x10/shared/test';

import { PERSONA, personas } from '../app.config';
import { defs } from '../model';
import { seed } from '../seed';
import { boatScale, buildCanal, groupKey, hullColor, isActionable, lensGroups, todayFor } from './canal';
import { actorFor, loadWorld } from './requests';

async function canal() {
  const store = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  const world = await loadWorld(store);
  return { world, data: buildCanal(world, FIXED_NOW) };
}

describe('the seeded canal', () => {
  it('has 24 suppliers and 14 change requests in every state', async () => {
    const { world } = await canal();
    expect(world.suppliers).toHaveLength(24);
    expect(world.requests).toHaveLength(14);
    const statuses = new Set(world.requests.map((r) => r.status));
    expect([...statuses].sort()).toEqual(['approved', 'cancelled', 'rejected', 'released', 'requested', 'verified']);
  });

  it('puts every boat in the chamber of its gate', async () => {
    const { data } = await canal();
    const count = (c: string) => data.boats.filter((b) => b.chamber === c).length;
    expect(count('request')).toBe(4);
    expect(count('callback')).toBe(3);
    expect(count('approval')).toBe(1);
    expect(count('basin')).toBe(3);
    expect(count('drydock')).toBe(3);
    expect(data.archived).toBe(0);
  });

  it('freezes the domestic pay group before tomorrow’s run and leaves international open', async () => {
    const { data } = await canal();
    expect(data.freeze.domestic.frozen).toBe(true);
    expect(data.freeze.domestic.until).toBe('2026-11-21T10:00:00.000Z');
    expect(data.freeze.international.frozen).toBe(false);
    const frozen = data.boats.filter((b) => b.freeze?.frozen).map((b) => b.supplier?.name);
    expect(frozen).toEqual(['Kestrel Print & Packaging']);
  });

  it('flies four pennants on the Lindqvist boat and finds the account it shares with Hartley', async () => {
    const { data } = await canal();
    const lind = data.boats.find((b) => b.supplier?.name === 'Lindqvist Industrial Parts GmbH')!;
    expect(lind.flags.map((f) => f.code).sort()).toEqual(['email', 'new_country', 'shared_account', 'urgency']);
    expect(lind.sharedWith?.name).toBe('Hartley Fixings Ltd');
    expect(data.shared).toHaveLength(1);
    expect(data.shared[0].suppliers.map((s) => s.name).sort()).toEqual(['Hartley Fixings Ltd', 'Lindqvist Industrial Parts GmbH']);
    expect(data.shared[0].boatId).toBe(lind.id);
  });

  it('no seeded boat has a trail issue', async () => {
    const { data } = await canal();
    expect(data.boats.filter((b) => b.issues.length).map((b) => [b.ref, b.issues])).toEqual([]);
  });

  it('Today ranks the four-flag boat, the shared account, the overdue call-back and the frozen approval', async () => {
    const { data } = await canal();
    const today = todayFor(data, 'all');
    expect(today.length).toBeGreaterThanOrEqual(4);
    expect(today.length).toBeLessThanOrEqual(5);
    expect(today[0].title).toMatch(/Lindqvist.*4 red flags/);
    expect(today.some((t) => /One account, 2 suppliers/.test(t.title))).toBe(true);
    const cb = today.find((t) => t.id.startsWith('callback-'))!;
    expect(cb.title).toMatch(/Harbourline/);
    expect(cb.value).toBe('31');
    const frozen = today.find((t) => t.id.startsWith('frozen-'))!;
    expect(frozen.title).toMatch(/Kestrel.*frozen/);
    expect(today.every((t) => t.boatId)).toBe(true);
  });

  it('view as clerk shows call-back work; view as approver shows the second key', async () => {
    const { data, world } = await canal();
    expect(todayFor(data, 'clerk').some((t) => t.id.startsWith('frozen-'))).toBe(false);
    expect(todayFor(data, 'clerk').some((t) => t.id.startsWith('callback-'))).toBe(true);
    expect(todayFor(data, 'approver').some((t) => t.id.startsWith('frozen-'))).toBe(true);
    const priya = actorFor(world.people.find((p) => p.sub === PERSONA.priya)!, world);
    const harbour = data.boats.find((b) => b.supplier?.name === 'Harbourline Shipping')!;
    const corvid = data.boats.find((b) => b.supplier?.name === 'Corvid Analytics BV')!;
    expect(isActionable(harbour, 'clerk', priya)).toBe(true);
    expect(isActionable(corvid, 'clerk', priya)).toBe(false);
    expect(isActionable(corvid, 'approver', priya)).toBe(true);
  });

  it('every lens assigns every boat to a group with a colour', async () => {
    const { data } = await canal();
    for (const lens of ['gate', 'flags', 'age', 'spend', 'channel'] as const) {
      for (const b of data.boats) {
        expect(lensGroups(lens).some((g) => g.key === groupKey(b, lens))).toBe(true);
        expect(hullColor(b, lens)).toMatch(/var\(|color-mix/);
      }
    }
    const lind = data.boats.find((b) => b.supplier?.name === 'Lindqvist Industrial Parts GmbH')!;
    expect(groupKey(lind, 'flags')).toBe('4');
    expect(groupKey(lind, 'channel')).toBe('email');
    expect(groupKey(lind, 'age')).toBe('b');
  });

  it('scales boats by annual spend', () => {
    expect(boatScale(null)).toBe(0.85);
    expect(boatScale(5_000)).toBeCloseTo(0.85);
    expect(boatScale(1_000_000)).toBeCloseTo(1.25);
    expect(boatScale(300_000)).toBeGreaterThan(boatScale(50_000));
  });

  it('archives released and closed boats after 30 days', async () => {
    const { world } = await canal();
    const d = buildCanal(world, new Date(FIXED_NOW.getTime() + 40 * 86_400_000));
    expect(d.boats.filter((b) => b.chamber === 'basin' || b.chamber === 'drydock')).toHaveLength(0);
    expect(d.archived).toBe(6);
  });
});
