/**
 * The five acceptance criteria of App 16 (docs/SPEC-2.md), through the UI, at 390 and 1280 px.
 */
import { expect, test } from '@playwright/test';

import { assertNoHorizontalScroll, openApp, watchConsole } from '@x10/shared/e2e';

import { formatExactInPage, JORDAN, PRIYA, SAM, switchTo, tomorrowRunIso } from './helpers';

test('AC1: the requester cannot verify or approve their own request; a different persona can', async ({ page }) => {
  const c = watchConsole(page);
  // Sam raised Pinecrest (PCR-0114): his own call-back is blocked.
  await openApp(page, '/callback', SAM);
  await page.getByTestId('queue-item').filter({ hasText: 'Pinecrest Laboratory Supplies' }).click();
  await expect(page.getByTestId('call-blocked')).toHaveText(/You raised this request/);
  await expect(page.getByTestId('call-form')).toHaveCount(0);

  // Priya makes the call on the number on file and the gate opens.
  await switchTo(page, PRIYA, '/callback');
  await page.getByTestId('queue-item').filter({ hasText: 'Pinecrest Laboratory Supplies' }).click();
  await expect(page.getByRole('heading', { name: 'Pinecrest Laboratory Supplies' })).toBeVisible();
  const onFile = (await page.getByTestId('number-on-file').textContent())!.trim();
  await page.getByLabel('Number you dialled').fill(onFile);
  await expect(page.getByTestId('number-match')).toBeVisible();
  await page.getByLabel('Who you spoke to').fill('Accounts manager');
  await page.getByRole('button', { name: 'Record the call' }).click();
  await expect(page.getByTestId('call-result')).toHaveText(/call-back gate opens/);

  // Sam cannot turn the second key on his own request (Corvid, PCR-0112); Priya, who called back, cannot either.
  await switchTo(page, SAM, '/second-key');
  await page.getByTestId('queue-item').filter({ hasText: 'Corvid Analytics BV' }).click();
  await expect(page.getByTestId('key-blocked')).toHaveText(/You raised this request/);
  await expect(page.getByTestId('approve')).toHaveCount(0);
  await switchTo(page, PRIYA, '/second-key');
  await page.getByTestId('queue-item').filter({ hasText: 'Corvid Analytics BV' }).click();
  await expect(page.getByTestId('key-blocked')).toHaveText(/You made the call-back/);

  // Jordan, a third person with the second key, approves; the boat moves to the Second-approval chamber.
  await switchTo(page, JORDAN, '/second-key');
  await page.getByTestId('queue-item').filter({ hasText: 'Corvid Analytics BV' }).click();
  await page.getByTestId('approve').click();
  await expect(page.getByRole('heading', { name: 'Corvid Analytics BV' })).toBeVisible();
  await expect(page.locator('[data-testid="boat"][data-supplier="Corvid Analytics BV"]')).toHaveAttribute('data-chamber', 'approval');
  c.assertClean();
});

test('AC2: a call-back on a number other than the one on file cannot verify the request', async ({ page }) => {
  const c = watchConsole(page);
  await openApp(page, '/callback', PRIYA);
  await page.getByTestId('queue-item').filter({ hasText: 'Harbourline Shipping' }).click();
  // The sheet shows only the number on file.
  await expect(page.getByTestId('number-on-file')).toHaveText('+44 161 496 0111');
  await page.getByLabel('Number you dialled').fill('+44 7700 900123');
  await expect(page.getByTestId('number-mismatch')).toHaveText(/cannot open the gate/);
  await page.getByLabel('Who you spoke to').fill('Number printed on the letter');
  await page.getByRole('button', { name: 'Record the call' }).click();
  await expect(page.getByTestId('call-result')).toHaveText(/cannot verify/);
  // Still at the call-back gate, with the call logged as not on file.
  await page.goto('/#/');
  await expect(page.locator('[data-testid="boat"][data-supplier="Harbourline Shipping"]')).toHaveAttribute('data-chamber', 'request');
  await page.goto('/#/callback');
  await page.getByTestId('queue-item').filter({ hasText: 'Harbourline Shipping' }).click();
  await expect(page.getByTestId('call-log-item').first()).toContainText('not the number on file');
  await assertNoHorizontalScroll(page);
  c.assertClean();
});

test('AC3: approving within 48 hours of a payment run is blocked with the exact freeze end time', async ({ page }) => {
  const c = watchConsole(page);
  await openApp(page, '/second-key', JORDAN);
  await page.getByTestId('queue-item').filter({ hasText: 'Kestrel Print & Packaging' }).click();
  const expected = await formatExactInPage(page, await tomorrowRunIso(page));
  await expect(page.getByTestId('key-blocked')).toHaveText(`Frozen until ${expected}`);
  await expect(page.getByTestId('freeze-banner')).toContainText('48 hours before a payment run');
  await expect(page.getByTestId('approve')).toBeDisabled();
  // The canal's sign on the second key says the same.
  await page.goto('/#/');
  await expect(page.getByTestId('freeze-until')).toHaveText(`until ${expected}`);
  await expect(page.locator('[data-testid="boat"][data-supplier="Kestrel Print & Packaging"]')).toHaveAttribute('data-frozen', 'true');
  c.assertClean();
});

test('AC4: the four-flag request shows each reason and needs an override reason to approve', async ({ page }) => {
  const c = watchConsole(page);
  await openApp(page, '/second-key', JORDAN);
  await page.getByTestId('queue-item').filter({ hasText: 'Lindqvist Industrial Parts GmbH' }).click();
  const flags = page.getByTestId('flag-list').getByTestId('flag');
  await expect(flags).toHaveCount(4);
  await expect(page.locator('[data-testid="flag"][data-code="shared_account"]')).toContainText('already on file for Hartley Fixings Ltd');
  await expect(page.locator('[data-testid="flag"][data-code="urgency"]')).toContainText('Urgency claimed');
  await expect(page.locator('[data-testid="flag"][data-code="email"]')).toContainText('Requested by email');
  await expect(page.locator('[data-testid="flag"][data-code="new_country"]')).toContainText('Never paid into Germany');
  await expect(page.getByTestId('flag-headline')).toHaveText('4 flags: override needed');

  await page.getByTestId('approve').click();
  await expect(page.getByTestId('decision-panel')).toContainText('needs a written override reason');
  await page.getByLabel('Override reason').fill('Supplier’s finance director visited with ID and a signed bank letter.');
  await page.getByTestId('approve').click();
  await expect(page.locator('[data-testid="boat"][data-supplier="Lindqvist Industrial Parts GmbH"]')).toHaveAttribute('data-chamber', 'approval');
  c.assertClean();
});

test('AC5: no full account number is stored after creating a request', async ({ page }) => {
  const c = watchConsole(page);
  await openApp(page, '/keeper', SAM);
  await page.getByLabel('Supplier').fill('Eastgate');
  await page.getByRole('option', { name: /Eastgate Couriers/ }).click();
  await page.getByLabel('New account number or IBAN').fill('GB82 WEST 1234 5698 7654 32');
  await expect(page.getByTestId('mask-preview')).toContainText('•••• 5432');
  await page.getByLabel('Bank country').selectOption('GB');
  await page.getByLabel('Source document').fill('Supplier portal form SP-99999');
  await page.getByLabel('Reason given').fill('New account after a bank merger.');
  await page.getByRole('button', { name: 'Put it in the water' }).click();
  await expect(page.locator('[data-testid="boat"][data-supplier="Eastgate Couriers"]')).toBeVisible();
  // Everything the demo store holds (localStorage) has the masked form only.
  const stored = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  expect(stored).toContain('•••• 5432');
  expect(stored).not.toContain('GB82WEST12345698765432');
  expect(stored).not.toContain('GB82 WEST');
  expect(stored).not.toContain('5698765432');
  c.assertClean();
});
