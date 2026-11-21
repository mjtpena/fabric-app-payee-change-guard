/**
 * Geometry of the lock flight (SVG user units). A side-on cutaway: four pounds stepping up left to right
 * (Request, Call-back, Second approval, the Released basin), three gates between them, and a dry dock cut into the
 * bank under the upper chambers. Pure, so boat slots can be tested and animated between.
 */
import type { Boat } from '../domain/canal';
import type { Chamber } from '../domain/gates';

export const VIEW = { w: 1200, h: 760 };
/** Depth of water in a chamber; also the rise at each gate. */
export const DEPTH = 90;
/** Base boat length; BoatShape is drawn at SHAPE_LEN and scaled. */
export const BOAT_LEN = 92;
export const SHAPE_LEN = 62;

export interface ChamberBox {
  key: Exclude<Chamber, 'drydock'>;
  x0: number;
  x1: number;
  /** Water surface. */
  water: number;
  /** Chamber floor. */
  floor: number;
  /** Top of the bank (towpath). */
  coping: number;
}

const box = (key: ChamberBox['key'], x0: number, x1: number, water: number): ChamberBox => ({ key, x0, x1, water, floor: water + DEPTH, coping: water - 26 });

export const CHAMBER_BOXES: ChamberBox[] = [
  box('request', 0, 372, 424),
  box('callback', 372, 650, 424 - DEPTH),
  box('approval', 650, 900, 424 - 2 * DEPTH),
  box('basin', 900, 1160, 424 - 3 * DEPTH),
];

export const DRY_DOCK = { x0: 664, x1: 1150, top: 470, floor: 620 };

export interface GateGeom {
  index: 1 | 2 | 3;
  x: number;
  /** Water on the upper side. */
  upper: number;
  /** Floor of the upper chamber: the leaf holds the upper water down to its sill. */
  upperFloor: number;
  coping: number;
  name: string;
}

export const GATES: GateGeom[] = [1, 2, 3].map((i) => {
  const upper = CHAMBER_BOXES[i];
  return { index: i as 1 | 2 | 3, x: upper.x0, upper: upper.water, upperFloor: upper.floor, coping: upper.coping, name: ['Call-back gate', 'Second key', 'Release gate'][i - 1] };
});

export function chamberBox(c: Chamber): ChamberBox | null {
  return CHAMBER_BOXES.find((b) => b.key === c) ?? null;
}

export interface Slot {
  id: string;
  x: number;
  /** Waterline (or keel-block line in the dry dock). */
  y: number;
  len: number;
  /** 0: near row (or a lone row); 1: moored outside, behind the near boat. */
  depth: 0 | 1;
  /** Label row for a crowded single row (staggered so neighbours do not collide). */
  row: 0 | 1;
  tilt: number;
}

/**
 * Boat slots, centred in each chamber. When a chamber is too full for one row, boats moor two abreast: the outer
 * row sits a little higher and smaller, behind the inner row, as boats breasted up in a lock do.
 */
export function layoutBoats(boats: Pick<Boat, 'id' | 'chamber'>[], scaleOf: (id: string) => number): Map<string, Slot> {
  const out = new Map<string, Slot>();
  const groups = new Map<Chamber, typeof boats>();
  for (const b of boats) groups.set(b.chamber, [...(groups.get(b.chamber) ?? []), b]);
  for (const [chamber, list] of groups) {
    const dock = chamber === 'drydock';
    const c = chamberBox(chamber);
    // The request pound opens onto the river on the left; boats moor clear of the lock keeper's hut.
    const x0 = dock ? DRY_DOCK.x0 + 36 : chamber === 'request' ? 92 : c!.x0 + 20;
    const x1 = dock ? DRY_DOCK.x1 - 30 : c!.x1 - 20;
    const y = dock ? DRY_DOCK.floor - 34 : c!.water;
    const gap = 12;
    const lens = list.map((b) => BOAT_LEN * scaleOf(b.id));
    const fits = lens.reduce((a, b) => a + b, 0) + gap * (list.length - 1) <= x1 - x0;
    const rows: (typeof list)[] = dock || fits || list.length < 2 ? [list] : [list.filter((_, i) => i % 2 === 0), list.filter((_, i) => i % 2 === 1)];
    rows.forEach((row, depth) => {
      const shrink = depth ? 0.88 : 1;
      const ls = row.map((b) => BOAT_LEN * scaleOf(b.id) * shrink);
      const total = ls.reduce((a, b) => a + b, 0);
      const width = x1 - x0;
      const natural = total + gap * (row.length - 1);
      const squeeze = natural > width ? (width - total) / Math.max(1, row.length - 1) : gap;
      const used = total + squeeze * (row.length - 1);
      // The outer row is offset half a boat so both rows show.
      let x = x0 + Math.max(0, (width - used) / 2) + (depth ? Math.min(30, Math.max(0, (width - used) / 2)) : 0);
      row.forEach((b, i) => {
        out.set(b.id, {
          id: b.id,
          x: x + ls[i] / 2,
          y: y - depth * 12,
          len: ls[i],
          depth: depth as 0 | 1,
          row: (rows.length === 1 && natural > width ? i % 2 : 0) as 0 | 1,
          tilt: dock ? (i % 2 ? 2.5 : -2) : 0,
        });
        x += ls[i] + squeeze;
      });
    });
  }
  return out;
}

/**
 * Keyframes for a boat moving from one slot to another. Rising through a gate: glide to the gate on the lower
 * level, rise with the water as the lock fills, then sail to the new slot. Hauled to the dry dock: lift out and
 * swing down. Launched: sail in from the left edge.
 */
export function voyage(from: { x: number; y: number } | null, to: Slot, fromChamber: Chamber | null, toChamber: Chamber): { x: number; y: number; at: number }[] {
  if (!from || !fromChamber) return [
    { x: -60, y: to.y, at: 0 },
    { x: to.x, y: to.y, at: 1 },
  ];
  if (toChamber === 'drydock') {
    const top = Math.min(from.y, to.y) - 90;
    return [
      { x: from.x, y: from.y, at: 0 },
      { x: from.x, y: top, at: 0.35 },
      { x: to.x, y: top, at: 0.7 },
      { x: to.x, y: to.y, at: 1 },
    ];
  }
  const order: Chamber[] = ['request', 'callback', 'approval', 'basin'];
  const a = order.indexOf(fromChamber);
  const b = order.indexOf(toChamber);
  if (a < 0 || b <= a) return [
    { x: from.x, y: from.y, at: 0 },
    { x: to.x, y: to.y, at: 1 },
  ];
  const frames: { x: number; y: number; at: number }[] = [{ x: from.x, y: from.y, at: 0 }];
  const steps = b - a;
  for (let s = 0; s < steps; s++) {
    const gate = GATES[a + s];
    const lowY = CHAMBER_BOXES[a + s].water;
    const highY = CHAMBER_BOXES[a + s + 1].water;
    const base = s / steps;
    const span = 1 / steps;
    frames.push({ x: gate.x - 34, y: lowY, at: base + span * 0.3 });
    frames.push({ x: gate.x - 34, y: highY, at: base + span * 0.62 });
    frames.push({ x: gate.x + 40, y: highY, at: base + span * 0.8 });
  }
  frames.push({ x: to.x, y: to.y, at: 1 });
  return frames;
}

/** Which gates a move crosses (1-based), to swing them open. */
export function gatesCrossed(fromChamber: Chamber | null, toChamber: Chamber): number[] {
  const order: Chamber[] = ['request', 'callback', 'approval', 'basin'];
  const a = fromChamber ? order.indexOf(fromChamber) : -1;
  const b = order.indexOf(toChamber);
  if (a < 0 || b <= a) return [];
  return Array.from({ length: b - a }, (_, i) => a + i + 1);
}
