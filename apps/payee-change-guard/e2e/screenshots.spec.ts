/**
 * Redesign screenshots (not a test). Run: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 * Writes docs/redesign/<screen>-<theme>-<desktop|phone>.png. SHOTS=name1,name2 limits the set.
 */
import { test, type Page } from '@playwright/test';

import { openApp } from '@x10/shared/e2e';

const ALEX = 'demo-admin-alex';
const SAM = 'demo-clerk-sam';
const PRIYA = 'demo-clerk-priya';
const JORDAN = 'demo-controller-jordan';

type Shot = { name: string; path: string; persona: string; full?: boolean; act?: (page: Page, phone: boolean) => Promise<void> };

const SHOTS: Shot[] = [
  { name: 'canal-gate', path: '/', persona: ALEX },
  {
    name: 'canal-flags',
    path: '/',
    persona: ALEX,
    act: async (page) => {
      await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Flags/ }).click();
    },
  },
  {
    name: 'canal-channel-approver',
    path: '/',
    persona: JORDAN,
    act: async (page) => {
      await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Channel/ }).click();
    },
  },
  {
    name: 'canal-today-focus',
    path: '/',
    persona: ALEX,
    act: async (page, phone) => {
      if (phone) await page.getByRole('button', { name: /^Today/ }).click();
      await page.getByRole('button', { name: /Lindqvist.*red flags/ }).click();
    },
  },
  {
    name: 'canal-list',
    path: '/',
    persona: ALEX,
    full: true,
    act: async (page) => {
      await page.getByRole('radio', { name: 'List' }).click();
    },
  },
  {
    name: 'lock-keeper',
    path: '/keeper',
    persona: SAM,
    full: true,
    act: async (page) => {
      await page.getByLabel('Supplier').fill('Mossgrove');
      await page.getByRole('option', { name: /Mossgrove Garden Care/ }).click();
      await page.getByLabel('New account number or IBAN').fill('LT12 1000 0111 0100 1000');
      await page.getByLabel('Bank country').selectOption('LT');
      await page.getByRole('radio', { name: 'Email' }).click();
      await page.getByLabel(/presses for urgency/i).check();
    },
  },
  { name: 'call-back', path: '/callback', persona: PRIYA, full: true },
  {
    name: 'call-back-wrong-number',
    path: '/callback',
    persona: PRIYA,
    full: true,
    act: async (page) => {
      await page.getByRole('link', { name: /Harbourline Shipping/ }).first().click();
      await page.getByLabel('Number you dialled').fill('+44 7700 900123');
    },
  },
  {
    name: 'second-key-four-flags',
    path: '/second-key',
    persona: JORDAN,
    full: true,
    act: async (page) => {
      await page.getByRole('link', { name: /Lindqvist/ }).first().click();
    },
  },
  {
    name: 'second-key-frozen',
    path: '/second-key',
    persona: JORDAN,
    full: true,
    act: async (page) => {
      await page.getByRole('link', { name: /Kestrel/ }).first().click();
    },
  },
  {
    name: 'voyage',
    path: '/ledger',
    persona: ALEX,
    full: true,
    act: async (page) => {
      await page.getByRole('link', { name: 'Bluefin Logistics BV' }).click();
      await page.getByRole('link', { name: /PCR-0107/ }).first().click();
    },
  },
  { name: 'ledger', path: '/ledger', persona: ALEX, full: true },
  { name: 'harbour', path: '/harbour', persona: ALEX, full: true },
  { name: 'about', path: '/about', persona: ALEX, full: true },
];

const only = process.env.SHOTS?.split(',').filter(Boolean);

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.use({ colorScheme: scheme });
    for (const s of SHOTS) {
      test(`${s.name} ${scheme}`, async ({ page }, info) => {
        test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to write the redesign screenshots.');
        test.skip(!!only && !only.includes(s.name), 'not selected');
        const phone = info.project.name === 'phone';
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openApp(page, s.path, s.persona);
        await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
        if (s.act) await s.act(page, phone);
        await page.waitForTimeout(900);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `docs/redesign/${s.name}-${scheme}-${phone ? 'phone' : 'desktop'}.png`, fullPage: !!s.full && !phone });
      });
    }
  });
}
