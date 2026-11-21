/**
 * App configuration. No React imports here: tools/seed-fabric.mjs loads this file in Node to export seed rows.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

/**
 * Demo personas. Alex keeps the supplier master and the payment-run calendar (admin, and holds a second key).
 * Sam and Priya are AP clerks who raise requests and make call-backs. Jordan is the finance controller who
 * approves. Sam raised most of the seeded requests, so Sam is the persona to try separation of duties with.
 */
export const personas: Persona[] = [
  { sub: 'demo-admin-alex', name: 'Alex Rivera', email: 'alex@example.com', isAdmin: true, role: 'Admin, supplier master' },
  { sub: 'demo-clerk-sam', name: 'Sam Taylor', email: 'sam@example.com', isAdmin: false, role: 'AP clerk' },
  { sub: 'demo-clerk-priya', name: 'Priya Nair', email: 'priya@example.com', isAdmin: false, role: 'AP clerk' },
  { sub: 'demo-controller-jordan', name: 'Jordan Lee', email: 'jordan@example.com', isAdmin: false, role: 'Finance controller' },
];

export const PERSONA = {
  alex: personas[0].sub,
  sam: personas[1].sub,
  priya: personas[2].sub,
  jordan: personas[3].sub,
} as const;

export const config: AppConfig<Schema> = {
  appId: 'payee-change-guard',
  title: 'Payee Change Guard',
  tagline: 'Stop supplier bank-detail fraud: every change called back and approved by a second person.',
  defs,
  personas,
  seed,
  accent: 'jade',
  // A lock gate seen side-on: two leaves with the balance beam, over a waterline (JSX-free for the seed tools).
  logoPaths: ['M3 9h7', 'M14 9h7', 'M6 9v10', 'M18 9v10', 'M6 13l5-4', 'M18 13l-5-4', 'M3 19c2 0 2-1.4 4.5-1.4S10 19 12 19s2-1.4 4.5-1.4S19 19 21 19'],
  // Phone tab-bar icons are attached in main.tsx (navIcons) to keep this file JSX-free.
  nav: [
    { to: '/', label: 'Canal', end: true },
    { to: '/keeper', label: 'Lock keeper' },
    { to: '/callback', label: 'Call-back' },
    { to: '/second-key', label: 'Second key' },
    { to: '/ledger', label: 'Ledger' },
    { to: '/harbour', label: 'Harbour office', adminOnly: true },
    { to: '/about', label: 'About' },
  ],
};
